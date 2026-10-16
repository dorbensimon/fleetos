// בדיקת נתיבי קבצים של חתימות
// האם הנתיב מתחיל כמו שצריך
function hasExpectedPrefix(path: unknown, prefix: string): path is string {
  return typeof path === 'string'
    && path.startsWith(prefix)
    && !path.includes('..')
    && path.split('/').every((part) => part.length > 0);
}

// נתיב קובץ מקור תקין
/** Source PDFs are created only in the company's signing-template namespace. */
export function isSigningTemplateSourcePath(companyId: string, path: unknown): path is string {
  return hasExpectedPrefix(path, `${companyId}/signing-templates/`) && path.endsWith('.pdf');
}

// נתיב מסמך חתום תקין
/** A completed PDF belongs to exactly one request and its assigned driver. */
export function isSignedRequestPath(
  companyId: string,
  driverId: string,
  requestId: string,
  path: unknown,
): path is string {
  return path === `${companyId}/driver/${driverId}/signed/${requestId}.pdf`;
}
