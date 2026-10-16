// חלון יצירת מסמך (בטלפון לא קיים)
import type * as Web from './CreateDocumentSheet.web';

/**
 * "מסמך חדש" is desktop web only (see the .web.tsx file).
 * This stub keeps pdf.js and the DOM editor out of the phone app bundle.
 */
export type OwnerTemplateTarget = Web.OwnerTemplateTarget;
// לא מציג כלום בטלפון
export function CreateDocumentSheet(_p: Parameters<typeof Web.CreateDocumentSheet>[0]) { return null; }
