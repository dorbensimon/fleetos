# תוכנית בדיקה חיה — FleetOS

תוכנית בדיקה מצטברת. מעודכנת בכל סבב ביקורת קוד. **סטטוס תשתית נוכחי (עדכון 2026-08-26, אחרי ריפקטור מכני של FleetScreen/OwnerHomeScreen/CompanyDetailScreen/adminApi.ts): Jest+RTL מותקן ועובד** — `jest-expo` preset, `npm test` (93/93 ירוק, כולל 27 טסטים חדשים ל-`fleetCardHelpers`), `npm run typecheck` ו-`npm run lint` נקיים (נבדק שוב אחרי הריפקטור — אין רגרסיה). קבצי טסט תחת `lib/__tests__/`. אין עדיין Detox/Maestro/Cypress — E2E על מכשיר עדיין מתועד ידנית בלבד.

---

## FleetScreen (מסך "נהגים/רכבים" המשולב) + components/fleet/* + lib/fleetCardHelpers.ts
- **קבצים רלוונטיים:** `screens/admin/FleetScreen.tsx` (984→465 שורות אחרי הריפקטור), `components/fleet/{DriverCard,VehicleCard,StatCell,ExportReportSheet}.tsx`, `lib/fleetCardHelpers.ts`, `components/ui/DriversVehiclesToggle.tsx`, `lib/adminApi.ts`
- **תרחישי בדיקה:**
  - [Unit] `remainingTone`/`remainingRatio`/`worstTone`/`chipFor` — מיפוי ימים/ק״מ שנותרו לטון צבע נכון (ok/warn/bad/neutral) ולצ'יפ תואם (תווית/צבעים), כולל גבולות (0, warnAt בדיוק, warnAt=0, שלילי/overdue, null, ratio clamp מעל 1/מתחת 0, worstTone על מערך ריק/מעורב, tone לא מוכר ב-chipFor) — סטטוס: **אוטומטי** (`lib/__tests__/fleetCardHelpers.test.ts`, 27 טסטים, נכתב לאחר פיצול הלוגיקה הטהורה מ-`FleetScreen.tsx` ל-`lib/fleetCardHelpers.ts`)
  - [Unit] `filteredDrivers`/`filteredVehicles` — לוגיקת סינון וחיפוש (כולל `no_vehicle`, סטטוס `archived` מוסתר כברירת מחדל) — סטטוס: מתוכנן (נשארה inline בתוך `FleetScreen.tsx`, לא פוצלה בריפקטור הזה — אם תבודד לפונקציה טהורה בעתיד, קלה לבדיקה כמו `fleetCardHelpers`)
  - [Integration] מעבר בין מצב "נהגים" ל"רכבים" לא מנווט למסך חדש (אין back stack) ושתי הרשימות נטענות פעם אחת ב-`useFocusEffect` — סטטוס: ידני-מתועד-לא-נבדק
  - [E2E-ידני] ייצוא דוח נהגים (PDF) לכל אחת מ-4 הקטגוריות (עכשיו דרך `components/fleet/ExportReportSheet.tsx`) — לוודא שהקובץ נוצר ומשתף שיתוף נפתח — סטטוס: ידני-מתועד-לא-נבדק
  - [רגרסיית ריפקטור] `npm test`/`npm run typecheck`/`npm run lint` הורצו שוב אחרי פיצול FleetScreen ל-components/fleet + lib/fleetCardHelpers ו-adminApi.ts ל-lib/adminApi/* — כולם ירוקים, אין רגרסיה מבחינת קומפילציה/לינט/טסטים קיימים — סטטוס: **אוטומטי** (2026-08-26)
- **סיכוני עומס/ביצועים:** `loadVehicles` מריץ 3 קריאות רשת ברצף (`listVehicles`, `listComplianceForOwners`, `listDrivers`, `listDepartments`) בכל פוקוס-מסך; בחברה עם הרבה רכבים/נהגים זה עלול להאט את המעבר בין מסכים. `listComplianceForOwners`/`listDrivers` לא עמודים (pagination) — כדאי לבדוק עומס עם 500+ רכבים/נהגים בעתיד (למשל k6 מול Supabase REST על `vehicles`/`compliance_items`/`driver_details`).

## שיוך נהג↔רכב (VehicleFormScreen, DriverPersonalDetailsScreen, VehicleDetailScreen, lib/adminApi.ts)
- **קבצים רלוונטיים:** `screens/admin/VehicleFormScreen.tsx`, `screens/admin/DriverPersonalDetailsScreen.tsx`, `screens/admin/VehicleDetailScreen.tsx`, `lib/adminApi.ts` (`assignDriverToVehicle`, `unassignVehicleDriver`, `setPrimaryVehicleDriver`, `listActiveVehicleDrivers`, `listActiveDriverVehicles`)
- **תרחישי בדיקה:**
  - [Unit] `assignDriverToVehicle` — דוחה נהג שכבר משויך פעיל לאותו רכב, דוחה שיוך שלישי (מקסימום 2 נהגים פעילים), דוחה נהג ראשי שני כשיש כבר ראשי פעיל, ומצליח כשאין קונפליקט — סטטוס: **אוטומטי** (`lib/__tests__/adminApi.test.ts`, 5 טסטים)
  - [Unit] `assignDriverToVehicle` — שגיאת DB/RLS/טריגר מה-insert מועברת הלאה (לא נבלעת) — סטטוס: **אוטומטי**
  - [Unit] `unassignVehicleDriver` — soft-delete בלבד (`unassigned_at` מוגדר, לא נמחקת שורה), ותקלת update מועברת — סטטוס: **אוטומטי**
  - [Unit] `setPrimaryVehicleDriver` — מוריד את הראשי הנוכחי לפני קידום החדש, ועוצר בלי לקדם אם שלב ההורדה נכשל — סטטוס: **אוטומטי**
  - [Integration/Security] שיוך נהג שכבר משויך לרכב אחר — דרך `VehicleFormScreen` וגם דרך `DriverPersonalDetailsScreen` (רינדור מסך מלא, מעבר על הלוגיקה הטהורה שכבר מכוסה למעלה) — סטטוס: ידני-מתועד-לא-נבדק (שני ממצאים פתוחים ב-`omer-findings.md` מתעדים כשל בפועל בשני הכיוונים)
  - [Integration] הסרת שיוך נהג מ-`VehicleDetailScreen` (`confirmUnassignDriver`) — מוודאת שהמסך קורא ל-`unassignVehicleDriver` הנכון ומסך הנהג עצמו לא מציג יותר את הרכב — סטטוס: ידני-מתועד-לא-נבדק (רינדור מסך מלא, לא מכוסה ב-unit)

## DateField (בורר תאריך)
- **קבצים רלוונטיים:** `components/ui/DateField.tsx`
- **תרחישי בדיקה:**
  - [E2E-ידני] iOS — פתיחת הבורר בתוך accordion/section מתקפלת ווידוא שלחיצה על "סיום" לא מקפלת גם את הסקשן (התיקון האחרון עטף את הספינר ב-`Modal` נפרד בדיוק בשביל זה) — סטטוס: ידני-מתועד-לא-נבדק (אין גישה לסימולטור iOS)
  - [E2E-ידני] Android — הבורר הנייטיבי (`display="default"`) נפתח, נסגר אוטומטית עם בחירה/ביטול — סטטוס: ידני-מתועד-לא-נבדק (אין גישה למכשיר/אמולטור)
  - [Unit] `toIso`/פורמט התאריך שחוזר מה-picker תואם למה שהשדה מצפה לו (בדיקת פונקציית עזר טהורה, אם תיחשף לבדיקה) — סטטוס: מתוכנן

## התראות אדמין (NotificationsScreen + מיגרציה 31)
- **קבצים רלוונטיים:** `screens/admin/NotificationsScreen.tsx`, `lib/adminApi.ts` (listNotifications/markNotificationRead/markAllNotificationsRead), `supabase/sql/31_expiry_and_service_notifications.sql`
- **תרחישי בדיקה:**
  - [Integration] פתיחת מסך התראות מסמנת רק את הפריט שנלחץ כ"נקרא", לא את כל הרשימה — סטטוס: ידני-מתועד-לא-נבדק
  - [Security] `markNotificationRead`/`markAllNotificationsRead` מוגבלות ל-`company_id` הנכון (דורש בדיקה מול RLS חי — נדחה לסבב הבא, יש גישה חיה ל-DB)
  - [Load-מתועד] `check_vehicle_expiry_notifications()` (מיגרציה 31) סורקת את **כל** ה-`vehicles`/`compliance_items` בכל ריצה יומית ללא הגבלת קבוצה/company — בבסיס נתונים גדול מאוד (הרבה חברות, הרבה רכבים) זה full-scan יומי; מומלץ אינדקס חלקי על `compliance_items(expiry_notified_at) where expiry_notified_at is null` ו-`vehicles(service_notified_at) where service_notified_at is null` אם ייצפה יותר מכמה אלפי שורות.
  - הערה: תזמון ה-cron (`0 4 * * *` UTC) לא באמת מקדים את הרצות mika/עומר לפי הכוונה המתועדת — ראה ממצא פתוח ב-`omer-findings.md` (2026-08-24).

## מסמכים (documents.ts, uploadLogo.ts, DriverDocumentsScreen)
- **קבצים רלוונטיים:** `lib/documents.ts`, `lib/uploadLogo.ts`, `screens/driver/DriverDocumentsScreen.tsx`, `screens/admin/DocumentCategoryScreen.tsx`
- **תרחישי בדיקה:**
  - [Unit] `pickImage`/`captureImage`/`pickFile` — שגיאת הרשאה זורקת הודעה בעברית, ביטול מחזיר `null`, נפילה חזרה (fallback) לשם/mimeType כשחסרים — סטטוס: **אוטומטי** (`lib/__tests__/documents.test.ts`, 7 טסטים)
  - [Unit] `uploadDocument` — מעלה bytes ל-storage ואז יוצר שורת `documents`, מחזיר את הנתונים; שגיאת upload לא מנסה insert; שגיאת insert מוחקת (`remove`) את הקובץ היתום שכבר הועלה ל-storage — סטטוס: **אוטומטי** (מכסה גם את התרחיש שהיה "ידני-מתועד-לא-נבדק" — כעת נבדק ביחידה מול Supabase client מדומה, לא מול storage חי)
  - [Unit] `listDocuments` — עם/בלי סינון לפי `category` — סטטוס: **אוטומטי**
  - [Unit] `deleteDocument` — מוחקת שורה ואז קובץ storage; אם מחיקת השורה נכשלת לא מנסה למחוק מ-storage — סטטוס: **אוטומטי**
  - [Unit] `getDocumentUrl`/`downloadDocument` — מחזיר `null` (לא זורק) כששגיאת חתימה, וזורק הודעת עברית כש-`downloadDocument` לא מקבל URL — סטטוס: **אוטומטי**
  - [Unit] `pickAndUploadLogo` — הרשאה נדחית זורקת הודעה בעברית, ביטול מחזיר `null`, הצלחה מעלה ל-bucket `company-logos` ומחזירה `publicUrl`, שגיאת upload מועברת — סטטוס: **אוטומטי** (`lib/__tests__/uploadLogo.test.ts`, 4 טסטים)
  - [Security] קישור חתום (`getDocumentUrl`) עם TTL של 10 דקות — לוודא שאי אפשר לגשת למסמך של חברה אחרת דרך URL ישן/מנוחש (דורש בדיקה מול storage policies חיות — נדחה לסבב הבא, לא ניתן ל-unit test)
  - לא מכוסה: `downloadDocument` בתרחיש הצלחה מלא (fetch+write+share) — דורש מוקינג כבד של `fetch`/`expo-file-system`/`expo-sharing` שערכו הנוסף מוגבל ביחס לסיכון; רק תרחיש הכשל (אין URL) מכוסה.

## Auth / Session (lib/session.ts)
- **קבצים רלוונטיים:** `lib/session.ts` (`resolveRouteForUser`, `ROLE_ROUTES`)
- **תרחישי בדיקה:**
  - [Unit/Security] שגיאה/העדר פרופיל → `signOut` + הודעת שגיאה, לא נותן route — סטטוס: **אוטומטי** (`lib/__tests__/session.test.ts`, 9 טסטים)
  - [Unit] `must_change_password=true` מנתב ל-`SetPassword` **לפני** כל בדיקת חברה, ובלי לבצע שאילתת companies מיותרת — סטטוס: **אוטומטי**
  - [Unit] `owner` מנותב ישירות בלי בדיקת חברה; `driver`/`admin` עם `company_id=null` מדלגים על בדיקת חברה — סטטוס: **אוטומטי**
  - [Unit/Security] חברה עם `status='disabled'` → `signOut` + חסימה, גם אם הפרופיל תקין — סטטוס: **אוטומטי**
  - [Unit/Security] שגיאת טעינת חברה → `signOut` + הודעת שגיאה (fail-closed, לא fail-open) — סטטוס: **אוטומטי**
  - [Integration] `App.tsx`/מסך הכניסה בפועל קורא ל-`resolveRouteForUser` ומנווט בהתאם (רינדור מלא, session persistence מול AsyncStorage) — סטטוס: ידני-מתועד-לא-נבדק

## הרשאות/RLS בצד קליינט (lib/adminApi.ts — קריאה חוצת-חברות)
- **קבצים רלוונטיים:** `lib/adminApi.ts` (`getVehicle`, `getDriver`), `supabase/sql/36_security_advisor_hardening.sql`
- **תרחישי בדיקה:**
  - [Unit/Security] `getVehicle`/`getDriver` — קוד שגיאה `PGRST116` ("no rows") מוחזר כ-`null` (רשומה לא קיימת), אבל כל קוד שגיאה אחר (למשל `42501` permission denied שיחזור מ-RLS כשמנסים לגשת לרכב/נהג של חברה אחרת) **מועבר כשגיאה** ולא נבלע כ-"not found" מטעה — סטטוס: **אוטומטי** (`lib/__tests__/adminApi.test.ts`, 4 טסטים). זו נקודה קריטית: לו ה-RLS-error היה נבלע כ-null, מסך שגוי עלול היה להציג "הרכב לא נמצא" במקום שגיאת הרשאה אמיתית, מה שמסתיר בעיית אבטחה/באג.
  - [Unit] `createDriverAccount`/`deleteAllCompanyDrivers` — מיפוי תגובת Edge Function (הצלחה, שגיאה עסקית ב-body, שגיאת רשת גנרית, ועדיפות ל-`error.context.json()` על פני הודעה גנרית) — סטטוס: **אוטומטי** (6 טסטים). אלו הפונקציות שמסתמכות על אכיפת הרשאות בצד השרת (service role) ולא בצד הקליינט — הבדיקה מוודאת שהודעת השגיאה מהשרת (כולל הודעות "אין הרשאה") מגיעה למשתמש כמו שצריך.
  - [Security] בדיקת RLS **חיה** (לא unit) — לוודא שאדמין של חברה A אכן לא יכול לקרוא/לעדכן שורת `vehicles`/`driver_details` של חברה B מול Supabase אמיתי — דורש גישת DB, נדחה לסבב נפרד (ראה גם ממצאים קיימים תחת "אבטחה" ב-`omer-findings.md`).

## אימות קלט (validation.ts, phone.ts, plate.ts)
- **קבצים רלוונטיים:** `lib/validation.ts`, `lib/phone.ts`, `lib/plate.ts`
- **תרחישי בדיקה:**
  - [Unit] `isValidEmail` — כתובות תקינות/לא תקינות (רווחים, בלי @, בלי דומיין) — סטטוס: מתוכנן (עדיין אין `lib/__tests__/validation.test.ts`)
  - [Unit] `formatPhone`/`isValidIsraeliPhone` — מספרי נייד (05X), קווי (0X), מספרים קצרים/ארוכים מדי, תווים לא מספריים — סטטוס: **אוטומטי** (`lib/__tests__/phone.test.ts`, קיים מראש)
  - [Unit] `formatPlate` — פורמט מספר רישוי לפי מספר הספרות — סטטוס: **אוטומטי** (`lib/__tests__/plate.test.ts`, קיים מראש)
  - [Unit] `validateForm` (`screens/OwnerHomeScreen.tsx`, יצירת חברה), `validateNewAdminForm`/`validateResetForm` (`screens/CompanyDetailScreen.tsx`) — לוגיקת ולידציה טהורה (שדות חובה, אורך סיסמה מינימלי, התאמת אימות סיסמה) שנשארה inline כ-closures בתוך רכיבי המסך אחרי הריפקטור, ולא פוצלה כמו `fleetCardHelpers`. אלו פונקציות טהורות פוטנציאליות (לא תלויות ב-state של קומפוננטה מעבר לקריאת ה-form object כפרמטר) — קל יחסית לבודד אותן ל-`lib/*` (למשל `lib/companyFormValidation.ts`) ולבדוק ביחידה ישירות, במקום לדרוש רינדור מסך מלא. לא מומש כרפקטור על ידי — מדווח כהמלצה בלבד למתן/idan.

## פיצול adminApi.ts
- **קבצים רלוונטיים:** `lib/adminApi/{types,vehicles,assignments,drivers,notifications,compliance,departments}.ts` + `lib/adminApi.ts` (barrel export)
- **תרחישי בדיקה:**
  - [רגרסיית ריפקטור] `lib/__tests__/adminApi.test.ts` (הקיים, 21 טסטים) ממשיך לעבור ללא שינוי מול ה-barrel export — מוודא שהפיצול לא שינה חתימות/התנהגות ציבורית — סטטוס: **אוטומטי** (נבדק מחדש 2026-08-26)
  - [Unit] יבוא ישיר מ-submodule בודד (למשל `lib/adminApi/vehicles.ts`) בלי דרך ה-barrel — לא נבדק במפורש, אך `npm run typecheck` הנקי מרמז שאין שגיאות imports/exports חסרים בין המודולים — סטטוס: ידני-מתועד-לא-נבדק

---

*הערה כללית: כל תרחיש E2E שדורש מכשיר/סימולטור בפועל (iOS/Android) מתועד כאן בלבד — אין Detox/Maestro מוגדר בפרויקט. כל תרחיש שדורש גישה חיה ל-Supabase (RLS בפועל, storage policies, cron בפועל) מסומן בבירור למעלה ונדחה לסבב בדיקה נפרד עם גישת DB.*
