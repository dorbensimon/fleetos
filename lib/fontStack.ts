// רשימת גופנים לגיבוי (לרוסית וערבית בדפדפן)
import { Platform } from 'react-native';

// גופן גיבוי של המערכת
// Heebo and Assistant cover Hebrew and Latin only. On web, Russian and
// Arabic text falls through to the system's sans-serif font instead of the
// browser default (usually a serif). Native apps fall back per glyph already.
const WEB_FALLBACK = ", system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Arabic', Arial, sans-serif";

// הגופן עם גיבויים
export function fontStack(family: string): string {
  return Platform.OS === 'web' ? family + WEB_FALLBACK : family;
}
