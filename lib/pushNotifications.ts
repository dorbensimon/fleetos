import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase, type UserRole } from './supabase';
import { resolveNotificationVehicleId } from './adminApi/notifications';
import type { Notification } from './adminApi/types';
import { notificationTarget, type NotificationTarget } from './notificationTargets';

const STORED_TOKEN_KEY = 'fleetos_expo_push_token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Called with the record the tapped notification is about, or null for the notifications page. */
type Navigate = (target: NotificationTarget | null) => void;

function projectId(): string | undefined {
  return Constants.easConfig?.projectId
    ?? Constants.expoConfig?.extra?.eas?.projectId;
}

async function currentUserRole(): Promise<UserRole | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  return profile?.role === 'owner' || profile?.role === 'admin' || profile?.role === 'driver'
    ? profile.role
    : null;
}

async function openNotification(
  response: Notifications.NotificationResponse,
  navigate: Navigate,
) {
  const role = await currentUserRole();
  if (!role) return;

  // The push carries the notification's id; the stored row names the driver
  // or vehicle it is about, so a tap lands exactly where the in-app list would.
  const data = response.notification.request.content.data ?? {};
  const notificationId = typeof data.notificationId === 'string' ? data.notificationId : null;
  if (!notificationId) {
    navigate(null);
    return;
  }
  const { data: row } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', notificationId)
    .maybeSingle();
  const target = row
    ? await notificationTarget(role, row as Notification, resolveNotificationVehicleId).catch(() => null)
    : null;
  navigate(target);
}

/** Registers this physical device. Push permissions can always be changed later in iOS Settings. */
export async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;

  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === 'granted'
    ? existing
    : await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'התראות כלליות',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const id = projectId();
  if (!id) return;
  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  const { error } = await supabase.functions.invoke('register-push-token', {
    body: { expoPushToken, platform: Platform.OS },
  });
  if (error) throw error;
  await AsyncStorage.setItem(STORED_TOKEN_KEY, expoPushToken);
}

/** Removes this device when the user signs out, so a shared device never receives their alerts. */
export async function unregisterPushNotifications(): Promise<void> {
  const expoPushToken = await AsyncStorage.getItem(STORED_TOKEN_KEY);
  if (!expoPushToken) return;
  try {
    await supabase.functions.invoke('register-push-token', {
      body: { action: 'remove', expoPushToken },
    });
  } finally {
    await AsyncStorage.removeItem(STORED_TOKEN_KEY);
  }
}

export function listenForPushNotificationResponses(navigate: Navigate) {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    void openNotification(response, navigate);
  });
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) return openNotification(response, navigate);
  }).catch(() => undefined);
  return () => subscription.remove();
}
