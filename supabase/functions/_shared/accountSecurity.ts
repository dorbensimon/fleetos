// בדיקות אבטחה משותפות לחשבונות
// בודק סיסמה זמנית
// 8–72 תווים בלי רווחים. Supabase Auth דוחה סיסמאות קצרות או כאלה שדלפו,
// ולכן הסיסמה הזמנית צריכה להיות אקראית ולא רק ספרות.
export const TEMP_PASSWORD_ERROR = 'הסיסמה הזמנית חייבת להכיל לפחות 8 תווים, בלי רווחים';
export function isValidTemporaryPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 72 && !/\s/.test(value);
}

// מתרגם שגיאת סיסמה חלשה של Supabase Auth להודעה בעברית
export function authPasswordErrorMessage(message: string | undefined | null): string | null {
  if (!message) return null;
  if (/known to be weak|pwned|easy to guess/i.test(message)) {
    return 'הסיסמה הזו נפוצה מדי ומופיעה במאגרי סיסמאות שדלפו. לחצו על "צור סיסמה זמנית" או בחרו סיסמה אחרת';
  }
  if (/password should|weak_password|password.*(at least|characters|contain)/i.test(message)) {
    return 'הסיסמה חלשה מדי. לחצו על "צור סיסמה זמנית" או בחרו סיסמה ארוכה יותר';
  }
  return null;
}

// האם המשתמש רשאי לפעול (לא חסום ולא חייב להחליף סיסמה)
export function mayUseAuthenticatedCapabilities(
  mustChangePassword: boolean,
  allowPendingPasswordSetup = false,
): boolean {
  return !mustChangePassword || allowPendingPasswordSetup;
}

// האם הקורא רשאי לנהל את החשבון הזה
export function mayManageAccount(
  callerRole: string,
  targetRole: string,
  targetCompanyId: string | null,
  requestedCompanyId: string,
): boolean {
  if (targetRole !== 'driver' && targetRole !== 'admin') return false;
  if (callerRole === 'owner') return true;
  return callerRole === 'admin' && targetRole === 'driver' && targetCompanyId === requestedCompanyId;
}
