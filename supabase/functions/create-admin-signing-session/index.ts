import { corsHeaders } from '../_shared/cors.ts';
function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  return json({ error: 'מסלול חתימת מנהל הוסר. ניתן לשלוח מסמכים רק לנהגים דרך תבניות החברה.' }, 410);
});
