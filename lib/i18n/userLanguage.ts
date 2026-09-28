import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { applyLanguage, getLanguage, isLanguage, readFromDevice, storeOnDevice, type Language } from './index';

/**
 * The signed-in user's language lives in their auth user_metadata, so it
 * follows them to every device and browser they sign in on.
 */
export function userLanguage(user: User | null | undefined): Language | null {
  const saved = user?.user_metadata?.language;
  return isLanguage(saved) ? saved : null;
}

// A choice made on this device that the account has not received yet
// (offline, or a server error), kept as the id of the user who made it.
const UNSAVED_KEY = 'fleetos.language.unsaved';

async function saveToAccount(language: Language): Promise<boolean> {
  try {
    const { error } = await supabase.auth.updateUser({ data: { language } });
    return !error;
  } catch {
    return false;
  }
}

/** The user picked a language in their settings: use it here and remember it on their account. */
export async function setUserLanguage(language: Language): Promise<void> {
  const user = await supabase.auth.getSession().then(({ data }) => data.session?.user ?? null, () => null);
  if (user) {
    const saved = userLanguage(user) === language || (await saveToAccount(language));
    // Not saved: the next sign-in or app start sends it, rather than taking
    // back the account's older choice.
    await storeOnDevice(UNSAVED_KEY, saved ? null : user.id);
  }
  await applyLanguage(language);
}

/**
 * The account's language, as the server has it now: another device may have
 * changed it since this one last looked. The account's choice wins, unless
 * this device holds a newer one the account never received — that is sent.
 * An account that never chose one keeps this device's language, and saves it.
 */
async function syncFromAccount(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  // Offline: this device already holds the latest choice it knows of.
  const user = data.user;
  if (!user) return;
  const unsaved = await readFromDevice(UNSAVED_KEY);
  if (unsaved === user.id) {
    if (await saveToAccount(getLanguage())) await storeOnDevice(UNSAVED_KEY, null);
    return;
  }
  if (unsaved) await storeOnDevice(UNSAVED_KEY, null);
  const saved = userLanguage(user);
  if (!saved) {
    await saveToAccount(getLanguage());
    return;
  }
  if (saved !== getLanguage()) await applyLanguage(saved);
}

let synced: { userId: string; done: Promise<void> } | null = null;

/**
 * On app start and on sign-in, once per signed-in user: a language changed on
 * another device is picked up then, never in the middle of the user's work.
 */
export function syncLanguageFromAccount(user: User | null | undefined): Promise<void> {
  if (!user) return Promise.resolve();
  if (synced?.userId !== user.id) synced = { userId: user.id, done: syncFromAccount().catch(() => undefined) };
  return synced.done;
}

/** Signed out: the next user to sign in here gets their own account's language. */
export function resetLanguageSync(): void {
  synced = null;
}
