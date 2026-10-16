// פונקציית שרת ישנה של בונה התבניות
import { corsHeaders } from '../_shared/cors.ts';

// תשובת JSON
function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// מחזיר 'הוסר'
// Retired: templates are now created only directly in DocuSeal, inside the
// "FleetOS-Global" folder, and synced in by import-docuseal-templates. Kept
// as a stub (instead of deleting the function outright) so any stale client
// build fails with a clear message rather than a broken network error.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return json({ error: 'יצירת תבניות בתוך האפליקציה בוטלה. תבניות נוצרות ישירות ב-DocuSeal.' }, 410);
});
