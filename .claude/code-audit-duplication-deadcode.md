# FleetOS — ביקורת כפילויות קוד וקוד מיותר (bundle size / dead code audit)

תאריך: 2026-08-25
היקף: כל הריפו למעט `node_modules/`, `.git/`, `graphify-out/`, `.claude/`.
שיטת עבודה: grep ממוקד לפי import/require, בדיקת App.tsx מול navigation/types.ts, השוואת package.json מול import statements בפועל.
**לא בוצע שום שינוי קוד** — קובץ זה בלבד נוצר.

## תמצית מנהלים

הקוד הבסיסי מאורגן היטב: יש כבר שכבת UI משותפת ב-`components/ui/index.tsx` (InfoRow, ExpiryBadge, EmptyState, Screen וכו') ו-util משותף ב-`lib/theme.ts` (`formatDate`, `expiryState`, `timeGreeting`) שבו כל 20+ המסכים משתמשים נכון — **אין** כפילות formatDate כפי שניחשנו מראש. הממצאים המשמעותיים ביותר הם: 2 תלויות npm שלא בשימוש בכלל בקוד, וכמה זוגות קומפוננטות/פונקציות כמעט-זהות שכדאי לאחד.

---

## 1. תלויות npm לא בשימוש (bundle size — חיסכון גדול יחסית)

| קטגוריה | path:line | תיאור | המלצה | חיסכון |
|---|---|---|---|---|
| npm dep מיותר | `package.json:24` (`expo-clipboard: ~8.0.8`) | אין אף `import`/`require` מ-`expo-clipboard` בכל קוד המקור (`screens/`, `components/`, `lib/`, `App.tsx`) | להסיר מ-`package.json` ולהריץ `npm install` מחדש | קטן–בינוני (native module, טוען קוד native בשתי הפלטפורמות) |
| npm dep מיותר | `package.json:33` (`expo-status-bar: ~3.0.9`) | אין שימוש ב-`<StatusBar>` או import מהחבילה בשום מקום, כולל `App.tsx` (שאינו מרנדר StatusBar בכלל) | להסיר מ-`package.json`, או להוסיף `<StatusBar>` ל-App.tsx אם ההעדר הוא באג ולא כוונה | קטן |

בדקתי גם את `react-native-webview`, `base64-arraybuffer`, `@react-native-community/datetimepicker`, `expo-file-system`, `expo-print`, `expo-sharing`, `expo-linear-gradient`, `expo-blur`, `expo-haptics`, `react-native-url-polyfill` — כולן בשימוש בפועל (חלקן דרך `require()` דינמי, כמו `react-native-webview` ב-`components/ui/SignatureAreaMarker.tsx:270`, ולא `import` רגיל — לכן חשוב לבדוק גם require לא רק import). `react-dom` נדרש ל-`react-native-web` (בשימוש עקיף, תקין להשאיר).

---

## 2. קוד כמעט-זהה שכדאי לאחד (code duplication)

| קטגוריה | path:line | תיאור | המלצה | חיסכון |
|---|---|---|---|---|
| קומפוננטה כפולה | `components/ui/NotificationBellButton.tsx:17-74` מול `components/ui/DriverMenuButton.tsx:24-89` (הפונקציה `DriverNotificationsButton`) | שתי קומפוננטות "פעמון התראות עם באדג'" כמעט זהות ב-100%: אותו `useFocusEffect` לרענון ספירה, אותו JSX, אותם styles (`badge`, `badgeRead`, `badgeText`, `button` עם אותם ערכים בדיוק). ההבדל היחיד: מקור הספירה (`countUnreadNotifications` מול `countUnreadDriverNotifications`) ויעד הניווט (`Notifications` מול `DriverNotifications`) | לחלץ hook משותף `useUnreadBadgeCount(countFn, dep)` + קומפוננטת `BellButton({ route, countFn })` גנרית ב-`components/ui/`, ולהשתמש בה משני המקומות | קטן (קוד, לא runtime — אך מפחית תחזוקה כפולה וסיכון לבאג פרייטים בין השניים) |
| קומפוננטה כמעט-כפולה | `components/ui/AdminMenuButton.tsx:10-18` מול `components/ui/DriverMenuButton.tsx:13-21` (`DriverMenuButton`) | שני כפתורי "תפריט" זהים במבנה (TouchableOpacity → navigate('Menu') → אייקון `person-circle-outline`), נבדלים רק בצבע רקע/גודל | לאחד לקומפוננטה אחת עם prop `variant: 'admin' \| 'driver'` או `color`/`size` | קטן |
| פונקציית utility כמעט-כפולה | `lib/documents.ts:66-80` (`pickFile`) מול `lib/documentsBroadcastApi.ts:120-143` (`pickTemplateFile`) | שתיהן עוטפות `DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true })` ומנרמלות את התוצאה לאותו shape (`uri`/`name`/`mimeType`). `pickTemplateFile` מוסיף בדיקת MIME/גודל קפדנית יותר | לחלץ helper בסיסי משותף (למשל `pickDocumentAsset(allowedTypes, opts)`) ב-`lib/` ולבנות את שתי הפונקציות עליו | קטן |
| שימוש לא-עקבי ב-util משותף | `lib/driverReport.ts:67` | `new Date().toLocaleDateString('he-IL')` נכתב ידנית, בעוד שכל שאר הקובץ (וכל שאר הריפו) כבר משתמשים ב-`formatDate` מ-`lib/theme.ts` | לשקול אחידות (לא חובה — כאן זה timestamp של "הופק בתאריך" ולא תאריך ישות, אז ההבדל עשוי להיות מכוון) | זניח |
| חזרה על תבנית `ActivityIndicator` | 24 מופעים ב-10 קבצים (`App.tsx`, `screens/SetPasswordScreen.tsx`, `components/ui/SignaturePad.tsx`, `components/ComplianceSection.tsx`, `screens/CompanyDetailScreen.tsx`, `screens/OwnerHomeScreen.tsx`, `components/ui/index.tsx`, `components/ui/SignatureAreaMarker.tsx`, `screens/admin/DocumentCategoryScreen.tsx`, `screens/admin/FleetScreen.tsx`) | תבנית loading-state (`<ActivityIndicator color={...} />`) חוזרת בקוד רבות, חלקה כבר עטופה ב-`Screen`/`EmptyState` ב-`components/ui/index.tsx` אך לא בכולן | לא קריטי ל-bundle size (זה קוד קיים ולא ספרייה); אפשר לשקול קומפוננטת `LoadingView` משותפת לעקביות עיצובית, לא לחיסכון משקל | זניח (זה שיפור קריאות/תחזוקה, לא bundle) |

**חשוב:** `formatDate`, `InfoRow`, `ExpiryBadge`, `EmptyState` **כבר** ממומשים פעם אחת ב-`lib/theme.ts` / `components/ui/index.tsx` ונצרכים נכון מ-15+ מקומות — נבדק במפורש ואין שם כפילות, למרות שזה נראה כמו קנדידט טבעי.

---

## 3. קוד מת / קבצים יתומים

**לא נמצא קוד מת בהיקף המסכים.** נבדקו כל שמונת המסכים החדשים שהוזכרו:

| מסך | מיובא ב-App.tsx | רשום ב-navigation/types.ts |
|---|---|---|
| `screens/MenuScreen.tsx` | כן (שורה 31, `Stack.Screen name="Menu"` שורה 85) | כן (`Menu: undefined` שורה 37) |
| `screens/NotificationPreferencesScreen.tsx` | כן (שורה 12, שורה 84) | כן (שורה 18) |
| `screens/driver/DriverNotificationsScreen.tsx` | כן (שורה 28, שורה 107) | כן (שורה 32) |
| `screens/driver/DriverSignDocumentScreen.tsx` | כן (שורה 30, שורה 109) | כן (שורה 34) |
| `screens/driver/DriverSignedDocumentsScreen.tsx` | כן (שורה 29, שורה 108) | כן (שורה 33) |
| `screens/admin/DocumentTemplatesScreen.tsx` | כן (שורה 22, שורה 99) | כן (שורה 25) |
| `screens/admin/DocumentTemplateDetailScreen.tsx` | כן (שורה 23, שורה 100) | כן (שורה 26) |
| `screens/admin/DriverSignedDocumentsAdminScreen.tsx` | כן (שורה 24, שורה 101) | כן (שורה 27) |

כולם מקושרים כראוי — אין מסכים "יתומים".

**קבצים שנמחקו (`screens/SettingsScreen.tsx`, `screens/driver/DriverDocumentsScreen.tsx`)**: נבדק grep גלובלי — אין שום `import` שבור אליהם בקוד האפליקציה (`App.tsx`, `screens/`, `components/`, `lib/`, `navigation/`). האזכורים היחידים שנותרו הם תיעודיים בלבד: `.claude/qa/test-plan.md:38-39` ו-`.claude/prds/documents-broadcast.md:24` — קבצי מסמכים, לא קוד, ולכן מחוץ להיקף הביקורת (`.claude/` הוחרג במפורש), אך אפשר לעדכן אותם בנפרד לניקיון תיעוד.

**exports לא בשימוש**: לא אותרו exports "יתומים" בסריקה — כל הפונקציות שנבדקו ב-`lib/documents.ts` ו-`lib/documentsBroadcastApi.ts` נצרכות ממסכים קיימים.

---

## 4. Assets

תיקיית `assets/` מכילה 4 קבצים בלבד, כולם קטנים ובשימוש (אייקוני האפליקציה הסטנדרטיים של Expo):
- `assets/icon.png` (24K)
- `assets/splash-icon.png` (20K)
- `assets/adaptive-icon.png` (20K)
- `assets/favicon.png` (4K)

אין כפילויות assets ואין קבצים כבדים/יתומים. לא נמצאו פונטים מקומיים (הפרויקט טוען `Assistant_400Regular`/`Assistant_700Bold` מ-`@expo-google-fonts/assistant`, שנצרך כראוי ב-`App.tsx:6,43`).

---

## 5. הערות/קוד מת בתוך קבצים בשימוש

נסרקו כל קבצי ה-`.ts`/`.tsx` לבלוקים של קוד מוער-החוצה (`// const`, `// import`, `// function`, `// return`, `// if(`, `// <Component`). **לא נמצא אף בלוק קוד מוער-החוצה** בכל הריפו — אין "זבל" מסוג זה לניקוי.

לא נמצאו גם טיפוסים/interfaces כפולים בעלי אותה משמעות שהוגדרו יותר מפעם אחת (נבדק במיוחד `lib/*.ts` עבור טיפוסי Props/Route חוזרים).

---

## המלצות מסודרות לפי עדיפות

1. **הסר `expo-clipboard` ו-`expo-status-bar` מ-`package.json`** (אם אכן לא מתוכננים לשימוש קרוב) — פעולה של 2 דקות, מפחיתה תלויות native מיותרות מה-bundle.
2. **אחד את `NotificationBellButton` ו-`DriverNotificationsButton`** לקומפוננטה/hook משותפים — מבטל ~50 שורות כפולות ומקור פוטנציאלי לבאגים כשמעדכנים אחד ושוכחים את השני.
3. **אחד את `pickFile`/`pickTemplateFile`** סביב helper משותף ל-`DocumentPicker` — מקטין שטח תחזוקה, לא bundle size.

שאר הממצאים (AdminMenuButton/DriverMenuButton, שימוש לא עקבי ב-toLocaleDateString, תבנית ActivityIndicator חוזרת) הם ניקיון קוד קל, לא משפיעים משמעותית על משקל האפליקציה.
