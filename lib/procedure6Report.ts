// טופס נוהל 6 כ-PDF
import * as Print from 'expo-print';
import { buildReportDocument, esc } from './reportTemplate';
import { uploadGeneratedDocument } from './documents';
import { DocumentRow, OwnerType } from './adminApi';

export const PROCEDURE_6_CATEGORY = 'procedure_6';

/** Field order matches the agreed layout: date & time, then the event, then who reported it. */
export interface Procedure6FormValues {
  eventDate: string; // DD/MM/YYYY, for display
  eventDateIso: string; // YYYY-MM-DD, kept as the document's date
  eventTime: string; // HH:MM
  details: string;
  vehicleNumber: string;
  complainantName: string;
  complainantPhone: string;
}

// בונה את ה-HTML של הטופס
function buildProcedure6Html(values: Procedure6FormValues, photoDataUri?: string | null): string {
  const bodyHtml = `
    <h2 class="section-title">פרטי האירוע</h2>
    <p style="font-size:13px; line-height:1.7; white-space:pre-wrap; margin:0;">${esc(values.details)}</p>
    ${
      photoDataUri
        ? `<h2 class="section-title">תיעוד</h2><img src="${photoDataUri}" style="max-width:100%; border-radius:6px; margin-top:4px;" />`
        : ''
    }
  `;

  return buildReportDocument({
    title: 'נוהל 6 – דיווח אירוע',
    metaColumns: [
      { label: 'תאריך האירוע', value: values.eventDate },
      { label: 'שעת האירוע', value: values.eventTime, ltr: true },
      { label: "מס' רכב", value: values.vehicleNumber, ltr: true },
      { label: 'שם הנהג המתלונן', value: values.complainantName },
      { label: 'טלפון הנהג המתלונן', value: values.complainantPhone, ltr: true },
    ],
    bodyHtml,
  });
}

// מפיק את PDF נוהל 6 ושומר אותו בתיק הנהג
/** Generates the נוהל 6 PDF and stores it exactly like any other driver document. */
export async function createProcedure6Report(params: {
  companyId: string;
  ownerType: OwnerType;
  ownerId: string;
  values: Procedure6FormValues;
  photoDataUri?: string | null;
}): Promise<DocumentRow> {
  const html = buildProcedure6Html(params.values, params.photoDataUri);
  const { base64 } = await Print.printToFileAsync({ html, base64: true });
  if (!base64) throw new Error('יצירת ה-PDF נכשלה');

  return uploadGeneratedDocument({
    companyId: params.companyId,
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    category: PROCEDURE_6_CATEGORY,
    title: `נוהל 6 – ${params.values.eventDate}`,
    fileName: `נוהל-6-${params.values.eventDate.replace(/\//g, '-')}.pdf`,
    mimeType: 'application/pdf',
    base64,
    // Also kept beside the PDF (migration 124), so the folder lists each event.
    documentDate: params.values.eventDateIso,
    details: procedure6Details(params.values),
  });
}

// הפרטים שנשמרים ליד המסמך (עמודת details)
/** The event fields as stored in `documents.details`; empty ones are left out. */
export function procedure6Details(values: Omit<Procedure6FormValues, 'eventDate' | 'eventDateIso'>): Record<string, string> {
  const out: Record<string, string> = {};
  const pairs: [string, string][] = [
    ['event_time', values.eventTime],
    ['event_details', values.details],
    ['vehicle_plate', values.vehicleNumber],
    ['complainant_name', values.complainantName],
    ['complainant_phone', values.complainantPhone],
  ];
  for (const [key, value] of pairs) if (value?.trim()) out[key] = value.trim();
  return out;
}
