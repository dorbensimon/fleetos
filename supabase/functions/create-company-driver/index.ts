// Edge Function: create-company-driver
//
// Called by a fleet admin (or the platform owner) to add a driver.
// A driver is a real account: an auth.users row, a profiles row with
// role='driver', and a driver_details row with the rest of the file.
//
// Runs with SUPABASE_SERVICE_ROLE_KEY, which is never exposed to the app.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';
import { isValidTemporaryPassword } from '../_shared/accountSecurity.ts';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const DRIVER_DETAILS_FIELDS = [
  'department_id', 'employee_number', 'national_id', 'birth_date', 'address',
  'home_phone', 'marital_status', 'education', 'employment_start_date',
  'license_number', 'license_classes', 'license_issue_date', 'license_expiry',
  'status', 'notes',
] as const;

function pickDriverDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    DRIVER_DETAILS_FIELDS
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}

/**
 * Name of the archived driver in this company holding `email`, or null.
 *
 * Only ever called on the "email already registered" error path, and only
 * over this company's archived drivers — a short list by nature. The login
 * address lives in auth.users, not in profiles, so it has to be looked up
 * one account at a time; the cap keeps that bounded no matter what.
 */
async function findArchivedDriverByEmail(
  // deno-lint-ignore no-explicit-any
  adminClient: any,
  companyId: string,
  email: string
): Promise<string | null> {
  const { data: archived } = await adminClient
    .from('driver_details')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'archived')
    .limit(50);

  for (const driver of archived ?? []) {
    const { data: authData } = await adminClient.auth.admin.getUserById(driver.id);
    if (authData?.user?.email?.toLowerCase() !== email.toLowerCase()) continue;
    const { data: profile } = await adminClient
      .from('profiles')
      .select('full_name')
      .eq('id', driver.id)
      .single();
    return profile?.full_name || 'נהג';
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'השיטה אינה נתמכת' }, 405);

  try {
    const body = await req.json();
    const { companyId, email, password, fullName, phone, details } = body ?? {};

    const access = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!access.ok) {
      return json({ error: access.error }, access.status);
    }
    const { adminClient } = access;

    if (!email?.trim() || !password || !fullName?.trim() || !phone?.trim()) {
      return json({ error: 'שם, טלפון, מייל וסיסמה הם שדות חובה' }, 400);
    }
    if (!isValidTemporaryPassword(password)) {
      return json({ error: 'הסיסמה חייבת להכיל לפחות 4 ספרות בלבד' }, 400);
    }

    const { data: newUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
    });

    if (createUserError || !newUser.user) {
      // "Email already registered" is the one failure an admin can act on,
      // and the most confusing when it comes back as raw English. An
      // archived driver still occupies their address, so the message points
      // at the archive — restoring them is almost always what was meant.
      const message = createUserError?.message ?? '';
      const emailTaken = /already been registered|already registered|email_exists/i.test(message);
      if (emailTaken) {
        const archivedOwner = await findArchivedDriverByEmail(adminClient, companyId, email.trim().toLowerCase());
        return json(
          {
            error: archivedOwner
              ? `כתובת המייל הזו שייכת ל${archivedOwner}, נהג שנמצא בארכיון. כדי להשתמש בה שוב יש לשחזר אותו מהארכיון, או למחוק אותו לצמיתות.`
              : 'כתובת המייל הזו כבר רשומה במערכת',
          },
          409
        );
      }
      return json({ error: message || 'יצירת המשתמש נכשלה' }, 500);
    }

    const driverId = newUser.user.id;

    const { error: profileError } = await adminClient.from('profiles').insert({
      id: driverId,
      role: 'driver',
      company_id: companyId,
      full_name: fullName.trim(),
      phone: phone.trim(),
      must_change_password: true,
    });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(driverId);
      return json({ error: 'יצירת פרופיל הנהג נכשלה' }, 500);
    }

    const { error: detailsError } = await adminClient.from('driver_details').insert({
      id: driverId,
      company_id: companyId,
      ...pickDriverDetails(details),
    });

    if (detailsError) {
      // Roll the whole thing back so a half-created driver never lingers.
      await adminClient.from('profiles').delete().eq('id', driverId);
      await adminClient.auth.admin.deleteUser(driverId);
      return json({ error: detailsError.message || 'שמירת פרטי הנהג נכשלה' }, 500);
    }

    return json({ success: true, driverId }, 200);
  } catch {
    return json({ error: 'אירעה שגיאה בלתי צפויה' }, 500);
  }
});
