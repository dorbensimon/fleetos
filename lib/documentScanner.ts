import TextRecognition from '@react-native-ml-kit/text-recognition';
import type { PickedFile } from './documents';
import { extractExpiryDate } from './licenseDateExtraction';

export { extractExpiryDate };

export interface ScanResult {
  rawText: string;
  extractedDate: string | null;
  confidence: number; // 0-1
}

/**
 * Scans a picked license photo for its expiry date, entirely on-device via
 * Google ML Kit — no network call, no external service, no rate limit,
 * since a license photo carries the driver's national ID, name and photo.
 *
 * ML Kit's Latin-script recognizer does not read Hebrew letters, but the one
 * thing this feature needs — the expiry date — is digits and separators
 * (DD.MM.YYYY), which the Latin model reads fine. `rawText` may still be
 * missing any Hebrew words; that's shown to the user for reference only, not
 * relied on for the date extraction itself.
 *
 * This file resolves for native builds (iOS/Android); documentScanner.web.ts
 * is the web counterpart (Tesseract.js) — ML Kit's package has no web build
 * and would break the web bundle if imported unconditionally here.
 */
export async function scanLicenseImage(file: PickedFile): Promise<ScanResult> {
  try {
    const result = await TextRecognition.recognize(file.uri);
    const rawText = result.text || '';
    const extractedDate = extractExpiryDate(rawText);
    // ML Kit doesn't expose a single confidence score; a non-empty result
    // means the recognizer found and read text.
    return { rawText, extractedDate, confidence: rawText ? 1 : 0 };
  } catch (error: any) {
    console.error('ML Kit OCR error:', error);
    return { rawText: '', extractedDate: null, confidence: 0 };
  }
}
