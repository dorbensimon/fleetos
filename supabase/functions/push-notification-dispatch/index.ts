import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

type NotificationRow = {
  id: string;
  company_id: string;
  recipient_id: string | null;
  message: string;
  notification_type: string | null;
  vehicle_id: string | null;
  folder_key: string | null;
};

type PushTokenRow = { user_id: string; expo_push_token: string };

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);

  const suppliedSecret = req.headers.get('x-push-dispatch-secret') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'הגדרות השרת חסרות' }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: authorized, error: authorizationError } = await admin.rpc(
    'validate_push_dispatch_secret',
    { candidate: suppliedSecret },
  );
  if (authorizationError || authorized !== true) return json({ error: 'אין הרשאה' }, 401);

  try {
    const { notificationId } = await req.json();
    if (typeof notificationId !== 'string') return json({ error: 'חסר מזהה התראה' }, 400);

    const { data: notification, error: notificationError } = await admin
      .from('notifications')
      .select('id, company_id, recipient_id, message, notification_type, vehicle_id, folder_key')
      .eq('id', notificationId)
      .maybeSingle();
    if (notificationError) throw notificationError;
    if (!notification) return json({ success: true, sent: 0, reason: 'not_found' });
    const row = notification as NotificationRow;

    let recipientIds: string[];
    if (row.recipient_id) {
      recipientIds = [row.recipient_id];
    } else {
      const { data: managers, error: managerError } = await admin
        .from('profiles')
        .select('id')
        .in('role', ['owner', 'admin'])
        .or(`company_id.eq.${row.company_id},role.eq.owner`);
      if (managerError) throw managerError;
      recipientIds = (managers ?? []).map((manager) => manager.id as string);
    }
    if (!recipientIds.length) return json({ success: true, sent: 0 });

    if (row.notification_type) {
      const { data: disabled, error: preferencesError } = await admin
        .from('notification_preferences')
        .select('user_id')
        .in('user_id', recipientIds)
        .eq('notification_type', row.notification_type)
        .eq('enabled', false);
      if (preferencesError) throw preferencesError;
      const disabledIds = new Set((disabled ?? []).map((item) => item.user_id as string));
      recipientIds = recipientIds.filter((id) => !disabledIds.has(id));
    }
    if (!recipientIds.length) return json({ success: true, sent: 0, reason: 'disabled_by_preference' });

    const { data: tokens, error: tokenError } = await admin
      .from('push_tokens')
      .select('user_id, expo_push_token')
      .in('user_id', recipientIds);
    if (tokenError) throw tokenError;
    const registeredTokens = (tokens ?? []) as PushTokenRow[];
    let sent = 0;
    let removed = 0;

    for (const batch of chunks(registeredTokens, BATCH_SIZE)) {
      const payload = batch.map((token) => ({
        to: token.expo_push_token,
        title: 'FleetOS',
        body: row.message,
        sound: 'default',
        data: { notificationId: row.id, notificationType: row.notification_type, vehicleId: row.vehicle_id, folderKey: row.folder_key },
      }));
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Expo Push returned ${response.status}`);
      const result = await response.json() as { data?: Array<{ status?: string; details?: { error?: string } }> };
      const stale = batch
        .filter((_, index) => result.data?.[index]?.details?.error === 'DeviceNotRegistered')
        .map((token) => token.expo_push_token);
      if (stale.length) {
        const { error: removeError } = await admin.from('push_tokens').delete().in('expo_push_token', stale);
        if (removeError) throw removeError;
        removed += stale.length;
      }
      sent += batch.length - stale.length;
    }

    return json({ success: true, sent, removed });
  } catch (error) {
    console.error('push-notification-dispatch failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'שליחת התראת Push נכשלה' }, 500);
  }
});
