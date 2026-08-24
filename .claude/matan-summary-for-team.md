# ביקורת Frontend — מתן (24/08/2026)

## ממצאים עיקריים

1. **אין Error State בכל האפליקציה.** `components/ui/index.tsx` מכיל `LoadingState` ו-`EmptyState` בלבד — אין `ErrorState` משותף. כמעט כל מסכי הפרטים (`VehicleDetailScreen`, `DriverDetailScreen`, `CompanyDetailScreen` ועוד) קוראים ל-`load()` בתוך `useFocusEffect` **בלי `try/catch`**. אם קריאת Supabase נכשלת (רשת/הרשאות), החריגה נבלעת בשקט, ה-state נשאר `null`, וה-UI מציג "הרכב לא נמצא" — הודעה מטעה שמזהה כשל רשת כאילו הרשומה לא קיימת. יש לעטוף כל `load()` ב-try/catch ולהוסיף `ErrorState` עם כפתור נסיון חוזר.
2. **`CompanyContext` (`lib/CompanyContext.tsx`) מתעלם משגיאות Supabase לחלוטין** — `const { data } = await supabase...` בלי לבדוק `error`. אם טעינת הפרופיל/חברה נכשלת, המשתמש נתקע במסך טעינה או מקבל מסך ריק ללא כל אינדיקציה.
3. **נגישות (a11y): 0 שימושים ב-`accessibilityLabel`/`accessibilityRole` בכל קוד האפליקציה** (בדקתי גם `components/ui`, גם המסכים) — כפתורי אייקון בלבד (חיוג, חזרה, עריכה, מחיקת שיוך, פעמון התראות) חסרי תווית לקוראי מסך. זו בעיה שיטתית ולא נקודתית; הכי יעיל לתקן ב-`PrimaryButton`/`SecondaryButton`/כפתורי אייקון ב-`components/ui` כדי שהתיקון יתפשט לכל המסכים.
4. **`FleetScreen.tsx`** (972 שורות, הכי גדול במסכי admin): שני ה-`FlatList` (נהגים ורכבים) תמיד "עולים" יחד לזיכרון ומוצגים ב-crossfade (`pointerEvents` בלבד קובע איזה פעיל) — עיצוב UX מכוון, אך משמעו שרשימה לא פעילה עדיין נטענת ומוצגת ברקע. עם צי גדול (מאות רכבים/נהגים) זה עומס render כפול. מומלץ לעקוב אם יתעורר lag בפועל; אם כן — לשקול lazy-mount לרשימה הלא פעילה או virtualization agresivi יותר (`windowSize`/`initialNumToRender`).
5. **`useFocusEffect` ב-`FleetScreen` טוען מחדש נהגים+רכבים בכל פוקוס**, כולל בעת חזרה ממסך פרטים ללא שינוי בפועל — לא קריטי אך מייצר קריאות Supabase מיותרות בניווט אינטנסיבי.
6. **תמונות מרוחקות (`Image` מ-`react-native` הרגיל, לא `expo-image`)** — לוגו חברה נטען ב-`CompanyDetailScreen`/`OwnerHomeScreen`/`LoginScreen` בלי caching, placeholder, או טיפול בכשל טעינה. `expo-image` (מותקן כברירת מחדל ב-Expo SDK, יש לבדוק גרסה) נותן caching+placeholder בחינם — המלצה, לא משהו שביצעתי (תלות חדשה טעונה אישור אם עדיין לא מותקנת).
7. **State ניהול תקין להיקף הפרויקט** — Context מצומצם (`CompanyProvider`) + local state בכל מסך, אין over-engineering, אין צורך ב-Redux/Zustand בשלב הזה.
8. נמצאו כפתורי `TouchableOpacity` מקוננים זה בתוך זה (`VehicleDetailScreen` – שורת נהג משויך: כפתור מחיקה בתוך כרטיס לחיץ) — עובד נכון בפועל (RN responder system), אך לא עקבי עם דפוס `e.stopPropagation()` שמופיע במקומות אחרים (`FleetScreen` כפתור חיוג) — כדאי לאחד דפוס.

## סיכום
לא בדקתי RLS/Edge Functions (תחום רועי) ולא כפלתי ממצאי UI/UX של לירון. הפער המשמעותי ביותר: **אין states של שגיאה בכלל** באפליקציה — כל כשל Supabase מוצג כ"ריק"/"לא נמצא" במקום הודעת שגיאה אמיתית עם retry. שנייה בחשיבות: **נגישות אפסית** לקוראי מסך על כל כפתורי אייקון. שתי הבעיות הן שיטתיות ומרוכזות ב-`components/ui` — תיקון שם ישפיע על כל המסכים במכה אחת.

## עדכון (24/08/2026) — בוצע על ידי מתן, לפי משימה 1.5 מ-idan-final-plan.md

1. **`components/ui/index.tsx`** — נוסף `ErrorState` חדש, לצד `LoadingState`/`EmptyState` הקיימים: אייקון שגיאה, כותרת, hint וכפתור "נסה שוב" (`onRetry`) עם `accessibilityRole="button"`/`accessibilityLabel`. עקבי עם `lib/theme.ts` (COLORS/RADIUS/SPACING).
2. **שורש הבעיה האמיתי אותר ותוקן ב-`lib/adminApi.ts`, לא רק במסכים:** `getVehicle` ו-`getDriver` בלעו כל שגיאת Supabase (`if (error) return null`) ללא הבחנה בין "לא נמצא" (PGRST116 — legitimate) לבין כשל רשת/RLS אמיתי. תוקן: עכשיו רק PGRST116 (no rows) מחזיר `null`; כל שגיאה אחרת נזרקת (`throw`) כדי שהמסכים יוכלו לתפוס אותה בפועל. **בלי התיקון הזה, עטיפת ה-`load()` במסכים בטרייקאץ' בלבד לא הייתה עוזרת — השגיאה נבלעה עוד לפני שהגיעה למסך.**
3. **`screens/admin/VehicleDetailScreen.tsx`** — `load()` בתוך `useFocusEffect` עטוף ב-try/catch, `loadError` state חדש, מסך `ErrorState` עם retry לפני הבדיקה של "הרכב לא נמצא" (כך שכשל אמיתי לא מוצג יותר כאילו הרכב לא קיים).
4. **`screens/admin/DriverDetailScreen.tsx`** — אותו תיקון: `load()` מופק לפונקציה נפרדת עם try/catch, `loadError` state, `ErrorState` עם retry מוצג לפני התוכן.
5. **`screens/admin/DriverPersonalDetailsScreen.tsx`** — אותו דפוס: `loadError` state, `ErrorState` עם retry.
6. **`lib/CompanyContext.tsx`** — שלוש הקריאות (`auth.getUser`, `profiles`, `companies`) עוטפות עכשיו ב-try/catch עם בדיקת `error` בכל אחת (היו מתעלמות לגמרי). נוסף שדה `error: string | null` ל-`CompanyContextValue` כדי שמסכים שצורכים את ה-context יוכלו להציג `ErrorState` בעצמם (עדיין לא צרכתי את זה במסכים ספציפיים מעבר לאלה שלמעלה — ראו "לא בוצע" למטה).

### לא בוצע במסגרת הסבב הזה (מחוץ להיקף שסומן)
- **`FleetScreen.tsx`** — לא נגעתי. הוא לא צורך `error`/`loading` מ-`useCompany()` כרגע (יש לו state טעינה נפרד לרשימות עצמן); הוספת `ErrorState` שם דורשת גם לצרוך את שדה ה-`error` החדש מה-context וגם לעטוף את קריאות ה-list המקומיות. השארתי בכוונה כדי לא לחרוג מההיקף שסומן במשימה (VehicleDetail/DriverDetail ומסכים דומים) — מומלץ כפריט המשך קטן.
- **`screens/CompanyDetailScreen.tsx`** — לא נגעתי. הוא כבר off-theme (פלטת צבעים מקומית משלו, לא `lib/theme.ts`) ומתוזמן ב-idan-final-plan.md תחת 3.1 ("מסכי Owner + LoginScreen ל-theme אחיד") **אחרי** מסלול 3 של vehicle_drivers — נגיעה חלקית עכשיו רק ב-error handling הייתה יוצרת שני מגעים נפרדים באותו קובץ בפער זמן קצר, בניגוד להמלצת התוכנית.
- שדה `error` החדש ב-`CompanyContext` עדיין לא נצרך בשום מסך (`useCompany().error`) — הוא זמין לשימוש עתידי, אבל לא יצרתי עדיין UI שמציג אותו במסך כלשהו מעבר לתיקון הבליעה עצמו.

### קבצים ששונו
`components/ui/index.tsx`, `lib/adminApi.ts`, `lib/CompanyContext.tsx`, `screens/admin/VehicleDetailScreen.tsx`, `screens/admin/DriverDetailScreen.tsx`, `screens/admin/DriverPersonalDetailsScreen.tsx`.

`npx tsc --noEmit` רץ נקי אחרי כל השינויים.
