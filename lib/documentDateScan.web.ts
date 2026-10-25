// סריקת מסמך שהועלה לזיהוי התאריכים שבו (בדפדפן, בלי שירות חיצוני)
import type { PickedFile } from './documents';
import { pickDocumentDates, type DocumentDates } from './documentDates';
import { pickInvoiceFields, type InvoiceFields } from './invoiceFields';

const MAX_PAGES = 3;

// זיהוי טקסט בתמונה
async function ocr(source: string | HTMLCanvasElement): Promise<string> {
  // @ts-ignore - tesseract.js doesn't have full TS types
  const { default: Tesseract } = await import('tesseract.js');
  const result = await Tesseract.recognize(source, 'heb+eng', { logger: () => {} });
  return result.data.text || '';
}

// הטקסט של קובץ PDF
/** A digital PDF's own text; a scanned PDF (no text inside) is read from a picture of page 1. */
async function pdfText(uri: string): Promise<string> {
  const { loadPdf, renderPage } = await import('../components/desktop/signing/pdf.web');
  const { doc } = await loadPdf(uri);
  try {
    let text = '';
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      text += '\n' + content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '')).join('');
    }
    if (text.replace(/\s/g, '').length >= 30) return text;
    const canvas = document.createElement('canvas');
    await renderPage(doc, 1, canvas, 1200);
    return await ocr(canvas);
  } finally {
    void doc.cleanup();
  }
}

// הטקסט של המסמך שנבחר
/**
 * Reads a picked PDF or photo in the browser; nothing is sent anywhere.
 * Null when the file can't be read (Word files, errors).
 */
export async function readDocumentText(file: PickedFile): Promise<string | null> {
  try {
    const isPdf = file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isImage = file.mimeType?.startsWith('image/');
    if (!isPdf && !isImage) return null;
    return isPdf ? await pdfText(file.uri) : await ocr(file.uri);
  } catch (error) {
    console.warn('Document scan failed:', error);
    return null;
  }
}

// מוצא את התאריכים במסמך שנבחר
export async function scanDocumentDates(file: PickedFile): Promise<DocumentDates | null> {
  const text = await readDocumentText(file);
  return text == null ? null : pickDocumentDates(text);
}

// מוצא את פרטי החשבונית במסמך שנבחר
export async function scanInvoice(file: PickedFile): Promise<InvoiceFields | null> {
  const text = await readDocumentText(file);
  return text == null ? null : pickInvoiceFields(text);
}
