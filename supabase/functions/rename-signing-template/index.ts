import { corsHeaders } from '../_shared/cors.ts';
import { docusealFetch } from '../_shared/docuseal.ts';
import { verifyUser } from '../_shared/verifyUser.ts';

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);
  try {
    const user = await verifyUser(req.headers.get('Authorization'));
    if (!user.ok) return json({ error: user.error }, user.status);
    if (user.profile.role !== 'owner') return json({ error: 'רק Owner יכול לשנות שם תבנית' }, 403);
    const { templateId, title } = await req.json();
    const name = typeof title === 'string' ? title.trim() : '';
    if (!name || name.length > 200) return json({ error: 'יש להזין שם באורך 1–200 תווים' }, 400);
    const now = new Date();
    const lock = new Date(now.getTime() + 60_000).toISOString();
    const { data: template, error } = await user.adminClient.from('signing_templates')
      .update({ rename_locked_until: lock }).eq('id', templateId).is('company_id', null)
      .or(`rename_locked_until.is.null,rename_locked_until.lt.${now.toISOString()}`)
      .select('id, title, docuseal_template_id').maybeSingle();
    if (error) throw error;
    if (!template) return json({ error: 'התבנית לא נמצאה או ששינוי שם כבר מתבצע' }, 409);
    try {
      if (!template.docuseal_template_id) return json({ error: 'התבנית אינה מקושרת ל-DocuSeal' }, 409);
      const response = await docusealFetch(`/templates/${template.docuseal_template_id}`, {
        method: 'PUT', body: JSON.stringify({ name }),
      });
      if (!response.ok) return json({ error: 'שינוי השם ב-DocuSeal נכשל. נסה שוב.' }, 502);
      const { error: updateError } = await user.adminClient.from('signing_templates')
        .update({ title: name }).eq('id', template.id).eq('rename_locked_until', lock);
      if (updateError) return json({ error: 'השם עודכן ב-DocuSeal אך לא נשמר באתר. יש לנסות שוב עם אותו שם.' }, 500);
      return json({ success: true });
    } finally {
      await user.adminClient.from('signing_templates').update({ rename_locked_until: null })
        .eq('id', template.id).eq('rename_locked_until', lock);
    }
  } catch { return json({ error: 'שינוי שם התבנית נכשל' }, 500); }
});
