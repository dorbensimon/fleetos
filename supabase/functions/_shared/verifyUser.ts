import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { mayUseAuthenticatedCapabilities } from './accountSecurity.ts';

type UserResult =
  | {
      ok: true;
      adminClient: SupabaseClient;
      userId: string;
      email: string;
      profile: {
        role: string;
        company_id: string | null;
        full_name: string | null;
        must_change_password: boolean;
      };
    }
  | { ok: false; status: number; error: string };

export async function verifyUser(
  authHeader: string | null,
  options: { allowPendingPasswordSetup?: boolean } = {},
): Promise<UserResult> {
  if (!authHeader) return { ok: false, status: 401, error: 'לא מחובר' };

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data.user?.email) return { ok: false, status: 401, error: 'לא מחובר' };

  const adminClient = createClient(url, serviceKey);
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role, company_id, full_name, must_change_password')
    .eq('id', data.user.id)
    .single();
  if (profileError || !profile || !['owner', 'admin', 'driver'].includes(profile.role)) {
    return { ok: false, status: 403, error: 'אין הרשאה' };
  }

  if (!mayUseAuthenticatedCapabilities(
    profile.must_change_password,
    options.allowPendingPasswordSetup,
  )) {
    return { ok: false, status: 403, error: 'יש להחליף את הסיסמה הזמנית לפני ביצוע פעולה זו' };
  }

  // Edge Functions use the service-role client for their trusted work, so RLS
  // cannot protect an archived driver's still-valid access token here. Keep
  // this check beside authentication so every function using verifyUser fails
  // closed before it can read or mutate anything on the driver's behalf.
  if (profile.role === 'driver') {
    const { data: driverDetails, error: driverError } = await adminClient
      .from('driver_details')
      .select('status')
      .eq('id', data.user.id)
      .maybeSingle();
    if (driverError || driverDetails?.status !== 'active') {
      return { ok: false, status: 403, error: 'חשבון הנהג אינו פעיל' };
    }
  }

  if (profile.role !== 'owner') {
    if (!profile.company_id) return { ok: false, status: 403, error: 'אין שיוך לחברה פעילה' };
    const { data: company, error: companyError } = await adminClient
      .from('companies')
      .select('status')
      .eq('id', profile.company_id)
      .single();
    if (companyError || company?.status !== 'active') {
      return { ok: false, status: 403, error: 'החברה אינה פעילה' };
    }
  }

  return { ok: true, adminClient, userId: data.user.id, email: data.user.email, profile };
}
