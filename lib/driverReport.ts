import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Company } from './supabase';
import { DriverRow } from './adminApi';
import { expiryState, formatDate } from './theme';

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

function esc(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHtml(company: Company, drivers: DriverRow[], category: ReportCategory): string {
  const rows = drivers
    .map(
      (d) => `
        <tr>
          <td>${esc(d.full_name) || '—'}</td>
          <td class="ltr">${esc(d.national_id) || '—'}</td>
          <td class="ltr">${esc(d.phone) || '—'}</td>
          <td>${esc(d.license_classes) || '—'}</td>
          <td>${d.license_expiry ? esc(formatDate(d.license_expiry)) : '—'}</td>
          <td><span class="status status-${expiryState(d.license_expiry)}">${licenseStatusLabel(d)}</span></td>
          <td class="ltr">${esc(d.vehicle_plate) || '—'}</td>
        </tr>`
    )
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
    font-size: 11.5px;
  }
  th {
    background: #000;
    color: #fff;
    padding: 9px 8px;
    text-align: right;
    font-size: 11px;
  }
  td {
    padding: 8px;
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
      <div class="detail-label">סה״כ נהגים בדוח</div>
      <div class="detail-value">${drivers.length}</div>
    </div>
  </div>

  <h1>${CATEGORY_TITLES[category]}</h1>
  <p class="report-sub">Tolvex &middot; ניהול צי רכב</p>

  ${
    drivers.length === 0
      ? `<div class="empty">לא נמצאו נהגים בקטגוריה זו</div>`
      : `<table>
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
        </table>`
  }

  <div class="footer">מסמך זה הופק אוטומטית על ידי מערכת Tolvex לניהול צי רכב</div>
</body>
</html>`;
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
