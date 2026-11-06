// פותח קישור לאפליקציה של המכשיר (הודעות, חיוג, מייל, וואטסאפ)
import { Linking, Platform } from 'react-native';

/**
 * Opens an sms:, tel:, mailto: or whatsapp: link. On the web, Linking.openURL
 * opens a new tab first (a blank white page on iPhone before Messages
 * opens); these schemes hand off to the phone's app, so the link is followed
 * in place and the app stays on screen.
 */
export async function openAppLink(url: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.href = url;
    return;
  }
  await Linking.openURL(url);
}

// האם זה דפדפן בטלפון
/** iPhone, Android, or an iPad (which reports itself as a Mac with touch). */
export function isPhoneBrowser(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
