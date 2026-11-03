// רשימות הבדיקה המוכנות לפי סוג רכב
/**
 * "בדיקת קצין בטיחות" has its own list of items for each kind of vehicle:
 * a forklift is not checked like a bus. Every vehicle type (supabase/sql/118)
 * belongs to one kind; a company can replace any kind's ready-made list with
 * its own (vehicle_inspection_settings.forms, supabase/sql/136).
 *
 * Shared as is by the app (lib/inspections.ts) and the vehicle-inspection
 * function, so it imports nothing.
 */

export type ReadyInspectionForm = {
  version: 1;
  groups: Array<{ id: string; title: string; items: Array<{ id: string; text: string }> }>;
};

export const INSPECTION_KINDS = ['car', 'bus', 'truck', 'trailer', 'forklift', 'equipment', 'small'] as const;
export type InspectionKind = (typeof INSPECTION_KINDS)[number];

// לאיזו רשימה שייך כל סוג רכב
const KIND_OF_TYPE: Record<string, InspectionKind> = {
  car: 'car', dual_use: 'car', taxi: 'car', minibus: 'car',
  passenger_minibus: 'bus', microbus: 'bus', small_bus: 'bus', bus: 'bus', touring_bus: 'bus',
  truck: 'truck', tractor_truck: 'truck', tanker: 'truck',
  trailer: 'trailer',
  forklift: 'forklift', pedestrian_forklift: 'forklift',
  tractor: 'equipment', engineering: 'equipment', operational: 'equipment',
  motorcycle: 'small', atv: 'small', golf_cart: 'small',
};

// סוג הרשימה של רכב; סוג לא מוכר מקבל את רשימת הרכב הפרטי
export function inspectionKindOf(vehicleType: string | null | undefined): InspectionKind {
  return KIND_OF_TYPE[vehicleType ?? ''] ?? 'car';
}

// סוגי הרכב בכל רשימה
export function vehicleTypesOfKind(kind: InspectionKind): string[] {
  return Object.keys(KIND_OF_TYPE).filter((type) => KIND_OF_TYPE[type] === kind);
}

// קבוצה ברשימה
const group = (id: string, title: string, items: Array<[string, string]>) => ({
  id,
  title,
  items: items.map(([itemId, text]) => ({ id: itemId, text })),
});

// ציוד חובה, משותף לכל הרכבים על הכביש
const roadKit = (extra: Array<[string, string]> = []) =>
  group('kit', 'ציוד חובה ומסמכים', [
    ['kit-fire', 'מטפי כיבוי'],
    ['kit-aid', 'ערכת עזרה ראשונה'],
    ['kit-triangle', 'משולש אזהרה ואפוד זוהר'],
    ...extra,
    ['kit-papers', 'רישיון רכב וביטוח ברכב'],
  ]);

// הרשימות המוכנות, לפי סדר ההליכה סביב הרכב
export const READY_INSPECTION_FORMS: Record<InspectionKind, ReadyInspectionForm> = {
  car: { version: 1, groups: [
    group('outside', 'מבחוץ', [
      ['out-glass', 'שמשות, מגבים ומתזים'],
      ['out-mirrors', 'מראות'],
      ['out-doors', 'דלתות ונעילה'],
      ['out-body', 'פחחות: פגיעות ושריטות'],
    ]),
    group('wheels', 'גלגלים ובלימה', [
      ['whl-tyres', 'מצב הצמיגים ולחץ האוויר'],
      ['whl-nuts', 'הידוק ברגי הגלגלים'],
      ['whl-brakes', 'בלמים ובלם יד'],
      ['whl-spare', 'גלגל חלופי, מגבה ומפתח'],
    ]),
    group('under', 'מתחת למכסה', [
      ['und-leaks', 'נזילות: שמן, דלק, מים'],
      ['und-fluids', 'מפלסי שמן, מים ונוזל בלמים'],
      ['und-battery', 'מצבר'],
    ]),
    group('lights', 'תאורה ולוח שעונים', [
      ['lgt-lamps', 'פנסים ואיתות'],
      ['lgt-warn', 'נורות אזהרה בלוח'],
      ['lgt-horn', 'צופר'],
    ]),
    group('cabin', 'תא הנהג', [
      ['cab-clean', 'ניקיון כללי'],
      ['cab-seats', 'מושבים וחגורות'],
      ['cab-ac', 'מיזוג'],
    ]),
    roadKit(),
  ] },

  bus: { version: 1, groups: [
    group('outside', 'מבחוץ', [
      ['out-glass', 'שמשות, מגבים ומתזים'],
      ['out-mirrors', 'מראות'],
      ['out-doors', 'דלתות ונעילה'],
      ['out-body', 'פחחות: פגיעות ושריטות'],
      ['out-signs', 'שילוט על דפנות הרכב'],
    ]),
    group('wheels', 'גלגלים ובלימה', [
      ['whl-tyres', 'מצב הצמיגים ולחץ האוויר'],
      ['whl-nuts', 'הידוק ברגי הגלגלים'],
      ['whl-brakes', 'בלמים ובלם עזר'],
      ['whl-spare', 'גלגל חלופי, מגבה ומפתח'],
    ]),
    group('under', 'מתחת למכסה ומתחת לרכב', [
      ['und-leaks', 'נזילות: שמן, סולר, מים'],
      ['und-air', 'דליפות אוויר'],
      ['und-steer', 'היגוי'],
      ['und-exhaust', 'מערכת פליטה'],
      ['und-battery', 'מצברים וכבלים'],
    ]),
    group('lights', 'תאורה ולוח שעונים', [
      ['lgt-lamps', 'פנסים ואיתות'],
      ['lgt-inside', 'תאורת פנים'],
      ['lgt-warn', 'נורות אזהרה בלוח'],
      ['lgt-tacho', 'מד מהירות וטכוגרף'],
      ['lgt-horn', 'צופר וזמזם רוורס'],
      ['lgt-ac', 'מיזוג'],
    ]),
    group('cabin', 'תא הנוסעים', [
      ['cab-clean', 'ניקיון כללי'],
      ['cab-seats', 'מושבים וחגורות'],
      ['cab-exits', 'פטישי חילוץ ויציאות חירום'],
      ['cab-audio', 'רמקולים ומיקרופון'],
    ]),
    roadKit(),
  ] },

  truck: { version: 1, groups: [
    group('outside', 'מבחוץ', [
      ['out-glass', 'שמשות, מגבים ומתזים'],
      ['out-mirrors', 'מראות, כולל מראות שטח מת'],
      ['out-doors', 'דלתות ומדרגות עלייה'],
      ['out-body', 'פחחות, ארגז ודפנות'],
      ['out-guard', 'מגן תת־רכב ומגני צד'],
      ['out-marks', 'פסים זוהרים ושלט אורך'],
    ]),
    group('wheels', 'גלגלים ובלימה', [
      ['whl-tyres', 'מצב הצמיגים ולחץ האוויר'],
      ['whl-nuts', 'הידוק ברגי הגלגלים'],
      ['whl-brakes', 'בלמים ובלם עזר'],
      ['whl-spare', 'גלגל חלופי, מגבה ומפתח'],
    ]),
    group('under', 'מתחת למכסה ומתחת לרכב', [
      ['und-leaks', 'נזילות: שמן, סולר, מים'],
      ['und-air', 'דליפות אוויר'],
      ['und-steer', 'היגוי'],
      ['und-exhaust', 'מערכת פליטה'],
      ['und-battery', 'מצברים וכבלים'],
    ]),
    group('load', 'מטען וגרירה', [
      ['ld-tie', 'קשירת מטען: רצועות ושרשראות'],
      ['ld-tail', 'דופן אחורית ומשטח הרמה'],
      ['ld-fifth', 'פלטה, וו גרירה וחיבורי נגרר'],
      ['ld-danger', 'שילוט חומרים מסוכנים, אם נדרש'],
    ]),
    group('lights', 'תאורה ולוח שעונים', [
      ['lgt-lamps', 'פנסים, איתות ופנסי צד'],
      ['lgt-warn', 'נורות אזהרה בלוח'],
      ['lgt-tacho', 'מד מהירות וטכוגרף'],
      ['lgt-horn', 'צופר וזמזם רוורס'],
    ]),
    roadKit([['kit-wedge', 'סדי עצירה לגלגלים']]),
  ] },

  trailer: { version: 1, groups: [
    group('hitch', 'חיבור לרכב הגורר', [
      ['hit-coupler', 'וו גרירה או קינג פין ונעילה'],
      ['hit-chain', 'שרשרת או כבל ביטחון'],
      ['hit-plug', 'שקע חשמל וכבל'],
      ['hit-air', 'צינורות אוויר ומחברים'],
      ['hit-legs', 'רגלי תמיכה וגלגל תמיכה'],
    ]),
    group('wheels', 'גלגלים ובלימה', [
      ['whl-tyres', 'מצב הצמיגים ולחץ האוויר'],
      ['whl-nuts', 'הידוק ברגי הגלגלים'],
      ['whl-brakes', 'בלמים ובלם חניה'],
      ['whl-spare', 'גלגל חלופי'],
    ]),
    group('body', 'מרכב ומטען', [
      ['bdy-frame', 'שלדה ומרכב'],
      ['bdy-sides', 'דפנות, דלתות ונעילות'],
      ['bdy-tie', 'נקודות קשירה ורצועות'],
      ['bdy-guard', 'מגן תת־רכב ומגני צד'],
      ['bdy-marks', 'פסים זוהרים ומחזירי אור'],
    ]),
    group('lights', 'תאורה', [
      ['lgt-lamps', 'פנסים אחוריים, בלם ואיתות'],
      ['lgt-side', 'פנסי צד ותאורת לוחית'],
    ]),
    group('kit', 'מסמכים', [
      ['kit-plate', 'לוחית רישוי'],
      ['kit-papers', 'רישיון וביטוח הנגרר'],
    ]),
  ] },

  forklift: { version: 1, groups: [
    group('mast', 'תורן ומזלגות', [
      ['mst-forks', 'מזלגות: סדקים, כיפוף ושחיקה'],
      ['mst-chains', 'שרשראות הרמה ושימון'],
      ['mst-mast', 'תורן וגלגלות'],
      ['mst-hyd', 'צינורות הידראוליים ונזילות'],
      ['mst-plate', 'שלט עומס מרבי'],
    ]),
    group('wheels', 'גלגלים ובלימה', [
      ['whl-tyres', 'צמיגים'],
      ['whl-brakes', 'בלם רגל ובלם חניה'],
      ['whl-steer', 'היגוי'],
    ]),
    group('power', 'מנוע ואנרגיה', [
      ['pwr-leaks', 'נזילות: שמן, דלק, מים'],
      ['pwr-battery', 'מצבר, כבלים ומטען'],
      ['pwr-gas', 'בלון גז וחיבורים, אם יש'],
    ]),
    group('safety', 'בטיחות המפעיל', [
      ['saf-belt', 'חגורת בטיחות'],
      ['saf-roof', 'גגון מגן'],
      ['saf-horn', 'צופר וזמזם רוורס'],
      ['saf-lights', 'פנסים ומהבהב'],
      ['saf-controls', 'ידיות הפעלה ומתג חירום'],
    ]),
    group('kit', 'ציוד ומסמכים', [
      ['kit-fire', 'מטף כיבוי'],
      ['kit-test', 'תסקיר בודק מוסמך בתוקף'],
    ]),
  ] },

  equipment: { version: 1, groups: [
    group('outside', 'מבחוץ', [
      ['out-glass', 'שמשות, מגבים ומראות'],
      ['out-body', 'מרכב ושלדה'],
      ['out-steps', 'מדרגות ומאחזי יד'],
    ]),
    group('work', 'כלי העבודה', [
      ['wrk-arm', 'זרוע, כף או כלי עבודה'],
      ['wrk-pins', 'פינים ומפרקים: שחיקה ושימון'],
      ['wrk-hyd', 'צינורות הידראוליים ונזילות'],
      ['wrk-crane', 'מנוף: כבלים, וו ונעילת וו'],
      ['wrk-legs', 'רגלי ייצוב'],
      ['wrk-plate', 'שלט עומס מרבי'],
    ]),
    group('wheels', 'גלגלים, זחלים ובלימה', [
      ['whl-tyres', 'צמיגים או זחלים'],
      ['whl-brakes', 'בלמים ובלם חניה'],
      ['whl-steer', 'היגוי'],
    ]),
    group('engine', 'מנוע', [
      ['eng-leaks', 'נזילות: שמן, סולר, מים'],
      ['eng-fluids', 'מפלסי שמן ומים'],
      ['eng-battery', 'מצברים וכבלים'],
    ]),
    group('safety', 'בטיחות המפעיל', [
      ['saf-belt', 'חגורת בטיחות ותא מגן'],
      ['saf-horn', 'צופר וזמזם רוורס'],
      ['saf-lights', 'פנסים ומהבהב'],
      ['saf-warn', 'נורות אזהרה בלוח'],
    ]),
    group('kit', 'ציוד ומסמכים', [
      ['kit-fire', 'מטף כיבוי'],
      ['kit-aid', 'ערכת עזרה ראשונה'],
      ['kit-test', 'תסקיר בודק מוסמך בתוקף, אם נדרש'],
      ['kit-papers', 'רישיון וביטוח'],
    ]),
  ] },

  small: { version: 1, groups: [
    group('wheels', 'גלגלים ובלימה', [
      ['whl-tyres', 'מצב הצמיגים ולחץ האוויר'],
      ['whl-brakes', 'בלם קדמי ואחורי'],
      ['whl-chain', 'שרשרת או רצועת הנעה'],
    ]),
    group('body', 'שלדה והיגוי', [
      ['bdy-frame', 'שלדה ומרכב'],
      ['bdy-steer', 'כידון או הגה, ומשיכה'],
      ['bdy-mirrors', 'מראות'],
      ['bdy-leaks', 'נזילות'],
    ]),
    group('lights', 'תאורה', [
      ['lgt-lamps', 'פנסים ואיתות'],
      ['lgt-horn', 'צופר'],
    ]),
    group('kit', 'ציוד ומסמכים', [
      ['kit-helmet', 'קסדה ומיגון, אם נדרש'],
      ['kit-papers', 'רישיון וביטוח'],
    ]),
  ] },
};
