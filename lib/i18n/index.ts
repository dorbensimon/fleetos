import { createInstance, type TOptions } from 'i18next';
import { Platform } from 'react-native';
import he from '../../locales/he.json';
import ar from '../../locales/ar.json';
import ru from '../../locales/ru.json';
import en from '../../locales/en.json';

/**
 * App-wide translations. Every string shown to a user lives in the static
 * JSON files under /locales — nothing is translated at runtime.
 *
 * The chosen language is kept on the device (localStorage on web,
 * AsyncStorage on native) and, for a signed-in user, in their auth
 * user_metadata.language so it follows them to every device they sign in on.
 */
export type Language = 'he' | 'ar' | 'ru' | 'en';

export const LANGUAGES: readonly { code: Language; nativeName: string }[] = [
  { code: 'he', nativeName: 'עברית' },
  { code: 'ar', nativeName: 'العربية' },
  { code: 'ru', nativeName: 'Русский' },
  { code: 'en', nativeName: 'English' },
];

export const DEFAULT_LANGUAGE: Language = 'he';
const STORAGE_KEY = 'fleetos.language';
const RTL_LANGUAGES: readonly Language[] = ['he', 'ar'];

export function isLanguage(value: unknown): value is Language {
  return value === 'he' || value === 'ar' || value === 'ru' || value === 'en';
}

// Web can read its saved choice synchronously, so the very first render —
// including module-level strings — is already in the right language.
function readWebLanguage(): Language | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(saved) ? saved : null;
  } catch {
    return null;
  }
}

const i18next = createInstance();

void i18next.init({
  resources: {
    he: { translation: he },
    ar: { translation: ar },
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: readWebLanguage() ?? DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function t(key: string, options?: TOptions): string {
  return i18next.t(key, options) as string;
}

export function getLanguage(): Language {
  return isLanguage(i18next.language) ? i18next.language : DEFAULT_LANGUAGE;
}

export function isRTL(language: Language = getLanguage()): boolean {
  return RTL_LANGUAGES.includes(language);
}

/** BCP 47 locale for Intl / toLocaleString (dates, numbers). */
export function getLocale(): string {
  // Arabic keeps Western digits, as used for plates, phones and dates in Israel.
  return { he: 'he-IL', ar: 'ar-IL-u-nu-latn', ru: 'ru-RU', en: 'en-GB' }[getLanguage()];
}

/**
 * The layout of every screen is authored for Hebrew: rows use
 * `row-reverse` and positions use start/end under a left-to-right layout
 * engine. Running that engine right-to-left mirrors the whole layout, which is
 * exactly what a left-to-right language needs. So the layout direction is the
 * opposite of the reading direction; text itself reads in the language's
 * direction (see AppText).
 */
export function layoutDirection(language: Language = getLanguage()): 'ltr' | 'rtl' {
  return isRTL(language) ? 'ltr' : 'rtl';
}

/** Physical side where a line of text starts in the current language. */
export function textStart(): 'right' | 'left' {
  return isRTL() ? 'right' : 'left';
}

export function textEnd(): 'right' | 'left' {
  return isRTL() ? 'left' : 'right';
}

/** Updates <html lang dir> and the document's layout direction on web. */
export function applyDocumentLanguage(language: Language = getLanguage()) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = language;
  root.dir = isRTL(language) ? 'rtl' : 'ltr';
  // Web-only screens styled with plain CSS read the reading direction from here.
  root.style.setProperty('--app-dir', root.dir);
  root.style.setProperty('--app-dir-sign', isRTL(language) ? '1' : '-1');
  // Modals and portals render straight into <body>, outside the app's root
  // view, so they take the layout direction from here.
  if (document.body) document.body.style.direction = layoutDirection(language);
}

type Listener = (language: Language) => void;
const listeners = new Set<Listener>();

export function onLanguageChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Loaded on first use, so importing translations never needs the native module.
async function nativeStorage() {
  return (await import('@react-native-async-storage/async-storage')).default;
}

async function storeLocally(language: Language) {
  if (Platform.OS === 'web') {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Storage may be unavailable (private browsing); the choice lasts for this visit.
    }
    return;
  }
  await nativeStorage().then((storage) => storage.setItem(STORAGE_KEY, language)).catch(() => undefined);
}

/** Switches the app language on this device (no server write). */
export async function applyLanguage(language: Language) {
  await storeLocally(language);
  if (language === getLanguage()) return;
  await i18next.changeLanguage(language);
  applyDocumentLanguage(language);
  listeners.forEach((listener) => listener(language));
}

/** Native keeps its choice in async storage; read it before the first screen. */
export async function loadStoredLanguage(): Promise<Language> {
  if (Platform.OS !== 'web') {
    const saved = await nativeStorage().then((storage) => storage.getItem(STORAGE_KEY)).catch(() => null);
    if (isLanguage(saved) && saved !== getLanguage()) await i18next.changeLanguage(saved);
  }
  applyDocumentLanguage();
  return getLanguage();
}

applyDocumentLanguage();

export default i18next;

/** Reading direction for text in the current language. */
export function textDirection(): 'rtl' | 'ltr' {
  return isRTL() ? 'rtl' : 'ltr';
}

const MIRRORED_ICONS = {
  'chevron-back': 'chevron-forward',
  'chevron-forward': 'chevron-back',
  'arrow-back': 'arrow-forward',
  'arrow-forward': 'arrow-back',
  'chevron-left': 'chevron-right',
  'chevron-right': 'chevron-left',
} as const;

/**
 * Directional icons are chosen for Hebrew (a "forward" chevron points left).
 * In a left-to-right language the layout is mirrored, so the arrow is too.
 */
export function dirIcon<T extends keyof typeof MIRRORED_ICONS>(name: T): T | (typeof MIRRORED_ICONS)[T] {
  return isRTL() ? name : MIRRORED_ICONS[name];
}

/** 1 in Hebrew/Arabic, -1 in a mirrored left-to-right layout: flips horizontal motion. */
export function dirSign(): 1 | -1 {
  return isRTL() ? 1 : -1;
}

/**
 * Pins a view to its Hebrew-authored arrangement in every language, for
 * things that look the same everywhere, like an Israeli licence plate.
 * Spread the props on the view and add the style.
 */
export const fixedLayoutProps: object = Platform.OS === 'web' ? { dir: 'ltr' } : {};
export const FIXED_LAYOUT_STYLE = { direction: 'ltr' } as const;
