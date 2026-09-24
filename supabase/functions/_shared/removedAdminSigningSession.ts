import { corsHeaders } from './cors.ts';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Keeps the retired endpoint names backward-compatible while preventing their
 * identical 410 handlers from drifting apart.
 */
export function serveRemovedAdminSigningSession() {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

    return json({ error: 'מסלול חתימת מנהל הוסר. ניתן לשלוח מסמכים רק לנהגים דרך תבניות החברה.' }, 410);
  });
}
