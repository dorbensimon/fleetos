// התראות פוש בדפדפן: אין, ולכן לא טוענים את expo-notifications
/**
 * Push notifications are phone-only. The web build skips expo-notifications
 * entirely: importing it registers a push-token listener the browser cannot
 * support, which only prints a warning.
 */

// אין רישום בדפדפן
export async function registerForPushNotifications(): Promise<void> {}

// אין מה לבטל בדפדפן
export async function unregisterPushNotifications(): Promise<void> {}

// אין לחיצות על התראות בדפדפן
export function listenForPushNotificationResponses(_navigate: unknown) {
  return () => undefined;
}
