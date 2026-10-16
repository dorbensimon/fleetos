// אישור תנאי השימוש ומדיניות הפרטיות על ידי המשתמש
import { Platform } from 'react-native';
import { supabase } from '../supabase';

// גרסת התנאים הנוכחית (משנים אותה כשהתנאים משתנים)
/**
 * The version of the terms of use and privacy policy a user must accept
 * before using the app. Bump it (a new date) whenever either changes in
 * substance: every user is then asked to accept once more.
 */
export const LEGAL_VERSION = '2026-09-25';

// האם המשתמש כבר אישר את הגרסה הנוכחית
export async function hasAcceptedCurrentTerms(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('legal_acceptances')
    .select('id')
    .eq('user_id', userId)
    .eq('version', LEGAL_VERSION)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// שומר שהמשתמש אישר את התנאים
export async function recordTermsAcceptance(): Promise<void> {
  const userAgent = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : null;
  const { error } = await supabase
    .from('legal_acceptances')
    .insert({ version: LEGAL_VERSION, platform: Platform.OS, user_agent: userAgent });
  // A second tap (or a second tab) finds the row already there: that's accepted too.
  if (error && error.code !== '23505') throw error;
}
