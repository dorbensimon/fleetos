import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type UserResult =
  | {
      ok: true;
      adminClient: SupabaseClient;
      userId: string;
      email: string;
      profile: { role: string; company_id: string | null; full_name: string | null };
    }
  | { ok: false; status: number; error: string };

export async function verifyUser(authHeader: string | null): Promise<UserResult> {
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
    .select('role, company_id, full_name')
    .eq('id', data.user.id)
    .single();
  if (profileError || !profile) return { ok: false, status: 403, error: 'אין הרשאה' };

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
