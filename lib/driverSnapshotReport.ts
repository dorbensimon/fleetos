import { Company } from './supabase';
import { DocumentRow, DriverRow } from './adminApi';
import { DRIVER_DOCUMENT_GROUPS, LICENSE_DOCS_CATEGORY, LICENSE_SIDE_TITLES } from './driverDocumentFolders';
import { SignatureRequest } from './docuseal';
import { expiryState, formatDate } from './theme';
import { formatPlate } from './plate';
import { formatPhone } from './phone';
import { buildReportDocument, emptyState, esc, printOrShareReport, statusTag, TagTone } from './reportTemplate';

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

const field = (label: string, valueHtml: string) =>
  `<div class="meta-col"><div class="meta-label">${esc(label)}</div><div class="meta-value">${valueHtml || '—'}</div></div>`;
const ltrField = (label: string, value: string | null | undefined) =>
  `<div class="meta-col"><div class="meta-label">${esc(label)}</div><div class="meta-value ltr">${esc(value) || '—'}</div></div>`;
const dateOrDash = (value: string | null | undefined) => (value ? esc(formatDate(value)) : '');

function buildHtml(
  company: Company,
  driver: DriverRow,
  departmentName: string | null,
  signingRequests: SignatureRequest[],
  documents: DocumentRow[]
): string {
  const license = licenseStatus(driver);
  const vehicles = driver.vehicles ?? [];
  const licensePhotos = documents.filter((doc) => doc.category === LICENSE_DOCS_CATEGORY);
  const photoSides = Object.values(LICENSE_SIDE_TITLES).filter((title) => licensePhotos.some((doc) => doc.title === title)).length;

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

  // Same folders and order as the driver record; the license photos have their own line above.
  const documentRows = DRIVER_DOCUMENT_GROUPS.map((group) => {
    const rows = group.folders.map((folder) => {
      const inFolder = documents.filter((doc) => doc.category === folder.category);
      const latest = inFolder.reduce<string | null>((max, doc) => (!max || doc.created_at > max ? doc.created_at : max), null);
      return `
        <tr>
          <td>${esc(folder.title)}</td>
          <td>${inFolder.length ? inFolder.length : statusTag('ריק', 'neutral')}</td>
          <td>${latest ? esc(formatDate(latest)) : '—'}</td>
        </tr>`;
    });
    return `<tr class="group-row"><td colspan="3">${esc(group.title)}</td></tr>${rows.join('')}`;
  }).join('');

  // Field order follows the driver record screen, row by row (three per row, right to left).
  const bodyHtml = `
    <h2 class="section-title">פרטים אישיים</h2>
    <div class="grid">
      ${field('שם מלא', esc(driver.full_name))}
      ${field('טלפון', driver.phone ? `<a class="link ltr" href="tel:${esc(driver.phone)}">${esc(formatPhone(driver.phone))}</a>` : '')}
      ${field('אימייל', driver.email ? `<span class="ltr">${esc(driver.email).replace(/([@.])/g, '<wbr>$1')}</span>` : '')}
      ${ltrField('ת.ז', driver.national_id)}
      ${field('תאריך לידה', dateOrDash(driver.birth_date))}
      ${field('כתובת', esc(driver.address))}
      ${ltrField('מספר עובד', driver.employee_number)}
      ${field('מחלקה', esc(departmentName))}
      ${field('תחילת העסקה', dateOrDash(driver.employment_start_date))}
      ${field('סטטוס', driver.status === 'archived' ? 'לא פעיל' : 'פעיל')}
      ${field('הצטרף לאפליקציה', dateOrDash(driver.created_at))}
      ${field('עדכון אחרון', dateOrDash(driver.updated_at))}
    </div>

    <h2 class="section-title">רישיון נהיגה</h2>
    <div class="grid">
      ${ltrField('מספר רישיון', driver.license_number)}
      ${field('דרגות', esc(driver.license_classes))}
      ${field('תאריך הנפקה', dateOrDash(driver.license_issue_date))}
      ${field('תוקף רישיון', dateOrDash(driver.license_expiry))}
      ${field('מצב', statusTag(license.label, license.tone))}
      ${field('צילומי רישיון', `${photoSides} מתוך 2 ${statusTag(photoSides === 2 ? 'הושלם' : 'חסר', photoSides === 2 ? 'accent' : 'outline')}`)}
    </div>

    <h2 class="section-title">רכבים משויכים</h2>
    ${
      vehicles.length === 0
        ? emptyState('אין רכב משויך לנהג זה')
        : `<div class="grid">
            ${vehicles.map((v) => ltrField(v.is_primary ? 'רכב ראשי' : 'רכב משני', formatPlate(v.plate_number))).join('')}
          </div>`
    }

    <h2 class="section-title">מסמכים</h2>
    <table class="table" dir="rtl">
      <thead>
        <tr>
          <th>תיקייה</th>
          <th>מסמכים</th>
          <th>עודכן לאחרונה</th>
        </tr>
      </thead>
      <tbody>${documentRows}</tbody>
    </table>

    <h2 class="section-title">טפסים לחתימה</h2>
    ${
      signingRequests.length === 0
        ? emptyState('לא נשלחו טפסים לחתימה לנהג זה')
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
    company: { name: company.name, businessId: company.business_id },
    // buildReportDocument escapes the title itself.
    title: `תמונת מצב — ${driver.full_name || 'נהג'}`,
    bodyHtml,
  });
}

export async function exportDriverSnapshotReport(
  company: Company,
  driver: DriverRow,
  departmentName: string | null,
  signingRequests: SignatureRequest[],
  documents: DocumentRow[]
): Promise<void> {
  const html = buildHtml(company, driver, departmentName, signingRequests, documents);
  await printOrShareReport(html, `תמונת מצב — ${driver.full_name ?? 'נהג'}`);
}
