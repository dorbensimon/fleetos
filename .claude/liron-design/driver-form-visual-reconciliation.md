# התאמת עיצוב — DriverFormScreen מול מפרט "מסך נהג חדש"

**שלב בתהליך:** 4. עיצוב (Design, ratification) + 6. מסירה (Handoff)
**תאריך:** 2026-09-01
**מקור המשימה:** בריף מרפאל, `.claude/rafael-ceremonies.md` → "Briefing — 2026-09-01 — DriverFormScreen לא תואם עיצוב"
**מבוסס על:** `lib/theme.ts` (מקור אמת יחיד לטוקנים — **לא הומצא טוקן חדש**, אלא היכן שמנומק בפירוש ומסומן ⚠️ להחלטה)
**מקור המפרט:** `C:\Users\dor59\Downloads\מפרט מסך נהג חדש.md`
**הקובץ שנבדק:** `screens/admin/DriverFormScreen.tsx` (הגרסה הנוכחית, שכתוב טרי לפי המפרט)

זהו **לא** מוקאפ חדש. זהו מסמך מיפוי 1:1: כל דרישה במפרט → טוקן/קומפוננטה שכבר קיימים בקוד בפועל, עם הפניה מדויקת לאיפה ב-`DriverFormScreen.tsx` הדבר צריך להשתנות. כל שורה מתויגת **UX** (זרימה/לוגיקה) או **UI** (חזותי) או שניהם.

---

## 0. הממצא המרכזי (לפני הפירוט)

`DriverFormScreen.tsx` הנוכחי **לא בנוי מרכיבי `components/ui`** בכלל (למעט `Screen`, `AppText`, `LoadingState`, `useToast` בשוליים) — הוא מייבא את כל ה-CSS-in-JS מהמפרט החיצוני `1:1` כולל צבעים אד-הוק (`rgba(14,30,43,...)`, `#8A5A00`, `#0A7FD0`...) שלא קיימים ב-`lib/theme.ts`, ובמקום זאת בונה מחדש שורות טופס, באדג'ים, כרטיסים וסוויץ' משלו — בזמן ש-`VehicleFormScreen.tsx` (אותו סוג מסך בדיוק, "טופס אדמין ליצירת ישות") עושה שימוש נקי ב-`Screen`/`Card`/`ScreenHeader`/`Field`/`Input`/`InputLtr`/`PrimaryButton`/`Select`. זו הסיבה השורשית לתקלה — לא רק "צבעים לא מתאימים" נקודתית.

**החלטת UX+UI מנחה לכל המסמך:** בכל מקום שבו מרכיב קיים (`components/ui`) יכול לשמש 1:1 — הוא ינוצח על מרכיב מקומי-חדש שהומצא בקובץ. במקומות שבהם המפרט דורש משהו שהטוקנים/הרכיבים הקיימים פשוט לא תומכים בו (גרדיאנט, צבע ירוק מדויק, שילוב label+input+checkmark בשורה אחת), אני מציגה 2 אופציות עם Trade-off ומסמנת החלטה פתוחה.

---

## 1. התנגשות הרקע/גרדיאנט — ⚠️ החלטה פתוחה לדור

| מקור | ערך |
|---|---|
| מפרט | `bg: #F1F4F7` + `accent-grad: linear-gradient(180deg,#3FA9E8,#0A7FD0)` על אווטאר ופס התקדמות |
| `lib/theme.ts` | `COLORS.screen = '#E4E4E4'`, הערת קוד מפורשת: "#0088CC is the ONLY accent colour" — אין הגדרת גרדיאנט כלל |
| **ממצא קוד חשוב** | `screens/admin/VehicleDetailScreen.tsx` (שורה 73, 93) **כבר משתמש בפועל** ב-`LinearGradient` עם `['#CFE7F5','#E4EFF6','#F1F4F7']` כרקע מסך שלם — כלומר יש כבר תקדים חי, מיוצר, שמפר את אותו כלל של `theme.ts` ומגיע כמעט לאותו יעד צבע (`#F1F4F7`) שהמפרט מבקש. |

**תיוג: UI (זהות חזותית) — משפיע גם על UX כי חוסר עקביות בין מסכי אדמין מבלבל.**

### אופציה A — נאמנות מלאה ל-`lib/theme.ts` (מומלצת כברירת מחדל הבטוחה)
- רקע מסך: `Screen` הקיים → `COLORS.screen` (`#E4E4E4`), בלי גרדיאנט.
- Header דביק: `COLORS.card` + `SUBTLE_SHADOW` (בדיוק כמו `ScreenHeader` הקיים ב-`components/ui/index.tsx:479-488`), **לא** `rgba(238,245,250,.95)` (שורה 594 בקובץ הנוכחי — ערך לא קיים בשום מקום ב-theme).
- **יתרון:** 0 טוקנים חדשים, 100% עקבי עם `FleetScreen`, `VehicleFormScreen`, `AdminDocumentSigningScreen`.
- **חיסרון:** מאבד את התחושה ה"תכולה-בהירה" של המפרט; לא תואם ל-`VehicleDetailScreen` שכבר קיים ומרגיש כרגע כ"יעד האמיתי" של המוצר.

### אופציה B — שימוש חוזר בגרדיאנט הקיים (לא המצאה, רק reuse) מ-`VehicleDetailScreen`
- רקע מסך בלבד (לא אווטאר, לא CTA, לא פס התקדמות — ראו סעיפים 2, 4, 6): `LinearGradient colors={['#CFE7F5','#E4EFF6','#F1F4F7']}` בדיוק כפי שמופיע כבר ב-`VehicleDetailScreen.tsx:73`. זו **אותה ערכת ערכים בדיוק**, לא גרדיאנט אד-הוק חדש.
- **יתרון:** מתקרב לכוונת המפרט (`#F1F4F7`), ועקבי עם המסך המקביל ביותר מבחינה תפקודית (רכב ⇄ נהג).
- **חיסרון:** גם זה סוטה מהכלל הכתוב ב-`theme.ts`, ומרחיב את התקדים הקיים (שתי חריגות במקום אחת). דורש גם ש-Header/Card ייבנו על "לבן על תכלת בהיר" ולא "לבן על אפור" — שינוי קטן לצל הכרטיסים (ראו סעיף 3).

**המלצתי:** אופציה A כברירת מחדל התחלתית — כי `DriverFormScreen` מוגדר במפורש ע"י `lib/theme.ts` כמסך אדמין רגיל (כמו Vehicle Form), לא כ"מסך הירו" ייעודי. אבל **זו החלטת מוצר, לא רק עיצוב** — אם דור/עידן רוצים ליישר את כל צי המסכים (`VehicleDetailScreen` + `DriverFormScreen`) לכיוון התכלת-הבהיר במכוון, כדאי לעשות זאת כעדכון מפורש ומתועד ל-`lib/theme.ts` (טוקן `COLORS.screenAlt` או דומה) ולא כחריגה שלישית-בשקט. **מבקשת החלטה מפורשת מדור לפני שמתן מטמיע.**

---

## 2. אווטאר ה-Hero (כרטיס זהות)

**תיוג: UI.**

| דרישת מפרט | מיקום נוכחי בקוד | מיפוי מומלץ |
|---|---|---|
| `accent-grad` (`#3FA9E8→#0A7FD0`), halo `rgba(63,169,232,.12)` | `DriverFormScreen.tsx:266-279` — `LinearGradient` אד-הוק, אין halo כלל | ראו למטה |

יש כבר **שני** מודלים תואמים-כמעט ("אווטאר הירו בגרדיאנט כחול") בקוד, שניהם **מפורשים כלא-לשימוש-חוזר**:
- `components/driverEdit/driverEditTheme.ts` → `DE_COLORS.avatarBlueLight/avatarBlueDeep` — "Deliberately separate... do not reuse these tokens elsewhere."
- `components/driverCard/driverCardTheme.ts` → `DC_COLORS.blueLight/blueDeep` (`#0A84FF`/`#0060DF`), בשימוש ב-`DriverHero.tsx` — גם הוא: "Deliberately separate... Do not reuse these tokens elsewhere."

כלומר: **אסור** למתן להעתיק את ערכי ה-Hex משני הקבצים האלה ישירות (זו חריגה מפורשת בקוד עצמו), גם אם ויזואלית הם הכי קרובים למה שהמפרט מבקש.

### המלצה מיידית (0 טוקנים חדשים)
אווטאר שטוח: עיגול 70px `backgroundColor: COLORS.accent` (ללא גרדיאנט), אייקון `person` לבן במרכז — תואם ישירות את כלל "#0088CC is the ONLY accent colour". ה"באדג' +" (26px, לבן על `COLORS.accent`) נשאר כפי שהוא כבר בקוד (שורה 276-278) — כבר תואם.

### ⚠️ אופציה חלופה (דורשת אישור בעל theme.ts, לא רק שלי)
אם דור רוצה לשמר את מראה ה"זוהר הכחול" של ה-Hero (יש לזה כבר תקדים כפול — פירושו שזה דפוס מוצרי מוכר, לא קפריזה של המפרט): להוסיף ל-`lib/theme.ts` טוקן **חדש, משותף ומוצהר** (למשל `COLORS.heroGradient: ['#3FA9E8', '#0A7FD0'] as const`), בניגוד לשני הטוקנים ה"פרטיים" הקיימים — כדי שהפעם הוא *יהיה* מיועד ל-reuse עתידי (Driver Form + Vehicle Detail + כל "הירו" עתידי), במקום ליצור העתק שלישי מבודד. זו תוספת טוקן קטנה שאני יכולה להצדיק (יש כבר 2 תקדימים לאותו קונספט), אבל **שינוי ל-`theme.ts` עצמו הוא לא בסמכותי לבצע** — מעביר להחלטת דור/מיקה.

---

## 3. צל הכרטיסים

**תיוג: UI.**

| דרישת מפרט | ערך | קוד נוכחי | מיפוי |
|---|---|---|---|
| צל כרטיס | `0 10px 26px -18px rgba(20,60,90,.45)` | `DriverFormScreen.tsx:647-652` — `require('react-native').StyleSheet.create(...)` בתוך `StyleSheet.create` הראשי (hack זמני, לא תבנית תקנית בקוד הזה) | **`Card` הקיים מ-`components/ui`, שכבר עוטף `CARD_SHADOW`** (`lib/theme.ts:47-53`: `shadowOpacity:0.1, shadowRadius:24, offset(0,8), elevation:6`) |

`CARD_SHADOW` הוא כבר בשימוש בכל כרטיס אדמין אחר (`VehicleFormScreen`, `FleetScreen` וכו') — **אין סיבה טכנית או ויזואלית** לשמר את ה-`require()` הפנימי בקובץ. הפרש הצבע (שחור טהור מול `rgba(20,60,90,.45)` הכחלחל של המפרט) הוא זניח בפועל ב-iOS/Android — לא מצדיק טוקן חדש.

**פעולה למתן:** להחליף את כל 3 המופעים המקומיים של אותו hack (`styles.card`, `styles.licenseCardSelected`, `styles.cta` — שלושתם קוראים לאותו `require()` בנפרד) ברכיב `Card` עצמו + `CARD_SHADOW`/הרחבותיו (ראו סעיף 5 לגבי הצל הכחול הספציפי של ה-CTA/הצ'יפ הנבחר).

---

## 4. ה-CTA הצף (Footer)

**תיוג: UX (מיפוי הלוגיקה של active/disabled) + UI.**

### הכפתור עצמו
| מפרט | קוד נוכחי | מיפוי |
|---|---|---|
| מלא → רקע accent, טקסט לבן | `TouchableOpacity` מקומי (`styles.cta`, שורה 725-734) | **`PrimaryButton`** מ-`components/ui` — יש לו כבר בדיוק את זה (`backgroundColor: COLORS.accent`, `styles.primaryBtnText` לבן) |
| ריק → רקע `fill`, טקסט `rgba(14,30,43,.35)` | `!canSubmit && { backgroundColor: COLORS.neutralBg }` (שורה 488) + `COLORS.textMuted` | ⚠️ **זו לא התנהגות ה-`disabled` הקיימת של `PrimaryButton`!** ראו למטה |

**⚠️ ממצא חשוב — שתי שפות "disabled" שונות קיימות במקביל:**
`PrimaryButton` הקיים מטפל ב-`disabled` ע"י **דהייה (opacity 0.6) על אותו כפתור accent** (`components/ui/index.tsx:138-139`, `styles.btnDisabled`) — זה מה שקורה בכל טופס אחר באפליקציה (`VehicleFormScreen` למשל). המפרט דורש **החלפת צבע מלאה** לאפור-נייטרלי (`fill`) + טקסט מושתק — שפה חזותית שונה לגמרי (יותר אינפורמטיבית: "עדיין לא מוכן" ולא רק "עמום"). שתי הגישות תקפות; אלה **לא אותו component behavior**.

**המלצה (UX):** לשמר את שפת ה-disabled *הספציפית* של המפרט כאן (Swap צבע, לא opacity) — כי זהו ה-CTA הראשי היחיד במסך שמלווה פס התקדמות חי, וההבדל הצבעוני עוזר למשתמש להבחין "עוד לא סיימתי" בבירור. **אך** לבצע את זה כ-style override על גבי `PrimaryButton` הקיים (העברת `style` עם `backgroundColor: COLORS.neutralBg` ו-`disabled` שמכבה גם spinner/loading העתידי), **לא** ליצור `TouchableOpacity` מפוזר מחדש. כך שומרים על ה-component (מבנה, `activeOpacity`, `accessibilityRole`) ורק על הצבע יש חריגה מתועדת.
- רקע ריק: **`COLORS.neutralBg`** (`#EFEFEF`, כבר בקוד הנוכחי — נכון!) — לא `fill` אד-הוק חדש.
- טקסט ריק: **`COLORS.textMuted`** (כבר בקוד — נכון, קרוב ל-`rgba(14,30,43,.35)` מהמפרט מספיק).
- כיתוב עזר מתחת (`הנהג יתווסף לצי...` / `נותרו N שדות`): `AppText` עם `TYPO.caption`/`bodyMuted` — **אין** לזה שדה קיים ב-`PrimaryButton`, זה טקסט צמוד מתחתיו (סביר וקיים כבר, שורה 503-507).

### הצל הכחול הפעיל
מפרט: `0 16px 30px -12px rgba(0,136,204,.65)`. קוד נוכחי (שורה 733): `shadowColor:'#0088CC', opacity:.65, radius:30, offset(0,16), elevation:8` — **זהה כמעט ל-100% למפרט, וכבר משתמש ב-`COLORS.accent` הנכון בערכו הגולמי.** הבעיה היחידה: זה כתוב פעמיים בקובץ (גם על `licenseCardSelected` בסעיף 5) בתור `require()` inline זהה, ולא כטוקן.

### ⚠️ הצעת טוקן קטנה, מנומקת (לא אד-הוק)
מציעה תוספת יחידה ועקבית ל-`lib/theme.ts`, באותה משפחה כמו `CARD_SHADOW`/`SUBTLE_SHADOW` הקיימים:
```
export const ACCENT_SHADOW = { shadowColor: COLORS.accent, shadowOpacity: 0.65, shadowRadius: 30, shadowOffset: { width: 0, height: 16 }, elevation: 8 } as const;
```
**נימוק:** הערך הזה כבר מופיע פעמיים בקובץ, הוא כבר משתמש בצבע ה-accent הרשמי (לא צבע נוסף), והוא תואם דפוס טוקן קיים ב-100% (סתם עוד "shadow preset" לצד השניים שכבר קיימים). זו לא פלטה חדשה — זו הפשטה (DRY) לערך שממילא כבר קיים פעמיים בקוד הנוכחי. **מעבירה להחלטת דור/מיקה** כי נגיעה ב-`lib/theme.ts` היא לא בסמכותי.

---

## 5. מצב-נבחר בקרוסלת דרגת הרישיון

**תיוג: UI + UX (הבחנה ברורה בין מצבים).**

| מצב | מפרט | קוד נוכחי (`DriverFormScreen.tsx:359-379`) | מיפוי |
|---|---|---|---|
| לא נבחר | `fill` + `text` | `rgba(118,118,128,.10)` (שורה 682) — ערך אד-הוק, לא ב-theme | **`COLORS.neutralBg`** (`#EFEFEF`) — אותו טוקן "ניטרלי" שכבר משמש ל-badge/CTA disabled במסך הזה עצמו; שומר על שפה אחידה של "לא פעיל" בתוך אותו מסך |
| נבחר | `accent` + לבן + `scale(1.04)` + צל accent | `COLORS.accent` + לבן (נכון!) + **חסר `scale(1.04)`** + צל דרך `require()` inline | הוסיפו `transform: [{ scale: 1.04 }]` לסטייל המצב הנבחר (מותר מפורשות ע"י המפרט — "רק transform/opacity/width"); הצל → `ACCENT_SHADOW` המוצע בסעיף 4 (אותו ערך בדיוק) |
| כיתוב משני לא נבחר | `text` @ opacity .72 | `rgba(14,30,43,.72)` (שורה 690) | **`COLORS.textMuted`** (קרוב מספיק; נמנעים מ-rgba חדש שמבוסס על צבע-דיו שלא קיים ב-theme) |

### ⚠️ ממצא תוכן (לא ויזואלי, אבל משפיע ישירות על הקרוסלה הזו — דורש הכרעת עידן/דור)
המפרט מגדיר 7 דרגות בלבד: `B, C1, C, D, E, A, 1`. הדאטה האמיתי באפליקציה (`lib/driverFields.ts:3-17`, `LICENSE_CLASS_OPTIONS`) כולל **13** ערכים אמיתיים (`A2, A1, A, B, C1, C, C+E, D1, D2, D3, D, 1, PERMIT`) וללא ערך `E` עצמאי כלל (הקרוב ביותר הוא `C+E`). מימוש 1:1 של המפרט "כמו שהוא" ישמיט בשקט 6 דרגות רישיון אמיתיות שקיימות היום בעריכת נהג — זו לא סוגיית טוקן, אבל היא תלווה כל שינוי בקרוסלה הזו. **לא בסמכותי להכריע (זה scope/דאטה, לא עיצוב) — מסמנת כדי שמתן לא "יגלה" את זה תוך כדי קידוד.**

---

## 6. פס ההתקדמות

**תיוג: UI + UX (המשוב על ההתקדמות חייב לקרוא ברור).**

| מפרט | קוד נוכחי (שורה 616-618) | מיפוי |
|---|---|---|
| מילוי `accent-grad` | `backgroundColor: '#0A7FD0'` — **לא `COLORS.accent`, ולא גרדיאנט** — ערך שלישי, לא-מתועד, לא-שווה לאף טוקן קיים | **`COLORS.accent`** (`#0088CC`), שטוח |

זהו התיקון הכי "חינמי" בכל המסמך: זה לא ויכוח גרדיאנט מול לא-גרדיאנט — זה פשוט באג צבע: `#0A7FD0` הוא לא ה-accent הרשמי של המוצר (`#0088CC`) וגם לא ה-`accent-grad` המלא של המפרט; הוא ערך-ביניים שאף אחד לא הגדיר בכוונה. יש להחליפו ב-`COLORS.accent` בין אם מתקבלת אופציה A או B בסעיף 1.
- מסלול (`rgba(14,30,43,.09)`, שורה 611) → **`COLORS.divider`** (`#ECECEC`) או `COLORS.fieldBorder` (`#E2E2E2`) — קרוב מספיק ברמת ניגודיות, בלי ערך אד-הוק.
- מונה `n/7` — כבר טקסט רגיל, למפות ל-`TYPO.label`/`caption` עם `COLORS.text`.

---

## 7. שורות "פרטים אישיים"/"רישיון"/"גישה" — Field vs. שורת-Settings

**תיוג: UX (איך ממלאים שדה) + UI (הצפיפות/המראה).**

זו החלטת המבנה החשובה ביותר במסמך הזה, כי היא לא רק "צבע לא נכון" — היא שתי שפות רכיב שונות:

- **הרכיב הקיים** `Field` + `Input`/`InputLtr` (`components/ui/index.tsx:182-227`, בשימוש ב-`VehicleFormScreen`): תווית **מעל** השדה, קופסת קלט מלאה ברוחב (גובה 48, `COLORS.field` רקע, `COLORS.fieldBorder` מסגרת) — מראה "טופס אנכי" קלאסי.
- **מה שהמפרט מבקש**: תווית **בעמודה קבועה 88px לצד** הערך, בלי תיבת-קלט נפרדת (הערך "צף" בתוך השורה), עם וי ירוק כשמלא — מראה "iOS Settings list" קומפקטי. זה בדיוק מה שהפונקציה המקומית `FormRow` (שורה 568-589 בקובץ הנוכחי) כבר מנסה לעשות — רק עם ערכי צבע אד-הוק (`COLORS.okText` לוי הירוק כן תקין, אבל השאר לא).

### אופציה A — reuse מלא של `Field`/`Input`/`InputLtr`
מסך ייראה כמו `VehicleFormScreen` (טופס אנכי רגיל). **אפס רכיבים חדשים.** מאבד: וי-השלמה בשורה, הצפיפות של iOS Settings, היישור ל-88px.

### אופציה B — לשדרג את `FormRow` המקומי לרכיב משותף חדש וקטן
לקחת בדיוק את `FormRow` הקיים (הלוגיקה שלו כבר נכונה!) ולנקות רק את הצבעים שלו לטוקנים אמיתיים:
| ב-`FormRow` היום | להחליף ב- |
|---|---|
| `borderBottomColor: 'rgba(14,30,43,.07)'` (שורה 659-660) | `COLORS.divider` |
| `label: { color: COLORS.text }` (שורה 664) — כבר נכון | ללא שינוי |
| `Ionicons checkmark color={COLORS.okText}` (שורה 584) — כבר נכון | ללא שינוי |
| `styles.input` בלי רקע/מסגרת מוגדרים דרך theme (שורה 667) | להשאיר שקוף (השורה עצמה מספקת את הרקע של הכרטיס — זה תקין ומכוון, לא צריך `COLORS.field`) |

**המלצתי: אופציה B.** ה"נזק" קטן (מדובר בקידוד-מחדש של רכיב קיים בקובץ אחד ל-tokens בלבד, לא רכיב חדש-חדש), והוא היחיד ששומר על זהות ה-mockup שדור אישר. אם דור מעדיף אחידות טוטאלית מול `VehicleFormScreen` — עדיפה אופציה A, אך זו סטייה מהמפרט שדור אישר, ולכן **מסמנת כהחלטה פתוחה קלה** (בניגוד לסעיפים 1/2/4 — כאן הסיכון נמוך יותר כי זה לא נוגע ב-theme.ts כלל).

### שדה "מחלקה" — ממצא reuse ישיר, בלי צורך בהחלטה
המפרט: "readOnly + chevron; פותח action sheet". `VehicleFormScreen.tsx:320-328` **כבר פותר בדיוק את זה** עבור אותו שדה בדיוק (`מחלקה`) דרך רכיב `Select` (`components/ui/Select.tsx`) — כולל `BlurView` (מותקן כבר, `expo-blur`), אנימציית bottom-sheet, ו-`CARD_SHADOW`. `DriverFormScreen.tsx` הנוכחי בונה `pickerOverlay`/`pickerContent` מקומי משלו (שורה 521-552) — כפילות מיותרת. **פעולה למתן: להחליף לגמרי ב-`<Select>` הקיים**, בדיוק כפי שמופיע כבר ב-`VehicleFormScreen` לאותו שדה. אין כאן שום החלטת עיצוב פתוחה.

### תיבת "בחר תאריך" (accent-soft)
מפרט: `accent-soft` = `rgba(0,136,204,.10)`. `lib/theme.ts`: `COLORS.accentSoft = 'rgba(0, 136, 204, 0.10)'` — **זהה ב-100%, כבר בשימוש נכון בקוד הנוכחי** (שורה 672). ✅ אין צורך בשינוי.

### תיבת התזכורת הצהובה
מפרט: `warn-bg/warn-fg` = `rgba(240,166,30,.12)` / `#8A5A00`. `lib/theme.ts`: `COLORS.warnBg = '#FDF3E2'`, `COLORS.warnText = '#A9720F'` — **אותו סלוט סמנטי בדיוק** (המפרט מגיע מ-mockup גולמי, לא מ-theme; ההבדל בגוון זניח). קוד נוכחי (שורה 699, 702) משתמש בערכים הגולמיים במקום בטוקן — **פעולה למתן:** להחליף ל-`COLORS.warnBg`/`COLORS.warnText`.

---

## 8. מתג "שלח הזמנה ב-SMS"

**תיוג: UX (נגישות + זרימת מצב) + UI (צבע/מנגנון).**

זהו הממצא הכי משמעותי מבחינת נגישות: המתג הנוכחי (`DriverFormScreen.tsx:460-476`) הוא `TouchableOpacity` + `Animated.View` **בלי שום** `accessibilityRole`, `accessibilityState`, בעוד שהמפרט **דורש במפורש** `role="switch"` + `aria-checked` (סעיף "הנחיות מימוש", שורה 105).

הרכיב הקיים `ToggleRow` (`components/ui/index.tsx:409-443`, בשימוש כבר במסך ההתראות) **כבר עושה בדיוק את זה נכון**: `Switch` native (מטפל אוטומטית ב-RTL, בלי חישובי `translateX(-20)` ידניים שהמפרט צריך לתאר במפורש רק כי HTML/CSS לא native), `accessibilityRole="switch"`, `accessibilityState={{checked: value}}`, וגם כבר תומך במבנה `label + description` שהמפרט מבקש (`שלח הזמנה ב-SMS` + `הנהג יקבל קישור...`).

**הבעיה היחידה:** `ToggleRow` הקיים קובע `trackColor.true = COLORS.accent` (כחול) — המפרט מבקש ירוק (`success: #30A46C`), וזה גם מה שהקוד הנוכחי כבר עושה נכון באופן חלקי (`styles.toggleOn: { backgroundColor: COLORS.okText }`, שורה 716 — ירוק אמיתי מה-theme, לא צבע אד-הוק!). ל-`theme.ts` אין ערך זהה ל-`#30A46C`, אבל יש לו כבר סמנטיקה מקבילה: **`COLORS.okText`** (`#5C8A6E`, "success/positive" בכל מקום אחר באפליקציה, כמו ב-`EXPIRY_STYLE.ok`).

### ⚠️ החלטה קטנה נדרשת (לא מ-theme.ts, מ-`ToggleRow` עצמו)
| אופציה | תיאור | Trade-off |
|---|---|---|
| A | להוסיף ל-`ToggleRow` פרמטר אופציונלי חדש, למשל `tone?: 'accent' \| 'success'`, שקובע `trackColor.true` (`COLORS.accent` ברירת מחדל / `COLORS.okText` כשנדרש) | תוספת קטנה, מנומקת (אין שינוי לטוקנים, רק חשיפת ברירה קיימת) לרכיב קיים; שומרת על reuse מלא של הנגישות/RTL/מבנה |
| B | לא לגעת ב-`ToggleRow` המשותף; לבנות בשורת ה-SMS `Switch` native עצמאי (לא TouchableOpacity+Animated) עם `trackColor={{false: COLORS.fieldBorder, true: COLORS.okText}}`, בהשראת מבנה `ToggleRow` בלי לשנות אותו | 0 נגיעה ברכיב המשותף, אבל כפילות קוד קטנה בין שני מקומות שכמעט זהים |

**המלצתי: אופציה A** — זו בדיוק סוג התוספת ה"קטנה ועקבית" שהבריף מתיר (לא פלטה חדשה, רק חשיפת פרמטר על גבי טוקן קיים). דורשת גע קטן בקומפוננטה משותפת, ולכן מסמנת ⚠️ להחלטת דור/מיקה לפני שמתן מיישם.

---

## 9. Toast

**תיוג: UI.**

`useToast()`/`ToastProvider` (`components/ui/Toast.tsx`) **כבר תואם כמעט לגמרי** למפרט: פיל כהה תחתון-מרכזי, טקסט לבן, מוסתר אוטומטית (2000ms קוד קיים מול 1900ms במפרט — הפרש זניח, לא דורש שינוי). כבר מחובר ב-`DriverFormScreen.tsx:201` להצלחה (`showToast('הנהג נוצר בהצלחה')`). **אין פעולה נדרשת**, מלבד לוודא (לא עיצוב, הערה ל-UX flow בלבד) שהודעת הכישלון "יש להשלים את שדות החובה" תיקרא רק אם אכן קיים נתיב הגשה שמגיע ל-inputs לא-תקינים (כרגע ה-CTA disabled חוסם את זה מראש — לוגיקה, לא עיצוב, מציינת רק שלא "נשכח").

---

## סיכום טוקנים בשימוש (מ-`lib/theme.ts`, אלא אם מסומן ⚠️)

`COLORS.screen`, `COLORS.card`, `COLORS.accent`, `COLORS.accentSoft`, `COLORS.text`, `COLORS.textMuted`, `COLORS.textFaint`, `COLORS.neutralBg`, `COLORS.divider`, `COLORS.fieldBorder`, `COLORS.field`, `COLORS.okText`, `COLORS.warnBg`, `COLORS.warnText`, `RADIUS.lg/md`, `SPACING.lg/md/xs`, `TYPO.caption/label/bodyMuted`, `CARD_SHADOW`, `SUBTLE_SHADOW`.

רכיבים קיימים ל-reuse: `Screen`, `Card`, `ScreenHeader` (בהשראתו — לא ישירות, כי מבנה הכותרת שונה), `PrimaryButton`, `Field`, `Input`, `InputLtr`, `Select`, `ToggleRow`, `useToast`/`ToastProvider`, `AppText`, `LoadingState`. דפוס נוסף לאימוץ (לא component מיובא, אלא טכניקה): `BlurView` מ-`expo-blur` (בשימוש כבר ב-`AdminGlassHeader`, `Select`) עבור ה-Header הדביק, במקום רקע `rgba` שטוח קבוע.

⚠️ תוספות טוקן קטנות שהוצעו, ממתינות לאישור דור/מיקה (לא בוצעו על ידי):
1. `ACCENT_SHADOW` חדש ב-`lib/theme.ts` (סעיף 4) — הפשטת ערך שכבר קיים פעמיים בקובץ.
2. `tone` אופציונלי ל-`ToggleRow` הקיים (סעיף 8) — כדי לתמוך גם בירוק (`COLORS.okText`) וגם בכחול (`COLORS.accent`).
3. `COLORS.heroGradient` אופציונלי (סעיף 2) — רק אם דור בוחר לשמר את מראה הגרדיאנט להירו, לאור שני התקדימים הקיימים (`DE_COLORS`, `DC_COLORS`) שמפורשים כ-do-not-reuse.

---

## החלטות שדורשות קלט מדור (סיכום)

1. **רקע המסך** (סעיף 1): `COLORS.screen` שטוח (A) או reuse של גרדיאנט `VehicleDetailScreen` (B)? — משפיע גם על Header/Card.
2. **אווטאר ה-Hero** (סעיף 2): שטוח ב-`COLORS.accent` (מיידי) או טוקן גרדיאנט חדש-ומשותף (`COLORS.heroGradient`)?
3. **תוספת `ACCENT_SHADOW`** ל-theme.ts (סעיף 4) — אישור להוספה, או להשאיר כ-inline חוזר?
4. **מבנה שורות הטופס** (סעיף 7): שדרוג `FormRow` המקומי לטוקנים (B, מומלץ) מול מעבר מלא ל-`Field`/`Input` הקיים (A, פחות נאמן למפרט)?
5. **פרמטר `tone` ל-`ToggleRow`** (סעיף 8) — אישור להרחבת הרכיב המשותף.
6. **דרגות רישיון בקרוסלה** (סעיף 5) — 7 הדרגות של המפרט בלבד, או 13 הדרגות האמיתיות מ-`LICENSE_CLASS_OPTIONS`? (זו לא שאלה שלי להכריע — מעבירה לעידן/דור.)

---

**מה לא נגעתי בו:** קוד, `.tsx`, `lib/theme.ts` עצמו. כל הצעה לשינוי ב-`theme.ts` או ברכיב משותף (`ToggleRow`) מסומנת ⚠️ ומחכה לאישור לפני שמתן מיישם.
