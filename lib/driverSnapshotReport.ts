import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Company } from './supabase';
import { DriverRow } from './adminApi';
import { SignatureRequest } from './docuseal';
import { expiryState, formatDate } from './theme';
import { formatPlate } from './plate';
import { formatPhone } from './phone';

function esc(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function licenseStatus(driver: DriverRow): { label: string; tone: string } {
  const state = expiryState(driver.license_expiry);
  if (state === 'expired') return { label: 'פג תוקף', tone: 'expired' };
  if (state === 'soon') return { label: 'קרוב לפוג', tone: 'soon' };
  if (state === 'missing') return { label: 'חסר', tone: 'missing' };
  return { label: 'בתוקף', tone: 'ok' };
}

const SIGNING_STATUS_LABELS: Record<SignatureRequest['status'], { label: string; tone: string }> = {
  pending: { label: 'ממתין לחתימה', tone: 'soon' },
  completed: { label: 'נחתם', tone: 'ok' },
  declined: { label: 'נדחה', tone: 'expired' },
  cancelled: { label: 'בוטל', tone: 'missing' },
  failed: { label: 'נכשל', tone: 'expired' },
};

function buildHtml(
  company: Company,
  driver: DriverRow,
  departmentName: string | null,
  signingRequests: SignatureRequest[]
): string {
  const license = licenseStatus(driver);
  const vehicles = driver.vehicles ?? [];
  const generatedAt = new Date().toLocaleDateString('he-IL');

  const signingRows = signingRequests
    .map((req) => {
      const status = SIGNING_STATUS_LABELS[req.status];
      return `
        <tr>
          <td>${esc(req.template?.title) || '—'}</td>
          <td><span class="status status-${status.tone}">${status.label}</span></td>
          <td>${req.completed_at ? esc(formatDate(req.completed_at)) : '—'}</td>
        </tr>`;
    })
    .join('');

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
  .company-name { font-size: 20px; font-weight: bold; color: #000; margin: 0; }
  .company-sub { font-size: 11.5px; color: #666; margin-top: 2px; }
  .letterhead-meta { text-align: left; font-size: 11px; color: #666; line-height: 1.6; }
  h1 { font-size: 18px; color: #000; margin: 0 0 4px; }
  .report-sub { font-size: 11px; color: #888; margin-bottom: 20px; }
  h2 {
    font-size: 13px;
    color: #0088CC;
    margin: 24px 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid #ECECEC;
  }
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 16px 24px;
    background: #F7F9FA;
    border-radius: 10px;
    padding: 14px 16px;
  }
  .grid-item { min-width: 160px; font-size: 11.5px; }
  .grid-label { color: #888; font-size: 10px; margin-bottom: 2px; }
  .grid-value { color: #1A1A1A; font-weight: bold; }
  .ltr { direction: ltr; text-align: left; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th { background: #000; color: #fff; padding: 9px 8px; text-align: right; font-size: 11px; }
  td { padding: 8px; border-bottom: 1px solid #ECECEC; text-align: right; }
  tr:nth-child(even) td { background: #FAFAFA; }
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
  .empty { text-align: center; padding: 20px 0; color: #999; font-size: 12px; }
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
        <p class="company-sub">${esc(company.company_type) || ''}</p>
      </div>
    </div>
    <div class="letterhead-meta">
      ${company.address ? `<div>${esc(company.address)}</div>` : ''}
      ${company.phone ? `<div class="ltr">${esc(company.phone)}</div>` : ''}
    </div>
  </div>

  <h1>תמונת מצב — ${esc(driver.full_name) || 'נהג'}</h1>
  <p class="report-sub">Tolvex &middot; ניהול צי רכב &middot; הופק ב-${generatedAt}</p>

  <h2>פרטים אישיים</h2>
  <div class="grid">
    <div class="grid-item"><div class="grid-label">שם מלא</div><div class="grid-value">${esc(driver.full_name) || '—'}</div></div>
    <div class="grid-item"><div class="grid-label">ת.ז</div><div class="grid-value ltr">${esc(driver.national_id) || '—'}</div></div>
    <div class="grid-item"><div class="grid-label">מספר עובד</div><div class="grid-value ltr">${esc(driver.employee_number) || '—'}</div></div>
    <div class="grid-item"><div class="grid-label">טלפון</div><div class="grid-value ltr">${esc(driver.phone ? formatPhone(driver.phone) : null) || '—'}</div></div>
    <div class="grid-item"><div class="grid-label">מחלקה</div><div class="grid-value">${esc(departmentName) || '—'}</div></div>
    <div class="grid-item"><div class="grid-label">סטטוס</div><div class="grid-value">${driver.status === 'archived' ? 'לא פעיל' : 'פעיל'}</div></div>
  </div>

  <h2>רישיון נהיגה</h2>
  <div class="grid">
    <div class="grid-item"><div class="grid-label">דרגת רישיון</div><div class="grid-value">${esc(driver.license_classes) || '—'}</div></div>
    <div class="grid-item"><div class="grid-label">תוקף רישיון</div><div class="grid-value">${driver.license_expiry ? esc(formatDate(driver.license_expiry)) : '—'}</div></div>
    <div class="grid-item"><div class="grid-label">סטטוס</div><div class="grid-value"><span class="status status-${license.tone}">${license.label}</span></div></div>
  </div>

  <h2>רכב משויך</h2>
  ${
    vehicles.length === 0
      ? `<div class="empty">אין רכב משויך לנהג זה</div>`
      : `<div class="grid">
          ${vehicles
            .map(
              (v) => `
            <div class="grid-item">
              <div class="grid-label">${vehicles.length > 1 ? (v.is_primary ? 'רכב ראשי' : 'רכב משני') : 'רכב'}</div>
              <div class="grid-value ltr">${esc(formatPlate(v.plate_number))}</div>
            </div>`
            )
            .join('')}
        </div>`
  }

  <h2>מסמכים לחתימה</h2>
  ${
    signingRequests.length === 0
      ? `<div class="empty">אין מסמכים לחתימה עבור נהג זה</div>`
      : `<table>
          <thead>
            <tr>
              <th>שם מסמך</th>
              <th>סטטוס</th>
              <th>נחתם בתאריך</th>
            </tr>
          </thead>
          <tbody>${signingRows}</tbody>
        </table>`
  }

  <div class="footer">מסמך זה הופק אוטומטית על ידי מערכת Tolvex לניהול צי רכב</div>
</body>
</html>`;
}

export async function exportDriverSnapshotReport(
  company: Company,
  driver: DriverRow,
  departmentName: string | null,
  signingRequests: SignatureRequest[]
): Promise<void> {
  const html = buildHtml(company, driver, departmentName, signingRequests);

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `תמונת מצב — ${driver.full_name ?? 'נהג'}`,
      UTI: 'com.adobe.pdf',
    });
  }
}
