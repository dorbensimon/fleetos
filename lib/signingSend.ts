import { assignSigningTemplate, deleteSigningRecord, listSignatureRequests } from './docuseal';
import { listDrivers } from './adminApi/drivers';

/**
 * Sending a signing document to drivers and deleting a company's own
 * document — the logic shared by the desktop "מסמכים חתומים" sheets and the
 * manager's phone screen, so both say and do exactly the same thing.
 */

export type SendRecipient = { id: string; name: string; state: 'none' | 'pending' | 'signed' };
export type SendOutcome = { sent: number; failed: { name: string; reason: string }[] };

export const RECIPIENT_STATE_LABEL: Record<SendRecipient['state'], string> = { none: '', pending: 'ממתין לחתימה', signed: 'כבר חתם' };

/** "נהג אחד" / "3 נהגים". */
export function driversCount(count: number): string {
  return count === 1 ? 'נהג אחד' : `${count} נהגים`;
}

/** What happens to a picked driver who already has this document. */
export function recipientNote(recipient: SendRecipient, picked: boolean): string {
  const label = RECIPIENT_STATE_LABEL[recipient.state];
  if (!label || !picked) return label;
  return `${label} · ${recipient.state === 'pending' ? 'יוחלף במסמך חדש' : 'יישלח שוב'}`;
}

/** The company's active drivers, by name, each with where they stand on this document. */
export async function loadSendRecipients(companyId: string, templateId: string): Promise<SendRecipient[]> {
  const [rows, requests] = await Promise.all([listDrivers(companyId), listSignatureRequests(companyId).catch(() => [])]);
  const forThis = requests.filter((r) => r.template_id === templateId);
  const stateOf = (id: string): SendRecipient['state'] =>
    forThis.some((r) => r.driver_id === id && r.status === 'completed')
      ? 'signed'
      : forThis.some((r) => r.driver_id === id && r.status === 'pending')
        ? 'pending'
        : 'none';
  return rows
    .filter((d) => d.status === 'active')
    .map((d) => ({ id: d.id, name: d.full_name?.trim() || 'נהג ללא שם', state: stateOf(d.id) }))
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
      else result.failed.push({ name: driver.name, reason: response.message || 'השליחה לא אושרה' });
    } catch (error) {
      result.failed.push({ name: driver.name, reason: (error as Error)?.message || 'השליחה נכשלה' });
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

export function deleteTemplateMessage(waiting: number): string {
  const pending = waiting
    ? ` ${waiting === 1 ? 'נהג אחד עוד לא חתם עליו, והבקשה שלו תבוטל.' : `${waiting} נהגים עוד לא חתמו עליו, והבקשות שלהם יבוטלו.`}`
    : '';
  return `המסמך יימחק לצמיתות, גם מ-DocuSeal.${pending} מסמכים שנהגים כבר חתמו עליהם יישארו בתיק הנהג.`;
}

/** Deletes a company's own document in one step; the server cancels requests still waiting. */
export async function deleteCompanyTemplate(companyId: string, templateId: string): Promise<void> {
  await deleteSigningRecord(companyId, 'template', templateId, 'company-delete');
}

/** Withdraws a request the driver hasn't signed yet (sent by mistake). */
export async function cancelSigningRequest(companyId: string, requestId: string): Promise<void> {
  await deleteSigningRecord(companyId, 'request', requestId, 'archive');
}
