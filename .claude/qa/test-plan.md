# תוכנית בדיקה חיה — FleetOS

תוכנית בדיקה מצטברת. מעודכנת בכל סבב ביקורת קוד. **סטטוס תשתית נוכחי: אין עדיין Jest/RTL מותקן בפרויקט** — `package.json` לא כולל `jest`, `jest-expo`, `@testing-library/react-native`, ואין `__tests__/` בריפו. כל עוד זה לא מותקן, כל תרחיש להלן מתועד כ"ידני-מתועד-לא-נבדק" או "מתוכנן"; שום תרחיש לא באמת "אוטומטי" עדיין. יש להתקין את החבילות האלה (לא הותקנו על ידי עומר, כנדרש בכללי ההרשאה) לפני שאפשר להתחיל להריץ טסטים בפועל.

---

## FleetScreen (מסך "נהגים/רכבים" המשולב)
- **קבצים רלוונטיים:** `screens/admin/FleetScreen.tsx`, `components/ui/DriversVehiclesToggle.tsx`, `lib/adminApi.ts`
- **תרחישי בדיקה:**
  - [Unit] `remainingTone`/`remainingRatio`/`worstTone` — מיפוי ימים/ק״מ שנותרו לטון צבע נכון (ok/warn/bad/neutral) כולל גבולות (0, warnAt בדיוק, שלילי, null) — סטטוס: מתוכנן
  - [Unit] `filteredDrivers`/`filteredVehicles` — לוגיקת סינון וחיפוש (כולל `no_vehicle`, סטטוס `archived` מוסתר כברירת מחדל) — סטטוס: מתוכנן
  - [Integration] מעבר בין מצב "נהגים" ל"רכבים" לא מנווט למסך חדש (אין back stack) ושתי הרשימות נטענות פעם אחת ב-`useFocusEffect` — סטטוס: ידני-מתועד-לא-נבדק
  - [E2E-ידני] ייצוא דוח נהגים (PDF) לכל אחת מ-4 הקטגוריות — לוודא שהקובץ נוצר ומשתף שיתוף נפתח — סטטוס: ידני-מתועד-לא-נבדק
- **סיכוני עומס/ביצועים:** `loadVehicles` מריץ 3 קריאות רשת ברצף (`listVehicles`, `listComplianceForOwners`, `listDrivers`, `listDepartments`) בכל פוקוס-מסך; בחברה עם הרבה רכבים/נהגים זה עלול להאט את המעבר בין מסכים. `listComplianceForOwners`/`listDrivers` לא עמודים (pagination) — כדאי לבדוק עומס עם 500+ רכבים/נהגים בעתיד (למשל k6 מול Supabase REST על `vehicles`/`compliance_items`/`driver_details`).

## שיוך נהג↔רכב (VehicleFormScreen, DriverPersonalDetailsScreen, VehicleDetailScreen)
- **קבצים רלוונטיים:** `screens/admin/VehicleFormScreen.tsx`, `screens/admin/DriverPersonalDetailsScreen.tsx`, `screens/admin/VehicleDetailScreen.tsx`, `lib/adminApi.ts` (`updateVehicle`, `listDrivers`)
- **תרחישי בדיקה:**
  - [Integration/Security] שיוך נהג שכבר משויך לרכב אחר — דרך `VehicleFormScreen` וגם דרך `DriverPersonalDetailsScreen` — לא אמור לאפשר יצירת מצב "רכב אחד = שני בעלים" בשקט. סטטוס: ידני-מתועד-לא-נבדק (שני ממצאים פתוחים ב-`omer-findings.md` מתעדים כשל בפועל בשני הכיוונים)
  - [Integration] הסרת שיוך נהג מ-`VehicleDetailScreen` (`confirmUnassignDriver`) — מוודאת `primary_driver_id: null` נשמר ומסך הנהג עצמו לא מציג יותר את הרכב — סטטוס: ידני-מתועד-לא-נבדק
  - [Unit] כשיהיה client זמין ל-Supabase mock — לבדוק ש-`updateVehicle` נקרא עם ה-patch הנכון בכל תרחישי השיוך/ההסרה — סטטוס: מתוכנן

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

## מסמכים (documents.ts, DriverDocumentsScreen)
- **קבצים רלוונטיים:** `lib/documents.ts`, `screens/driver/DriverDocumentsScreen.tsx`, `screens/admin/DocumentCategoryScreen.tsx`
- **תרחישי בדיקה:**
  - [Integration] העלאת קובץ שנכשל ב-insert ל-`documents` מוחקת את הקובץ שכבר הועלה ל-storage (מניעת orphan) — סטטוס: ידני-מתועד-לא-נבדק (קוד קורא נכון ל-`remove` ב-catch, אך לא נבדק בפועל מול storage חי)
  - [Security] קישור חתום (`getDocumentUrl`) עם TTL של 10 דקות — לוודא שאי אפשר לגשת למסמך של חברה אחרת דרך URL ישן/מנוחש (דורש בדיקה מול storage policies חיות — נדחה לסבב הבא)

## אימות קלט (validation.ts, phone.ts, plate.ts)
- **קבצים רלוונטיים:** `lib/validation.ts`, `lib/phone.ts`, `lib/plate.ts`
- **תרחישי בדיקה:**
  - [Unit] `isValidEmail` — כתובות תקינות/לא תקינות (רווחים, בלי @, בלי דומיין) — סטטוס: מתוכנן
  - [Unit] `formatPhone`/`isValidIsraeliPhone` — מספרי נייד (05X), קווי (0X), מספרים קצרים/ארוכים מדי, תווים לא מספריים — סטטוס: מתוכנן
  - [Unit] `formatPlate` — פורמט מספר רישוי לפי מספר הספרות — סטטוס: מתוכנן

---

*הערה כללית: כל תרחיש E2E שדורש מכשיר/סימולטור בפועל (iOS/Android) מתועד כאן בלבד — אין Detox/Maestro מוגדר בפרויקט. כל תרחיש שדורש גישה חיה ל-Supabase (RLS בפועל, storage policies, cron בפועל) מסומן בבירור למעלה ונדחה לסבב בדיקה נפרד עם גישת DB.*
