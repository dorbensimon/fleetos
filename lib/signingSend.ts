import { assignSigningTemplate, deleteSigningRecord, listSignatureRequests } from './docuseal';
import { listDrivers } from './adminApi/drivers';
import { formatDate } from './theme';
import { t } from './i18n';
import { errorMessage } from './requestError';
import { DRIVER_COMPLIANCE } from './compliance';

/**
 * Sending a signing document to drivers and deleting a company's own
 * document — the logic shared by the desktop "מסמכים חתומים" sheets and the
 * manager's phone screen, so both say and do exactly the same thing.
 */

export type SendRecipient = {
  id: string;
  name: string;
  state: 'none' | 'pending' | 'signed';
  /** When the driver last signed this document, if ever. */
  lastSignedAt?: string | null;
};
export type SendOutcome = { sent: number; failed: { name: string; reason: string }[] };

/** Two document names count as the same when they differ only in spaces or letter case. */
export function sameDocumentTitle(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('he');
  return !!key(a) && key(a) === key(b);
}

export const TAKEN_TITLE_MESSAGE = () => t('signing.duplicateName');

/** A name every driver's file already has as a fixed folder, such as "הצהרת בריאות". */
export function isFixedFolderTitle(title: string | null | undefined): boolean {
  return DRIVER_COMPLIANCE.some((def) => sameDocumentTitle(def.storedTitle, title) || sameDocumentTitle(def.label, title));
}

export const RECIPIENT_STATE_LABEL: Record<SendRecipient['state'], string> = { none: '', get pending() { return t('signing.pendingSignature'); }, get signed() { return t('signing.alreadySigned'); } };

/** "נהג אחד" / "3 נהגים". */
export function driversCount(count: number): string {
  return count === 1 ? t('common.oneDriver') : t('common.driversCount', { count });
}

/** Where a driver stands on this document, and what happens if picked: "חתם לאחרונה ב-23/09/2026 · יישלח שוב". */
export function recipientNote(recipient: SendRecipient, picked: boolean): string {
  const label =
    recipient.state === 'signed' && recipient.lastSignedAt
      ? t('signing.lastSignedOn', { v1: formatDate(recipient.lastSignedAt) })
      : RECIPIENT_STATE_LABEL[recipient.state];
  if (!label || !picked) return label;
  return `${label} · ${recipient.state === 'pending' ? t('signing.willBeReplaced') : t('signing.willResend')}`;
}

/** The company's active drivers, by name, each with where they stand on this document and when they last signed it. */
export async function loadSendRecipients(companyId: string, templateId: string): Promise<SendRecipient[]> {
  const [rows, requests] = await Promise.all([listDrivers(companyId), listSignatureRequests(companyId).catch(() => [])]);
  const forThis = requests.filter((r) => r.template_id === templateId);
  const lastSignedAt = (id: string) =>
    forThis
      .filter((r) => r.driver_id === id && r.status === 'completed')
      .map((r) => r.completed_at ?? r.created_at)
      .filter(Boolean)
      .sort()
      .pop() ?? null;
  const stateOf = (id: string): SendRecipient['state'] =>
    forThis.some((r) => r.driver_id === id && r.status === 'completed')
      ? 'signed'
      : forThis.some((r) => r.driver_id === id && r.status === 'pending')
        ? 'pending'
        : 'none';
  return rows
    .filter((d) => d.status === 'active')
    .map((d) => ({ id: d.id, name: d.full_name?.trim() || t('common.unnamedDriver'), state: stateOf(d.id), lastSignedAt: lastSignedAt(d.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

/**
 * One request per driver, through the same path as the driver's own file,
 * one after the other — so a failure for one driver never stops the rest.
 */
export async function sendToRecipients(
  companyId: string,
  templateId: string,
  targets: SendRecipient[],
  onProgress?: (done: number, total: number) => void,
): Promise<SendOutcome> {
  const result: SendOutcome = { sent: 0, failed: [] };
  for (const [i, driver] of targets.entries()) {
    try {
      const response = await assignSigningTemplate(companyId, templateId, [driver.id]);
      if (response.success && response.created === 1) result.sent += 1;
      else result.failed.push({ name: driver.name, reason: response.message || t('signing.sendNotApproved') });
    } catch (error) {
      result.failed.push({ name: driver.name, reason: errorMessage(error, t('signing.sendFailed')) });
    }
    onProgress?.(i + 1, targets.length);
  }
  return result;
}

/** How many drivers are still waiting to sign this document (their requests are cancelled with it). */
export async function countWaitingSigners(companyId: string, templateId: string): Promise<number> {
  const requests = await listSignatureRequests(companyId).catch(() => []);
  return requests.filter((r) => r.template_id === templateId && r.status === 'pending').length;
}

export function deleteTemplateMessage(waiting: number, checklist = false): string {
  if (checklist) {
    const pending = waiting
      ? ` ${waiting === 1 ? t('signing.oneMeetingWaiting') : t('signing.meetingsWaiting', { waiting })}`
      : '';
    return t('signing.deleteChecklistMessage', { pending });
  }
  const pending = waiting
    ? ` ${waiting === 1 ? t('signing.oneDriverNotSigned') : t('signing.driversNotSigned', { waiting })}`
    : '';
  return t('signing.deleteTemplateMessage', { pending });
}

/** Deletes a company's own document in one step; the server cancels requests still waiting. */
export async function deleteCompanyTemplate(companyId: string, templateId: string): Promise<void> {
  await deleteSigningRecord(companyId, 'template', templateId, 'company-delete');
}

/** Withdraws a request the driver hasn't signed yet (sent by mistake). */
export async function cancelSigningRequest(companyId: string, requestId: string): Promise<void> {
  await deleteSigningRecord(companyId, 'request', requestId, 'archive');
}

/**
 * Deletes one document of one driver for good: pending or signed, the file,
 * the DocuSeal copy and its notifications. Nothing is kept.
 */
export async function eraseSigningRequest(companyId: string, requestId: string): Promise<void> {
  await deleteSigningRecord(companyId, 'request', requestId, 'erase');
}

/** The warning shown before deleting, in plain words. */
export function eraseWarning(status: string, driverName: string | null | undefined): string {
  const who = driverName?.trim() || t('common.theDriver');
  return status === 'completed'
    ? t('signing.deleteSignedMessage', { who })
    : t('signing.deletePendingMessage', { who });
}
