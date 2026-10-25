// סידור עבודה: הכללים (חפיפות, רכב תקין, נהג זמין, שעות מנוחה, זמן הגעה, חגים)
/**
 * Everything the "סידור עבודה" screen decides, with no screen and no
 * network: the screen loads a ScheduleData and asks these functions which
 * vehicle is free, why a driver cannot drive, and what is open on a day.
 *
 * Dates are 'YYYY-MM-DD' strings and hours 'HH:MM' strings, compared as
 * text. A trip of several days runs from `date` to `end`; its middle days
 * are taken all day ('00:00'–'24:00').
 */
import type { VehicleStatus, VehicleType } from './adminApi/types';
import { t } from './i18n';

export type TripStatus = 'active' | 'cancelled';

export interface Trip {
  id: string;
  date: string;
  /** Last day of a trip of several days; null for one day. */
  end: string | null;
  from: string;
  to: string;
  title: string;
  client: string;
  /** The client's phone; optional. */
  phone: string;
  pickup: string;
  dest: string;
  vehicleId: string | null;
  driverId: string | null;
  seriesId: string | null;
  status: TripStatus;
}

/**
 * A recurring trip with no last day ("until I cancel"). Its trips are made
 * ahead, a few months at a time, up to `generatedUntil`; `until` is set when
 * it is cancelled.
 */
export interface Series {
  id: string;
  repeat: 'daily' | 'weekly';
  start: string;
  until: string | null;
  generatedUntil: string;
  from: string;
  to: string;
  title: string;
  client: string;
  phone: string;
  pickup: string;
  dest: string;
  vehicleId: string | null;
  driverId: string | null;
}

export interface VehicleDoc {
  label: string;
  until: string;
  /** Comprehensive insurance is not required by law: it only warns. */
  warnOnly: boolean;
}

export interface ScheduleVehicle {
  id: string;
  plate: string;
  type: VehicleType;
  status: VehicleStatus;
  driverId: string | null;
  docs: VehicleDoc[];
}

export interface ScheduleDriver {
  id: string;
  name: string;
  licenseExpiry: string | null;
  classes: string[];
}

export interface Block {
  /** Free text: what is being fixed, the cost, and so on. */
  details?: string;
  id: string;
  ownerType: 'vehicle' | 'driver';
  ownerId: string;
  from: string;
  to: string;
  reason: string;
}

export interface Client {
  id: string;
  name: string;
}

export interface SavedTrip {
  id: string;
  name: string;
  title: string;
  client: string;
  from: string;
  to: string;
  pickup: string;
  dest: string;
}

export interface ScheduleData {
  vehicles: ScheduleVehicle[];
  drivers: ScheduleDriver[];
  trips: Trip[];
  blocks: Block[];
  clients: Client[];
  saved: SavedTrip[];
  series: Series[];
}

/* ---------------- dates ---------------- */

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
export const addDays = (k: string, n: number) => {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
export const diffDays = (a: string, b: string) => Math.round((fromKey(a).getTime() - fromKey(b).getTime()) / 864e5);
export const weekStart = (k: string) => addDays(k, -fromKey(k).getDay());
export const weekday = (k: string) => fromKey(k).getDay();
export const todayKey = () => dayKey(new Date());
export const daysOf = (a: string, b: string) => {
  const out: string[] = [];
  for (let k = a; k <= b && out.length < 400; k = addDays(k, 1)) out.push(k);
  return out;
};
const overlap = (a: string, b: string, c: string, d: string) => a < d && c < b;
export const hhmm = (time: string | null | undefined) => (time ?? '').slice(0, 5);
export const mins = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
const isolate = (s: string) => `⁦${s}⁩`;
export const timeRange = (a: string, b: string) => isolate(`${a}–${b}`);
export const shortDate = (k: string) => {
  const d = fromKey(k);
  return `${d.getDate()}.${d.getMonth() + 1}`;
};
export const monthName = (m: number) => t(`date.months.${m + 1}`);
export const dayName = (k: string) => t(`schedule.weekday.${weekday(k)}`);
/** "יום ג׳, 20 באוקטובר" */
export const niceDate = (k: string) => {
  const d = fromKey(k);
  return t('schedule.niceDate', { day: dayName(k), date: d.getDate(), month: monthName(d.getMonth()) });
};
/** Duration in words: "40 דקות", "6:30 שעות". */
export const duration = (m: number) =>
  m < 60 ? t('schedule.minutes', { n: m }) : t('schedule.hours', { n: `${Math.floor(m / 60)}${m % 60 ? ':' + pad(m % 60) : ''}` });
/** Picks the "one" or the "many" wording of a count. */
export const count = (n: number, key: string) => t(`${key}${n === 1 ? 'One' : 'Many'}`, { n });

/* ---------------- Hebrew calendar and holidays ---------------- */

let hebrewParts: Intl.DateTimeFormat | null = null;
let hebrewLabel: Intl.DateTimeFormat | null = null;
const hebrewCache = new Map<string, { day: number; month: string }>();
// היום והחודש העבריים של תאריך (מהדפדפן, בלי ספרייה)
export function hebrewDate(k: string): { day: number; month: string } | null {
  const hit = hebrewCache.get(k);
  if (hit) return hit;
  try {
    hebrewParts ??= new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long' });
    const parts = hebrewParts.formatToParts(fromKey(k));
    const value = { day: Number(parts.find((p) => p.type === 'day')?.value), month: parts.find((p) => p.type === 'month')?.value ?? '' };
    hebrewCache.set(k, value);
    return value;
  } catch {
    return null;
  }
}

// גימטריה: 9 → ט׳, 15 → ט״ו
export function gematria(n: number): string {
  if (n === 15) return 'ט״ו';
  if (n === 16) return 'ט״ז';
  const s = ['', 'י', 'כ', 'ל'][Math.floor(n / 10)] + ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'][n % 10];
  return s.length > 1 ? `${s.slice(0, -1)}״${s.slice(-1)}` : `${s}׳`;
}

// התאריך העברי לתצוגה: "ט׳ בחשוון" (ובחודש הראשון רק שם החודש)
export function hebrewDayLabel(k: string): { day: string; month: string; first: boolean } {
  try {
    hebrewLabel ??= new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long' });
    const parts = hebrewLabel.formatToParts(fromKey(k));
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    return { day: gematria(day), month: parts.find((p) => p.type === 'month')?.value ?? '', first: day === 1 };
  } catch {
    return { day: '', month: '', first: false };
  }
}

export interface Holiday {
  name: string;
  /** No work on this day. */
  off?: boolean;
  /** Eve of a holiday: a short day. */
  eve?: boolean;
}

const HOLIDAYS: Record<string, Record<number, [string, 'off' | 'eve' | null]>> = {
  Elul: { 29: ['roshHashanaEve', 'eve'] },
  Tishri: {
    1: ['roshHashana', 'off'], 2: ['roshHashana', 'off'], 9: ['yomKippurEve', 'eve'], 10: ['yomKippur', 'off'],
    14: ['sukkotEve', 'eve'], 15: ['sukkot', 'off'], 16: ['cholHamoed', null], 17: ['cholHamoed', null], 18: ['cholHamoed', null],
    19: ['cholHamoed', null], 20: ['cholHamoed', null], 21: ['hoshanaRaba', 'eve'], 22: ['simchatTorah', 'off'],
  },
  Nisan: {
    14: ['pesachEve', 'eve'], 15: ['pesach', 'off'], 16: ['cholHamoed', null], 17: ['cholHamoed', null], 18: ['cholHamoed', null],
    19: ['cholHamoed', null], 20: ['pesachSeventhEve', 'eve'], 21: ['pesachSeventh', 'off'],
  },
  Sivan: { 5: ['shavuotEve', 'eve'], 6: ['shavuot', 'off'] },
  Adar: { 14: ['purim', null] },
  'Adar II': { 14: ['purim', null] },
};

// יום העצמאות: ה׳ באייר, ומוקדם/נדחה כשהוא נופל על שישי, שבת או שני
function independenceDay(k: string, h: { day: number; month: string }): boolean {
  if (h.month !== 'Iyar' || h.day < 3 || h.day > 6) return false;
  const wd = weekday(k);
  if (h.day === 5) return wd !== 5 && wd !== 6 && wd !== 1;
  if (h.day === 4) return wd === 4 && hebrewDate(addDays(k, 1))?.day === 5; // 5 Iyar on Friday
  if (h.day === 3) return wd === 4 && hebrewDate(addDays(k, 2))?.day === 5; // 5 Iyar on Saturday
  return wd === 2 && hebrewDate(addDays(k, -1))?.day === 5; // 5 Iyar on Monday
}

const holidayCache = new Map<string, Holiday | null>();
// חג או ערב חג ביום הזה
export function holidayOf(k: string): Holiday | null {
  if (holidayCache.has(k)) return holidayCache.get(k) ?? null;
  const h = hebrewDate(k);
  let out: Holiday | null = null;
  if (h) {
    const hit = HOLIDAYS[h.month]?.[h.day];
    if (hit) out = { name: t(`schedule.holiday.${hit[0]}`), off: hit[1] === 'off', eve: hit[1] === 'eve' };
    else if (independenceDay(k, h)) out = { name: t('schedule.holiday.independence'), off: true };
    else if (independenceDay(addDays(k, 1), hebrewDate(addDays(k, 1)) ?? h)) out = { name: t('schedule.holiday.memorial'), eve: true };
    // חנוכה: שמונה ימים מכ״ה בכסלו
    else if ([0, 1, 2, 3, 4, 5, 6, 7].some((i) => {
      const x = hebrewDate(addDays(k, -i));
      return x?.month === 'Kislev' && x.day === 25;
    })) out = { name: t('schedule.holiday.chanukah') };
  }
  holidayCache.set(k, out);
  return out;
}

/** Saturday or a holiday with no work. */
export const isOff = (k: string) => weekday(k) === 6 || !!holidayOf(k)?.off;

// יום העבודה הבא (מחר, ואם מחר שבת או חג – היום שאחריו)
export function nextWorkDay(from = todayKey()): string {
  let k = addDays(from, 1);
  while (isOff(k)) k = addDays(k, 1);
  return k;
}

/* ---------------- travel time ---------------- */

// ponytail: a small table of central cities and straight-line distance; real travel time would come from a maps service.
export const CITIES: Record<string, [number, number]> = {
  'תל אביב': [32.08, 34.78], 'רמלה': [31.93, 34.87], 'לוד': [31.95, 34.89], 'נתב״ג': [32.0, 34.87], 'אשדוד': [31.8, 34.65],
  'אשקלון': [31.67, 34.57], 'חיפה': [32.79, 34.99], 'ירושלים': [31.77, 35.21], 'באר שבע': [31.25, 34.79], 'אילת': [29.56, 34.95],
  'נתניה': [32.32, 34.86], 'פתח תקווה': [32.09, 34.88], 'ראשון לציון': [31.97, 34.8], 'רחובות': [31.89, 34.81], 'מודיעין': [31.9, 35.01],
  'חולון': [32.01, 34.78], 'בת ים': [32.02, 34.75], 'רמת גן': [32.07, 34.82], 'הרצליה': [32.16, 34.84], 'כפר סבא': [32.18, 34.91],
  'רעננה': [32.18, 34.87], 'חדרה': [32.43, 34.92], 'עפולה': [32.61, 35.29], 'נצרת': [32.7, 35.3], 'טבריה': [32.79, 35.53],
  'צפת': [32.96, 35.5], 'קריית שמונה': [33.21, 35.57], 'עכו': [32.93, 35.08], 'נהריה': [33.01, 35.1], 'כרמיאל': [32.92, 35.3],
  'בית שמש': [31.75, 34.99], 'קריית גת': [31.61, 34.76], 'דימונה': [31.07, 35.03], 'ים המלח': [31.2, 35.36],
};
const norm = (s: string | null | undefined) => String(s ?? '').trim().replace(/\s+/g, ' ');

// זמן נסיעה משוער בין שתי ערים, בדקות (0 כשלא יודעים)
export function travelMinutes(a: string, b: string): number {
  const p = CITIES[norm(a)];
  const q = CITIES[norm(b)];
  if (!p || !q || p === q) return 0;
  return Math.round((Math.hypot((p[0] - q[0]) * 111, (p[1] - q[1]) * 94) * 1.3) / 80 * 60) + 10;
}

/* ---------------- rules ---------------- */

// ponytail: placeholder limits until the safety officer confirms the exact numbers.
export const MAX_DAY_MINUTES = 12 * 60;
export const MIN_REST_MINUTES = 7 * 60;

/** License class each vehicle type needs, and which classes cover which. */
// 'minibus' is the stored key of "מסחרי" (a van up to 3.5 t, class B); the passenger minibus is 'passenger_minibus'.
const NEED: Partial<Record<VehicleType, string>> = {
  car: 'B', dual_use: 'B', minibus: 'B', passenger_minibus: 'D1', truck: 'C1', tractor_truck: 'C+E', bus: 'D',
};
const COVERS: Record<string, string[]> = {
  B: ['B'], C1: ['C1', 'B'], C: ['C', 'C1', 'B'], 'C+E': ['C+E', 'C', 'C1', 'B'],
  D1: ['D1', 'B'], D2: ['D2', 'D1', 'B'], D3: ['D3', 'D2', 'D1', 'B'], D: ['D', 'D3', 'D2', 'D1', 'B'],
};

export const lastDay = (trip: Pick<Trip, 'date' | 'end'>) => trip.end || trip.date;
export const onDay = (trip: Pick<Trip, 'date' | 'end'>, k: string) => trip.date <= k && k <= lastDay(trip);
/** The hours a trip takes on one of its days. */
export const span = (trip: Pick<Trip, 'date' | 'end' | 'from' | 'to'>, k: string): [string, string] => [
  k === trip.date ? trip.from : '00:00',
  k === lastDay(trip) ? trip.to : '24:00',
];
export const byStart = (k: string) => (a: Trip, b: Trip) => (span(a, k)[0] < span(b, k)[0] ? -1 : 1);
export const route = (trip: Pick<Trip, 'pickup' | 'dest'>) => [trip.pickup, trip.dest].filter(Boolean).join(' ← ');
export const tripTime = (trip: Trip, k: string) => {
  if (!trip.end) return timeRange(trip.from, trip.to);
  if (k === trip.date) return t('schedule.leaves', { time: isolate(trip.from) });
  if (k === trip.end) return t('schedule.returns', { time: isolate(trip.to) });
  return t('schedule.allDay');
};
/** "יום 2 מתוך 3" on a trip of several days. */
export const tripDayOf = (trip: Trip, k: string) =>
  trip.end ? t('schedule.dayOf', { day: diffDays(k, trip.date) + 1, total: diffDays(trip.end, trip.date) + 1 }) : '';

export function createRules(data: ScheduleData) {
  const vehicleById = new Map(data.vehicles.map((v) => [v.id, v]));
  const driverById = new Map(data.drivers.map((d) => [d.id, d]));
  const active = data.trips.filter((x) => x.status === 'active');

  const vehicle = (id: string | null | undefined) => (id ? vehicleById.get(id) ?? null : null);
  const driver = (id: string | null | undefined) => (id ? driverById.get(id) ?? null : null);
  const driverName = (id: string | null | undefined) => driver(id)?.name ?? '';
  const vehicleLabel = (v: ScheduleVehicle | null) => (v ? `${t(`vehicle.type.${v.type}`)} ${v.plate}` : '');
  const dayTrips = (k: string) => data.trips.filter((x) => onDay(x, k));

  const garageOf = (vehicleId: string, k: string) =>
    data.blocks.find((b) => b.ownerType === 'vehicle' && b.ownerId === vehicleId && b.from <= k && k <= b.to) ?? null;
  const awayOf = (driverId: string | null, k: string) =>
    driverId ? data.blocks.find((b) => b.ownerType === 'driver' && b.ownerId === driverId && b.from <= k && k <= b.to) ?? null : null;

  // רכב שאסור לשבץ ביום הזה: בטיפול/מושבת בכרטיס, או תוקף שפג
  const vehicleBlocked = (v: ScheduleVehicle, k: string): string | null => {
    if (v.status === 'maintenance' || v.status === 'disabled') return t(`schedule.vehicleStatus.${v.status}`);
    const doc = v.docs.find((d) => !d.warnOnly && k > d.until);
    return doc ? t('schedule.docExpired', { doc: doc.label, date: shortDate(doc.until) }) : null;
  };
  // אזהרה בלבד: תוקף שנגמר בשבועיים הקרובים, או ביטוח מקיף שפג
  const vehicleSoon = (v: ScheduleVehicle, k: string): string | null => {
    const doc = v.docs
      .filter((d) => (d.until >= k && diffDays(d.until, k) <= 14) || (d.warnOnly && k > d.until))
      .sort((a, b) => (a.until < b.until ? -1 : 1))[0];
    if (!doc) return null;
    return t(k > doc.until ? 'schedule.docExpired' : 'schedule.docUntil', { doc: doc.label, date: shortDate(doc.until) });
  };
  // נהג בלי דרגת הרישיון שהרכב צריך (בלי דרגות רשומות – לא בודקים)
  const noLicense = (driverId: string | null, v: ScheduleVehicle | null): string | null => {
    const d = driver(driverId);
    if (!d || !v || !d.classes.length) return null;
    const need = NEED[v.type];
    if (!need) return null; // types with no licence class mapped (equipment etc.) are not checked
    return d.classes.some((c) => (COVERS[c] ?? [c]).includes(need))
      ? null
      : t('schedule.noLicenseFor', { type: t(`vehicle.type.${v.type}`), need });
  };
  // נהג שלא יכול לנהוג ביום הזה
  const driverBlocked = (driverId: string | null, k: string): string | null => {
    if (!driverId) return null;
    const away = awayOf(driverId, k);
    if (away) return t('schedule.awayUntil', { reason: away.reason, date: shortDate(away.to) });
    const d = driver(driverId);
    if (d?.licenseExpiry && k > d.licenseExpiry) return t('schedule.licenseExpired', { date: shortDate(d.licenseExpiry) });
    return null;
  };
  const driverBusy = (driverId: string | null, k: string, from: string, to: string, ignore: string | null) =>
    driverId ? active.find((x) => x.id !== ignore && x.driverId === driverId && onDay(x, k) && overlap(from, to, ...span(x, k))) ?? null : null;
  const vehicleBusy = (vehicleId: string, k: string, from: string, to: string, ignore: string | null): string | null => {
    const v = vehicle(vehicleId);
    if (!v) return t('schedule.vehicleMissing');
    if (garageOf(vehicleId, k)) return t('schedule.inGarage');
    const bad = vehicleBlocked(v, k);
    if (bad) return bad;
    const hit = active.find((x) => x.id !== ignore && x.vehicleId === vehicleId && onDay(x, k) && from && to && overlap(from, to, ...span(x, k)));
    return hit ? (hit.end ? t('schedule.onLongTrip') : t('schedule.busyAt', { time: timeRange(hit.from, hit.to) })) : null;
  };

  // אותן בדיקות על כל ימי הטווח; מחזיר את הסיבה הראשונה ובאיזה יום
  const onRange = (a: string, b: string, fn: (k: string) => string | null) => {
    for (const k of daysOf(a, b)) {
      const r = fn(k);
      if (r) return k === a ? r : t('schedule.onDate', { reason: r, date: shortDate(k) });
    }
    return null;
  };
  // רכב שכבר יוצא לנסיעה אחרת באותן שעות (רק חפיפה, בלי תוקף ומוסך)
  const vehicleClash = (vehicleId: string, k: string, from: string, to: string, ignore: string | null) =>
    active.some((x) => x.id !== ignore && x.vehicleId === vehicleId && onDay(x, k) && from && to && overlap(from, to, ...span(x, k)));
  const vehicleBusyRange = (vehicleId: string, a: string, b: string, from: string, to: string, ignore: string | null) =>
    onRange(a, b, (k) => vehicleBusy(vehicleId, k, k === a ? from : '00:00', k === b ? to : '24:00', ignore));
  const driverBlockedRange = (driverId: string | null, a: string, b: string) => onRange(a, b, (k) => driverBlocked(driverId, k));
  const driverBusyRange = (driverId: string | null, a: string, b: string, from: string, to: string, ignore: string | null) => {
    for (const k of daysOf(a, b)) {
      const hit = driverBusy(driverId, k, k === a ? from : '00:00', k === b ? to : '24:00', ignore);
      if (hit) return hit;
    }
    return null;
  };

  /* שעות נהיגה, מנוחה וזמן הגעה (נסיעות של יום אחד; בנסיעה של כמה ימים הלינה היא המנוחה) */
  const driverDay = (driverId: string, k: string, ignore: string | null, extra?: Trip) => {
    const list = active.filter((x) => x.id !== ignore && x.driverId === driverId && !x.end && x.date === k);
    if (extra && extra.date === k) list.push(extra);
    return list.sort((x, y) => (x.from < y.from ? -1 : 1));
  };
  const hoursIssue = (driverId: string | null, k: string, ignore: string | null = null, extra?: Trip): string | null => {
    if (!driverId) return null;
    const list = driverDay(driverId, k, ignore, extra);
    if (!list.length) return null;
    const total = list.reduce((sum, x) => sum + mins(x.to) - mins(x.from), 0);
    if (total > MAX_DAY_MINUTES) return t('schedule.tooManyHours', { hours: duration(total), max: MAX_DAY_MINUTES / 60 });
    const prev = driverDay(driverId, addDays(k, -1), ignore, extra).pop();
    if (prev) {
      const rest = 24 * 60 - mins(prev.to) + mins(list[0].from);
      if (rest < MIN_REST_MINUTES) {
        return t('schedule.shortRest', {
          rest: duration(rest), end: isolate(prev.to), endDate: shortDate(prev.date), start: isolate(list[0].from), startDate: shortDate(k), min: MIN_REST_MINUTES / 60,
        });
      }
    }
    return null;
  };
  // נסיעה שמתחילה רחוק מהמקום שבו הקודמת נגמרה, בלי מספיק זמן להגיע
  const gaps = (list: Trip[]) => {
    const out: { prev: Trip; next: Trip; text: string }[] = [];
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const next = list[i];
      const need = travelMinutes(prev.dest, next.pickup);
      const gap = mins(next.from) - mins(prev.to);
      if (need && gap >= 0 && need > gap) {
        out.push({ prev, next, text: t('schedule.gap', { end: isolate(prev.to), dest: prev.dest, start: isolate(next.from), pickup: next.pickup, need: duration(need) }) });
      }
    }
    return out;
  };

  /* מה פתוח ביום: חפיפות, רכב לא תקין, נהג לא זמין, שעות מנוחה, זמן הגעה */
  const issues = (k: string): { tripId: string; text: string }[] => {
    const list = active.filter((x) => x.vehicleId && onDay(x, k)).sort(byStart(k));
    const out: { tripId: string; text: string }[] = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const x = list[i];
        const y = list[j];
        if (!overlap(...span(x, k), ...span(y, k))) continue;
        const times = { a: isolate(span(x, k)[0]), b: isolate(span(y, k)[0]) };
        if (x.vehicleId === y.vehicleId) out.push({ tripId: y.id, text: t('schedule.issue.vehicleTwice', { plate: vehicle(x.vehicleId)?.plate ?? '', ...times }) });
        else if (x.driverId && x.driverId === y.driverId) out.push({ tripId: y.id, text: t('schedule.issue.driverTwice', { name: driverName(x.driverId), ...times }) });
      }
    }
    const single = list.filter((x) => !x.end);
    const seen = new Set<string>();
    [...new Set(single.map((x) => x.driverId).filter(Boolean) as string[])].forEach((id) => {
      const h = hoursIssue(id, k);
      if (h) out.push({ tripId: single.find((x) => x.driverId === id)!.id, text: `${driverName(id)} – ${h}` });
      gaps(single.filter((x) => x.driverId === id)).forEach((g) => {
        seen.add(`${g.prev.id}-${g.next.id}`);
        out.push({ tripId: g.next.id, text: `${driverName(id)} – ${g.text}` });
      });
    });
    [...new Set(single.map((x) => x.vehicleId as string))].forEach((id) =>
      gaps(single.filter((x) => x.vehicleId === id)).forEach((g) => {
        if (!seen.has(`${g.prev.id}-${g.next.id}`)) out.push({ tripId: g.next.id, text: `${vehicle(id)?.plate ?? ''} – ${g.text}` });
      })
    );
    list.forEach((x) => {
      const v = vehicle(x.vehicleId);
      if (!v) return;
      const at = isolate(span(x, k)[0]);
      const garage = garageOf(v.id, k);
      if (garage) out.push({ tripId: x.id, text: t('schedule.issue.garage', { vehicle: vehicleLabel(v), reason: garage.reason, time: at }) });
      const bad = vehicleBlocked(v, k);
      if (bad) out.push({ tripId: x.id, text: t('schedule.issue.vehicleBad', { vehicle: vehicleLabel(v), reason: bad, time: at }) });
      const blocked = driverBlocked(x.driverId, k);
      if (blocked) out.push({ tripId: x.id, text: t('schedule.issue.driverBlocked', { name: driverName(x.driverId), reason: blocked, time: at }) });
      const license = noLicense(x.driverId, v);
      if (license) out.push({ tripId: x.id, text: t('schedule.issue.driverLicense', { name: driverName(x.driverId), reason: license, vehicle: vehicleLabel(v), time: at }) });
    });
    return out;
  };

  return {
    vehicle, driver, driverName, vehicleLabel, dayTrips, garageOf, awayOf,
    vehicleBlocked, vehicleSoon, noLicense, driverBlocked, driverBusy, vehicleBusy, vehicleClash,
    vehicleBusyRange, driverBlockedRange, driverBusyRange, driverDay, hoursIssue, gaps, issues,
  };
}

export type Rules = ReturnType<typeof createRules>;

/* ---------------- recurring trips ---------------- */

export type Repeat = 'once' | 'daily' | 'weekly' | 'multi';

// תאריכים של נסיעה קבועה: בלי שבתות וחגים; "כל יום" גם בלי שישי
export function repeatDates(repeat: Repeat, start: string, until: string): string[] {
  if (repeat !== 'daily' && repeat !== 'weekly') return [start];
  if (!start || !until || until < start) return [];
  return daysOf(start, until).filter((d) => !isOff(d) && (repeat === 'daily' ? weekday(d) !== 5 : diffDays(d, start) % 7 === 0));
}
