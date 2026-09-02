import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyUser } from './verifyUser.ts';

type VerifyResult =
  | { ok: true; adminClient: SupabaseClient; ownerId: string }
  | { ok: false; status: number; error: string };

// מוודא שהקורא ל-Edge Function הוא owner מחובר, ומחזיר לקוח service_role לפעולות הרגישות
export async function verifyOwner(authHeader: string | null): Promise<VerifyResult> {
  const user = await verifyUser(authHeader);
  if (!user.ok) return user;
  if (user.profile.role !== 'owner') {
    return { ok: false, status: 403, error: 'אין הרשאה לבצע פעולה זו' };
  }

  return { ok: true, adminClient: user.adminClient, ownerId: user.userId };
}
