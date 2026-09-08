import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Company } from './supabase';
import { DriverRow } from './adminApi';
import { expiryState, formatDate } from './theme';
import { formatPlate } from './plate';
import { formatPhone } from './phone';
import { buildReportDocument, emptyState, esc, statusTag, TagTone } from './reportTemplate';

export type ReportCategory = 'all' | 'soon' | 'expired' | 'no_vehicle';

export const REPORT_CATEGORIES: { value: ReportCategory; label: string; icon: string }[] = [
  { value: 'all', label: 'כל הנהגים', icon: 'people-outline' },
  { value: 'soon', label: 'רישיון קרוב לפוג', icon: 'hourglass-outline' },
  { value: 'expired', label: 'רישיון פג תוקף', icon: 'warning' },
  { value: 'no_vehicle', label: 'ללא רכב משויך', icon: 'ban-outline' },
];

const CATEGORY_TITLES: Record<ReportCategory, string> = {
  all: 'דוח כלל הנהגים',
  soon: 'דוח נהגים עם רישיון קרוב לפוג',
  expired: 'דוח נהגים עם רישיון שפג תוקפו',
  no_vehicle: 'דוח נהגים ללא רכב משויך',
};

function filterDrivers(drivers: DriverRow[], category: ReportCategory): DriverRow[] {
  switch (category) {
    case 'soon':
      return drivers.filter((d) => expiryState(d.license_expiry) === 'soon');
    case 'expired':
      return drivers.filter((d) => expiryState(d.license_expiry) === 'expired');
    case 'no_vehicle':
      return drivers.filter((d) => !d.vehicle_plate);
    default:
      return drivers;
  }
}

function licenseStatusLabel(d: DriverRow): string {
  const state = expiryState(d.license_expiry);
  if (state === 'expired') return 'פג תוקף';
  if (state === 'soon') return 'קרוב לפוג';
  if (state === 'missing') return 'חסר';
  return 'בתוקף';
}

function licenseStatusTone(d: DriverRow): TagTone {
  const state = expiryState(d.license_expiry);
  if (state === 'expired') return 'accent2';
  if (state === 'soon') return 'outline';
  if (state === 'missing') return 'neutral';
  return 'accent';
}

function buildHtml(company: Company, drivers: DriverRow[], category: ReportCategory): string {
  const rows = drivers
    .map(
      (d) => `
        <tr>
          <td>${esc(d.full_name) || '—'}</td>
          <td class="ltr">${esc(d.national_id) || '—'}</td>
          <td class="ltr">${esc(d.phone ? formatPhone(d.phone) : null) || '—'}</td>
          <td>${esc(d.license_classes) || '—'}</td>
          <td>${d.license_expiry ? esc(formatDate(d.license_expiry)) : '—'}</td>
          <td>${statusTag(licenseStatusLabel(d), licenseStatusTone(d))}</td>
          <td class="ltr">${esc(d.vehicle_plate ? formatPlate(d.vehicle_plate) : null) || '—'}</td>
        </tr>`
    )
    .join('');

  const bodyHtml = drivers.length === 0
    ? emptyState('לא נמצאו נהגים בקטגוריה זו')
    : `<table class="table" dir="rtl">
        <thead>
          <tr>
            <th>שם מלא</th>
            <th>ת.ז</th>
            <th>טלפון</th>
            <th>דרגת רישיון</th>
            <th>תוקף רישיון</th>
            <th>סטטוס</th>
            <th>רכב משויך</th>
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
        label: 'סה״כ נהגים בדוח',
        value: String(drivers.length),
        big: true,
        pushEnd: true,
      },
    ],
    bodyHtml,
  });
}

export async function exportDriversReport(
  company: Company,
  drivers: DriverRow[],
  category: ReportCategory
): Promise<void> {
  const filtered = filterDrivers(drivers, category);
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
