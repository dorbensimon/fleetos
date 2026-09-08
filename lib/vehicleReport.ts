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
import { buildReportDocument, emptyState, esc, statusTag, TagTone } from './reportTemplate';

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

function statusTone(statusKey: 'ok' | 'soon' | 'expired' | 'missing'): TagTone {
  if (statusKey === 'expired') return 'accent2';
  if (statusKey === 'soon') return 'outline';
  if (statusKey === 'missing') return 'neutral';
  return 'accent';
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
          <td>${statusTag(STATUS_LABELS[statusKey], statusTone(statusKey))}</td>
        </tr>`;
    })
    .join('');

  const bodyHtml = summaries.length === 0
    ? emptyState('לא נמצאו רכבים בקטגוריה זו')
    : `<table class="table" dir="rtl">
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
      </table>`;

  return buildReportDocument({
    title: CATEGORY_TITLES[category],
    metaColumns: [
      {
        label: 'חברה',
        value: company.name,
        sub: company.business_id ? `ח.פ ${company.business_id}` : undefined,
      },
      {
        label: 'קצין רכב',
        value: company.safety_officer_name ?? '',
      },
      {
        label: 'קצין רכב נייד',
        value: company.safety_officer_phone ?? '',
        ltr: true,
      },
      {
        label: 'סה״כ רכבים בדוח',
        value: String(summaries.length),
        big: true,
        pushEnd: true,
      },
    ],
    bodyHtml,
  });
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
