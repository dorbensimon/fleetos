import { supabase } from '../supabase';
import { Notification } from './types';
import { plateFromOdometerMessage } from '../notificationFocus';

const NOTIFICATION_TTL_DAYS = 7;

function notificationCutoffIso(): string {
  return new Date(Date.now() - NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function listNotifications(companyId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('company_id', companyId)
    .gte('created_at', notificationCutoffIso())
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

/**
 * Notifications that only report something are done once the user has seen
 * the place they talk about: opening a driver's card clears "the driver
 * updated details", opening "הפרטים שלי" clears "the manager updated your
 * file". Row-level security keeps this to the caller's own notifications.
 */
export async function markNotificationsReadWhere(filter: {
  types: string[];
  actorId?: string;
  recipientId?: string;
}) {
  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('notification_type', filter.types)
    .is('read_at', null);
  if (filter.actorId) query = query.eq('actor_id', filter.actorId);
  if (filter.recipientId) query = query.eq('recipient_id', filter.recipientId);
  const { error } = await query;
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

/**
 * Old vehicle notifications were written before `vehicle_id` existed. Their
 * message still includes the plate in parentheses, so resolve that one
 * legacy shape within the same company instead of sending the user to the
 * whole fleet. New notifications always use their stored vehicle_id.
 */
export async function resolveNotificationVehicleId(notification: Notification): Promise<string | null> {
  if (notification.vehicle_id) return notification.vehicle_id;

  const odometerPlate = plateFromOdometerMessage(notification.message);
  const plateCandidates = [
    ...Array.from(notification.message.matchAll(/\(([^()]+)\)/g)).map((match) => match[1].trim()),
    ...(odometerPlate ? [odometerPlate] : []),
  ]
    .flatMap((value) => [value, value.replace(/\D/g, '')])
    .filter((value, index, values) => value.length >= 5 && values.indexOf(value) === index);

  if (plateCandidates.length === 0) return null;

  const { data, error } = await supabase
    .from('vehicles')
    .select('id')
    .eq('company_id', notification.company_id)
    .in('plate_number', plateCandidates)
    .limit(1);

  if (error) throw error;
  return data?.[0]?.id ?? null;
}
