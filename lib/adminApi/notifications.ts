import { supabase } from '../supabase';
import { Notification } from './types';

const NOTIFICATION_TTL_DAYS = 7;

function notificationCutoffIso(): string {
  return new Date(Date.now() - NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function listNotifications(companyId: string): Promise<Notification[]> {
  // No dedicated cron job for this — trim anything past its 7-day
  // lifetime whenever the list is actually opened, which is often
  // enough in practice, then read only what's left.
  await supabase.from('notifications').delete().eq('company_id', companyId).lt('created_at', notificationCutoffIso());

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function countUnreadNotifications(companyId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('read_at', null)
    .gte('created_at', notificationCutoffIso());

  if (error) throw error;
  return count ?? 0;
}

/** Marks a single notification as read — used when the admin opens that specific notification. */
export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null);

  if (error) throw error;
}

/** Marks every currently-unread notification as read — only via an explicit "קרא הכל" action. */
export async function markAllNotificationsRead(companyId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .is('read_at', null);

  if (error) throw error;
}
