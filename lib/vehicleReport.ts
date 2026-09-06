import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Company } from './supabase';
import { Vehicle, ComplianceItem, VehicleDriverWithProfile } from './adminApi';
import { daysUntilExpiry, formatDate } from './theme';
import { formatPlate } from './plate';
import {
  VEHICLE_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  complianceRemainingDays,
  findComplianceDef,
} from './compliance';
import {
  TONE_BAD,
  TONE_OK,
  TONE_WARN,
  SERVICE_WARN_KM,
  remainingTone,
  worstTone,
} from './fleetCardHelpers';

export type VehicleReportCategory = 'all' | 'insurance' | 'test' | 'service' | 'issues';

export const VEHICLE_REPORT_CATEGORIES: { value: VehicleReportCategory; label: string; icon: string }[] = [
  { value: 'all', label: 'כל הרכבים', icon: 'car-outline' },
  { value: 'issues', label: 'רכבים עם חריגה', icon: 'warning' },
  { value: 'insurance', label: 'ביטוח פג / קרוב לפוג', icon: 'shield-checkmark-outline' },
  { value: 'test', label: 'טסט פג / קרוב לפוג', icon: 'construct-outline' },
  { value: 'service', label: 'טיפול קרוב / באיחור', icon: 'build-outline' },
];

const CATEGORY_TITLES: Record<VehicleReportCategory, string> = {
  all: 'דוח כלל הרכבים',
  issues: 'דוח רכבים עם חריגה',
  insurance: 'דוח ביטוח רכבים',
  test: 'דוח טסט שנתי',
  service: 'דוח טיפולים',
};

interface VehicleSummary {
  vehicle: Vehicle;
  insurance: string | null;
  insDays: number | null;
  insTone: string;
  test: string | null;
  testDays: number | null;
  testTone: string;
  kmToService: number | null;
  svcTone: string;
  worst: string;
  driverName: string | null;
}

function summarize(
  vehicle: Vehicle,
  compliance: Map<string, ComplianceItem[]>,
  vehicleDrivers: Map<string, VehicleDriverWithProfile[]>
): VehicleSummary {
  const items = compliance.get(vehicle.id) ?? [];
  const insuranceItem = items.find((c) => c.item_type === 'insurance_mandatory') ?? null;
  const testItem = items.find((c) => c.item_type === 'annual_test') ?? null;
  const testDef = findComplianceDef('vehicle', 'annual_test');

  const insurance = insuranceItem?.expiry_date ?? null;
  const insDays = daysUntilExpiry(insurance);
  const testDays = testDef ? complianceRemainingDays(testDef, testItem) : daysUntilExpiry(testItem?.expiry_date ?? null);
  const kmToService = vehicle.next_service_km != null ? vehicle.next_service_km - vehicle.odometer : null;

  const insTone = remainingTone(insDays, 30);
  const testTone = remainingTone(testDays === Number.POSITIVE_INFINITY ? null : testDays, 30);
  const svcTone = remainingTone(kmToService, SERVICE_WARN_KM);
  const worst = worstTone([insTone, testTone, svcTone]);

  const assignedDrivers = vehicleDrivers.get(vehicle.id) ?? [];
  const driverName = assignedDrivers.find((d) => d.is_primary)?.full_name ?? assignedDrivers[0]?.full_name ?? null;

  return {
    vehicle,
    insurance,
    insDays,
    insTone,
    test: testItem?.expiry_date ?? null,
    testDays: testDays === Number.POSITIVE_INFINITY ? null : testDays,
    testTone,
    kmToService,
    svcTone,
    worst,
    driverName,
  };
}

function filterVehicles(
  summaries: VehicleSummary[],
  category: VehicleReportCategory
): VehicleSummary[] {
  switch (category) {
    case 'insurance':
      return summaries.filter((s) => s.insTone !== TONE_OK);
    case 'test':
      return summaries.filter((s) => s.testTone !== TONE_OK);
    case 'service':
      return summaries.filter((s) => s.svcTone !== TONE_OK);
    case 'issues':
      return summaries.filter((s) => s.worst !== TONE_OK);
    default:
      return summaries;
  }
}

function toneStatusKey(tone: string): 'ok' | 'soon' | 'expired' | 'missing' {
  if (tone === TONE_BAD) return 'expired';
  if (tone === TONE_WARN) return 'soon';
  if (tone === TONE_OK) return 'ok';
  return 'missing';
}

const STATUS_LABELS: Record<'ok' | 'soon' | 'expired' | 'missing', string> = {
  ok: 'תקין',
  soon: 'מתקרב מועד',
  expired: 'דורש טיפול',
  missing: 'חסר נתונים',
};

function esc(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHtml(company: Company, summaries: VehicleSummary[], category: VehicleReportCategory): string {
  const rows = summaries
    .map((s) => {
      const v = s.vehicle;
      const statusKey = toneStatusKey(s.worst);
      const model = [v.manufacturer, v.model].filter(Boolean).join(' ') || '—';
      return `
        <tr>
          <td class="ltr">${esc(formatPlate(v.plate_number))}</td>
          <td>${esc(model)}</td>
          <td>${esc(VEHICLE_TYPE_LABELS[v.vehicle_type] ?? v.vehicle_type)}</td>
          <td>${esc(VEHICLE_STATUS_LABELS[v.status] ?? v.status)}</td>
          <td>${s.insurance ? esc(formatDate(s.insurance)) : '—'}</td>
          <td>${s.test ? esc(formatDate(s.test)) : '—'}</td>
          <td>${v.next_service_km != null ? `${v.next_service_km.toLocaleString()} ק״מ` : '—'}</td>
          <td>${esc(s.driverName) || 'ללא נהג'}</td>
          <td><span class="status status-${statusKey}">${STATUS_LABELS[statusKey]}</span></td>
        </tr>`;
    })
    .join('');

  const generatedAt = new Date().toLocaleDateString('he-IL');

  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Arial', sans-serif;
    margin: 0;
    padding: 32px;
    color: #1A1A1A;
    direction: rtl;
  }
  .letterhead {
    display: flex;
    flex-direction: row-reverse;
    align-items: center;
    justify-content: space-between;
    border-bottom: 3px solid #0088CC;
    padding-bottom: 16px;
    margin-bottom: 20px;
  }
  .letterhead-company {
    display: flex;
    flex-direction: row-reverse;
    align-items: center;
    gap: 14px;
  }
  .logo {
    width: 56px;
    height: 56px;
    border-radius: 10px;
    object-fit: cover;
    border: 1px solid #E2E2E2;
  }
  .company-name {
    font-size: 20px;
    font-weight: bold;
    color: #000;
    margin: 0;
  }
  .company-sub {
    font-size: 11.5px;
    color: #666;
    margin-top: 2px;
  }
  .letterhead-meta {
    text-align: left;
    font-size: 11px;
    color: #666;
    line-height: 1.6;
  }
  .company-details {
    display: flex;
    flex-direction: row-reverse;
    flex-wrap: wrap;
    gap: 22px;
    background: #F7F9FA;
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 22px;
    font-size: 11.5px;
  }
  .detail-item { min-width: 140px; }
  .detail-label { color: #888; font-size: 10px; margin-bottom: 2px; }
  .detail-value { color: #1A1A1A; font-weight: bold; }
  h1 {
    font-size: 16px;
    color: #000;
    margin: 0 0 4px;
  }
  .report-sub {
    font-size: 11px;
    color: #888;
    margin-bottom: 16px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.8px;
  }
  th {
    background: #000;
    color: #fff;
    padding: 9px 6px;
    text-align: right;
    font-size: 10.3px;
  }
  td {
    padding: 7px 6px;
    border-bottom: 1px solid #ECECEC;
    text-align: right;
  }
  tr:nth-child(even) td { background: #FAFAFA; }
  .ltr { direction: ltr; text-align: left; }
  .status {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: bold;
    white-space: nowrap;
  }
  .status-ok { background: #E6F6EF; color: #1E8E63; }
  .status-soon { background: #FDF3E2; color: #A9720F; }
  .status-expired { background: #F8E7E5; color: #C0392B; }
  .status-missing { background: #EFEFEF; color: #666; }
  .empty {
    text-align: center;
    padding: 40px 0;
    color: #999;
    font-size: 13px;
  }
  .footer {
    margin-top: 26px;
    padding-top: 10px;
    border-top: 1px solid #ECECEC;
    font-size: 10px;
    color: #999;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="letterhead">
    <div class="letterhead-company">
      ${company.logo_url ? `<img class="logo" src="${esc(company.logo_url)}" />` : ''}
      <div>
        <p class="company-name">${esc(company.name)}</p>
        <p class="company-sub">${esc(company.company_type) || ''}${
          company.business_id ? ` &nbsp;·&nbsp; ${esc(company.company_type ? (company.company_type === 'בע״מ' ? 'ח.פ' : 'ע.מ') : 'מס\' עוסק')} ${esc(company.business_id)}` : ''
        }</p>
      </div>
    </div>
    <div class="letterhead-meta">
      ${company.address ? `<div>${esc(company.address)}</div>` : ''}
      ${company.phone ? `<div class="ltr">${esc(company.phone)}</div>` : ''}
    </div>
  </div>

  <div class="company-details">
    <div class="detail-item">
      <div class="detail-label">שם קצין הרכב</div>
      <div class="detail-value">${esc(company.safety_officer_name) || '—'}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">נייד קצין הרכב</div>
      <div class="detail-value ltr">${esc(company.safety_officer_phone) || '—'}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">תאריך הפקה</div>
      <div class="detail-value">${generatedAt}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">סה״כ רכבים בדוח</div>
      <div class="detail-value">${summaries.length}</div>
    </div>
  </div>

  <h1>${CATEGORY_TITLES[category]}</h1>
  <p class="report-sub">Tolvex &middot; ניהול צי רכב</p>

  ${
    summaries.length === 0
      ? `<div class="empty">לא נמצאו רכבים בקטגוריה זו</div>`
      : `<table>
          <thead>
            <tr>
              <th>מספר רישוי</th>
              <th>יצרן ודגם</th>
              <th>סוג</th>
              <th>סטטוס רכב</th>
              <th>ביטוח חובה</th>
              <th>טסט שנתי</th>
              <th>טיפול הבא</th>
              <th>נהג משויך</th>
              <th>מצב כללי</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`
  }

  <div class="footer">מסמך זה הופק אוטומטית על ידי מערכת Tolvex לניהול צי רכב</div>
</body>
</html>`;
}

export async function exportVehiclesReport(
  company: Company,
  vehicles: Vehicle[],
  compliance: Map<string, ComplianceItem[]>,
  vehicleDrivers: Map<string, VehicleDriverWithProfile[]>,
  category: VehicleReportCategory
): Promise<void> {
  const activeVehicles = vehicles.filter((v) => v.status !== 'archived');
  const summaries = activeVehicles.map((v) => summarize(v, compliance, vehicleDrivers));
  const filtered = filterVehicles(summaries, category);
  const html = buildHtml(company, filtered, category);

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: CATEGORY_TITLES[category],
      UTI: 'com.adobe.pdf',
    });
  }
}
