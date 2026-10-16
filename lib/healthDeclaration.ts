// הצהרת בריאות: תוקף שנה מיום החתימה
import type { SignatureRequest } from './docuseal';

// כמה ימים הצהרה בתוקף
/** A signed health declaration is treated as valid for one year from signing. */
export const HEALTH_DECLARATION_VALID_DAYS = 365;

// שם המסמך
const TITLE = 'הצהרת בריאות';

export interface HealthDeclarationInfo {
  /** Date the latest declaration was signed, if any was signed. */
  signedAt: string | null;
  /** signedAt + HEALTH_DECLARATION_VALID_DAYS, as YYYY-MM-DD. */
  expiresAt: string | null;
  /** A declaration was sent and is still waiting for the driver's signature. */
  pending: boolean;
}

// שם המסמך של בקשת חתימה
function titleOf(request: SignatureRequest): string {
  return request.template?.title || request.template_title || '';
}

// מוסיף ימים לתאריך
function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// הצהרת הבריאות האחרונה של כל נהג
/**
 * The health declaration of each driver, read from the signed documents whose
 * title contains "הצהרת בריאות". The most recent signing wins.
 */
export function healthDeclarationsByDriver(requests: SignatureRequest[]): Map<string, HealthDeclarationInfo> {
  const map = new Map<string, HealthDeclarationInfo>();
  for (const request of requests) {
    if (!titleOf(request).includes(TITLE)) continue;
    const current = map.get(request.driver_id) ?? { signedAt: null, expiresAt: null, pending: false };
    if (request.status === 'completed' && request.completed_at) {
      if (!current.signedAt || request.completed_at > current.signedAt) {
        current.signedAt = request.completed_at;
        current.expiresAt = addDays(request.completed_at, HEALTH_DECLARATION_VALID_DAYS);
      }
    } else if (request.status === 'pending') {
      current.pending = true;
    }
    map.set(request.driver_id, current);
  }
  return map;
}
