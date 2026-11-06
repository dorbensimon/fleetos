// קישורים אישיים לנהג שהמנהל שולח בוואטסאפ שלו
// The manager's own WhatsApp opens with a ready message; the driver's link
// needs no password (driver-quick-link, migration 138).
import { Platform } from 'react-native';
import { callFunction } from './callFunction';
import { t } from './i18n';
import { LICENSE_SIDE_STORED_TITLE, type LicenseSide } from './licenseSides';

const SITE_URL = 'https://icar-app.com';

type Recipient = { driverName: string; phone: string; companyName: string };
export type QuickLinkRequest =
  | { kind: 'sign'; requestId: string }
  | { kind: 'odometer'; driverId: string; vehicleId: string }
  | { kind: 'document'; driverId: string; category: string; title: string };

export type QuickLinkPage = {
  kind: 'odometer' | 'document';
  driverFirstName: string;
  companyName: string;
  plate: string | null;
  odometer: number | null;
  title: string | null;
  uploads: number;
  maxUploads: number;
  /** Whether the folder's files carry an expiry date the driver fills in. */
  expiry: 'required' | 'optional' | 'none';
};

// כתובת הדף של הנהג
/** The driver's page on the site the manager is using (preview sites included). */
export function quickLinkUrl(token: string): string {
  const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : SITE_URL;
  return `${origin}/d/${token}`;
}

// מנסח את הודעת הוואטסאפ
export function quickLinkMessage(kind: QuickLinkRequest['kind'], v: { name: string; company: string; url: string; title?: string | null; plate?: string | null }): string {
  const params = { name: v.name.split(/\s+/)[0] ?? '', company: v.company, url: v.url, title: v.title ?? '', plate: v.plate ?? '' };
  if (kind === 'sign') return t('quickLink.msgSign', params);
  if (kind === 'odometer') return t('quickLink.msgOdometer', params);
  return t('quickLink.msgDocument', params);
}

// יוצר קישור ומחזיר מספר והודעה
/** Creates the link on the server and returns the driver's phone and the message. */
export async function prepareQuickLink(request: QuickLinkRequest): Promise<{ phone: string; message: string }> {
  const data = await callFunction<Recipient & { url?: string; token?: string; title?: string | null; plate?: string | null }>(
    'driver-quick-link',
    { action: 'create', ...request },
    t('quickLink.failed'),
  );
  const url = data.url ?? quickLinkUrl(data.token ?? '');
  return {
    phone: data.phone,
    message: quickLinkMessage(request.kind, { name: data.driverName, company: data.companyName, url, title: data.title, plate: data.plate }),
  };
}

// קישורים לצילום צדי הרישיון
/**
 * One WhatsApp message asking the driver for one or both sides of the
 * license. Each side gets its own link, so the upload is saved under that
 * side's title and shows up in the right tile.
 */
export async function prepareLicenseQuickLinks(driverId: string, sides: readonly LicenseSide[]): Promise<{ phone: string; message: string }> {
  const links = await Promise.all(
    sides.map((side) =>
      callFunction<Recipient & { url?: string; token?: string }>(
        'driver-quick-link',
        { action: 'create', kind: 'document', driverId, category: 'license_docs', title: LICENSE_SIDE_STORED_TITLE[side] },
        t('quickLink.failed'),
      ),
    ),
  );
  const first = links[0];
  const lines = links.map((data, i) => `${sides[i] === 'front' ? t('documents.frontSide') : t('documents.backSide')}: ${data.url ?? quickLinkUrl(data.token ?? '')}`);
  return {
    phone: first.phone,
    message: t('quickLink.msgLicense', { name: first.driverName.split(/\s+/)[0] ?? '', company: first.companyName, links: lines.join('\n') }),
  };
}

// פעולות הדף הפתוח של הנהג
export function resolveQuickLink(token: string) {
  return callFunction<QuickLinkPage>('driver-quick-link', { action: 'resolve', token }, t('quickLink.invalid'));
}

export function submitQuickOdometer(token: string, odometer: number) {
  return callFunction<{ success: true }>('driver-quick-link', { action: 'odometer', token, odometer }, t('common.error'));
}

export function uploadQuickDocument(token: string, file: { fileName: string; mimeType: string; base64: string; expiryDate?: string | null }) {
  return callFunction<{ uploads: number; maxUploads: number }>('driver-quick-link', { action: 'upload', token, ...file }, t('common.error'));
}
