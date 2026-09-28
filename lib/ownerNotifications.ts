import { supabase } from './supabase';
import { t } from './i18n';

/**
 * The owner's own feed (table owner_notifications, migration 102): about
 * companies and their managers only, never about drivers. Written by the
 * database (a manager's first sign-in, a new manager, the daily check);
 * the owner only reads, marks read and clears.
 */

export type OwnerNotificationType =
  | 'owner_company_activated'
  | 'owner_admin_added'
  | 'owner_company_not_activated'
  | 'owner_company_inactive'
  | 'owner_carrier_license_expiry'
  | 'owner_trial_ending'
  | 'owner_renewal_due'
  | 'owner_vehicle_limit';

export type OwnerNotificationTone = 'info' | 'good' | 'warn' | 'bad';

export type OwnerNotification = {
  id: string;
  company_id: string | null;
  notification_type: OwnerNotificationType;
  title: string;
  message: string;
  tone: OwnerNotificationTone;
  read_at: string | null;
  created_at: string;
};

/** Older than this drops off the feed. */
const FEED_DAYS = 60;

export async function listOwnerNotifications(): Promise<OwnerNotification[]> {
  const since = new Date(Date.now() - FEED_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('owner_notifications')
    .select('id, company_id, notification_type, title, message, tone, read_at, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as OwnerNotification[];
}

export async function countUnreadOwnerNotifications(): Promise<number> {
  const since = new Date(Date.now() - FEED_DAYS * 86_400_000).toISOString();
  const { count, error } = await supabase
    .from('owner_notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
    .gte('created_at', since);
  if (error) throw error;
  return count ?? 0;
}

export async function markOwnerNotificationRead(id: string) {
  const { error } = await supabase.from('owner_notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null);
  if (error) throw error;
}

export async function markAllOwnerNotificationsRead() {
  const { error } = await supabase.from('owner_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (error) throw error;
}

/** What a tap on the notification does, in words; every owner alert opens its company. */
export function ownerActionLabel(n: OwnerNotification): string | null {
  if (!n.company_id) return null;
  if (n.notification_type === 'owner_trial_ending' || n.notification_type === 'owner_renewal_due' || n.notification_type === 'owner_vehicle_limit') {
    return t('owner.notif.toSubscription');
  }
  return t('owner.notif.toCompany');
}
