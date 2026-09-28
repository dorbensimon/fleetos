import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { applyLanguage, getLanguage, isLanguage, type Language } from './index';

/**
 * The signed-in user's language lives in their auth user_metadata, so it
 * follows them to every device and browser they sign in on.
 */
export function userLanguage(user: User | null | undefined): Language | null {
  const saved = user?.user_metadata?.language;
  return isLanguage(saved) ? saved : null;
}

/** The user picked a language in their settings: use it here and remember it on their account. */
export async function setUserLanguage(language: Language): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session && userLanguage(data.session.user) !== language) {
      await supabase.auth.updateUser({ data: { language } });
    }
  } catch {
    // Offline or a server error: the device still switches; the account
    // catches up the next time the user picks a language.
  }
  await applyLanguage(language);
}

/**
 * On sign-in: the account's saved language wins. An account that never chose
 * one keeps the language this device already uses, and saves it.
 */
export async function syncLanguageFromUser(user: User | null | undefined): Promise<void> {
  if (!user) return;
  const saved = userLanguage(user);
  if (saved) {
    if (saved !== getLanguage()) await applyLanguage(saved);
    return;
  }
  await supabase.auth.updateUser({ data: { language: getLanguage() } }).catch(() => undefined);
}
