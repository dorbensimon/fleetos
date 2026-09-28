import type { Company } from './supabase';
import { daysBetween, dueText } from './meetingPlan';
import { formatPlate } from './plate';
import {
  defectLines,
  formatIsoDay,
  listInspections,
  listStateOf,
  loadInspectionPlan,
  readExtraDefects,
  readInspectionForm,
  todayIso,
  type InspectionListRow,
  type InspectionPlanRow,
  type InspectionState,
} from './inspections';
import { buildReportDocument, emptyState, esc, printOrShareReport, statusTag } from './reportTemplate';

/**
 * "ייצוא דוחות" → vehicle safety inspections: what was checked in the last
 * three months, what still waits for a driver's signature, the defects the
 * last inspection of each vehicle found, which vehicles are due, and which
 * were never checked. Drafts and cancelled inspections never count.
 */

export type InspectionReportCategory = 'insp_quarter' | 'insp_awaiting' | 'insp_defects' | 'insp_due' | 'insp_never';

export const INSPECTION_REPORT_CATEGORIES: { value: InspectionReportCategory; label: string; icon: string }[] = [
  { value: 'insp_quarter', label: 'בדיקות ב־3 החודשים האחרונים', icon: 'checkmark-done-outline' },
  { value: 'insp_awaiting', label: 'בדיקות שממתינות לחתימת הנהג', icon: 'time-outline' },
  { value: 'insp_defects', label: 'ליקויים שנמצאו בבדיקה האחרונה', icon: 'warning-outline' },
  { value: 'insp_due', label: 'רכבים שצריכים בדיקה (באיחור או בשבועיים הקרובים)', icon: 'alert-circle-outline' },
  { value: 'insp_never', label: 'רכבים שעוד לא נבדקו', icon: 'car-outline' },
];

const TITLES: Record<InspectionReportCategory, string> = {
  insp_quarter: 'דוח בדיקות בטיחות ב־3 החודשים האחרונים',
  insp_awaiting: 'דוח בדיקות בטיחות שממתינות לחתימת הנהג',
  insp_defects: 'דוח ליקויים בבדיקות הבטיחות',
  insp_due: 'דוח רכבים שצריכים בדיקת בטיחות',
  insp_never: 'דוח רכבים שעוד לא עברו בדיקת בטיחות',
};

const SOON_DAYS = 14;

/** The date three months before today, YYYY-MM-DD. */
function quarterStart(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 4, 1));
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(d, last));
  return start.toISOString().slice(0, 10);
}

type Entry = { row: InspectionListRow; state: InspectionState };
export type DefectLine = { row: InspectionListRow; text: string };

/** Which rows belong in each report. Exported for the tests. */
export function selectInspectionReport(
  category: InspectionReportCategory,
  data: { inspections: InspectionListRow[]; plan: InspectionPlanRow[] },
  today = todayIso(),
): { entries: Entry[]; plan: InspectionPlanRow[]; defects: DefectLine[] } {
  const entries = data.inspections
    .map((row) => ({ row, state: listStateOf(row) }))
    .filter((e) => e.state !== 'draft' && e.state !== 'cancelled');
  if (category === 'insp_quarter') {
    const since = quarterStart(today);
    return { entries: entries.filter((e) => e.row.inspection_date >= since && e.row.inspection_date <= today), plan: [], defects: [] };
  }
  if (category === 'insp_awaiting') {
    return { entries: entries.filter((e) => e.state === 'awaiting_driver' || e.state === 'requires_attention'), plan: [], defects: [] };
  }
  if (category === 'insp_defects') {
    // The last inspection of each vehicle in use (the plan's), when it found any.
    const last = new Set(data.plan.filter((p) => p.lastInspectionId && p.lastDefects > 0).map((p) => p.lastInspectionId as string));
    const defects: DefectLine[] = [];
    for (const { row } of entries) {
      if (!last.has(row.id)) continue;
      const form = readInspectionForm(row.form);
      if (!form) continue;
      for (const text of defectLines(form, row.answers ?? {}, readExtraDefects(row.extra_defects))) defects.push({ row, text });
    }
    return { entries: [], plan: [], defects };
  }
  if (category === 'insp_due') {
    return { entries: [], plan: data.plan.filter((p) => !!p.nextDue && daysBetween(today, p.nextDue) <= SOON_DAYS), defects: [] };
  }
  return { entries: [], plan: data.plan.filter((p) => p.firstInspection), defects: [] };
}

const STATE_TAG: Partial<Record<InspectionState, [string, 'accent' | 'accent2' | 'outline']>> = {
  completed: ['חתום', 'accent'],
  closed: ['נסגר בלי חתימת נהג', 'outline'],
  awaiting_driver: ['ממתין לנהג', 'outline'],
  requires_attention: ['דורש טיפול', 'accent2'],
};

function vehicleCells(plate: string | null | undefined, label: string | null | undefined): string {
  return `<td class="ltr">${esc(plate ? formatPlate(plate) : null) || '—'}</td><td>${esc(label) || '—'}</td>`;
}

function vehicleLabel(row: InspectionListRow): string {
  return [row.vehicle?.manufacturer, row.vehicle?.model].filter(Boolean).join(' ') || row.facts?.vehicle || '';
}

function buildHtml(company: Company, category: InspectionReportCategory, picked: ReturnType<typeof selectInspectionReport>, today: string): string {
  let head = '';
  let rows = '';
  let count = 0;
  let countLabel = 'סה״כ רכבים בדוח';

  if (category === 'insp_quarter' || category === 'insp_awaiting') {
    count = picked.entries.length;
    countLabel = 'סה״כ בדיקות בדוח';
    head = '<th>מספר רכב</th><th>רכב</th><th>תאריך הבדיקה</th><th>קצין הבטיחות</th><th>נהג</th><th>ליקויים</th><th>חתימת הנהג</th>';
    rows = picked.entries.map(({ row, state }) => {
      const tag = STATE_TAG[state];
      return `
        <tr>
          ${vehicleCells(row.vehicle?.plate_number ?? row.facts?.plate, vehicleLabel(row))}
          <td>${esc(formatIsoDay(row.inspection_date))}</td>
          <td>${esc(row.officer_name) || '—'}</td>
          <td>${esc(row.driver?.full_name ?? row.facts?.driverName) || '—'}</td>
          <td>${row.defect_count > 0 ? statusTag(String(row.defect_count), 'accent2') : 'אין'}</td>
          <td>${tag ? statusTag(tag[0], tag[1]) : '—'}</td>
        </tr>`;
    }).join('');
  } else if (category === 'insp_defects') {
    count = picked.defects.length;
    countLabel = 'סה״כ ליקויים בדוח';
    head = '<th>מספר רכב</th><th>רכב</th><th>תאריך הבדיקה</th><th>קצין הבטיחות</th><th>הליקוי</th>';
    rows = picked.defects.map(({ row, text }) => `
        <tr>
          ${vehicleCells(row.vehicle?.plate_number ?? row.facts?.plate, vehicleLabel(row))}
          <td>${esc(formatIsoDay(row.inspection_date))}</td>
          <td>${esc(row.officer_name) || '—'}</td>
          <td>${esc(text)}</td>
        </tr>`).join('');
  } else {
    count = picked.plan.length;
    head = category === 'insp_due'
      ? '<th>מספר רכב</th><th>רכב</th><th>בדיקה אחרונה</th><th>המועד</th><th>מצב</th>'
      : '<th>מספר רכב</th><th>רכב</th><th>המועד לבדיקה הראשונה</th>';
    rows = picked.plan.map((p) => category === 'insp_due' ? `
        <tr>
          ${vehicleCells(p.plate, p.vehicleLabel)}
          <td>${p.lastInspection ? esc(formatIsoDay(p.lastInspection)) : 'בדיקה ראשונה'}</td>
          <td>${esc(formatIsoDay(p.nextDue))}</td>
          <td>${statusTag(dueText(p.nextDue!, today), daysBetween(today, p.nextDue!) < 0 ? 'accent2' : 'outline')}</td>
        </tr>` : `
        <tr>
          ${vehicleCells(p.plate, p.vehicleLabel)}
          <td>${p.nextDue ? esc(formatIsoDay(p.nextDue)) : '—'}</td>
        </tr>`).join('');
  }

  const empty: Record<InspectionReportCategory, string> = {
    insp_quarter: 'לא נעשו בדיקות בטיחות ב־3 החודשים האחרונים',
    insp_awaiting: 'אין בדיקות שממתינות לחתימת הנהג',
    insp_defects: 'לא נמצאו ליקויים בבדיקות האחרונות',
    insp_due: 'אין רכבים שצריכים בדיקה בשבועיים הקרובים',
    insp_never: 'כל הרכבים כבר עברו בדיקת בטיחות',
  };
  const bodyHtml = count === 0
    ? emptyState(empty[category])
    : `<table class="table" dir="rtl"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;

  return buildReportDocument({
    company: { name: company.name, businessId: company.business_id },
    title: TITLES[category],
    metaColumns: [
      { label: 'קצין רכב', value: company.safety_officer_name ?? '' },
      { label: 'קצין רכב נייד', value: company.safety_officer_phone ?? '', ltr: true },
      { label: countLabel, value: String(count), big: true, pushEnd: true },
    ],
    bodyHtml,
  });
}

export async function exportInspectionsReport(company: Company, category: InspectionReportCategory): Promise<void> {
  const needsList = category === 'insp_quarter' || category === 'insp_awaiting' || category === 'insp_defects';
  const needsPlan = category === 'insp_defects' || category === 'insp_due' || category === 'insp_never';
  const [inspections, plan] = await Promise.all([
    needsList ? listInspections(company.id) : Promise.resolve([]),
    needsPlan ? loadInspectionPlan(company.id) : Promise.resolve([]),
  ]);
  const today = todayIso();
  const picked = selectInspectionReport(category, { inspections, plan }, today);
  await printOrShareReport(buildHtml(company, category, picked, today), TITLES[category]);
}
