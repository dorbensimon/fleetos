// רשימת התוקפים: כל התיקיות עם תאריך תוקף, של כל הרכבים והנהגים
import { supabase } from './supabase';
import { listVehicles } from './adminApi/vehicles';
import { listDrivers } from './adminApi/drivers';
import { listDepartments } from './adminApi/departments';
import { listComplianceForOwners } from './adminApi/compliance';
import { chunkIds, fetchAllPages } from './adminApi/paging';
import { complianceTargetDate, newestDocument, VEHICLE_COMPLIANCE } from './compliance';
import { VEHICLE_FOLDER_ALERTS } from './vehicleFolderAlerts';
import { folderCategory, listCompanyFolders } from './companyFolders';
import { LICENSE_DOCS_CATEGORY } from './driverDocumentFolders';
import { daysUntilExpiry, formatDate } from './theme';
import { formatPlate } from './plate';
import { dateOnlyIsoFromLocalDate } from './driverFormValidation';
import { t } from './i18n';

/**
 * The "תוקפים" tab: the current expiry of every dated folder, worked out from
 * the data itself (not from notifications, which go stale once a folder is
 * renewed or a notification is read). Mirrors what the vehicle and driver
 * cards show: compliance items, the newest file of each document folder, the
 * driver's licence and permit dates.
 */

export type ValidityOwner = 'vehicle' | 'driver';
export type ValidityState = 'expired' | 'soon' | 'all';

export interface ValidityFolder {
  key: string;
  label: string;
  ownerType: ValidityOwner;
}

export interface ValidityRow {
  id: string;
  ownerType: ValidityOwner;
  ownerId: string;
  folderKey: string;
  folderLabel: string;
  until: string;
  days: number;
  /** Plate (vehicles) or full name (drivers). */
  name: string;
  /** Manufacturer and model, or employee number. */
  detail: string;
  department: string;
}

export interface ValidityData {
  folders: ValidityFolder[];
  rows: ValidityRow[];
}

/** "עומד לפוג": within this many days, like the cards' orange. */
export const VALIDITY_SOON_DAYS = 30;

// תיקיות המסמכים של הרכב עם תוקף (בלי התיקיות שהחברה הוסיפה)
export const VEHICLE_DOC_FOLDERS = VEHICLE_FOLDER_ALERTS.filter((f) => f.source === 'document' && !f.folderKey.startsWith('company_'));

// תאריכי הנהג שנשמרים בכרטיס עצמו
const DRIVER_DATES = [
  { key: 'work_at_height_expiry', label: () => t('driver.workAtHeightExpiry') },
  { key: 'port_entry_expiry', label: () => t('driver.portEntryExpiry') },
  { key: 'forklift_refresher_expiry', label: () => t('driver.forkliftRefresherExpiry') },
  { key: 'hazmat_permit_expiry', label: () => t('driver.hazmatPermitExpiry') },
] as const;

// התוקף של כל תיקיית מסמכים, לכל בעלים: לפי הקובץ האחרון שהועלה
/** `owner_id|category` → the expiry of that folder's newest file (folders whose newest file has no date are left out). */
export async function folderExpiries(companyId: string, ownerType: ValidityOwner, ownerIds: string[], categories: string[]) {
  const out = new Map<string, string>();
  if (!ownerIds.length || !categories.length) return out;
  const docs = new Map<string, { expiry_date: string | null; created_at: string }[]>();
  for (const batch of chunkIds(ownerIds)) {
    const rows = await fetchAllPages<{ owner_id: string; category: string; expiry_date: string | null; created_at: string }>((from, to) =>
      supabase
        .from('documents')
        .select('owner_id, category, expiry_date, created_at')
        .eq('company_id', companyId)
        .eq('owner_type', ownerType)
        .in('owner_id', batch)
        .in('category', categories)
        .order('id', { ascending: true })
        .range(from, to)
    );
    for (const row of rows) {
      const k = `${row.owner_id}|${row.category}`;
      docs.set(k, [...(docs.get(k) ?? []), row]);
    }
  }
  for (const [k, list] of docs) {
    const until = newestDocument(list)?.expiry_date;
    if (until) out.set(k, until);
  }
  return out;
}

// טוען את כל התוקפים של החברה
export async function loadValidity(companyId: string): Promise<ValidityData> {
  const [vehicles, drivers, departments, companyFolders] = await Promise.all([
    listVehicles(companyId),
    listDrivers(companyId),
    listDepartments(companyId),
    listCompanyFolders(companyId),
  ]);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const dated = companyFolders.filter((f) => f.tracks_expiry);
  const vehicleCustom = dated.filter((f) => f.owner_type === 'vehicle').map((f) => ({ key: folderCategory(f), label: f.title }));
  const driverCustom = dated.filter((f) => f.owner_type === 'driver').map((f) => ({ key: folderCategory(f), label: f.title }));
  const today = dateOnlyIsoFromLocalDate(new Date());
  const activeDrivers = drivers.filter((d) => !d.employment_end_date || d.employment_end_date >= today);

  const folders: ValidityFolder[] = [
    ...VEHICLE_COMPLIANCE.map((def) => ({ key: def.itemType, label: def.label, ownerType: 'vehicle' as const })),
    ...VEHICLE_DOC_FOLDERS.map((f) => ({ key: f.folderKey, label: f.label, ownerType: 'vehicle' as const })),
    ...vehicleCustom.map((f) => ({ ...f, ownerType: 'vehicle' as const })),
    { key: LICENSE_DOCS_CATEGORY, label: t('driver.licenseExpiry'), ownerType: 'driver' },
    ...DRIVER_DATES.map((f) => ({ key: f.key, label: f.label(), ownerType: 'driver' as const })),
    ...driverCustom.map((f) => ({ ...f, ownerType: 'driver' as const })),
  ];
  const labelOf = new Map(folders.map((f) => [`${f.ownerType}|${f.key}`, f.label]));

  const [compliance, vehicleDocs, driverDocs] = await Promise.all([
    listComplianceForOwners('vehicle', vehicles.map((v) => v.id)),
    folderExpiries(companyId, 'vehicle', vehicles.map((v) => v.id), [...VEHICLE_DOC_FOLDERS.map((f) => f.folderKey), ...vehicleCustom.map((f) => f.key)]),
    folderExpiries(companyId, 'driver', activeDrivers.map((d) => d.id), driverCustom.map((f) => f.key)),
  ]);

  const rows: ValidityRow[] = [];
  const push = (ownerType: ValidityOwner, ownerId: string, folderKey: string, until: string | null | undefined, name: string, detail: string, departmentId: string | null) => {
    const days = daysUntilExpiry(until);
    if (!until || days == null) return;
    rows.push({
      id: `${ownerType}|${ownerId}|${folderKey}`,
      ownerType, ownerId, folderKey,
      folderLabel: labelOf.get(`${ownerType}|${folderKey}`) ?? folderKey,
      until, days, name, detail,
      department: (departmentId && deptName.get(departmentId)) || '',
    });
  };

  for (const v of vehicles) {
    const name = formatPlate(v.plate_number);
    const detail = [v.manufacturer, v.model].filter(Boolean).join(' ');
    const items = compliance.get(v.id) ?? [];
    for (const def of VEHICLE_COMPLIANCE) push('vehicle', v.id, def.itemType, complianceTargetDate(def, items.find((x) => x.item_type === def.itemType)), name, detail, v.department_id);
  }
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  for (const [k, until] of vehicleDocs) {
    const [ownerId, category] = k.split('|');
    const v = vehicleById.get(ownerId);
    if (v) push('vehicle', v.id, category, until, formatPlate(v.plate_number), [v.manufacturer, v.model].filter(Boolean).join(' '), v.department_id);
  }
  for (const d of activeDrivers) {
    const name = d.full_name?.trim() || t('common.unnamed');
    const detail = d.employee_number ? t('driver.employeeNo', { employee_number: d.employee_number }) : '';
    push('driver', d.id, LICENSE_DOCS_CATEGORY, d.license_expiry, name, detail, d.department_id);
    for (const f of DRIVER_DATES) {
      if (f.key === 'hazmat_permit_expiry' && !d.hazmat_approved) continue;
      push('driver', d.id, f.key, d[f.key], name, detail, d.department_id);
    }
  }
  const driverById = new Map(activeDrivers.map((d) => [d.id, d]));
  for (const [k, until] of driverDocs) {
    const [ownerId, category] = k.split('|');
    const d = driverById.get(ownerId);
    if (d) push('driver', d.id, category, until, d.full_name?.trim() || t('common.unnamed'), d.employee_number ? t('driver.employeeNo', { employee_number: d.employee_number }) : '', d.department_id);
  }
  rows.sort((a, b) => a.until.localeCompare(b.until) || a.name.localeCompare(b.name, 'he'));
  return { folders, rows };
}

// מסנן לפי רכב/נהג, תיקיות, מצב וחיפוש
export function filterValidity(
  rows: ValidityRow[],
  filter: { ownerType: ValidityOwner; folderKeys: ReadonlySet<string>; state: ValidityState; query: string }
): ValidityRow[] {
  const q = filter.query.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  return rows.filter((r) => {
    if (r.ownerType !== filter.ownerType) return false;
    if (filter.folderKeys.size && !filter.folderKeys.has(r.folderKey)) return false;
    if (filter.state === 'expired' && r.days >= 0) return false;
    if (filter.state === 'soon' && (r.days < 0 || r.days > VALIDITY_SOON_DAYS)) return false;
    if (!q) return true;
    const text = `${r.name} ${r.detail} ${r.department}`.toLowerCase();
    return text.includes(q) || (!!digits && r.name.replace(/\D/g, '').includes(digits));
  });
}

// הטקסט של מצב התוקף
export function validityStatusText(row: Pick<ValidityRow, 'days'>): string {
  if (row.days < 0) return t('validity.expiredDaysAgo', { count: -row.days });
  if (row.days === 0) return t('validity.today');
  return t('validity.inDays', { count: row.days });
}

// ייצוא לאקסל (CSV שאקסל פותח, כולל עברית)
export function validityCsv(rows: ValidityRow[], ownerType: ValidityOwner): string {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const head = [ownerType === 'vehicle' ? t('validity.col.vehicle') : t('validity.col.driver'), t('validity.col.detail'), t('common.department'), t('validity.col.folder'), t('validity.col.until'), t('validity.col.status')];
  const body = rows.map((r) => [r.name, r.detail, r.department, r.folderLabel, formatDate(r.until), validityStatusText(r)]);
  return '﻿' + [head, ...body].map((line) => line.map(cell).join(',')).join('\r\n');
}
