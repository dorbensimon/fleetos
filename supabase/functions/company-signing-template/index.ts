import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';
import { PDFDocument } from 'pdf-lib';

/**
 * A company admin's own signing templates (desktop "מסמכים חתומים").
 *
 * `prepare` turns an uploaded image or Word file into the draft's PDF, so the
 * browser can show its pages while the admin places fields.
 * `create` builds the DocuSeal template, either from the admin's placed fields
 * on that PDF, or from a document written in the in-app editor (sent here as
 * a block model plus pixel field positions, never as raw HTML, so nothing the
 * browser sends is rendered verbatim), and saves it as a ready company template.
 *
 * Every draft lives in `<companyId>/signing-templates/<draftId>/`; its final
 * PDF is always `document.pdf` there, the path the template row points to.
 */

const SIGNER_ROLE = 'נהג';
const MAX_FIELDS = 120;
const MAX_BLOCKS = 400;
const MAX_TEXT = 60_000;

type FieldKind =
  | 'signature' | 'date' | 'checkbox' | 'text'
  | 'driver_full_name' | 'driver_national_id' | 'driver_phone' | 'driver_license_number' | 'company_name';

const PREFILL_KINDS: Record<string, string> = {
  driver_full_name: 'שם הנהג',
  driver_national_id: 'תעודת זהות',
  driver_phone: 'טלפון הנהג',
  driver_license_number: 'מספר רישיון',
  company_name: 'שם החברה',
};
const FIELD_KINDS = new Set<string>(['signature', 'date', 'checkbox', 'text', ...Object.keys(PREFILL_KINDS)]);

type PlacedField = { kind: FieldKind; label?: string; page: number; x: number; y: number; w: number; h: number };
type Inline = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };
type EditorField = { kind: FieldKind; label?: string; x: number; y: number; w: number; h: number };
type Block = { type: 'h1' | 'h2' | 'p' | 'ul' | 'ol'; align?: 'right' | 'center' | 'left'; content: Inline[][] };

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function cleanLabel(label: unknown, fallback: string): string {
  const text = typeof label === 'string' ? label.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return text || fallback;
}

/**
 * DocuSeal field names: a signature or date shared across the document is one
 * value the driver fills once; every checkbox and free-text field is its own.
 */
function fieldIdentity(kind: FieldKind, label: unknown, counters: Record<string, number>, used: Set<string>) {
  if (kind === 'signature') return { name: 'חתימה', type: 'signature', title: 'חתימה' };
  if (kind === 'date') return { name: 'תאריך', type: 'date', title: 'תאריך' };
  if (kind in PREFILL_KINDS) return { name: kind, type: 'text', title: PREFILL_KINDS[kind] };
  counters[kind] = (counters[kind] ?? 0) + 1;
  const base = cleanLabel(label, kind === 'checkbox' ? `אישור ${counters[kind]}` : `שדה ${counters[kind]}`);
  let name = base;
  for (let n = 2; used.has(name); n += 1) name = `${base} (${n})`;
  used.add(name);
  return { name, type: kind === 'checkbox' ? 'checkbox' : 'text', title: base };
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

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The editor's page geometry and type sizes (lib/companySigningTemplates.ts
 * EDITOR_PAGE and the `.sd-paper-page` / `.sd-doc` styles). Fields arrive as
 * pixels on that page and are drawn at the same spot here.
 */
const PAGE = { width: 794, height: 1123, padX: 72, padY: 64, headerH: 72, headerGap: 32 };

/** The date on the letterhead: read-only for the driver; DocuSeal stamps it with the day the document is signed. */
const LETTERHEAD_DATE_FIELD = 'תאריך המסמך';

type Letterhead = { name: string; logoUrl: string | null };

/** The company's letterhead, drawn exactly like the editor's `.sd-lh` (same box sizes, so the text below starts at the same spot). */
function renderLetterhead({ name, logoUrl }: Letterhead): string {
  const logo = logoUrl
    ? `<span class="lh-logo"><img src="${escapeHtml(logoUrl)}" alt=""></span>`
    : `<span class="lh-logo lh-mono">${escapeHtml(name.charAt(0))}</span>`;
  return `<div class="lh">
  <div class="lh-brand">${logo}<span class="lh-name">${escapeHtml(name)}</span></div>
  <div class="lh-date"><span class="lh-label">תאריך</span><date-field name="${LETTERHEAD_DATE_FIELD}" title="${LETTERHEAD_DATE_FIELD}" role="${SIGNER_ROLE}" readonly="true" required="false" default="{{date}}" format="DD/MM/YYYY" font-size="16" align="left" style="width: 110px; height: 22px; display: block;"></date-field></div>
</div>`;
}

function parseEditorFields(raw: unknown): EditorField[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FIELDS) return null;
  const fields: EditorField[] = [];
  for (const f of raw) {
    if (!f || typeof f !== 'object') return null;
    const { kind, label, x, y, w, h } = f as Record<string, unknown>;
    if (typeof kind !== 'string' || !FIELD_KINDS.has(kind)) return null;
    if (![x, y, w, h].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) return null;
    const box = { x: x as number, y: y as number, w: w as number, h: h as number };
    if (box.w < 4 || box.h < 4 || box.x + box.w > PAGE.width + 1 || box.y > PAGE.height * 200) return null;
    fields.push({ kind: kind as FieldKind, label: typeof label === 'string' ? label : undefined, ...box });
  }
  return fields;
}

function renderEditorDocument(raw: unknown, fields: EditorField[], letterhead: Letterhead): string | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BLOCKS) return null;
  const counters: Record<string, number> = {};
  const used = new Set<string>();
  let textLength = 0;

  const inline = (item: unknown): string | null => {
    if (!item || typeof item !== 'object') return null;
    const node = item as Record<string, unknown>;
    if (typeof node.text !== 'string') return null;
    textLength += node.text.length;
    let html = escapeHtml(node.text).replace(/\n/g, '<br>');
    if (node.bold) html = `<strong>${html}</strong>`;
    if (node.italic) html = `<em>${html}</em>`;
    if (node.underline) html = `<u>${html}</u>`;
    return html;
  };

  const line = (items: unknown): string | null => {
    if (!Array.isArray(items)) return null;
    const parts = items.map(inline);
    return parts.some((p) => p === null) ? null : (parts.join('') || '<br>');
  };

  const out: string[] = [];
  for (const block of raw) {
    if (!block || typeof block !== 'object') return null;
    const { type, align, content } = block as Record<string, unknown>;
    if (!['h1', 'h2', 'p', 'ul', 'ol'].includes(type as string) || !Array.isArray(content) || content.length === 0) return null;
    const textAlign = align === 'center' || align === 'left' ? align : 'right';
    const lines = content.map(line);
    if (lines.some((l) => l === null)) return null;
    if (type === 'ul' || type === 'ol') {
      out.push(`<${type} style="text-align: ${textAlign}">${lines.map((l) => `<li>${l}</li>`).join('')}</${type}>`);
    } else {
      out.push(`<${type} style="text-align: ${textAlign}">${lines[0]}</${type}>`);
    }
  }
  if (textLength > MAX_TEXT) return null;

  // Fields float over the text at the pixel spot the admin dropped them on.
  const tags = fields.map((f) => {
    const id = fieldIdentity(f.kind, f.label, counters, used);
    const tag = `${id.type}-field`;
    const style = `position: absolute; left: ${f.x.toFixed(1)}px; top: ${f.y.toFixed(1)}px; width: ${f.w.toFixed(1)}px; height: ${f.h.toFixed(1)}px;`;
    return `<${tag} name="${escapeHtml(id.name)}" title="${escapeHtml(id.title)}" role="${SIGNER_ROLE}" required="${f.kind === 'checkbox' ? 'false' : 'true'}" style="${style}"></${tag}>`;
  });

  return `<!doctype html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700&display=swap">
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; }
  .page { position: relative; box-sizing: border-box; width: ${PAGE.width}px; padding: ${PAGE.padY}px ${PAGE.padX}px; }
  .doc { font-family: 'Heebo', 'Arial Hebrew', 'DejaVu Sans', Arial, sans-serif; font-size: 16px; line-height: 1.8; color: #111; direction: rtl; text-align: right; }
  h1 { font-size: 28px; line-height: 1.3; margin: 0 0 16px; font-weight: 700; }
  h2 { font-size: 20px; line-height: 1.4; margin: 20px 0 8px; font-weight: 700; }
  p { margin: 0 0 8px; }
  ul, ol { margin: 0 0 8px; padding-right: 26px; padding-left: 0; }
  strong { font-weight: 700; }
  .lh { position: relative; height: ${PAGE.headerH}px; margin-bottom: ${PAGE.headerGap}px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding-bottom: 16px; border-bottom: 1px solid #E1E6EA; direction: rtl; font-family: 'Heebo', 'Arial Hebrew', Arial, sans-serif; }
  .lh::after { content: ''; position: absolute; right: 0; bottom: -2px; width: 56px; height: 3px; border-radius: 2px; background: #0088CC; }
  .lh-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .lh-logo { flex: none; width: 52px; height: 52px; border-radius: 13px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #F4F6F8; }
  .lh-logo img { width: 100%; height: 100%; object-fit: contain; }
  .lh-mono { background: linear-gradient(160deg, #35B8F0, #0088CC); color: #fff; font-weight: 700; font-size: 24px; }
  .lh-name { font-size: 22px; line-height: 1.2; font-weight: 700; color: #16222E; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lh-date { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .lh-label { font-size: 12px; line-height: 1.2; color: #8B98A4; }
</style>
</head>
<body><div class="page">${renderLetterhead(letterhead)}<div class="doc">${out.join('\n')}</div>${tags.join('')}</div></body>
</html>`;
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
      else byName.set(id.name, { name: id.name, title: id.title, type: id.type, role: SIGNER_ROLE, required: f.kind !== 'checkbox', areas: [area] });
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
    if (typeof draftId !== 'string' || !UUID.test(draftId)) return json({ error: 'מזהה הטיוטה אינו תקין' }, 400);

    const folder = draftFolder(companyId, draftId);
    const pdfPath = `${folder}/document.pdf`;
    const storage = access.adminClient.storage.from('documents');

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

    if (action !== 'create') return json({ error: 'פעולה לא מוכרת' }, 400);

    const title = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    if (!title) return json({ error: 'חסר שם למסמך' }, 400);
    const kind = body.kind;
    if (kind !== 'pdf' && kind !== 'editor') return json({ error: 'סוג המסמך אינו תקין' }, 400);

    let fields: PlacedField[] | null = null;
    let pageSizes: Array<{ width: number; height: number }> = [];
    let rendered: string | null = null;
    if (kind === 'pdf') {
      fields = parseFields(body.fields);
      if (!fields) return json({ error: 'השדות על המסמך אינם תקינים' }, 400);
      if (!fields.some((f) => f.kind === 'signature')) return json({ error: 'צריך להוסיף לפחות שדה חתימה אחד' }, 400);
    } else {
      const editorFields = parseEditorFields(body.fields);
      if (!editorFields) return json({ error: 'השדות על המסמך אינם תקינים' }, 400);
      if (!editorFields.some((f) => f.kind === 'signature')) return json({ error: 'צריך להוסיף לפחות שדה חתימה אחד' }, 400);
      // The letterhead comes from the company's own record, never from the request.
      const { data: company } = await access.adminClient.from('companies').select('name, logo_url').eq('id', companyId).single();
      const logosPrefix = `${Deno.env.get('SUPABASE_URL') ?? ''}/storage/v1/object/public/company-logos/`;
      const logoUrl = typeof company?.logo_url === 'string' && company.logo_url.startsWith(logosPrefix) ? company.logo_url : null;
      rendered = renderEditorDocument(body.blocks, editorFields, { name: (company?.name ?? '').trim() || 'החברה', logoUrl });
      if (!rendered) return json({ error: 'תוכן המסמך אינו תקין' }, 400);
    }

    if (kind === 'pdf') {
      const { data: blob, error } = await storage.download(pdfPath);
      if (error || !blob) return json({ error: 'הקובץ של המסמך לא נמצא. העלו אותו שוב.' }, 400);
      const parsed = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), { ignoreEncryption: true });
      pageSizes = parsed.getPages().map((p) => p.getSize());
      if (fields!.some((f) => f.page > pageSizes.length)) return json({ error: 'אחד השדות נמצא בעמוד שלא קיים' }, 400);
    }

    const { data: row, error: insertError } = await access.adminClient
      .from('signing_templates')
      .insert({ company_id: companyId, created_by: access.callerId, title, source_file_path: pdfPath, source_file_name: `${title}.pdf`, status: 'draft' })
      .select('id')
      .single();
    if (insertError || !row) return json({ error: 'שמירת המסמך נכשלה' }, 500);

    const folderName = `FleetOS-${companyId}`;
    let remote: RemoteTemplate | null = null;
    try {
      if (kind === 'pdf') {
        const { data: signed, error } = await storage.createSignedUrl(pdfPath, 60 * 30);
        if (error || !signed?.signedUrl) throw new Error('signed url failed');
        remote = await createFromPdf(title, folderName, row.id, signed.signedUrl, fields!, pageSizes);
      } else {
        const response = await docusealFetch('/templates/html', {
          method: 'POST',
          body: JSON.stringify({ name: title, html: rendered!, size: 'A4', folder_name: folderName, external_id: row.id }),
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

      const { data: ready, error: readyError } = await access.adminClient
        .from('signing_templates')
        .update({ docuseal_template_id: remote.id, status: 'ready', updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .select('*')
        .single();
      if (readyError || !ready) throw new Error('marking the template ready failed');
      return json({ template: ready });
    } catch (error) {
      console.error('company-signing-template create failed', error instanceof Error ? error.message : 'unknown');
      await deleteRemoteTemplate(remote?.id);
      await access.adminClient.from('signing_templates').delete().eq('id', row.id);
      return json({ error: 'יצירת המסמך ב-DocuSeal נכשלה. נסו שוב בעוד רגע.' }, 502);
    }
  } catch (error) {
    console.error('company-signing-template failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'הפעולה נכשלה' }, 500);
  }
});
