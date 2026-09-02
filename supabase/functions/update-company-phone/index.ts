// Edge Function: update-company-phone
// Lets an admin (or the owner) update their own company's phone number.
// `companies` RLS only grants UPDATE to the platform owner, so a company
// admin editing their own details screen needs this narrow, server-side
// path instead — it only ever touches the `phone` column.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyCompanyAccess } from '../_shared/verifyCompanyAccess.ts';

const PHONE_RE = /^0([23489]|5[0-9]|7[0-9])\d{6,7}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'השיטה אינה נתמכת' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { companyId, phone } = await req.json();
    const digits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';

    if (!digits || !PHONE_RE.test(digits)) {
      return new Response(JSON.stringify({ error: 'מספר טלפון לא תקין' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const verify = await verifyCompanyAccess(req.headers.get('Authorization'), companyId ?? null);
    if (!verify.ok) {
      return new Response(JSON.stringify({ error: verify.error }), {
        status: verify.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { adminClient } = verify;

    const { error } = await adminClient.from('companies').update({ phone: digits }).eq('id', companyId);
    if (error) {
      return new Response(JSON.stringify({ error: 'עדכון הטלפון נכשל' }), {
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
