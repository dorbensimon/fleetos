/**
 * Extract a license expiry date from OCR text. Tries multiple Israeli/Hebrew
 * date formats: DD.MM.YYYY or DD/MM/YYYY, optionally near a "תוקף"/"valid"/
 * "expiry" keyword. Shared by both the web (Tesseract) and native (ML Kit)
 * scanners — see documentScanner.ts / documentScanner.web.ts.
 */
export function extractExpiryDate(text: string): string | null {
  if (!text) return null;

  // Remove extra whitespace/RTL marks, and collapse newlines to spaces so a
  // date that OCR wrapped across lines (common with a license's narrow
  // field columns) still matches as one contiguous string.
  const cleaned = text
    .replace(/[‎‏‪‫‬‭‮]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Pattern 1: DD.MM.YYYY or DD/MM/YYYY (loose - might catch various formats).
  // Allow optional whitespace around the separators for the same reason.
  const datePattern = /(\d{1,2})\s*[.\\/]\s*(\d{1,2})\s*[.\\/]\s*(\d{4})/g;
  const matches = [...cleaned.matchAll(datePattern)];

  // Take the last date found (usually expiry, not issue date)
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const [, day, month, year] = lastMatch;
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);

    // Validate
    if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && parseInt(year, 10) >= 2000) {
      return `${year}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    }
  }

  // Pattern 2: Look for Hebrew "תוקף" or English "valid" keywords near dates
  const patterns = [
    /תוקף[^\d]*(\d{1,2})\s*[.\\/]\s*(\d{1,2})\s*[.\\/]\s*(\d{4})/i,
    /valid[^\d]*(\d{1,2})\s*[.\\/]\s*(\d{1,2})\s*[.\\/]\s*(\d{4})/i,
    /expiry[^\d]*(\d{1,2})\s*[.\\/]\s*(\d{1,2})\s*[.\\/]\s*(\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const [, day, month, year] = match;
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && parseInt(year, 10) >= 2000) {
        return `${year}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      }
    }
  }

  return null;
}
