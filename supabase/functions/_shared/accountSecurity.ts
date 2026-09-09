export function isValidTemporaryPassword(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4,}$/.test(value);
}

export function mayUseAuthenticatedCapabilities(
  mustChangePassword: boolean,
  allowPendingPasswordSetup = false,
): boolean {
  return !mustChangePassword || allowPendingPasswordSetup;
}

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
