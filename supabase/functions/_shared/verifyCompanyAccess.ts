import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AccessResult =
  | { ok: true; adminClient: SupabaseClient; callerId: string; callerRole: string }
  | { ok: false; status: number; error: string };

/**
 * Verifies the caller may manage `targetCompanyId`.
 *
 * Unlike verifyOwner (which only lets the platform owner through), this
 * also admits an admin whose own company_id matches the target — which
 * is what the fleet-admin screens need when they create drivers.
 */
export async function verifyCompanyAccess(
  authHeader: string | null,
  targetCompanyId: string | null
): Promise<AccessResult> {
  if (!authHeader) {
    return { ok: false, status: 401, error: 'לא מחובר' };
  }
  if (!targetCompanyId) {
    return { ok: false, status: 400, error: 'חסר מזהה חברה' };
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

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role, company_id')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false, status: 403, error: 'אין הרשאה לבצע פעולה זו' };
  }

  const allowed =
    profile.role === 'owner' ||
    (profile.role === 'admin' && profile.company_id === targetCompanyId);

  if (!allowed) {
    return { ok: false, status: 403, error: 'אין הרשאה לבצע פעולה זו' };
  }

  return {
    ok: true,
    adminClient,
    callerId: userData.user.id,
    callerRole: profile.role,
  };
}
