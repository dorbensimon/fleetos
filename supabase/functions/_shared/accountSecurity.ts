// בדיקות אבטחה משותפות לחשבונות
// בודק סיסמה זמנית
export function isValidTemporaryPassword(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4,}$/.test(value);
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
