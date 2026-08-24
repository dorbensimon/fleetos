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
