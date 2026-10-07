import { corsHeaders } from '../_shared/cors.ts';

/**
 * The folder catalog was removed (migration 110): companies make all their
 * forms, and the owner offers optional templates instead (form-templates).
 * Kept only so a browser still running the earlier site sees no folders
 * instead of an error; delete this function once that site is gone.
 */

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (body.action === 'company-list') return json({ folders: [], driverCount: 0 });
  if (body.action === 'catalog-list') return json({ folders: [] });
  return json({ error: 'קטלוג התיקיות הוסר. רעננו את הדף.' }, 410);
});
