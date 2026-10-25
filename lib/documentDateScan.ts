// סריקת מסמך לזיהוי התאריכים והפרטים שבו - בטלפון (צילומים בלבד)
import { scanLicenseImage } from './documentScanner';
import type { PickedFile } from './documents';
import { pickDocumentDates, type DocumentDates } from './documentDates';
import { pickInvoiceFields, type InvoiceFields } from './invoiceFields';

/** Native counterpart of documentDateScan.web.ts: photos through ML Kit; PDFs are not read. */
export async function readDocumentText(file: PickedFile): Promise<string | null> {
  if (!file.mimeType?.startsWith('image/')) return null;
  const { rawText } = await scanLicenseImage(file);
  return rawText || null;
}

export async function scanDocumentDates(file: PickedFile): Promise<DocumentDates | null> {
  const text = await readDocumentText(file);
  return text == null ? null : pickDocumentDates(text);
}

export async function scanInvoice(file: PickedFile): Promise<InvoiceFields | null> {
  const text = await readDocumentText(file);
  return text == null ? null : pickInvoiceFields(text);
}
