// מסמכי טיפולים לרכב: טעינה, שמירה, מחיקה, סינון לפי תאריכים וסכום
import { supabase } from './supabase';
import type { DocumentRow } from './adminApi';
import { deleteDocument, uploadDocument, type PickedFile } from './documents';

/** The documents-table folder that holds the invoice files. */
export const SERVICE_DOCS_CATEGORY = 'service_docs';
const SERVICE_DOCS_TITLE = 'מסמך טיפול';

export type ServiceRecord = {
  id: string;
  company_id: string;
  vehicle_id: string;
  document_id: string | null;
  service_date: string;
  service_type: string | null;
  supplier: string | null;
  invoice_number: string | null;
  amount_before_vat: number | null;
  details: string | null;
  created_at: string;
  document: DocumentRow | null;
};

export type ServiceRecordInput = {
  service_date: string;
  service_type: string | null;
  supplier: string | null;
  invoice_number: string | null;
  amount_before_vat: number | null;
  details: string | null;
};

const SELECT = '*, document:documents(*)';

// כל הטיפולים של רכב
export async function listServiceRecords(vehicleId: string): Promise<ServiceRecord[]> {
  const { data, error } = await supabase
    .from('vehicle_service_records')
    .select(SELECT)
    .eq('vehicle_id', vehicleId)
    .order('service_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ ...row, amount_before_vat: row.amount_before_vat == null ? null : Number(row.amount_before_vat) }));
}

// טיפול חדש (עם הקובץ, אם נבחר)
/** Uploads the file first; if saving the details then fails, the file is removed again. */
export async function createServiceRecord(params: { companyId: string; vehicleId: string; input: ServiceRecordInput; file: PickedFile | null }) {
  const doc = params.file
    ? await uploadDocument({
        companyId: params.companyId,
        ownerType: 'vehicle',
        ownerId: params.vehicleId,
        category: SERVICE_DOCS_CATEGORY,
        title: SERVICE_DOCS_TITLE,
        file: params.file,
        documentDate: params.input.service_date,
      })
    : null;
  const { error } = await supabase.from('vehicle_service_records').insert({
    company_id: params.companyId,
    vehicle_id: params.vehicleId,
    document_id: doc?.id ?? null,
    ...params.input,
  });
  if (error) {
    if (doc) await deleteDocument(doc).catch(() => {});
    throw error;
  }
}

// עדכון פרטי טיפול
export async function updateServiceRecord(id: string, input: ServiceRecordInput) {
  const { error } = await supabase.from('vehicle_service_records').update(input).eq('id', id);
  if (error) throw error;
}

// מחיקת טיפול והקובץ שלו
export async function deleteServiceRecord(record: ServiceRecord) {
  const { error } = await supabase.from('vehicle_service_records').delete().eq('id', record.id);
  if (error) throw error;
  if (record.document) await deleteDocument(record.document).catch(() => {});
}

// הטיפולים שבטווח התאריכים
/** Both ends are optional and inclusive. */
export function inDateRange(records: ServiceRecord[], from: string | null, to: string | null): ServiceRecord[] {
  return records.filter((r) => (!from || r.service_date >= from) && (!to || r.service_date <= to));
}

// סה"כ לפני מע"מ
export function totalBeforeVat(records: ServiceRecord[]): number {
  return Math.round(records.reduce((sum, r) => sum + (r.amount_before_vat ?? 0), 0) * 100) / 100;
}

// סכום בשקלים
export function formatShekels(n: number): string {
  return `${n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₪`;
}
