import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';
import { parseForm, renderChecklistHtml } from '../_shared/checklistDocument.ts';
import {
  cleanEditorContent, fieldIdentity, renderEditorDocument, DATE_FORMAT, FIELD_KINDS, MAX_FIELDS, SIGNER_ROLE, TEXT_LOOK,
  type FieldKind, type Letterhead,
} from '../_shared/editorDocument.ts';
import { PDFDocument } from 'pdf-lib';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * A company admin's own signing templates (desktop "מסמכים חתומים").
 *
 * `prepare` turns an uploaded image or Word file into the draft's PDF, so the
 * browser can show its pages while the admin places fields.
 * `create` builds the DocuSeal template, either from the admin's placed fields
 * on that PDF, or from a document written in the in-app editor (sent here as
 * a block model plus pixel field positions, never as raw HTML, so nothing the
 * browser sends is rendered verbatim), and saves it as a ready company template.
 * A "רשימת סעיפים" form (`kind: 'checklist'`) has no DocuSeal template: each
 * meeting renders its own document (checklist-meeting). Here it only gets a
 * blank PDF of the form, for its preview and its card.
 *
 * A form may start from one of the platform owner's templates
 * (`sourceTemplateId`, form-templates): the browser sends the content the
 * company edited; the id is kept only to count who used the template.
 * `replace` saves a new version of any company form in place (its history is
 * kept, see migration 110), `restore-version` brings an earlier one back.
 *
 * Every draft lives in `<companyId>/signing-templates/<draftId>/`; its final
 * PDF is always `document.pdf` there, the path the template row points to.
 */

type PlacedField = { kind: FieldKind; label?: string; page: number; x: number; y: number; w: number; h: number };

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Names that differ only in spaces or letter case count as the same name. */
function titleKey(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('he');
}

/** The fixed folders of every driver's file (lib/compliance.ts DRIVER_COMPLIANCE); a document may not take their names. */
const FIXED_DRIVER_FOLDERS = ['הצהרת בריאות', 'הדרכות תקופתיות', 'נוהל 6 (הסעת ילדים)', 'נוהל 6', 'רישיון מנוף', 'תוקף ר.פ'];

/** Is this draft folder already a form, or one of a form's earlier versions? */
async function draftInUse(adminClient: SupabaseClient, folder: string): Promise<boolean> {
  const prefix = `${folder}/%`;
  const [templates, versions] = await Promise.all([
    adminClient.from('signing_templates').select('id').like('source_file_path', prefix).limit(1),
    adminClient.from('signing_template_versions').select('id').like('source_file_path', prefix).limit(1),
  ]);
  if (templates.error || versions.error) throw new Error('draft lookup failed');
  return Boolean(templates.data?.length || versions.data?.length);
}

/** Drivers still waiting to sign an earlier version of the form. */
async function pendingOnOlderVersion(adminClient: SupabaseClient, templateId: string, version: number): Promise<number> {
  const { count } = await adminClient.from('signature_requests')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', templateId).eq('status', 'pending').is('archived_at', null).is('deleted_at', null)
    .or(`template_version.is.null,template_version.lt.${version}`);
  return count ?? 0;
}

type ReplaceResult =
  | { ok: true; template: Record<string, unknown>; pendingOld: number }
  | { ok: false; status: number; error: string; code?: string };

async function replaceVersion(
  adminClient: SupabaseClient, companyId: string, replacing: { id: string; version: number },
  docusealId: number | null, path: string, fileName: string, form: unknown, editorContent: unknown, actor: string,
): Promise<ReplaceResult> {
  const { data: version, error } = await adminClient.rpc('replace_signing_template_version', {
    target_template: replacing.id, target_company: companyId, expected_version: replacing.version,
    new_docuseal_template_id: docusealId, new_source_file_path: path, new_source_file_name: fileName,
    new_form_content: form, new_editor_content: editorContent, actor,
  });
  if (error) {
    console.error('company-signing-template replace failed', error.message);
    return { ok: false, status: 500, error: 'שמירת הנוסח החדש נכשלה' };
  }
  if (version == null) return { ok: false, status: 409, error: 'הטופס עודכן בינתיים. רעננו ונסו שוב.', code: 'stale' };
  const { data: template } = await adminClient.from('signing_templates').select('*').eq('id', replacing.id).single();
  return { ok: true, template: template ?? {}, pendingOld: await pendingOnOlderVersion(adminClient, replacing.id, version as number) };
}

function draftFolder(companyId: string, draftId: string) {
  return `${companyId}/signing-templates/${draftId}`;
}

function sniff(bytes: Uint8Array): 'pdf' | 'png' | 'jpeg' | 'docx' | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'docx'; // zip container
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function imageToPdf(bytes: Uint8Array, kind: 'png' | 'jpeg'): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const image = kind === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const scale = 842 / Math.max(image.width, image.height);
  const width = Math.max(72, Math.round(image.width * scale));
  const height = Math.max(72, Math.round(image.height * scale));
  pdf.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  return pdf.save();
}

type RemoteTemplate = {
  id?: number;
  fields?: Array<{ areas?: Array<{ page?: number; x?: number; y?: number }> }>;
  documents?: Array<{ url?: string }>;
};

async function deleteRemoteTemplate(id: number | undefined) {
  if (!id) return;
  await docusealFetch(`/templates/${id}`, { method: 'DELETE' }).catch(() => null);
}

/** DocuSeal converts the Word file; we keep only its PDF and discard the throwaway template. */
async function docxToPdf(bytes: Uint8Array, name: string): Promise<Uint8Array> {
  const response = await docusealFetch('/templates/docx', {
    method: 'POST',
    body: JSON.stringify({ name: `draft-${name}`, folder_name: 'FleetOS-Drafts', documents: [{ name, file: toBase64(bytes) }] }),
  });
  if (!response.ok) throw new Error('docx conversion failed');
  const remote = await response.json() as RemoteTemplate;
  try {
    const url = remote.documents?.[0]?.url;
    if (!url) throw new Error('docx conversion returned no document');
    const pdf = await fetch(url);
    if (!pdf.ok) throw new Error('docx pdf download failed');
    return new Uint8Array(await pdf.arrayBuffer());
  } finally {
    await deleteRemoteTemplate(remote.id);
  }
}

/** The same look for fields placed on an uploaded PDF (sizes in PDF points). */
function fieldPreferences(type: string): Record<string, unknown> | undefined {
  if (type === 'text') return { font_size: 12, align: TEXT_LOOK.align, valign: TEXT_LOOK.valign };
  if (type === 'date') return { font_size: 12, align: TEXT_LOOK.align, valign: TEXT_LOOK.valign, format: DATE_FORMAT };
  return undefined;
}

function parseFields(raw: unknown): PlacedField[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FIELDS) return null;
  const fields: PlacedField[] = [];
  for (const f of raw) {
    if (!f || typeof f !== 'object') return null;
    const { kind, label, page, x, y, w, h } = f as Record<string, unknown>;
    const nums = [x, y, w, h];
    if (typeof kind !== 'string' || !FIELD_KINDS.has(kind)) return null;
    if (!Number.isInteger(page) || (page as number) < 1 || (page as number) > 500) return null;
    if (!nums.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) return null;
    if ((w as number) <= 0 || (h as number) <= 0) return null;
    fields.push({ kind: kind as FieldKind, label: typeof label === 'string' ? label : undefined, page: page as number, x: x as number, y: y as number, w: w as number, h: h as number });
  }
  return fields;
}

/** The letterhead comes from the company's own record, never from the request. */
async function companyLetterhead(adminClient: SupabaseClient, companyId: string): Promise<Letterhead> {
  const { data: company } = await adminClient.from('companies').select('name, logo_url').eq('id', companyId).single();
  const logosPrefix = `${Deno.env.get('SUPABASE_URL') ?? ''}/storage/v1/object/public/company-logos/`;
  const logoUrl = typeof company?.logo_url === 'string' && company.logo_url.startsWith(logosPrefix) ? company.logo_url : null;
  return { name: (company?.name ?? '').trim() || 'החברה', logoUrl };
}

/** DocuSeal renders the HTML to a PDF; we keep only the PDF and discard the throwaway template. */
async function htmlToPdf(html: string): Promise<Uint8Array> {
  const response = await docusealFetch('/templates/html', {
    method: 'POST',
    body: JSON.stringify({ name: 'draft-checklist', html, size: 'A4', folder_name: 'FleetOS-Drafts' }),
  });
  if (!response.ok) throw new Error(`DocuSeal rejected the html (${response.status})`);
  const remote = await response.json() as RemoteTemplate;
  try {
    const url = remote.documents?.[0]?.url;
    if (!url) throw new Error('html rendering returned no document');
    const pdf = await fetch(url);
    if (!pdf.ok) throw new Error('html pdf download failed');
    return new Uint8Array(await pdf.arrayBuffer());
  } finally {
    await deleteRemoteTemplate(remote.id);
  }
}

async function createFromPdf(
  title: string, folderName: string, externalId: string, pdfUrl: string, fields: PlacedField[], pageSizes: Array<{ width: number; height: number }>,
): Promise<RemoteTemplate> {
  const counters: Record<string, number> = {};
  const used = new Set<string>();
  const identities = fields.map((f) => fieldIdentity(f.kind, f.label, counters, used));

  // The API documents area coordinates as pixels on the page; DocuSeal stores
  // them as page fractions. Send page points first, then check the stored
  // position against where the admin actually dropped the field.
  const attempt = async (units: 'points' | 'fractions'): Promise<RemoteTemplate> => {
    const byName = new Map<string, Record<string, unknown>>();
    fields.forEach((f, i) => {
      const id = identities[i];
      const size = pageSizes[f.page - 1];
      const scaleX = units === 'points' ? size.width : 1;
      const scaleY = units === 'points' ? size.height : 1;
      const area = { page: f.page, x: f.x * scaleX, y: f.y * scaleY, w: f.w * scaleX, h: f.h * scaleY };
      const existing = byName.get(id.name);
      if (existing) (existing.areas as unknown[]).push(area);
      else {
        const preferences = fieldPreferences(id.type);
        byName.set(id.name, { name: id.name, title: id.title, type: id.type, role: SIGNER_ROLE, required: f.kind !== 'checkbox', areas: [area], ...(preferences ? { preferences } : {}) });
      }
    });
    const response = await docusealFetch('/templates/pdf', {
      method: 'POST',
      body: JSON.stringify({
        name: title,
        folder_name: folderName,
        external_id: externalId,
        documents: [{ name: title, file: pdfUrl, fields: [...byName.values()] }],
      }),
    });
    if (!response.ok) throw new Error(`DocuSeal rejected the template (${response.status})`);
    return await response.json() as RemoteTemplate;
  };

  const expected = fields[0];
  const matches = (remote: RemoteTemplate) => {
    const areas = (remote.fields ?? []).flatMap((f) => f.areas ?? []);
    return areas.some((a) => a.page === expected.page - 1 && Math.abs((a.x ?? -1) - expected.x) < 0.02 && Math.abs((a.y ?? -1) - expected.y) < 0.02);
  };

  const first = await attempt('points');
  if (matches(first)) return first;
  await deleteRemoteTemplate(first.id);
  const second = await attempt('fractions');
  if (matches(second)) return second;
  await deleteRemoteTemplate(second.id);
  throw new Error('DocuSeal placed the fields in an unexpected position');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const body = await req.json();
    const { action, companyId, draftId } = body ?? {};
    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) return json({ error: access.error }, access.status);
    if (access.callerRole !== 'admin' && access.callerRole !== 'owner') return json({ error: 'אין הרשאה ליצור מסמכים' }, 403);

    // Bring back an earlier version of a form (its DocuSeal template was kept).
    if (action === 'restore-version') {
      const { templateId, version, expectedVersion } = body;
      if (typeof templateId !== 'string' || !UUID.test(templateId) || !Number.isInteger(version) || !Number.isInteger(expectedVersion)) {
        return json({ error: 'חסרים פרטי הטופס' }, 400);
      }
      const { data: restored, error } = await access.adminClient.rpc('restore_signing_template_version', {
        target_template: templateId, target_company: companyId, version_number: version, expected_version: expectedVersion, actor: access.callerId,
      });
      if (error) {
        console.error('company-signing-template restore failed', error.message);
        return json({ error: 'שחזור הנוסח נכשל' }, 500);
      }
      if (restored == null) return json({ error: 'הטופס עודכן בינתיים. רעננו ונסו שוב.', code: 'stale' }, 409);
      const { data: template } = await access.adminClient.from('signing_templates').select('*').eq('id', templateId).single();
      return json({ template, pendingOld: await pendingOnOlderVersion(access.adminClient, templateId, restored as number) });
    }

    if (typeof draftId !== 'string' || !UUID.test(draftId)) return json({ error: 'מזהה הטיוטה אינו תקין' }, 400);

    const folder = draftFolder(companyId, draftId);
    const pdfPath = `${folder}/document.pdf`;
    const storage = access.adminClient.storage.from('documents');

    // A draft folder that already became a form (or one of its versions) is never written again.
    if (await draftInUse(access.adminClient, folder)) {
      return json({ error: 'הטיוטה כבר נשמרה. סגרו את החלון ופתחו אותו מחדש.' }, 409);
    }

    if (action === 'prepare') {
      const { uploadName } = body;
      if (typeof uploadName !== 'string' || !/^original\.(pdf|png|jpe?g|docx)$/i.test(uploadName)) {
        return json({ error: 'סוג הקובץ אינו נתמך' }, 400);
      }
      const { data: blob, error } = await storage.download(`${folder}/${uploadName}`);
      if (error || !blob) return json({ error: 'לא הצלחנו לקרוא את הקובץ שהועלה' }, 400);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const kind = sniff(bytes);

      let pdf: Uint8Array;
      try {
        if (kind === 'pdf') pdf = bytes;
        else if (kind === 'png' || kind === 'jpeg') pdf = await imageToPdf(bytes, kind);
        else if (kind === 'docx') pdf = await docxToPdf(bytes, 'document.docx');
        else return json({ error: 'אפשר להעלות קובץ PDF, וורד (docx) או תמונה' }, 400);
        // A document we cannot open here would fail later at DocuSeal too.
        const parsed = await PDFDocument.load(pdf, { ignoreEncryption: true });
        if (parsed.getPageCount() === 0) return json({ error: 'הקובץ לא מכיל עמודים' }, 400);
      } catch {
        return json({ error: 'לא הצלחנו לפתוח את הקובץ. נסו לשמור אותו מחדש כ-PDF ולהעלות שוב.' }, 400);
      }

      const { error: uploadError } = await storage.upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true });
      if (uploadError) return json({ error: 'שמירת הקובץ נכשלה' }, 500);
      if (uploadName !== 'document.pdf') await storage.remove([`${folder}/${uploadName}`]);
      return json({ pdfPath });
    }

    if (action !== 'create' && action !== 'replace') return json({ error: 'פעולה לא מוכרת' }, 400);

    const kind = body.kind;
    if (kind !== 'checklist' && kind !== 'pdf' && kind !== 'editor') return json({ error: 'סוג המסמך אינו תקין' }, 400);
    const formKind = kind === 'checklist' ? 'checklist' : 'document';

    // What is being saved: a new version of a company form ("replace form"),
    // or a new form.
    let title = '';
    let replacing: { id: string; version: number } | null = null;
    let sourceTemplateId: string | null = null;

    if (action === 'replace') {
      const { templateId, expectedVersion } = body;
      if (typeof templateId !== 'string' || !UUID.test(templateId) || !Number.isInteger(expectedVersion)) {
        return json({ error: 'חסרים פרטי הטופס' }, 400);
      }
      const { data: current } = await access.adminClient.from('signing_templates')
        .select('id, title, version, form_kind, archived_at, status')
        .eq('id', templateId).eq('company_id', companyId).maybeSingle();
      if (!current || current.archived_at || current.status !== 'ready') return json({ error: 'הטופס לא נמצא' }, 404);
      if ((current.form_kind ?? 'document') !== formKind) return json({ error: 'סוג הטופס החדש לא מתאים לטופס הקיים' }, 400);
      if (current.version !== expectedVersion) return json({ error: 'הטופס עודכן בינתיים. רעננו ונסו שוב.', code: 'stale' }, 409);
      replacing = { id: current.id, version: current.version };
      title = current.title;
    } else {
      title = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
      if (!title) return json({ error: 'חסר שם למסמך' }, 400);
      // Each document the company can send has its own name, so a driver's
      // folders and the manager's list never show two alike.
      const { data: named, error: namedError } = await access.adminClient.from('signing_templates')
        .select('title').or(`company_id.eq.${companyId},company_id.is.null`).eq('status', 'ready').is('archived_at', null);
      if (namedError) return json({ error: 'שמירת המסמך נכשלה. נסו שוב.' }, 500);
      if (FIXED_DRIVER_FOLDERS.some((name) => titleKey(name) === titleKey(title))) {
        return json({ error: 'יש כבר תיקייה קבועה בשם הזה בתיק הנהג. בחרו שם אחר.' }, 409);
      }
      if ((named ?? []).some((row) => titleKey(row.title) === titleKey(title))) {
        return json({ error: 'כבר יש מסמך בשם הזה. בחרו שם אחר.' }, 409);
      }
      // The owner's template it started from, kept only to count its use. One
      // that was hidden or does not match is not an error: the content the
      // company edited is what is saved either way.
      if (typeof body.sourceTemplateId === 'string' && UUID.test(body.sourceTemplateId) && kind !== 'pdf') {
        const { data: source } = await access.adminClient.from('form_templates')
          .select('id, kind').eq('id', body.sourceTemplateId).is('hidden_at', null).maybeSingle();
        if (source && source.kind === formKind) sourceTemplateId = source.id;
      }
    }

    if (kind === 'checklist') {
      const form = parseForm(body.form);
      if (!form) return json({ error: 'הסעיפים בטופס אינם תקינים' }, 400);
      let pdf: Uint8Array;
      try {
        pdf = await htmlToPdf(renderChecklistHtml({ title, form, letterhead: await companyLetterhead(access.adminClient, companyId), meeting: null }));
      } catch (error) {
        console.error('company-signing-template checklist preview failed', error instanceof Error ? error.message : 'unknown');
        return json({ error: 'יצירת הטופס נכשלה. נסו שוב בעוד רגע.' }, 502);
      }
      const { error: uploadError } = await storage.upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true });
      if (uploadError) return json({ error: 'שמירת הטופס נכשלה' }, 500);

      if (replacing) {
        const replaced = await replaceVersion(access.adminClient, companyId, replacing, null, pdfPath, `${title}.pdf`, form, null, access.callerId);
        if (!replaced.ok) {
          await storage.remove([pdfPath]);
          return json({ error: replaced.error, code: replaced.code }, replaced.status);
        }
        return json({ template: replaced.template, pendingOld: replaced.pendingOld });
      }

      const { data: row, error: insertError } = await access.adminClient
        .from('signing_templates')
        .insert({
          company_id: companyId, created_by: access.callerId, title, source_file_path: pdfPath, source_file_name: `${title}.pdf`,
          status: 'ready', form_kind: 'checklist', form_content: form, source_template_id: sourceTemplateId,
        })
        .select('*')
        .single();
      if (insertError || !row) {
        await storage.remove([pdfPath]);
        return json({ error: 'שמירת הטופס נכשלה' }, 500);
      }
      return json({ template: row });
    }

    let fields: PlacedField[] | null = null;
    let pageSizes: Array<{ width: number; height: number }> = [];
    let rendered: string | null = null;
    // A document written in the editor keeps its text, so its next version
    // opens with it (an uploaded file has nothing to keep).
    let editorContent: Record<string, unknown> | null = null;
    if (kind === 'pdf') {
      fields = parseFields(body.fields);
      if (!fields) return json({ error: 'השדות על המסמך אינם תקינים' }, 400);
      if (!fields.some((f) => f.kind === 'signature')) return json({ error: 'צריך להוסיף לפחות שדה חתימה אחד' }, 400);
    } else {
      if (!Array.isArray(body.fields) || !body.fields.some((f: unknown) => (f as { kind?: unknown } | null)?.kind === 'signature')) {
        return json({ error: 'צריך להוסיף לפחות שדה חתימה אחד' }, 400);
      }
      const content = cleanEditorContent(body.blocks, body.fields);
      if (!content) return json({ error: 'תוכן המסמך אינו תקין' }, 400);
      rendered = renderEditorDocument(content.blocks, content.fields, await companyLetterhead(access.adminClient, companyId));
      if (!rendered) return json({ error: 'תוכן המסמך אינו תקין' }, 400);
      editorContent = content;
    }

    if (kind === 'pdf') {
      const { data: blob, error } = await storage.download(pdfPath);
      if (error || !blob) return json({ error: 'הקובץ של המסמך לא נמצא. העלו אותו שוב.' }, 400);
      const parsed = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), { ignoreEncryption: true });
      pageSizes = parsed.getPages().map((p) => p.getSize());
      if (fields!.some((f) => f.page > pageSizes.length)) return json({ error: 'אחד השדות נמצא בעמוד שלא קיים' }, 400);
    }

    // A replacement builds its DocuSeal template first and swaps it in at the
    // end; a new form gets its row first.
    let rowId: string;
    if (replacing) {
      rowId = replacing.id;
    } else {
      const { data: row, error: insertError } = await access.adminClient
        .from('signing_templates')
        .insert({
          company_id: companyId, created_by: access.callerId, title, source_file_path: pdfPath, source_file_name: `${title}.pdf`,
          status: 'draft', editor_content: editorContent, source_template_id: sourceTemplateId,
        })
        .select('id')
        .single();
      if (insertError || !row) return json({ error: 'שמירת המסמך נכשלה' }, 500);
      rowId = row.id;
    }

    const folderName = `FleetOS-${companyId}`;
    let remote: RemoteTemplate | null = null;
    try {
      if (kind === 'pdf') {
        const { data: signed, error } = await storage.createSignedUrl(pdfPath, 60 * 30);
        if (error || !signed?.signedUrl) throw new Error('signed url failed');
        remote = await createFromPdf(title, folderName, rowId, signed.signedUrl, fields!, pageSizes);
      } else {
        const response = await docusealFetch('/templates/html', {
          method: 'POST',
          body: JSON.stringify({ name: title, html: rendered!, size: 'A4', folder_name: folderName, external_id: rowId }),
        });
        if (!response.ok) throw new Error(`DocuSeal rejected the html template (${response.status})`);
        remote = await response.json() as RemoteTemplate;
        // Keep our own copy of the generated PDF: previews and downloads read it.
        const url = remote.documents?.[0]?.url;
        if (!url) throw new Error('html template returned no document');
        const pdf = await fetch(url);
        if (!pdf.ok) throw new Error('html template pdf download failed');
        const { error: uploadError } = await storage.upload(pdfPath, new Uint8Array(await pdf.arrayBuffer()), { contentType: 'application/pdf', upsert: true });
        if (uploadError) throw new Error('storing the generated pdf failed');
      }
      if (!remote?.id) throw new Error('DocuSeal returned no template id');
    } catch (error) {
      console.error('company-signing-template create failed', error instanceof Error ? error.message : 'unknown');
      await deleteRemoteTemplate(remote?.id);
      if (replacing) await storage.remove([pdfPath]);
      else await access.adminClient.from('signing_templates').delete().eq('id', rowId).eq('status', 'draft');
      return json({ error: 'יצירת המסמך ב-DocuSeal נכשלה. נסו שוב בעוד רגע.' }, 502);
    }

    if (replacing) {
      const replaced = await replaceVersion(access.adminClient, companyId, replacing, remote.id, pdfPath, `${title}.pdf`, null, editorContent, access.callerId);
      if (!replaced.ok) {
        // Only the new version is undone. The old DocuSeal template stays: deleting
        // it can take the drivers' signatures on it down with it.
        await deleteRemoteTemplate(remote.id);
        await storage.remove([pdfPath]);
        return json({ error: replaced.error, code: replaced.code }, replaced.status);
      }
      return json({ template: replaced.template, pendingOld: replaced.pendingOld });
    }

    const { data: ready, error: readyError } = await access.adminClient
      .from('signing_templates')
      .update({ docuseal_template_id: remote.id, status: 'ready', updated_at: new Date().toISOString() })
      .eq('id', rowId)
      .select('*')
      .single();
    if (readyError || !ready) {
      console.error('company-signing-template ready failed', readyError?.message ?? 'no row');
      await deleteRemoteTemplate(remote.id);
      await access.adminClient.from('signing_templates').delete().eq('id', rowId).eq('status', 'draft');
      return json({ error: 'יצירת המסמך ב-DocuSeal נכשלה. נסו שוב בעוד רגע.' }, 502);
    }
    return json({ template: ready });
  } catch (error) {
    console.error('company-signing-template failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'הפעולה נכשלה' }, 500);
  }
});
