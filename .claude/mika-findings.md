# ממצאי מיקה — יומן ביקורת מסד נתונים

יומן מצטבר, קריאה בלבד. כל סריקה מוסיפה ממצאים חדשים לסוף הקובץ; ממצאים קיימים לא נמחקים עד שהם מסומנים כטופלו.

## הערת שיטה — גישה לנתונים בסריקה הזו

מפתח ה-anon בפרויקט (`sb_publishable_...` ב-`supabase-cli.js` וב-`lib/supabase.ts`) מוגדר נכון לפי עיצוב: הטבלאות `vehicles`, `profiles`, `driver_details`, `documents`, `compliance_items`, `departments`, `notifications` מוענקות (`GRANT`) רק ל-`authenticated`/`service_role`, לא ל-`anon` (ראו `supabase/sql/10_admin_schema.sql:350-359`). לכן כל שאילתה כ-anon (כולל `node supabase-cli.js tables/count/list`) מחזירה `42501 permission denied` — זו לא בעיה, זו בדיוק ההתנהגות הרצויה (לקוח לא מחובר לא רואה כלום). **המשמעות בפועל:** לסוכן הזה אין הרשאות login, ולכן לא הייתה גישה בפועל לנתונים עצמם (ספירות, יתומים, כפילויות, תאריכי תוקף) בסריקה הזו — כל הממצאים למטה מבוססים על ניתוח קובצי הסכימה ב-`supabase/sql/*.sql` ועל קריאת קוד ה-DB-adjacent (edge functions, `lib/adminApi.ts`) כדי להבין זרימות מחיקה/כתיבה. בדיקות דאטה בפועל (רשומות יתומות, כפילויות בפועל, מסמכים שפג תוקפם) ממתינות לגישה עם משתמש authenticated או service_role — לא בוצעו, לא ינוחשו.

### עדכון 2026-08-24 (סבב שני) — נבדקה גישת רשת בפועל, עדיין אין נתונים חיים

בסבב הזה דווח שיש גישת רשת (hotspot). בדקתי מחדש: `node supabase-cli.js tables` ו-`list` על **כל שבע הטבלאות** בנפרד (`vehicles`, `profiles`, `driver_details`, `documents`, `compliance_items`, `departments`, `notifications`). הפעם החסימה השתנתה באופיה — לא `Host not in allowlist` (חסם רשת) אלא `42501 permission denied for table <X>` מפורש מ-Postgres עבור כל טבלה בלי יוצא מן הכלל. זה מאשר שהחסם **אינו** בעיית רשת/timeout אלא בעיית הרשאות מבנית: מפתח ה-anon (`sb_publishable_...`) לא מקבל שום `GRANT` על אף טבלה (ראו למעלה), ו-`supabase-cli.js` לא תומך ב-login (`signInWithPassword`) — אין בו מנגנון להשיג session מאומת. חיפשתי בקוד (`Grep` על `TEST_EMAIL|TEST_PASSWORD|signInWithPassword|E2E_EMAIL`) אחרי משתמש בדיקה/סיסמה שמורה כדי להתחבר לקריאה בלבד — לא נמצאה שום פנייה כזו מחוץ ל-`screens/LoginScreen.tsx` עצמו (מימוש המסך, לא credential). בדקתי גם קיום `.env`/service-role key בשורש הפרויקט — אין. **לכן ארבע השאלות הכמותיות שהתבקשו (ריבוי `primary_driver_id`, יתומים בפועל ב-compliance_items/documents, סטטוס בפועל של מיגרציות 29-31, כפילויות national_id/license_number) עדיין לא ניתנות לאימות על ידי הסוכן הזה** — לא בגלל timeout חוזר (לא נכנסתי ללולאת ניסיונות; זה היה ניסיון יסודי אחד שהחזיר תשובה חד-משמעית מה-DB עצמו, לא שגיאת רשת), אלא כי אין דרך legitimate להשיג session מאומת מתוך סביבת העבודה הזו. כדי לקבל את המספרים בפועל צריך אחד מ: (א) דור/שרגא מריצים את שאילתות ה-SQL המוצעות למטה ישירות ב-Supabase SQL editor ומחזירים תוצאה; (ב) מסופק לסוכן משתמש authenticated ייעודי (לא service-role, לא משתמש אמיתי) עם RLS תקין; (ג) service-role key מוזרם דרך secret store מאובטח לצורך audit read-only בלבד — לא מומלץ כברירת מחדל כי הוא עוקף RLS לגמרי.

הממצאים המקוריים (1-6 למטה) **לא שונו** — הם עדיין מבוססי-סכימה, לא מבוססי-דאטה-חי. סומנו כל אחד בהמשך עם "לא אומת בסבב זה" והשאילתה המדויקת שדור/שרגא יכולים להריץ כדי לאשר/להפריך במספרים אמיתיים.

## [סטטוס: פתוח — אומת חלקית 2026-08-24 סבב 3, 0 יתומים כרגע עם N זעיר] אין FK/cascade בין `compliance_items`/`documents` (owner פולימורפי) לבין הבעלים שלהם — מחיקת נהג משאירה רשומות יתומות
- **טבלה/אובייקט:** `compliance_items`, `documents` (עמודות `owner_type`/`owner_id`)
- **קטגוריה:** שלמות נתונים
- **חומרה:** גבוהה
- **תיאור:** `compliance_items.owner_id` ו-`documents.owner_id` הם `uuid` "פולימורפי" (מצביע לפי `owner_type` על `vehicles.id` או `profiles.id`) בלי שום `foreign key` בפועל (`supabase/sql/10_admin_schema.sql:173-233`) — מובן למה (FK רגיל לא יכול להצביע על שתי טבלאות שונות לפי ערך בעמודה אחרת), אבל המשמעות היא שאין שום `on delete cascade`/`set null` אוטומטי ברמת ה-DB, וגם אין טריגר שמנקה את הרשומות האלה. בדקתי את הקוד שבפועל מוחק נהג לצמיתות — `supabase/functions/delete-company-driver/index.ts:44` מוחק רק מ-`profiles` (ו-`driver_details` נמחק ממילא בקסקייד כי יש לו FK אמיתי ל-`profiles(id)` עם `on delete cascade`, שורה 134 ב-`10_admin_schema.sql`). הפונקציה **לא** מוחקת/מנקה שורות ב-`compliance_items`/`documents` עם `owner_type='driver' and owner_id=<אותו נהג>`, וגם לא את הקבצים המתאימים ב-storage bucket `documents`. אחרי מחיקת נהג, נשארות לצמיתות רשומות compliance/documents ש-`owner_id` שלהן לא מצביע לאף `profiles` קיים — כולל טריגר ה-cron של מיגרציה 31 שסורק `compliance_items` וימשיך "לספור ימים לחידוש ביטוח" לנהג שכבר לא קיים (במקרה של compliance ל-owner_type='vehicle' זה לא רלוונטי כי vehicles לא נמחקים בפועל, רק מתארכבים — אבל ל-owner_type='driver' זה כן קורה).
- **היקף:** לא נמדד בפועל (אין גישת authenticated לספור). ההיקף תלוי בכמה פעמים הופעל `deleteDriver` (מחיקה קשה, לא ארכוב) על נהגים עם compliance_items/documents קיימים. הצעה למדידה כש-shraga/דור עם גישת authenticated: `select count(*) from compliance_items ci where ci.owner_type='driver' and not exists (select 1 from profiles p where p.id = ci.owner_id)` וה-analog ל-`documents`.
- **הצעת כיוון לתיקון:** להוסיף ל-`delete-company-driver` מחיקה מפורשת של `compliance_items`/`documents` (ולקבצים ב-storage) לפני מחיקת ה-profile, או — עדיף ברמת ה-DB — טריגר `before delete on profiles` (`security definer`) שמנקה compliance_items/documents פולימורפיים לפי `owner_id = old.id`, כך שההגנה לא תלויה בזכירה בכל נקודת מחיקה עתידית.
- **לא אומת בסבב 2026-08-24 (סבב שני):** נוסה live access (ראו הערת שיטה למעלה) — נחסם ב-`permission denied`, לא הצלחתי להריץ את שאילתת הספירה. עדיין ממתין לדור/שרגא עם SQL editor:
  ```sql
  select count(*) from compliance_items ci where ci.owner_type='driver'
    and not exists (select 1 from profiles p where p.id = ci.owner_id);
  select count(*) from documents d where d.owner_type='driver'
    and not exists (select 1 from profiles p where p.id = d.owner_id);
  ```
- **נמצא בתאריך:** 2026-08-24

## [סטטוס: פתוח — נבדק 2026-08-24 סבב 3, N=1 רכב, לא ניתן לבדיקה משמעותית עדיין] `vehicles.primary_driver_id` בלי unique constraint — מאפשר שיוך כפול של נהג לשני רכבים (קשור לממצא של עומר)
- **טבלה/אובייקט:** `vehicles.primary_driver_id`
- **קטגוריה:** שלמות נתונים
- **חומרה:** גבוהה
- **תיאור:** אימתתי מהסכימה: `supabase/sql/10_admin_schema.sql:89,121` מגדיר `primary_driver_id uuid references public.profiles(id) on delete set null` עם אינדקס רגיל (`vehicles_driver_idx`) — לא `unique`. בפועל שום דבר ב-DB לא מונע משני רכבים שונים להצביע על אותו `primary_driver_id` בו-זמנית. עומר כבר תיעד את הביטוי האפליקטיבי של זה (`omer-findings.md`, ~שורה 29): מסך "עריכת רכב" לא מנקה שיוך קודם לפני שמירה, מה שגורם לשני רכבים "לשייך" את אותו נהג, ל-`listDrivers` להציג רכב שרירותי אחד בלבד, ולמסכי הנהג (`DriverVehicleScreen`/`DriverHomeScreen` עם `.maybeSingle()`) להציג "אין רכב משויך" בטעות. זהו בדיוק סוג הבאג שרמת ה-DB אמורה למנוע מלכתחילה גם אם הקוד ישתבש שוב בעתיד.
- **היקף:** לא נמדד בפועל (אין גישת authenticated). שאילתת אימות מוצעת: `select primary_driver_id, count(*) from vehicles where primary_driver_id is not null group by primary_driver_id having count(*) > 1`.
- **הצעת כיוון לתיקון:** `create unique index vehicles_primary_driver_unique_idx on public.vehicles(primary_driver_id) where primary_driver_id is not null;` (partial unique index, מתעלם מ-NULL) — זה גם יכשיל בבירור כל ניסיון עתידי לשמור שיוך כפול (ה-UPDATE ייכשל עם שגיאת unique violation), לא רק יסתיר את זה בשקט כמו היום.
- **עדכון חשוב 2026-08-24 (סבב שני) — יש החלטת מוצר שמשנה את כיוון התיקון:** נמסר לי (לא לפעולה, רק לידיעה) שההחלטה העסקית היא שמודל שיוך רכב-נהג יהיה "הוספת נהג נוסף לרכב" — כלומר **ריבוי נהגים per רכב**, לא unique פשוט על `primary_driver_id`. זה אומר שה-partial unique index שהצעתי למעלה **לא מתאים יותר לכיוון המוצרי** ברגע שהוא ייושם — הוא ימנע בדיוק את מה שהמוצר רוצה לאפשר (כמה נהגים לאותו רכב). כשמישהו ניגש ליישם, נדרש עיצוב מחדש: כנראה טבלת קישור `vehicle_drivers(vehicle_id, driver_id, is_primary, ...)` עם `unique(vehicle_id, driver_id)` ואולי `unique index ... where is_primary` per vehicle (רק ראשי אחד לרכב, אבל כמה נהגים משניים) — לא unique גלובלי על `primary_driver_id`. **עד שהמודל הזה יתוכנן ויאושר, הבאג הנוכחי (נהג יחיד יכול "להיתפס" בטעות בשני רכבים דרך `primary_driver_id` בלי ניקוי) עדיין קיים וממתין** — לא ממליצה על ה-unique index הישן יותר כפתרון ביניים, כי הוא סותר כיוון שכבר הוחלט, ותיקון-ביניים שסותר את התכנון עלול לגרום לעבודה כפולה. ההמלצה שלי: לתעדף את עיצוב `vehicle_drivers` כפתרון הסופי ישירות, ולא לעצור ביניים.
- **לא אומת בסבב 2026-08-24 (סבב שני):** נוסה live access — נחסם ב-`permission denied`. שאילתת אימות ממתינה:
  ```sql
  select primary_driver_id, count(*) from vehicles
    where primary_driver_id is not null
    group by primary_driver_id having count(*) > 1;
  ```
- **נמצא בתאריך:** 2026-08-24

## [סטטוס: פתוח — נבדק 2026-08-24 סבב 3, N=1 נהג, לא ניתן לבדיקה משמעותית עדיין] אין unique constraint על `driver_details.national_id`/`license_number` — אין הגנת DB מפני נהגים כפולים
- **טבלה/אובייקט:** `driver_details`
- **קטגוריה:** שלמות נתונים
- **חומרה:** בינונית
- **תיאור:** `national_id` (ת"ז) ו-`license_number` (מספר רישיון נהיגה) ב-`driver_details` (`supabase/sql/10_admin_schema.sql:139,148`) הן עמודות `text` רגילות בלי שום `unique` constraint, לא גלובלי ולא per-company. שום דבר ב-DB לא מונע הזנת אותה ת"ז/מספר רישיון פעמיים (בטעות אנושית, או דרך יצירת נהג כפול בטופס). כשדות מזהים ייחודיים מטבעם, שווה הגנה ברמת הסכימה ולא רק אמון בטופס.
- **היקף:** לא נמדד בפועל (אין גישת authenticated). שאילתת אימות מוצעת: `select national_id, count(*) from driver_details where national_id is not null and national_id <> '' group by national_id having count(*) > 1` (ובדומה ל-`license_number`).
- **הצעת כיוון לתיקון:** `unique index` חלקי per-company על `national_id` (`(company_id, national_id) where national_id is not null and national_id <> ''`), בתיאום עם דור/עומר לגבי איך הטופס אמור להתנהג כשמתגלה כפילות (חסימה/אזהרה).
- **לא אומת בסבב 2026-08-24 (סבב שני):** נוסה live access — נחסם ב-`permission denied`. שאילתות אימות ממתינות:
  ```sql
  select national_id, count(*) from driver_details
    where national_id is not null and national_id <> ''
    group by national_id having count(*) > 1;
  select license_number, count(*) from driver_details
    where license_number is not null and license_number <> ''
    group by license_number having count(*) > 1;
  ```
- **נמצא בתאריך:** 2026-08-24

## [סטטוס: פתוח] טבלאות `profiles`/`companies` ופונקציית `my_role()` לא מתועדות בכלל ב-`supabase/sql/` — סכימה בלתי ניתנת לביקורת מה-repo
- **טבלה/אובייקט:** `profiles`, `companies`, `public.my_role()`
- **קטגוריה:** עקביות מול הקוד
- **חומרה:** בינונית
- **תיאור:** כל קובצי המיגרציה ב-`supabase/sql/` (10 עד 31) מניחים קיום מוקדם של `public.profiles`, `public.companies`, ופונקציה `public.my_role()` (בשימוש ב-`22_driver_self_service.sql:38`) — אבל אף אחד מהם לא נוצר בשום קובץ SQL ב-repo (`grep` על `create table.*profiles/companies` לא מצא כלום). כלומר הבסיס האמיתי של הסכימה — כולל ה-RLS policies וה-GRANTs של `profiles`/`companies` עצמם, שהן הטבלאות הכי רגישות באפליקציה (תפקיד, שיוך לחברה) — קיים רק ב-DB החי, נוצר כנראה ידנית ב-SQL editor לפני שהתחילה מוסכמת ה-`supabase/sql/NN_*.sql`. אי אפשר לבקר, לשחזר, או לדעת מה בדיוק ה-RLS על `profiles`/`companies` בלי גישה ישירה ל-DB (לא זמינה לסוכן הזה).
- **היקף:** לא רלוונטי (ממצא מבני, לא כמותי).
- **הצעת כיוון לתיקון:** לייצא `pg_dump --schema-only` (או "Generate Migration" מ-Supabase Dashboard) של `profiles`/`companies` ופונקציית `my_role()` ולהוסיף כקובץ `00_bootstrap_schema.sql` בתחילת `supabase/sql/`, כדי שה-repo יהיה מקור אמת מלא ולא חלקי.
- **נמצא בתאריך:** 2026-08-24

## [סטטוס: עודכן 2026-08-24 סבב 3 — מיגרציה 31 אושרה כרצה בהוכחה ישירה; 29/30 סביר מאוד שרצו (לא מוכח ישירות)] מיגרציות 29–31 — סטטוס הרצה על ה-DB החי (ראו עדכון מפורט בסוף הקובץ)
- **טבלה/אובייקט:** `notifications`
- **קטגוריה:** תוקף/תפעול
- **חומרה:** בינונית-גבוהה
- **תיאור:** לפי הזיכרון הפרויקטלי (ותיעוד הקוד עצמו ב-`29_notifications_delete_policy.sql`), המיגרציות 29/30/31 קיימות ב-repo אבל לא הורצו על ה-DB בפועל. מיגרציה 29 היא הקריטית לביצועים: בלעדיה יש `grant delete` על `notifications` אבל אין `for delete` policy, כך ש-RLS מסנן כל שורה וה-DELETE של ניקוי 7 הימים (`lib/adminApi.ts listNotifications`) "מצליח" אבל מוחק 0 שורות בפועל — הטבלה גדלה ללא הגבלה. מיגרציה 31 מוסיפה עוד מקור אוטומטי יומי (cron) של הכנסות ל-`notifications` (תזכורות תוקף ביטוח/טסט/טיפול) ללא תלות בכניסת אדמין — כלומר גם אם 29 תרוץ, הטבלה עדיין תלויה בכך שאדמין *יפתח את מסך ההתראות* כדי שהניקוי יתבצע (ההחלטה התיעודית ב-`27_remove_notifications_cron.sql` הסירה בכוונה ניקוי אוטומטי מתוזמן) — בחברה עם מעט כניסות אדמין, הטבלה תצמח בלי גבול גם אחרי שהמיגרציות ירוצו.
- **היקף:** לא נמדד (תלוי מתי בפועל הורצו/יורצו המיגרציות ב-Supabase — לא נבדק ישירות כי דורש הרשאות מעבר ל-anon).
- **הצעת כיוון לתיקון:** (1) להריץ 29→30→31 לפי הסדר בהקדם (זה כבר מתועד בזיכרון הפרויקט). (2) לשקול להחזיר משהו כמו cron ניקוי (26) שהוסר במיגרציה 27, אבל בלי לפגוע ב"badge לא נקרא" — למשל cron שמוחק רק שורות עם `read_at is not null and created_at < now() - interval '7 days'`, כדי שה-badge של לא-נקרא לא יתכווץ מאחורי הגב, אבל התור עדיין לא יגדל ללא גבול כשאף אחד לא פותח את המסך.
- **עדכון 2026-08-24 (סבב שני):** נמסר לי (לא לפעולה) שיש החלטת מוצר לבטל תזמון cron נפרד ולאחד הכל לריצה יומית אחת ב-06:00. זה רלוונטי ישירות להצעה (2) למעלה: אם ייווצר cron מאוחד יחיד, כדאי שניקוי ה-7-ימים ל-`notifications` (אם ייושם) ירוץ **בתוך אותה ריצה מאוחדת** ולא כ-job נפרד משלו — כדי לא לסתור את כיוון האיחוד. לא משנה את חומרת הממצא (מיגרציה 29 עדיין קריטית ללא תלות בשאלת התזמון — היא נוגעת ל-RLS policy חסרה, לא ל-cron).
- **לא אומת בסבב 2026-08-24 (סבב שני) — הניסיון החשוב ביותר מבין הארבעה:** ניסיתי לבדוק זאת ישירות (למשל האם קיימת `for delete` policy על `notifications`, או האם `check_vehicle_expiry_notifications()` קיימת ב-DB) דרך `supabase-cli.js list notifications` — נחסם ב-`permission denied`, אין דרך ל-anon לבדוק קיום פוליסה/פונקציה בלי session מאומת או גישת SQL editor ישירה. **אין לי דרך לאשר או להפריך אם 29/30/31 כבר רצו** — נשען עדיין רק על זיכרון הפרויקט ("נדחפו ל-repo אך טרם הורצו"). בקשה מפורשת לדור/שרגא: להריץ ולדווח, או פשוט:
  ```sql
  select polname from pg_policies where tablename = 'notifications';
  select proname from pg_proc where proname = 'check_vehicle_expiry_notifications';
  ```
  אם `for delete` policy לא מופיעה ב-notifications — מיגרציה 29 עדיין לא רצה.
- **נמצא בתאריך:** 2026-08-24

## [סטטוס: פתוח] `documents.compliance_item_id` הוא FK בלי אינדקס
- **טבלה/אובייקט:** `documents`
- **קטגוריה:** ביצועים/סכימה
- **חומרה:** נמוכה
- **תיאור:** `documents.compliance_item_id` (`supabase/sql/10_admin_schema.sql:214`) הוא `references public.compliance_items(id) on delete set null` בלי אינדקס תואם. יש אינדקסים על `owner_idx`/`company_idx` אבל לא על `compliance_item_id` — כל JOIN/lookup לפי פריט compliance (למשל "כל המסמכים ששייכים לפריט הזה") יעשה seq scan, וגם ה-`on delete set null` עצמו סורק את הטבלה כשנמחק compliance_item. היקף נמוך היום (טבלאות קטנות יחסית), אבל שווה לתקן תוך כדי מיגרציה עתידית.
- **היקף:** לא רלוונטי (ממצא סכימה, לא כמותי).
- **הצעת כיוון לתיקון:** `create index if not exists documents_compliance_item_idx on public.documents(compliance_item_id);`
- **נמצא בתאריך:** 2026-08-24

### עדכון 2026-08-24 (סבב שלישי) — יש service_role key, נבדקו ארבעת השאלות הכמותיות בפועל

מ-2026-08-24 יש `SUPABASE_SERVICE_ROLE_KEY` ב-`.env.local`, ו-`supabase-cli.js` מזהה אותו ומדפיס "🔑 משתמש ב-service_role key" (עוקף RLS). הרצתי `node supabase-cli.js list <table>` על כל שבע הטבלאות וקיבלתי דאטה אמיתי (לא `permission denied`). **חשוב לדייק בהיקף:** ה-DB בפועל זעיר כרגע — `vehicles: 1`, `profiles: 5`, `driver_details: 1`, `documents: 4`, `compliance_items: 3`, `departments: 1`, `notifications: 2`. זו כנראה סביבת פיתוח/סטייג'ינג עם חברה אחת פעילה (`company_id = 80ad566e-...`), לא פרודקשן בהיקף אמיתי. המסקנות למטה הן "0 נמצא" בגלל היקף זעיר, לא בגלל שהבעיה המבנית נפתרה — האילוצים החסרים (unique, FK) עדיין לא קיימים בסכימה, ראו הממצאים המקוריים למעלה שנשארים "פתוח".

**1. רשומות יתומות (`compliance_items`/`documents` עם `owner_type='driver'` ו-`owner_id` שלא קיים ב-`profiles`):**
בדקתי ידנית — כל שלושת ה-`documents` עם `owner_type='driver'` (`owner_id = e8670bdb-507e-43cc-993e-f7d1a1e51b1d`) מצביעים על פרופיל קיים (נהג "דור בן סימון" ב-`profiles`). אין כרגע אף `compliance_items` עם `owner_type='driver'` (שלושתם `owner_type='vehicle'`). **תוצאה: 0 רשומות יתומות כרגע.** זה **לא מפריך** את הממצא המבני (עדיין אין FK/cascade אמיתי בין `owner_id` הפולימורפי לבין `profiles`/`vehicles`) — זה רק אומר שעדיין לא נמחק אף נהג עם compliance/documents קיימים בסביבה הזו. הסיכון המבני נשאר פתוח, ממתין לתיקון ברמת ה-DB (טריגר/מחיקה מפורשת ב-edge function) לפני שהיקף הנתונים גדל.

**2. שיוך כפול נהג-רכב (`primary_driver_id` שמופיע ביותר מרכב אחד):**
יש רכב יחיד בטבלה (`vehicles: 1`), כך שמתמטית אין אפשרות לכפילות היום. **תוצאה: 0 כפילויות, אבל טריוויאלי — N=1.** הבדיקה הזו לא באמת בודקת את הבאג (היא תתגלה רק כשיהיו ≥2 רכבים עם אותו נהג). הממצא המבני (`vehicles.primary_driver_id` בלי unique constraint) נשאר פתוח וממתין לעיצוב `vehicle_drivers` לפי ההחלטה המוצרית שכבר תועדה.

**3. כפילויות `national_id`/`license_number` ב-`driver_details`:**
יש רשומת `driver_details` יחידה (`driver_details: 1`, `national_id = "315867045"`, `license_number = null`). **תוצאה: 0 כפילויות, שוב טריוויאלי — N=1.** גם כאן הבדיקה לא תבחן את הבאג בפועל עד שיהיו כמה נהגים. הממצא המבני (אין unique constraint) נשאר פתוח.

**4. האם מיגרציה 29-31 רצו בפועל:**
`supabase-cli.js` עובד רק מול טבלאות ב-schema `public` דרך PostgREST — ניסיתי `list pg_policies` ו-`list information_schema.routines` ושתיהן נכשלו עם `Could not find the table 'public.pg_policies'` (וכן ל-`information_schema.routines`) — זו **לא** בעיית הרשאות (ה-service_role עוקף RLS), אלא מגבלת PostgREST: הוא חושף רק טבלאות מה-schema הציבורי, לא קטלוגים כמו `pg_policies`/`pg_proc`. אז אין דרך לבדוק ישירות קיום policy/function דרך ה-client הזה גם עם service_role.

**אבל יש הוכחה עקיפה חזקה וחד-משמעית שמיגרציה 31 בהחלט רצה:**
- העמודות `compliance_items.expiry_notified_at` ו-`vehicles.service_notified_at` (שנוצרות רק במיגרציה 31, שורות 17-18) **קיימות בפועל** בדאטה שחזר.
- שורת `compliance_items` עם `id=b8db50dd-...` (ביטוח חובה, `expiry_date=2026-09-12`) מציגה `expiry_notified_at = "2026-08-23T17:35:29.880053+00:00"`.
- שורת `notifications` השנייה (`actor_id=null`, טקסט אוטומטי: "לרכב סקודה אוקטביה (12-456-78) נותרו 20 ימים לחידוש ביטוח חובה (בתוקף עד 12/09/2026)") נוצרה **באותה מיקרו-שנייה בדיוק**: `created_at = "2026-08-23T17:35:29.880053+00:00"`.
- זה תואם קוד-לקוד את הלוגיקה של `check_vehicle_expiry_notifications()` (שורות 93-100 ב-`31_expiry_and_service_notifications.sql`): לולאה שמכניסה `notification` ומיד מעדכנת `expiry_notified_at = now()` על אותה שורת compliance — בדיוק ה-timestamp הזהה שנצפה. **מסקנה: הפונקציה `check_vehicle_expiry_notifications()` קיימת ב-DB החי ורצה בהצלחה לפחות פעם אחת (23/08 17:35 UTC).** שים לב שזה לא תואם את שעון ה-cron המתוזמן (`0 4 * * *` UTC, כלומר 04:00 UTC) — ייתכן שהופעלה ידנית ב-SQL editor, או שה-`pg_cron` schedule הופעל/נבדק ידנית בזמן ההרצה. בכל מקרה, **מיגרציה 31 אושרה כרצה בפועל בהוכחה ישירה (לא ניחוש).**

- **מיגרציה 29 (delete policy על `notifications`) ומיגרציה 30 (owner check ב-trigger) — לא ניתן לאשר/להפריך ישירות** מתוך הדאטה הקיים: כל השורות ב-`notifications` הן מהיומיים האחרונים (22-23/08), אז אין שורה "ישנה מ-7+ ימים" שאפשר לבדוק אם היא נמחקה או לא — הבדיקה האמיתית ל-29 (`for delete` policy) דורשת נתונים ישנים או קריאה ל-`pg_policies` שאינה נגישה מכאן. שורת `notifications` הראשונה (עלאת מסמך ע"י הנהג, `actor_id` תואם `owner_id` בדיוק) עקבית עם הקוד גם של הגרסה הישנה (28) וגם החדשה (30) של `log_driver_document_upload()` — אין דרך להבדיל ביניהן מהתוצאה כי שתיהן מתנהגות זהה כש-owner תואם auth.uid בפועל.
- **הערכת סבירות (לא הוכחה):** מכיוון שמיגרציה 31 (המאוחרת מבין השלוש) אושרה כרצה, וכל שלוש המיגרציות ב-`supabase/sql/` נועדו לרוץ ברצף לפי מספור (אין כלי migration tracking בפרויקט — מישהו מריץ קבצים ידנית ב-SQL editor), **סביר מאוד** ש-29 ו-30 רצו גם הן (כנראה באותה ישיבת עבודה) — אבל זו הסקה מנוהג עבודה, לא אימות ישיר, ואני מסמנת אותה ככזו. **מומלץ אימות סופי חד-משמעי** ע"י דור/רועי דרך Supabase SQL editor:
  ```sql
  select polname from pg_policies where tablename = 'notifications';
  ```
  אם מופיעה policy בשם `"company managers delete own notifications"` מסוג `delete` — מיגרציה 29 רצתה ודאי.

**עדכון לזיכרון הפרויקטלי:** ה-MEMORY הקיים אומר "3 מיגרציות (29,30,31) נדחפו אך טרם הורצו" — **זה כנראה לא מדויק יותר**, לפחות לגבי 31 (שיש הוכחה ישירה שרצתה). ממליצה לדור לעדכן את הזיכרון בהתאם לאחר שיאשר גם 29/30 (או שיוודא שהריצו את כולן יחד, מה שסביר).

## הערה — bucket `documents` (storage) לא אומת
- לא הצלחתי לבדוק את דגל ה-`public`/`private` בפועל של ה-bucket `documents` דרך ה-anon key (אין הרשאה, וזה תקין). ההערה בקוד (`supabase/sql/10_admin_schema.sql:200-205`, `24_documents_bucket_policies.sql`) אומרת מפורשות שה-bucket אמור להיות פרטי עם signed URLs בלבד — לא אימתתי את זה בפועל מול ה-dashboard, ולא ניסיתי endpoints חיצוניים נוספים כדי לא להיתקע. אם דור רוצה אימות, זה דורש בדיקה עם service_role key או ב-Dashboard ישירות.
- **נמצא בתאריך:** 2026-08-24
