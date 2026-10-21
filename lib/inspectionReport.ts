// דוח בדיקות קצין בטיחות להורדה (PDF)
import type { Company } from './supabase';
import { daysBetween } from './meetingPlan';
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
import { buildTableReport, printOrShareReport, ReportCell } from './reportTemplate';
import { listDepartments } from './adminApi/departments';
import { listVehicles } from './adminApi/vehicles';
import { VEHICLE_TYPE_LABELS } from './compliance';

/**
 * "ייצוא דוחות" → vehicle safety inspections: what was checked in the last
 * three months, what still waits for a driver's signature, the defects the
 * last inspection of each vehicle found, which vehicles are due, and which
 * were never checked. Drafts and cancelled inspections never count.
 */

export type InspectionReportCategory = 'insp_quarter' | 'insp_awaiting' | 'insp_defects' | 'insp_due' | 'insp_never';

// סוגי הדוח לבחירה
export const INSPECTION_REPORT_CATEGORIES: { value: InspectionReportCategory; label: string; icon: string }[] = [
  { value: 'insp_quarter', label: 'בדיקות ב־3 החודשים האחרונים', icon: 'checkmark-done-outline' },
  { value: 'insp_awaiting', label: 'בדיקות שממתינות לחתימת הנהג', icon: 'time-outline' },
  { value: 'insp_defects', label: 'ליקויים שנמצאו בבדיקה האחרונה', icon: 'warning-outline' },
  { value: 'insp_due', label: 'רכבים שצריכים בדיקה (באיחור או בשבועיים הקרובים)', icon: 'alert-circle-outline' },
  { value: 'insp_never', label: 'רכבים שעוד לא נבדקו', icon: 'car-outline' },
];

// כותרת לכל סוג דוח
const TITLES: Record<InspectionReportCategory, string> = {
  insp_quarter: 'דוח בדיקות קצין בטיחות ב־3 החודשים האחרונים',
  insp_awaiting: 'דוח בדיקות שממתינות לחתימת הנהג',
  insp_defects: 'דוח ליקויים בבדיקות קצין הבטיחות',
  insp_due: 'דוח רכבים שצריכים בדיקת קצין בטיחות',
  insp_never: 'דוח רכבים שעוד לא עברו בדיקת קצין בטיחות',
};

// כמה ימים נחשבים 'בקרוב'
const SOON_DAYS = 14;

// התאריך לפני שלושה חודשים
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

// בוחר אילו שורות נכנסות לכל דוח
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

// שם הרכב בדוח
function vehicleLabel(row: InspectionListRow): string {
  return [row.vehicle?.manufacturer, row.vehicle?.model].filter(Boolean).join(' ') || row.facts?.vehicle || '';
}

// תא של מועד: באיחור, היום או בעוד כמה ימים
function dueCell(nextDue: string, today: string): ReportCell {
  const days = daysBetween(today, nextDue);
  const text = formatIsoDay(nextDue);
  if (days < 0) return { text, ltr: true, tone: 'bad', sub: `באיחור של ${-days} ימים` };
  return { text, ltr: true, sub: days === 0 ? 'היום' : days === 1 ? 'מחר' : `בעוד ${days} ימים` };
}

type VehicleFacts = Map<string, { type: string; department: string | null }>;

const VEHICLES = { one: 'רכב אחד', many: 'רכבים' };
const INSPECTIONS = { one: 'בדיקה אחת', many: 'בדיקות' };

// בונה את ה-HTML של הדוח
function buildHtml(
  company: Company,
  category: InspectionReportCategory,
  picked: ReturnType<typeof selectInspectionReport>,
  today: string,
  facts: VehicleFacts,
): string {
  const common = { company: { name: company.name, businessId: company.business_id }, title: TITLES[category] };
  const plate = (value: string | null | undefined): ReportCell => ({ text: value ? formatPlate(value) : null, ltr: true });
  const inspectionCells = (row: InspectionListRow): ReportCell[] => [
    plate(row.vehicle?.plate_number ?? row.facts?.plate),
    { text: vehicleLabel(row) },
    { text: formatIsoDay(row.inspection_date), ltr: true },
    { text: row.officer_name },
    { text: row.driver?.full_name ?? row.facts?.driverName },
  ];
  const inspectionColumns = [
    { label: 'מספר רישוי', width: 15 }, { label: 'יצרן ודגם', width: 20 }, { label: 'תאריך הבדיקה', width: 15 },
    { label: 'קצין הבטיחות', width: 16 }, { label: 'נהג', width: 16 },
  ];

  if (category === 'insp_quarter') {
    const row = ({ row: r }: Entry) => [...inspectionCells(r), r.defect_count > 0
      ? { text: r.defect_count === 1 ? 'ליקוי אחד' : `${r.defect_count} ליקויים`, tone: 'bad' as const }
      : { text: 'אין' }];
    return buildTableReport({
      ...common,
      unit: INSPECTIONS,
      columns: [...inspectionColumns, { label: 'ליקויים', width: 18 }],
      sections: [
        { title: 'סה״כ בדיקות עם ליקויים', rows: picked.entries.filter((e) => e.row.defect_count > 0).map(row) },
        { title: 'סה״כ בדיקות תקינות', rows: picked.entries.filter((e) => e.row.defect_count === 0).map(row) },
      ],
      grandTitle: 'סה״כ בדיקות ב־3 החודשים האחרונים',
      note: `כל בדיקות קצין הבטיחות שנעשו מ־${formatIsoDay(quarterStart(today))} ועד היום.`,
      emptyText: 'לא נעשו בדיקות קצין בטיחות ב־3 החודשים האחרונים',
    });
  }

  if (category === 'insp_awaiting') {
    const waiting = ({ row: r }: Entry): ReportCell[] => {
      const days = Math.max(0, daysBetween(r.inspection_date, today));
      return [...inspectionCells(r), { text: days === 1 ? 'יום אחד' : `${days} ימים`, tone: days > 7 ? 'bad' : undefined }];
    };
    return buildTableReport({
      ...common,
      unit: INSPECTIONS,
      columns: [...inspectionColumns, { label: 'ממתין', width: 18 }],
      sections: [
        { title: 'סה״כ ממתינות לחתימת הנהג', rows: picked.entries.filter((e) => e.state === 'awaiting_driver').map(waiting) },
        { title: 'סה״כ הנהג סירב או שהשליחה נכשלה', rows: picked.entries.filter((e) => e.state === 'requires_attention').map(waiting) },
      ],
      grandTitle: 'סה״כ בדיקות שממתינות לחתימה',
      note: 'בדיקות שהקצין חתם עליהן והנהג עוד לא חתם באפליקציה.',
      emptyText: 'אין בדיקות שממתינות לחתימת הנהג',
    });
  }

  if (category === 'insp_defects') {
    const byVehicle = new Map<string, DefectLine[]>();
    for (const line of picked.defects) {
      const key = line.row.vehicle?.plate_number ?? line.row.facts?.plate ?? '';
      byVehicle.set(key, [...(byVehicle.get(key) ?? []), line]);
    }
    return buildTableReport({
      ...common,
      unit: { one: 'ליקוי אחד', many: 'ליקויים' },
      columns: [
        { label: 'מספר רישוי', width: 15 }, { label: 'יצרן ודגם', width: 20 }, { label: 'תאריך הבדיקה', width: 15 },
        { label: 'קצין הבטיחות', width: 16 }, { label: 'הליקוי', width: 34 },
      ],
      sections: [...byVehicle].map(([key, lines]) => ({
        title: `סה״כ ליקויים ברכב ${key ? formatPlate(key) : ''}`.trim(),
        rows: lines.map(({ row, text }) => [...inspectionCells(row).slice(0, 4), { text }]),
      })),
      grandTitle: 'סה״כ ליקויים פתוחים',
      note: 'הליקויים מהבדיקה האחרונה של כל רכב.',
      emptyText: 'לא נמצאו ליקויים בבדיקות האחרונות',
    });
  }

  const dept = (p: InspectionPlanRow): ReportCell => ({ text: facts.get(p.vehicleId)?.department });

  if (category === 'insp_due') {
    const row = (p: InspectionPlanRow): ReportCell[] => [
      plate(p.plate), { text: p.vehicleLabel }, dept(p),
      p.lastInspection ? { text: formatIsoDay(p.lastInspection), ltr: true } : { text: 'בדיקה ראשונה', tone: 'muted' },
      dueCell(p.nextDue!, today),
    ];
    return buildTableReport({
      ...common,
      unit: VEHICLES,
      columns: [
        { label: 'מספר רישוי', width: 15 }, { label: 'יצרן ודגם', width: 20 }, { label: 'מחלקה', width: 14 },
        { label: 'בדיקה אחרונה', width: 20 }, { label: 'המועד', width: 31 },
      ],
      sections: [
        { title: 'סה״כ באיחור', rows: picked.plan.filter((p) => daysBetween(today, p.nextDue!) < 0).map(row) },
        { title: 'סה״כ בשבועיים הקרובים', rows: picked.plan.filter((p) => daysBetween(today, p.nextDue!) >= 0).map(row) },
      ],
      grandTitle: 'סה״כ רכבים שצריכים בדיקה',
      note: `רכבים שהבדיקה שלהם באיחור או שהיא צריכה להיעשות בתוך ${SOON_DAYS} הימים הקרובים.`,
      emptyText: 'אין רכבים שצריכים בדיקה בשבועיים הקרובים',
    });
  }

  return buildTableReport({
    ...common,
    unit: VEHICLES,
    columns: [
      { label: 'מספר רישוי', width: 16 }, { label: 'יצרן ודגם', width: 26 }, { label: 'סוג', width: 14 },
      { label: 'מחלקה', width: 18 }, { label: 'מועד בדיקה ראשונה', width: 26 },
    ],
    sections: [{
      title: '',
      rows: picked.plan.map((p) => [
        plate(p.plate), { text: p.vehicleLabel }, { text: facts.get(p.vehicleId)?.type }, dept(p),
        p.nextDue ? dueCell(p.nextDue, today) : { text: null },
      ]),
    }],
    grandTitle: 'סה״כ רכבים שלא נבדקו',
    note: 'רכבים שאין להם אף בדיקת קצין בטיחות.',
    emptyText: 'כל הרכבים כבר עברו בדיקת קצין בטיחות',
  });
}

// סוג הרכב והמחלקה של כל רכב
async function loadVehicleFacts(companyId: string): Promise<VehicleFacts> {
  const [vehicles, departments] = await Promise.all([listVehicles(companyId), listDepartments(companyId)]);
  const names = new Map(departments.map((d) => [d.id, d.name]));
  return new Map(vehicles.map((v) => [v.id, {
    type: VEHICLE_TYPE_LABELS[v.vehicle_type] ?? v.vehicle_type,
    department: v.department_id ? names.get(v.department_id) ?? null : null,
  }]));
}

// מפיק ומוריד את הדוח
export async function exportInspectionsReport(company: Company, category: InspectionReportCategory): Promise<void> {
  const needsList = category === 'insp_quarter' || category === 'insp_awaiting' || category === 'insp_defects';
  const needsPlan = category === 'insp_defects' || category === 'insp_due' || category === 'insp_never';
  const needsFacts = category === 'insp_due' || category === 'insp_never';
  const [inspections, plan, facts] = await Promise.all([
    needsList ? listInspections(company.id) : Promise.resolve([]),
    needsPlan ? loadInspectionPlan(company.id) : Promise.resolve([]),
    needsFacts ? loadVehicleFacts(company.id) : Promise.resolve<VehicleFacts>(new Map()),
  ]);
  const today = todayIso();
  const picked = selectInspectionReport(category, { inspections, plan }, today);
  await printOrShareReport(buildHtml(company, category, picked, today, facts), TITLES[category]);
}
