import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type VerifyResult =
  | { ok: true; adminClient: SupabaseClient; ownerId: string }
  | { ok: false; status: number; error: string };

// מוודא שהקורא ל-Edge Function הוא owner מחובר, ומחזיר לקוח service_role לפעולות הרגישות
export async function verifyOwner(authHeader: string | null): Promise<VerifyResult> {
  if (!authHeader) {
    return { ok: false, status: 401, error: 'לא מחובר' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, status: 401, error: 'לא מחובר' };
  }

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || callerProfile?.role !== 'owner') {
    return { ok: false, status: 403, error: 'אין הרשאה לבצע פעולה זו' };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  return { ok: true, adminClient, ownerId: userData.user.id };
}
