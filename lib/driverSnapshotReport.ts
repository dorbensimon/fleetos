// דוח מלא על נהג אחד (PDF)
import { Company } from './supabase';
import { DocumentRow, DriverRow } from './adminApi';
import { DRIVER_DOCUMENT_GROUPS, LICENSE_DOCS_CATEGORY } from './driverDocumentFolders';
import { LICENSE_SIDE_STORED_TITLE } from './licenseSides';
import { SignatureRequest } from './docuseal';
import { expiryState, formatDate } from './theme';
import { formatPlate } from './plate';
import { formatPhone } from './phone';
import { buildReportDocument, emptyState, esc, printOrShareReport, statusTag, TagTone } from './reportTemplate';

// מצב הרישיון וצבע
function licenseStatus(driver: DriverRow): { label: string; tone: TagTone } {
  const state = expiryState(driver.license_expiry);
  if (state === 'expired') return { label: 'פג תוקף', tone: 'accent2' };
  if (state === 'soon') return { label: 'קרוב לפוג', tone: 'outline' };
  if (state === 'missing') return { label: 'חסר', tone: 'neutral' };
  return { label: 'בתוקף', tone: 'accent' };
}

// טקסט וצבע לכל מצב חתימה
const SIGNING_STATUS_LABELS: Record<SignatureRequest['status'], { label: string; tone: TagTone }> = {
  pending: { label: 'ממתין לחתימה', tone: 'outline' },
  completed: { label: 'נחתם', tone: 'accent' },
  declined: { label: 'נדחה', tone: 'accent2' },
  cancelled: { label: 'בוטל', tone: 'neutral' },
  failed: { label: 'נכשל', tone: 'accent2' },
};

// שורת שדה בדוח
const field = (label: string, valueHtml: string) =>
  `<div class="meta-col"><div class="meta-label">${esc(label)}</div><div class="meta-value">${valueHtml || '—'}</div></div>`;
// שורת שדה משמאל לימין (מספרים)
const ltrField = (label: string, value: string | null | undefined) =>
  `<div class="meta-col"><div class="meta-label">${esc(label)}</div><div class="meta-value ltr">${esc(value) || '—'}</div></div>`;
// תאריך או ריק
const dateOrDash = (value: string | null | undefined) => (value ? esc(formatDate(value)) : '');

// בונה את ה-HTML של הדוח
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
  const photoSides = Object.values(LICENSE_SIDE_STORED_TITLE).filter((title) => licensePhotos.some((doc) => doc.title === title)).length;

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
  // Each folder: how many files, the latest upload, and the latest expiry with its state.
  const folderState = (inFolder: DocumentRow[]) => {
    const latest = [...inFolder].sort((x, y) => (x.created_at < y.created_at ? 1 : -1))[0] ?? null;
    const expiry = latest?.expiry_date ?? null;
    const state = expiry ? expiryState(expiry) : null;
    return { latest, expiry, state };
  };
  let emptyFolders = 0;
  const badFolders: string[] = [];
  const documentRows = DRIVER_DOCUMENT_GROUPS.map((group) => {
    const rows = group.folders.map((folder) => {
      const inFolder = documents.filter((doc) => doc.category === folder.category);
      const { latest, expiry, state } = folderState(inFolder);
      if (!inFolder.length) emptyFolders++;
      if (state === 'expired' || state === 'soon') badFolders.push(`${folder.title} — ${state === 'expired' ? 'פג תוקף' : 'קרוב לפוג'} (${formatDate(expiry)})`);
      const tag = !inFolder.length
        ? statusTag('ריק', 'neutral')
        : state === 'expired' ? statusTag('פג תוקף', 'accent2')
        : state === 'soon' ? statusTag('קרוב לפוג', 'outline')
        : statusTag('קיים', 'accent');
      return `
        <tr>
          <td>${esc(folder.title)}</td>
          <td class="num">${inFolder.length || '—'}</td>
          <td>${latest ? esc(formatDate(latest.created_at)) : '—'}</td>
          <td>${expiry ? esc(formatDate(expiry)) : '—'}</td>
          <td>${tag}</td>
        </tr>`;
    });
    return `<tr class="group-row"><td colspan="5">${esc(group.title)}</td></tr>${rows.join('')}`;
  }).join('');
  const folderCount = DRIVER_DOCUMENT_GROUPS.reduce((n, g) => n + g.folders.length, 0);
  const pendingSigning = signingRequests.filter((r) => r.status === 'pending').length;

  // מה דורש טיפול: קודם מה שפג, אחר כך מה שקרוב לפוג ומה שחסר
  const actions: { text: string; tone: TagTone }[] = [];
  const licenseState = expiryState(driver.license_expiry);
  if (licenseState === 'expired') actions.push({ text: `רישיון הנהיגה פג תוקף ב-${formatDate(driver.license_expiry)}`, tone: 'accent2' });
  if (licenseState === 'missing') actions.push({ text: 'לא הוזן תוקף לרישיון הנהיגה', tone: 'outline' });
  if (licenseState === 'soon') actions.push({ text: `רישיון הנהיגה יפוג ב-${formatDate(driver.license_expiry)}`, tone: 'outline' });
  if (photoSides < 2) actions.push({ text: `חסר צילום רישיון (${photoSides} מתוך 2 צדדים)`, tone: 'outline' });
  badFolders.forEach((text) => actions.push({ text, tone: text.includes('פג תוקף') ? 'accent2' : 'outline' }));
  if (pendingSigning) actions.push({ text: `${pendingSigning} טפסים ממתינים לחתימת הנהג`, tone: 'outline' });
  actions.sort((x, y) => (x.tone === y.tone ? 0 : x.tone === 'accent2' ? -1 : 1));
  const overall = actions.some((x) => x.tone === 'accent2') ? { label: 'דורש טיפול מיידי', tone: 'accent2' as TagTone }
    : actions.length ? { label: 'דורש השלמה', tone: 'outline' as TagTone }
    : { label: 'תקין', tone: 'accent' as TagTone };

  const kpi = (label: string, value: string, tone: TagTone | null = null, sub = '') =>
    `<div class="kpi${tone ? ` kpi-${tone}` : ''}"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${esc(sub)}</div>` : ''}</div>`;

  // Field order follows the driver record screen, row by row (three per row, right to left).
  const bodyHtml = `
    <div class="kpis">
      ${kpi('מצב כללי', esc(overall.label), overall.tone)}
      ${kpi('רישיון נהיגה', esc(license.label), license.tone, driver.license_expiry ? `עד ${formatDate(driver.license_expiry)}` : '')}
      ${kpi('תיקיות עם מסמכים', `<span class="ltr">${folderCount - emptyFolders}/${folderCount}</span>`, null, emptyFolders ? `${emptyFolders} ריקות` : 'הכל מלא')}
      ${kpi('טפסים לחתימה', String(pendingSigning), pendingSigning ? 'outline' : null, pendingSigning ? 'ממתינים לנהג' : 'אין ממתינים')}
    </div>

    <h2 class="section-title">דורש טיפול</h2>
    ${actions.length
      ? `<ul class="actions">${actions.map((x) => `<li class="action action-${x.tone}">${esc(x.text)}</li>`).join('')}</ul>`
      : emptyState('אין פריטים פתוחים — תיק הנהג מעודכן')}

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
        : `<table class="table" dir="rtl">
            <thead><tr><th>מספר רישוי</th><th>שיוך</th></tr></thead>
            <tbody>${vehicles.map((v) => `<tr><td><span class="ltr">${esc(formatPlate(v.plate_number))}</span></td><td>${v.is_primary ? 'רכב ראשי' : 'רכב משני'}</td></tr>`).join('')}</tbody>
          </table>`
    }

    <h2 class="section-title">מסמכים</h2>
    <table class="table" dir="rtl">
      <thead>
        <tr>
          <th>תיקייה</th>
          <th>קבצים</th>
          <th>הועלה לאחרונה</th>
          <th>תוקף</th>
          <th>מצב</th>
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
    }

    <div class="signoff">
      <div class="sign-line"><span>שם הבודק</span></div>
      <div class="sign-line"><span>תפקיד</span></div>
      <div class="sign-line"><span>תאריך</span></div>
      <div class="sign-line"><span>חתימה</span></div>
    </div>`;

  return buildReportDocument({
    company: { name: company.name, businessId: company.business_id },
    // buildReportDocument escapes the title itself.
    title: `תמונת מצב — ${driver.full_name || 'נהג'}`,
    bodyHtml,
  });
}

// מפיק ומוריד את דוח הנהג
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
