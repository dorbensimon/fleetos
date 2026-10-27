// פונקציית שרת: הוספת מנהל לחברה
// Edge Function: add-company-admin
// Called by the app (owner only) to add another admin to an existing company.
// The owner chooses the admin's password directly (no random temp password).

import { corsHeaders } from '../_shared/cors.ts';
import { verifyOwner } from '../_shared/verifyOwner.ts';
import { isValidTemporaryPassword } from '../_shared/accountSecurity.ts';
import { findAccountByEmail, managerLinkBlock } from '../_shared/existingAccount.ts';

// מקבל בקשה, בודק הרשאה ויוצר מנהל
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'השיטה אינה נתמכת' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const verify = await verifyOwner(req.headers.get('Authorization'));
    if (!verify.ok) {
      return new Response(JSON.stringify({ error: verify.error }), {
        status: verify.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { adminClient } = verify;

    const body = await req.json();
    const { companyId, adminFirstName, adminLastName, adminEmail, adminPassword, adminPhone } = body;

    // An email that is already a manager is linked to this company instead of
    // creating a second account (same email, same password).
    const existing = adminEmail?.trim() ? await findAccountByEmail(adminClient, adminEmail) : null;
    let alreadyMember = false;
    if (existing && companyId) {
      const { data: membership } = await adminClient
        .from('company_memberships')
        .select('user_id')
        .eq('user_id', existing.id)
        .eq('company_id', companyId)
        .maybeSingle();
      alreadyMember = !!membership;
    }
    const block = existing
      ? managerLinkBlock(existing) ?? (alreadyMember ? 'המנהל כבר משויך לחברה זו' : null)
      : null;

    if (body.checkEmail) {
      return new Response(
        JSON.stringify({ success: true, account: existing ? { fullName: existing.fullName, block } : null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existing) {
      if (block) {
        return new Response(JSON.stringify({ error: block }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: targetCompany } = await adminClient.from('companies').select('id').eq('id', companyId).maybeSingle();
      if (!targetCompany) {
        return new Response(JSON.stringify({ error: 'החברה לא נמצאה' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { error: membershipError } = await adminClient
        .from('company_memberships')
        .insert({ user_id: existing.id, company_id: companyId });
      if (membershipError) {
        return new Response(JSON.stringify({ error: 'שיוך המנהל לחברה נכשל' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, linkedExisting: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (
      !companyId ||
      !adminFirstName?.trim() ||
      !adminLastName?.trim() ||
      !adminEmail?.trim() ||
      !adminPassword ||
      !adminPhone?.trim()
    ) {
      return new Response(
        JSON.stringify({ error: 'שם פרטי ומשפחה, מייל, טלפון וסיסמת אדמין הם שדות חובה' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidTemporaryPassword(adminPassword)) {
      return new Response(JSON.stringify({ error: 'הסיסמה חייבת להכיל לפחות 4 ספרות בלבד' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: company, error: companyError } = await adminClient
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: 'החברה לא נמצאה' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: newUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: adminEmail.trim().toLowerCase(),
      password: adminPassword,
      email_confirm: true,
    });

    if (createUserError || !newUser.user) {
      return new Response(
        JSON.stringify({ error: createUserError?.message || 'יצירת המשתמש נכשלה' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: profileInsertError } = await adminClient.from('profiles').insert({
      id: newUser.user.id,
      role: 'admin',
      company_id: companyId,
      full_name: `${adminFirstName.trim()} ${adminLastName.trim()}`.trim(),
      phone: adminPhone.trim(),
      must_change_password: true,
    });

    if (profileInsertError) {
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: 'יצירת פרופיל האדמין נכשלה' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'אירעה שגיאה בלתי צפויה' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
