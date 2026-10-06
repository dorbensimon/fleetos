import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { verifyOwner } from '../_shared/verifyOwner.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Folders for every driver's file (migration 107, plans/folder_catalog_plan.md).
 *
 * The platform owner keeps the catalog: `catalog-*` actions.
 * A company (its admin, or the owner for it) adds a folder to all its drivers,
 * links an existing form to it, or removes it: `company-*` actions.
 * The folder's form itself is created and replaced in company-signing-template.
 *
 * Every write goes through here or the SQL functions it calls; the browser
 * only reads these tables.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The fixed folders of every driver's file (company-signing-template FIXED_DRIVER_FOLDERS). */
const FIXED_DRIVER_FOLDERS = ['הצהרת בריאות', 'הדרכות תקופתיות', 'נוהל 6 (הסעת ילדים)', 'נוהל 6', 'רישיון מנוף', 'תוקף ר.פ'];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function titleKey(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('he');
}

function cleanTitle(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
}

function cleanDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, 300);
  return text || null;
}

/** null = not sent / cleared; undefined = invalid. */
function intOrNull(value: unknown, min: number, max: number): number | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

/** Reads the owner's defaults for a folder of `kind`, or an error message. */
function readDefaults(body: Record<string, unknown>, kind: 'document' | 'checklist') {
  const validMonths = intOrNull(body.defaultValidMonths, 1, 120);
  const leadDays = intOrNull(body.defaultLeadDays, 1, 90);
  const repeatMonths = intOrNull(body.defaultRepeatMonths, 0, 24);
  if (validMonths === undefined || leadDays === undefined || repeatMonths === undefined) return { error: 'ברירות המחדל אינן תקינות' };
  return {
    default_valid_months: kind === 'document' ? validMonths : null,
    default_lead_days: leadDays ?? 30,
    default_repeat_months: kind === 'checklist' ? repeatMonths : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const body = await req.json() as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    if (action.startsWith('catalog-')) {
      const owner = await verifyOwner(req.headers.get('Authorization'));
      if (!owner.ok) return json({ error: owner.error }, owner.status);
      return await catalogAction(owner.adminClient, owner.ownerId, action, body);
    }

    if (action.startsWith('company-')) {
      const companyId = typeof body.companyId === 'string' && UUID.test(body.companyId) ? body.companyId : null;
      const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId);
      if (!access.ok) return json({ error: access.error }, access.status);
      if (access.callerRole !== 'admin' && access.callerRole !== 'owner') return json({ error: 'אין הרשאה לנהל תיקיות' }, 403);
      return await companyAction(access.adminClient, access.callerId, companyId!, action, body);
    }

    return json({ error: 'פעולה לא מוכרת' }, 400);
  } catch (error) {
    console.error('folder-catalog failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'הפעולה נכשלה' }, 500);
  }
});

// ── The owner's catalog ─────────────────────────────────────────────

async function catalogAction(db: SupabaseClient, ownerId: string, action: string, body: Record<string, unknown>): Promise<Response> {
  if (action === 'catalog-list') {
    const [{ data: folders, error }, { data: added, error: addedError }] = await Promise.all([
      db.from('folder_catalog').select('*').order('sort_order').order('created_at'),
      db.from('company_catalog_folders').select('catalog_id, removed_at'),
    ]);
    if (error || addedError) return json({ error: 'טעינת התיקיות נכשלה' }, 500);
    const usage = new Map<string, { active: number; ever: number }>();
    for (const row of added ?? []) {
      const entry = usage.get(row.catalog_id) ?? { active: 0, ever: 0 };
      entry.ever += 1;
      if (!row.removed_at) entry.active += 1;
      usage.set(row.catalog_id, entry);
    }
    return json({
      folders: (folders ?? []).map((folder) => ({
        ...folder,
        companies: usage.get(folder.id)?.active ?? 0,
        everAdded: (usage.get(folder.id)?.ever ?? 0) > 0,
      })),
    });
  }

  if (action === 'catalog-create') {
    const title = cleanTitle(body.title);
    const kind = body.kind;
    if (!title) return json({ error: 'חסר שם לתיקייה' }, 400);
    if (kind !== 'document' && kind !== 'checklist') return json({ error: 'סוג התיקייה אינו תקין' }, 400);
    if (FIXED_DRIVER_FOLDERS.some((name) => titleKey(name) === titleKey(title))) {
      return json({ error: 'יש כבר תיקייה קבועה בשם הזה בתיק הנהג. בחרו שם אחר.' }, 409);
    }
    const defaults = readDefaults(body, kind);
    if ('error' in defaults) return json({ error: defaults.error }, 400);
    const { data: last } = await db.from('folder_catalog').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    const { data: folder, error } = await db.from('folder_catalog').insert({
      title, kind, description: cleanDescription(body.description), sort_order: (last?.sort_order ?? -1) + 1,
      created_by: ownerId, ...defaults,
    }).select('*').single();
    if (error?.code === '23505') return json({ error: 'כבר יש תיקייה בשם הזה' }, 409);
    if (error || !folder) return json({ error: 'יצירת התיקייה נכשלה' }, 500);
    return json({ folder });
  }

  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : null;

  if (action === 'catalog-reorder') {
    const ids = Array.isArray(body.ids) ? body.ids.filter((value): value is string => typeof value === 'string' && UUID.test(value)) : [];
    if (!ids.length || ids.length > 200) return json({ error: 'הסדר אינו תקין' }, 400);
    for (const [index, folderId] of ids.entries()) {
      const { error } = await db.from('folder_catalog').update({ sort_order: index }).eq('id', folderId);
      if (error) return json({ error: 'שמירת הסדר נכשלה' }, 500);
    }
    return json({ success: true });
  }

  if (!id) return json({ error: 'התיקייה לא נמצאה' }, 400);
  const { data: current } = await db.from('folder_catalog').select('*').eq('id', id).maybeSingle();
  if (!current) return json({ error: 'התיקייה לא נמצאה' }, 404);

  if (action === 'catalog-update') {
    const defaults = readDefaults(body, current.kind);
    if ('error' in defaults) return json({ error: defaults.error }, 400);
    const title = body.title === undefined ? current.title : cleanTitle(body.title);
    if (!title) return json({ error: 'חסר שם לתיקייה' }, 400);
    if (FIXED_DRIVER_FOLDERS.some((name) => titleKey(name) === titleKey(title))) {
      return json({ error: 'יש כבר תיקייה קבועה בשם הזה בתיק הנהג. בחרו שם אחר.' }, 409);
    }

    if (title !== current.title) {
      // The folder and every company's form in it are renamed in one transaction.
      const { data: remoteIds, error } = await db.rpc('catalog_rename', { target_catalog: id, new_title: title });
      if (error?.code === '23505') return json({ error: 'כבר יש תיקייה בשם הזה' }, 409);
      if (error) return json({ error: error.message?.startsWith('לחברה') ? error.message : 'שינוי השם נכשל' }, 409);
      // DocuSeal shows the name to the driver; a miss there breaks nothing here.
      for (const row of (remoteIds ?? []) as Array<{ docuseal_template_id: number }>) {
        const response = await docusealFetch(`/templates/${row.docuseal_template_id}`, { method: 'PUT', body: JSON.stringify({ name: title }) });
        if (!response.ok) console.error('folder-catalog: docuseal rename failed', row.docuseal_template_id, response.status);
      }
    }
    const { data: folder, error } = await db.from('folder_catalog')
      .update({ description: cleanDescription(body.description), ...defaults }).eq('id', id).select('*').single();
    if (error || !folder) return json({ error: 'שמירת התיקייה נכשלה' }, 500);
    return json({ folder });
  }

  if (action === 'catalog-retire') {
    const retired = body.retired !== false;
    const { error } = await db.from('folder_catalog').update({ retired_at: retired ? new Date().toISOString() : null }).eq('id', id);
    if (error) return json({ error: 'שמירת התיקייה נכשלה' }, 500);
    return json({ success: true });
  }

  if (action === 'catalog-delete') {
    const { error } = await db.from('folder_catalog').delete().eq('id', id);
    // on delete restrict: a company added it at some point.
    if (error?.code === '23503') return json({ error: 'חברות כבר הוסיפו את התיקייה. אפשר להוציא אותה משימוש במקום.', code: 'in_use' }, 409);
    if (error) return json({ error: 'מחיקת התיקייה נכשלה' }, 500);
    return json({ success: true });
  }

  return json({ error: 'פעולה לא מוכרת' }, 400);
}

// ── A company's folders ─────────────────────────────────────────────

async function companyAction(db: SupabaseClient, actor: string, companyId: string, action: string, body: Record<string, unknown>): Promise<Response> {
  if (action === 'company-list') {
    const [folders, added, templates, drivers] = await Promise.all([
      db.from('folder_catalog').select('id, title, kind, description, sort_order, retired_at, default_valid_months, default_lead_days, default_repeat_months')
        .order('sort_order').order('created_at'),
      db.from('company_catalog_folders').select('catalog_id, removed_at, added_at').eq('company_id', companyId),
      db.from('signing_templates').select('id, title, form_kind, status, archived_at, catalog_folder_id, version, updated_at')
        .eq('company_id', companyId).eq('status', 'ready'),
      db.from('driver_details').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'active'),
    ]);
    if (folders.error || added.error || templates.error || drivers.error) return json({ error: 'טעינת התיקיות נכשלה' }, 500);
    const addedBy = new Map((added.data ?? []).map((row) => [row.catalog_id, row]));
    const formBy = new Map((templates.data ?? []).filter((t) => t.catalog_folder_id).map((t) => [t.catalog_folder_id, t]));
    const own = (templates.data ?? []).filter((t) => !t.catalog_folder_id && !t.archived_at);
    return json({
      driverCount: drivers.count ?? 0,
      folders: (folders.data ?? [])
        // A retired folder is still shown to a company that has (or had) it.
        .filter((folder) => !folder.retired_at || addedBy.has(folder.id))
        .map((folder) => {
          const row = addedBy.get(folder.id);
          const form = formBy.get(folder.id) ?? null;
          const twin = own.find((t) => titleKey(t.title) === titleKey(folder.title));
          return {
            ...folder,
            added: Boolean(row && !row.removed_at),
            form: form ? { id: form.id, version: form.version, updatedAt: form.updated_at } : null,
            // An own document of the same name: the add window offers to link it.
            sameName: twin && !form ? { id: twin.id, kind: twin.form_kind } : null,
            linkable: form ? [] : own.filter((t) => t.form_kind === folder.kind).map((t) => ({ id: t.id, title: t.title })),
          };
        }),
    });
  }

  const catalogId = typeof body.catalogId === 'string' && UUID.test(body.catalogId) ? body.catalogId : null;
  if (!catalogId) return json({ error: 'התיקייה לא נמצאה' }, 400);

  if (action === 'company-add') {
    const linkTemplateId = typeof body.linkTemplateId === 'string' && UUID.test(body.linkTemplateId) ? body.linkTemplateId : null;
    const { data: folder } = await db.from('folder_catalog').select('id, title, kind').eq('id', catalogId).maybeSingle();
    if (!folder) return json({ error: 'התיקייה לא נמצאה' }, 404);
    // An own document already carries this name: link it, or nothing (two alike would confuse every driver's file).
    if (!linkTemplateId) {
      const { data: hasForm } = await db.from('signing_templates').select('id')
        .eq('company_id', companyId).eq('catalog_folder_id', catalogId).maybeSingle();
      if (!hasForm) {
        const { data: own } = await db.from('signing_templates').select('id, title, form_kind')
          .eq('company_id', companyId).eq('status', 'ready').is('archived_at', null).is('catalog_folder_id', null);
        const clash = (own ?? []).find((t) => titleKey(t.title) === titleKey(folder.title));
        if (clash) {
          return clash.form_kind === folder.kind
            ? json({ error: 'יש לכם כבר מסמך בשם הזה. אפשר לקשר אותו לתיקייה.', code: 'can_link', templateId: clash.id }, 409)
            : json({ error: 'יש לכם כבר מסמך מסוג אחר בשם הזה. מחקו אותו או פנו לתמיכה.', code: 'name_taken' }, 409);
        }
      }
    }
    const { data: formId, error } = await db.rpc('catalog_add_folder', {
      target_company: companyId, target_catalog: catalogId, actor, link_template: linkTemplateId,
    });
    if (error) return json({ error: knownMessage(error.message) ?? 'הוספת התיקייה נכשלה' }, 409);
    return json({ success: true, templateId: formId ?? null });
  }

  if (action === 'company-remove') {
    const cancelPending = body.cancelPending === true;
    const remove = () => db.rpc('catalog_remove_folder', { target_company: companyId, target_catalog: catalogId, actor });
    let { data: waiting, error } = await remove();
    if (error) return json({ error: knownMessage(error.message) ?? 'הסרת התיקייה נכשלה' }, 409);
    if ((waiting as number) > 0) {
      if (!cancelPending) return json({ pending: waiting });
      const cancelled = await cancelPendingRequests(db, actor, companyId, catalogId);
      if (!cancelled.ok) return json({ error: cancelled.error }, cancelled.status);
      ({ data: waiting, error } = await remove());
      if (error) return json({ error: knownMessage(error.message) ?? 'הסרת התיקייה נכשלה' }, 409);
      // Someone sent the form again meanwhile.
      if ((waiting as number) > 0) return json({ pending: waiting });
    }
    return json({ success: true });
  }

  return json({ error: 'פעולה לא מוכרת' }, 400);
}

/** The SQL functions' own Hebrew messages are safe to show; anything else is not. */
function knownMessage(message: string | undefined): string | null {
  return message && /[֐-׿]/.test(message) ? message : null;
}

/**
 * Cancels every request still waiting on the folder's form, the same way a
 * manager cancels one (delete-signing-record "archive"): reserve the row, delete
 * the DocuSeal submission, then mark it cancelled. A driver signing right now
 * is never cut in half.
 */
async function cancelPendingRequests(db: SupabaseClient, actor: string, companyId: string, catalogId: string) {
  const { data: form } = await db.from('signing_templates').select('id').eq('company_id', companyId).eq('catalog_folder_id', catalogId).maybeSingle();
  if (!form) return { ok: true as const };
  const { data: requests, error } = await db.from('signature_requests')
    .select('id, docuseal_submission_id')
    .eq('template_id', form.id).eq('company_id', companyId).eq('status', 'pending').is('archived_at', null).is('deleted_at', null);
  if (error) return { ok: false as const, status: 500, error: 'טעינת המסמכים הממתינים נכשלה' };

  for (const request of requests ?? []) {
    const startedAt = new Date().toISOString();
    const lockUntil = new Date(Date.now() + 3 * 60_000).toISOString();
    const { data: claimed } = await db.from('signature_requests')
      .update({ sync_locked_until: lockUntil })
      .eq('id', request.id).eq('status', 'pending')
      .or(`sync_locked_until.is.null,sync_locked_until.lt.${startedAt}`)
      .select('id').maybeSingle();
    if (!claimed) return { ok: false as const, status: 409, error: 'נהג חותם על המסמך ברגע זה. חכו רגע ונסו שוב.' };
    if (request.docuseal_submission_id) {
      const response = await docusealFetch(`/submissions/${request.docuseal_submission_id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        await db.from('signature_requests').update({ sync_locked_until: null }).eq('id', request.id).eq('sync_locked_until', lockUntil);
        return { ok: false as const, status: 502, error: 'לא ניתן לבטל את החתימות ב-DocuSeal כרגע. נסו שוב.' };
      }
    }
    const now = new Date().toISOString();
    await db.from('signature_requests').update({
      status: 'cancelled', cancelled_at: now, cancelled_by: actor, archived_at: now, archived_by: actor,
      next_email_reminder_at: null, email_reminder_locked_until: null, sync_locked_until: null,
    }).eq('id', request.id).eq('status', 'pending').eq('sync_locked_until', lockUntil);
  }
  return { ok: true as const };
}
