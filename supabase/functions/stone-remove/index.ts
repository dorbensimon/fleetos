// Edge Function: stone-remove
//
// Stone of Words (/mystone): a customer removes one of their own stones while it
// still waits for approval. No sign-in: the customer's secret key (migration 142)
// is what proves the stone is theirs. Removes the order row and its print file.
// Deployed without JWT verification; visitors cannot delete from storage themselves.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const body = await req.json().catch(() => null);
  const key = String(body?.key ?? ''), code = String(body?.code ?? '');
  if (!UUID.test(key) || !/^[A-Z0-9]{4}$/.test(code)) return json({ error: 'bad request' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // One statement decides it: the key must match and the stone must not be approved yet.
  const { data, error } = await admin.from('stone_orders').delete()
    .eq('customer_key', key).eq('code', code).eq('status', 'new').select('image_path');
  if (error) { console.error('stone-remove:', error.message); return json({ error: 'failed' }, 500); }
  if (!data.length) return json({ removed: false });

  const file = await admin.storage.from('stone-orders').remove([data[0].image_path]);
  if (file.error) console.error('stone-remove: order removed, file left behind:', file.error.message);
  return json({ removed: true });
});
