import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyUser } from './verifyUser.ts';

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
  if (!targetCompanyId) {
    return { ok: false, status: 400, error: 'חסר מזהה חברה' };
  }

  const user = await verifyUser(authHeader);
  if (!user.ok) return user;
  const { adminClient, profile } = user;

  const allowed =
    profile.role === 'owner' ||
    (profile.role === 'admin' && profile.company_id === targetCompanyId);

  if (!allowed) {
    return { ok: false, status: 403, error: 'אין הרשאה לבצע פעולה זו' };
  }

  return {
    ok: true,
    adminClient,
    callerId: user.userId,
    callerRole: profile.role,
  };
}
