import type { PickedFile } from './documents';
import { readPickedFileBase64 } from './documents';
import { extractExpiryDate } from './licenseDateExtraction';

export { extractExpiryDate };

export interface ScanResult {
  rawText: string;
  extractedDate: string | null;
  confidence: number; // 0-1
}

/**
 * Scans a picked license photo for its expiry date, entirely in the browser
 * via Tesseract.js — no upload, no external service, no rate limit, since a
 * license photo carries the driver's national ID, name and photo.
 *
 * Web counterpart of documentScanner.ts (which uses ML Kit on native) — kept
 * as a separate .web.ts file because ML Kit's package has no web build and
 * would break Metro's web bundle if the two were merged behind a runtime
 * Platform check instead of this file-extension split.
 */
export async function scanLicenseImage(file: PickedFile): Promise<ScanResult> {
  try {
    const base64 = await readPickedFileBase64(file);
    // Dynamically import Tesseract so its (sizeable) bundle is only pulled
    // in when a scan actually runs, not on every web app load.
    // @ts-ignore - tesseract.js doesn't have full TS types
    const { default: Tesseract } = await import('tesseract.js');

    const result = await Tesseract.recognize(
      `data:image/jpeg;base64,${base64}`,
      'heb+eng', // Hebrew + English
      {
        logger: () => {}, // Silent mode
      }
    );

    const rawText = result.data.text || '';
    const confidence = (result.data.confidence || 0) / 100;
    const extractedDate = extractExpiryDate(rawText);

    return { rawText, extractedDate, confidence };
  } catch (error: any) {
    console.error('Tesseract OCR error:', error);
    return { rawText: '', extractedDate: null, confidence: 0 };
  }
}
