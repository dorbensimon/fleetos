import { corsHeaders } from '../_shared/cors.ts';
import { verifyUser } from '../_shared/verifyUser.ts';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string'
    && /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  const user = await verifyUser(req.headers.get('Authorization'));
  if (!user.ok) return json({ error: user.error }, user.status);

  try {
    const { action, expoPushToken, platform } = await req.json();
    if (!isExpoPushToken(expoPushToken)) return json({ error: 'מזהה מכשיר לא תקין' }, 400);

    if (action === 'remove') {
      const { error } = await user.adminClient
        .from('push_tokens')
        .delete()
        .eq('user_id', user.userId)
        .eq('expo_push_token', expoPushToken);
      if (error) throw error;
      return json({ success: true });
    }

    if (platform !== 'ios' && platform !== 'android') return json({ error: 'פלטפורמה לא תקינה' }, 400);
    const { error } = await user.adminClient
      .from('push_tokens')
      .upsert({
        user_id: user.userId,
        expo_push_token: expoPushToken,
        platform,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'expo_push_token' });
    if (error) throw error;
    return json({ success: true });
  } catch (error) {
    console.error('register-push-token failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'שמירת המכשיר להתראות נכשלה' }, 500);
  }
});
