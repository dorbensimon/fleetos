import * as Print from 'expo-print';
import { buildReportDocument, esc } from './reportTemplate';
import { uploadGeneratedDocument } from './documents';
import { DocumentRow, OwnerType } from './adminApi';

/** Field order matches the agreed layout: date & time, then the event, then who reported it. */
export interface Procedure6FormValues {
  eventDate: string; // DD/MM/YYYY, for display
  eventTime: string; // HH:MM
  details: string;
  vehicleNumber: string;
  complainantName: string;
  complainantPhone: string;
}

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
    category: 'procedure_6',
    title: `נוהל 6 – ${params.values.eventDate}`,
    fileName: `נוהל-6-${params.values.eventDate.replace(/\//g, '-')}.pdf`,
    mimeType: 'application/pdf',
    base64,
  });
}
