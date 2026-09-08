import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Company } from './supabase';
import { DriverRow } from './adminApi';
import { SignatureRequest } from './docuseal';
import { expiryState, formatDate } from './theme';
import { formatPlate } from './plate';
import { formatPhone } from './phone';
import { buildReportDocument, emptyState, esc, statusTag, TagTone } from './reportTemplate';

function licenseStatus(driver: DriverRow): { label: string; tone: TagTone } {
  const state = expiryState(driver.license_expiry);
  if (state === 'expired') return { label: 'פג תוקף', tone: 'accent2' };
  if (state === 'soon') return { label: 'קרוב לפוג', tone: 'outline' };
  if (state === 'missing') return { label: 'חסר', tone: 'neutral' };
  return { label: 'בתוקף', tone: 'accent' };
}

const SIGNING_STATUS_LABELS: Record<SignatureRequest['status'], { label: string; tone: TagTone }> = {
  pending: { label: 'ממתין לחתימה', tone: 'outline' },
  completed: { label: 'נחתם', tone: 'accent' },
  declined: { label: 'נדחה', tone: 'accent2' },
  cancelled: { label: 'בוטל', tone: 'neutral' },
  failed: { label: 'נכשל', tone: 'accent2' },
};

function buildHtml(
  company: Company,
  driver: DriverRow,
  departmentName: string | null,
  signingRequests: SignatureRequest[]
): string {
  const license = licenseStatus(driver);
  const vehicles = driver.vehicles ?? [];

  const signingRows = signingRequests
    .map((req) => {
      const status = SIGNING_STATUS_LABELS[req.status];
      return `
        <tr>
          <td>${esc(req.template?.title) || '—'}</td>
          <td>${statusTag(status.label, status.tone)}</td>
          <td>${req.completed_at ? esc(formatDate(req.completed_at)) : '—'}</td>
        </tr>`;
    })
    .join('');

  const bodyHtml = `
    <h2 class="section-title">פרטים אישיים</h2>
    <div class="grid">
      <div class="meta-col"><div class="meta-label">שם מלא</div><div class="meta-value">${esc(driver.full_name) || '—'}</div></div>
      <div class="meta-col"><div class="meta-label">ת.ז</div><div class="meta-value ltr">${esc(driver.national_id) || '—'}</div></div>
      <div class="meta-col"><div class="meta-label">מספר עובד</div><div class="meta-value ltr">${esc(driver.employee_number) || '—'}</div></div>
      <div class="meta-col"><div class="meta-label">טלפון</div><div class="meta-value ltr">${esc(driver.phone ? formatPhone(driver.phone) : null) || '—'}</div></div>
      <div class="meta-col"><div class="meta-label">מחלקה</div><div class="meta-value">${esc(departmentName) || '—'}</div></div>
      <div class="meta-col"><div class="meta-label">סטטוס</div><div class="meta-value">${driver.status === 'archived' ? 'לא פעיל' : 'פעיל'}</div></div>
    </div>

    <h2 class="section-title">רישיון נהיגה</h2>
    <div class="grid">
      <div class="meta-col"><div class="meta-label">דרגת רישיון</div><div class="meta-value">${esc(driver.license_classes) || '—'}</div></div>
      <div class="meta-col"><div class="meta-label">תוקף רישיון</div><div class="meta-value">${driver.license_expiry ? esc(formatDate(driver.license_expiry)) : '—'}</div></div>
      <div class="meta-col"><div class="meta-label">סטטוס</div><div class="meta-value">${statusTag(license.label, license.tone)}</div></div>
    </div>

    <h2 class="section-title">רכב משויך</h2>
    ${
      vehicles.length === 0
        ? emptyState('אין רכב משויך לנהג זה')
        : `<div class="grid">
            ${vehicles
              .map(
                (v) => `
              <div class="meta-col">
                <div class="meta-label">${vehicles.length > 1 ? (v.is_primary ? 'רכב ראשי' : 'רכב משני') : 'רכב'}</div>
                <div class="meta-value ltr">${esc(formatPlate(v.plate_number))}</div>
              </div>`
              )
              .join('')}
          </div>`
    }

    <h2 class="section-title">מסמכים לחתימה</h2>
    ${
      signingRequests.length === 0
        ? emptyState('אין מסמכים לחתימה עבור נהג זה')
        : `<table class="table" dir="rtl">
            <thead>
              <tr>
                <th>שם מסמך</th>
                <th>סטטוס</th>
                <th>נחתם בתאריך</th>
              </tr>
            </thead>
            <tbody>${signingRows}</tbody>
          </table>`
    }`;

  return buildReportDocument({
    title: `תמונת מצב — ${esc(driver.full_name) || 'נהג'}`,
    metaColumns: [
      {
        label: 'חברה',
        value: company.name,
        sub: company.business_id ? `ח.פ ${company.business_id}` : undefined,
      },
    ],
    bodyHtml,
  });
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
