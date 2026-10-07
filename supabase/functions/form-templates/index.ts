import { corsHeaders } from '../_shared/cors.ts';
import { verifyOwner } from '../_shared/verifyOwner.ts';
import { parseForm } from '../_shared/checklistDocument.ts';
import { cleanEditorContent } from '../_shared/editorDocument.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * The platform owner's form templates (migration 110). A company may start a
 * new form from one; its form is then its own copy (company-signing-template),
 * and nothing here ever changes it.
 *
 * Owner only. Managers read the visible templates straight from the table
 * (RLS); every write goes through here, so the stored content is always one
 * the editor or the checklist builder can open.
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

/** The template's content, checked the same way a company form is; null when invalid. */
function cleanContent(kind: 'document' | 'checklist', raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  if (kind === 'checklist') return parseForm(raw);
  const { blocks, fields } = raw as Record<string, unknown>;
  return cleanEditorContent(blocks, fields);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  try {
    const owner = await verifyOwner(req.headers.get('Authorization'));
    if (!owner.ok) return json({ error: owner.error }, owner.status);
    const body = await req.json() as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';
    return await run(owner.adminClient, owner.ownerId, action, body);
  } catch (error) {
    console.error('form-templates failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'הפעולה נכשלה' }, 500);
  }
});

async function run(db: SupabaseClient, ownerId: string, action: string, body: Record<string, unknown>): Promise<Response> {
  if (action === 'list') {
    const [{ data: templates, error }, { data: used, error: usedError }] = await Promise.all([
      db.from('form_templates').select('id, title, kind, description, content, sort_order, hidden_at, created_at, updated_at')
        .order('sort_order').order('created_at'),
      db.from('signing_templates').select('source_template_id, company_id')
        .not('source_template_id', 'is', null).not('company_id', 'is', null).is('archived_at', null).eq('status', 'ready'),
    ]);
    if (error || usedError) return json({ error: 'טעינת השבלונות נכשלה' }, 500);
    const companies = new Map<string, Set<string>>();
    for (const row of used ?? []) {
      const set = companies.get(row.source_template_id) ?? new Set<string>();
      set.add(row.company_id);
      companies.set(row.source_template_id, set);
    }
    return json({
      templates: (templates ?? []).map((template) => ({ ...template, companies: companies.get(template.id)?.size ?? 0 })),
    });
  }

  if (action === 'create') {
    const title = cleanTitle(body.title);
    const kind = body.kind;
    if (!title) return json({ error: 'חסר שם לשבלונה' }, 400);
    if (kind !== 'document' && kind !== 'checklist') return json({ error: 'סוג השבלונה אינו תקין' }, 400);
    if (FIXED_DRIVER_FOLDERS.some((name) => titleKey(name) === titleKey(title))) {
      return json({ error: 'יש כבר תיקייה קבועה בשם הזה בתיק הנהג. בחרו שם אחר.' }, 409);
    }
    const content = cleanContent(kind, body.content);
    if (!content) return json({ error: kind === 'checklist' ? 'הסעיפים בשבלונה אינם תקינים' : 'תוכן השבלונה אינו תקין. ודאו שיש בה שדה חתימה.' }, 400);
    const { data: last } = await db.from('form_templates').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    const { data: template, error } = await db.from('form_templates').insert({
      title, kind, description: cleanDescription(body.description), content,
      sort_order: (last?.sort_order ?? -1) + 1, created_by: ownerId,
    }).select('*').single();
    if (error?.code === '23505') return json({ error: 'כבר יש שבלונה בשם הזה' }, 409);
    if (error || !template) return json({ error: 'שמירת השבלונה נכשלה' }, 500);
    return json({ template });
  }

  if (action === 'reorder') {
    const ids = Array.isArray(body.ids) ? body.ids.filter((value): value is string => typeof value === 'string' && UUID.test(value)) : [];
    if (!ids.length || ids.length > 500) return json({ error: 'הסדר אינו תקין' }, 400);
    for (const [index, id] of ids.entries()) {
      const { error } = await db.from('form_templates').update({ sort_order: index }).eq('id', id);
      if (error) return json({ error: 'שמירת הסדר נכשלה' }, 500);
    }
    return json({ success: true });
  }

  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : null;
  if (!id) return json({ error: 'השבלונה לא נמצאה' }, 400);
  const { data: current } = await db.from('form_templates').select('id, kind').eq('id', id).maybeSingle();
  if (!current) return json({ error: 'השבלונה לא נמצאה' }, 404);

  if (action === 'update') {
    const title = cleanTitle(body.title);
    if (!title) return json({ error: 'חסר שם לשבלונה' }, 400);
    if (FIXED_DRIVER_FOLDERS.some((name) => titleKey(name) === titleKey(title))) {
      return json({ error: 'יש כבר תיקייה קבועה בשם הזה בתיק הנהג. בחרו שם אחר.' }, 409);
    }
    const changes: Record<string, unknown> = { title, description: cleanDescription(body.description) };
    // Content is optional on an update (renaming only).
    if (body.content !== undefined) {
      const content = cleanContent(current.kind, body.content);
      if (!content) return json({ error: current.kind === 'checklist' ? 'הסעיפים בשבלונה אינם תקינים' : 'תוכן השבלונה אינו תקין. ודאו שיש בה שדה חתימה.' }, 400);
      changes.content = content;
    }
    const { data: template, error } = await db.from('form_templates').update(changes).eq('id', id).select('*').single();
    if (error?.code === '23505') return json({ error: 'כבר יש שבלונה בשם הזה' }, 409);
    if (error || !template) return json({ error: 'שמירת השבלונה נכשלה' }, 500);
    return json({ template });
  }

  if (action === 'hide') {
    const hidden = body.hidden !== false;
    const { error } = await db.from('form_templates').update({ hidden_at: hidden ? new Date().toISOString() : null }).eq('id', id);
    if (error) return json({ error: 'שמירת השבלונה נכשלה' }, 500);
    return json({ success: true });
  }

  if (action === 'delete') {
    // Forms companies made from it are their own copies and stay (the link is cleared).
    const { error } = await db.from('form_templates').delete().eq('id', id);
    if (error) return json({ error: 'מחיקת השבלונה נכשלה' }, 500);
    return json({ success: true });
  }

  return json({ error: 'פעולה לא מוכרת' }, 400);
}
