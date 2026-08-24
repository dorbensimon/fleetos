# ביקורת DevOps / תשתית — FleetOS
תאריך: 2026-08-24
מבצע: דניאל (DevOps/Infra)
היקף: CI/CD, ניהול Build, ניטור, גיבוי/DR, אבטחת תשתית (secrets/env). ללא גישה חיה ל-DB.

---

## 0. מתודולוגיה
נבדקו בפועל (Read/Glob/Grep, לא הנחות): `package.json`, `app.json`, שורש הריפו, `.gitignore`, `lib/supabase.ts`,
`supabase/functions/**`, `supabase/sql/**`, `git ls-files` (למה שבאמת מגורסן ב-git, לא רק מה שקיים על הדיסק).

---

## 1. CI/CD — לא קיים בפועל

- **אין תיקיית `.github/workflows`** בריפו כלל (לא ב-git, לא על הדיסק). אין שום צנרת אוטומטית שרצה על PR/push.
- **`package.json` לא מכיל סקריפטים ל-lint / typecheck / test.** יש רק `start`, `android`, `ios`, `web`. גם אם היה
  נוצר workflow — אין כרגע מה להריץ בו (`tsc --noEmit`, ESLint, Jest וכו' לא מוגדרים כ-script). זה תלוי בהחלטת
  הצוות על סטנדרט lint/test (לא שלי להחליט מה הכללים — אבל אני ממליץ להוסיף `"typecheck": "tsc --noEmit"` לפחות,
  כבסיס מינימלי ל-CI עתידי).
- **אין `eas.json`** בשורש הריפו. כלומר אין כרגע פרופילי build (`development`/`preview`/`production`) מוגדרים
  ל-EAS Build, ואין הפרדת ערוצי EAS Update. `app.json` לא כולל `"extra": { "eas": { "projectId": ... } }` —
  כלומר הפרויקט כנראה **עדיין לא קושר (`eas init`) ל-EAS** בכלל.
- **אין הפרדת סביבות Dev/Staging/Production** ברמת קונפיגורציה: יש Supabase project יחיד (`lnflftptzrfuzfecmhho`)
  מוטמע כ-hardcoded ב-`lib/supabase.ts` (סעיף 3), ואין `app.config.js`/profiles שמאפשרים להצביע על פרויקט
  Supabase אחר ל-staging מול production. כל build (כולל dev מקומי) פוגע באותו DB פרודקשן.

**מסקנה**: כרגע אין תהליך build/deploy אוטומטי כלל — רק `expo start` מקומי. כל build ל-store (APK/IPA) חייב
היום צעד ידני (`eas build` אחרי `eas init`, או `expo run:android/ios` מקומי). זו לא בעיה "טכנית שבורה" — זה
פשוט השלב שבו הפרויקט נמצא. אבל זה אומר שאין Safety net (lint/typecheck) לפני מיזוג קוד, ואין staged rollout
מבוקר לפרודקשן.

---

## 2. ניהול Secrets / משתני סביבה

- **אין קובצי `.env`** בריפו (לא ב-git, לא על הדיסק) — טוב, אין דליפת secrets דרך env files.
- **`SUPABASE_URL` ו-`SUPABASE_ANON_KEY` הם hardcoded בקוד** (`lib/supabase.ts:5-6`), לא נטענים ממשתני סביבה.
  - **חומרה: נמוכה-בינונית, לא "דליפת סוד" קלאסית** — המפתח הוא `sb_publishable_...`, כלומר מפתח ה-publishable
    (anon) החדש של Supabase, שמיועד מטבעו לחיות בצד קליינט וכפוף ל-RLS. זה **לא** ה-service role key.
  - עדיין, hardcoding בקוד המקור (ולא ב-`app.config.js` + `EXPO_PUBLIC_*` env vars) הוא anti-pattern כי:
    1. אין דרך להריץ build כנגד סביבת staging נפרדת בלי לערוך קוד ולעשות commit.
    2. אין הפרדה בין local dev / CI / production מבחינת ה-URL/key.
    3. כל מי שקורא את ה-git history רואה את המפתח (גם אם הוא "publishable" ומיועד לכך — עדיין best practice הוא
       החזקתו כ-config, לא literal).
  - **המלצה** (לא בוצע — דורש אישור): להעביר ל-`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
    דרך `app.config.js` + EAS Secrets/`eas.json` `env`, כדי לאפשר בעתיד staging build נפרד.
- **`SUPABASE_SERVICE_ROLE_KEY` מטופל נכון**: נבדק בכל ה-Edge Functions (`verifyOwner.ts`, `verifyCompanyAccess.ts`,
  `create-company-admin`, `create-company-driver` ועוד) — נטען אך ורק דרך `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`
  בצד השרת (auto-injected ע"י Supabase Edge Runtime), **לא מגיע לקליינט בשום קובץ שנבדק**. זו עבודה נכונה של
  הפרדת הרשאות (anon מול service role).
- **`android/app/debug.keystore`** קיים על הדיסק אבל **לא מגורסן ב-git** (`git ls-files` לא מחזיר תוצאה, כי
  `.gitignore` שורה 41 מחריגה `/android` כתיקייה נוצרת-אוטומטית). תקין — אין keystore חשוף בהיסטוריית git.
- `.gitignore` מכסה `*.jks`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision`, `*.pem`, `.env*.local` — כיסוי סביר
  לקבצי חתימה/סוד נפוצים. **שים לב**: `.env*.local` מכוסה, אבל `.env` "רגיל" (בלי `.local`) **לא** מכוסה
  במפורש — כרגע אין קובץ כזה בפרויקט אז זה לא סיכון בפועל, אבל אם ייווצר `.env` בעתיד הוא עלול להתגלגל ל-git
  בטעות. **המלצה קלה**: להוסיף שורת `.env` גורפת ל-`.gitignore` כרשת ביטחון מונעת.

---

## 3. תשתית ענן (Supabase) — כקוד מול ידני

- **קוד השרת (Edge Functions, מדיניות RLS) כן מגורסן כקוד**: `supabase/functions/**` ו-`supabase/sql/**` נמצאים
  ב-git, מתועדים במספור (10, 20-31). זה טוב — זה ה"Provisioning as Code" הרלוונטי בהקשר הזה.
- **חסר `supabase/config.toml`** — לא נמצא כלל בריפו. אומר שאין קונפיגורציית CLI מקומית מגורסנת (project ref,
  API port, auth settings מקומיים) — כל מי שמצטרף לפרויקט צריך `supabase link` ידני. לא קריטי אך פוגע ב-
  reproducibility של סביבת הפיתוח המקומית.
- **אין תהליך אוטומטי להרצת מיגרציות** (`supabase db push` / GitHub Action ל-migrations). כפי שעולה גם מהזיכרון
  הפרויקטלי: יש 3 מיגרציות SQL (29, 30, 31) שכבר בריפו אבל **טרם הורצו בפועל מול הפרויקט**. זה חוסר סנכרון בין
  קוד לסביבה חיה — סיכון תפעולי אמיתי (drift). זה בתחום רועי לביצוע, אבל אני מדגיש את זה כפער תהליכי: **אין
  gate/CI שמוודא שכל SQL שנכנס לריפו אכן רץ בסביבה**, וזה תלוי כרגע בזיכרון אנושי בלבד.
- `supabase/.temp/` (project-ref, pooler-url וכו') נמצא על הדיסק אך מוחרג נכון ב-`.gitignore` (שורה 44) ו-לא
  מגורסן — תקין, זה state מקומי של ה-CLI ולא אמור להיות ב-git.

---

## 4. ניטור, Observability, Alerting

- **אין שום כלי ניטור ייעודי בפרויקט** (לא Sentry, לא כל SDK דומה) — לא ב-`package.json`, לא בקוד. אין
  Crash reporting לצד קליינט, ואין ריכוז לוגים מעבר למה ש-Supabase Dashboard נותן out-of-the-box (Logs/Postgres
  logs/Edge Function logs באמצעות ה-Dashboard המנוהל).
- **אין Dashboard/Alerting מוגדר כקוד** (אין webhook, אין הגדרת alert thresholds מתועדת בריפו).
- זו נקודה אמיתית לתשומת לב — אבל **הוספת Sentry/כלי חיצוני דורשת אישור מפורש** (ספק חדש + מפתחות API), לא
  בוצעה ולא הומלצה כברירת מחדל כאן. מציין את הפער בלבד.

---

## 5. גיבויים ו-DR (ברמת תשתית — לא בדיקת דאטה עצמה)

- **לא נמצאה שום תוכנית DR מתועדת בריפו** (אין קובץ runbook, אין תיעוד backup policy, אין אזכור ל-PITR).
  Supabase (בתוכניות בתשלום) מספק Point-in-Time Recovery מנוהל, אך **לא נבדקה כאן תצורת הפרויקט בפועל בענן**
  (הוראה מפורשת: לא לגעת בגישה חיה ל-DB בסבב הזה) — לכן זו נקודה פתוחה שדורשת בדיקה ישירה מול Supabase
  Dashboard/Billing plan בסבב הבא.
- אין גיבוי מתועד ל-Secrets/מפתחות עצמם (מי מחזיק את ה-service role key מחוץ ל-Supabase env vars? האם יש
  Secret manager חיצוני לגיבוי חירום?) — לא נמצא תיעוד.
- **המלצה לסבב הבא (Backend/Roi + אישור עקרוני)**: לוודא ש-PITR מופעל בפרויקט Supabase בפועל, ולתעד runbook
  קצר (מי אחראי, מה זמן השחזור הצפוי — MTTR יעד).

---

## 5.5 עדכון 2026-08-24 — שלושה תיקונים מיידיים בוצעו (מאושרים ב-`.claude/idan-final-plan.md`, סעיף 1.11-1.13)

- **1.11 — טופל.** תזמון ה-cron של מיגרציה 31 (`check-vehicle-expiry-notifications`) היה שגוי בפועל: הריץ ב-04:00
  UTC עם הערה שטענה "לפני מיקה (05:40 IDT) ועומר (06:00 IDT)" — אבל 04:00 UTC בקיץ (UTC+3) הוא 07:00 IDT, כלומר
  *אחרי* שניהם, לא לפני. תוקן ע"י מיגרציה חדשה **append-only**: `supabase/sql/33_fix_expiry_notifications_cron_schedule.sql`
  (לא נגעתי בקובץ 31 הקיים). המיגרציה מבטלת (`cron.unschedule`) ומגדירה מחדש את אותה עבודה ל-03:00 UTC = 06:00
  IDT (קיץ), מאוחדת עם שאר הריצה היומית. **הערה חשובה**: pg_cron לא מודע ל-DST — התזמון מניח שעון קיץ (UTC+3)
  קבוע; מעבר לשעון חורף (UTC+2) יזיז את הריצה בפועל לשעה 07:00 IDT. זה נתון קיים גם היום (26/31 באותה בעיה) ולא
  טופל כאן — טיפול מלא ב-DST דורש החלטה נפרדת (שני תזמונים מתחלפים / scheduler חיצוני מודע-timezone) ומחוץ
  להיקף התיקון המיידי הזה. **טרם רץ בפועל מול production** — מצטרף לתור המיגרציות הממתינות (29, 30, 31, ועכשיו 33)
  שרועי צריך להריץ. תואמתי מספור מול רועי: מיגרציה 32 שמורה לתיקון ה-RLS הדחוף שלו, לכן קובץ זה ממוספר 33.
- **1.12 — טופל.** נוספה שורת `.env` גורפת ל-`.gitignore` (לצד `.env*.local` הקיים), כרשת ביטחון מונעת למקרה
  שייווצר קובץ `.env` בעתיד. שאר הכיסוי (`*.jks`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision`, `*.pem`) נבדק
  שוב ונמצא תקין, ללא חורים נוספים.
- **1.13 — טופל.** נוסף `"typecheck": "tsc --noEmit"` ל-`package.json`. `tsconfig.json` הקיים (`extends:
  "expo/tsconfig.base"`, `strict: true`, מחריג `supabase/functions/**`) מתאים כמו שהוא — לא נדרש שינוי. הרצתי
  `npm run typecheck` בפועל: עובר נקי, ללא שגיאות. זה מהווה בסיס מינימלי ל-CI עתידי (עדיין אין `.github/workflows`
  בפועל — זה נשאר פער נפרד, לא טופל בסבב הזה).

---

## 6. תלויות / עדכוני אבטחה

- `expo ~54.0.36`, `react-native 0.81.5`, `@supabase/supabase-js ^2.112.3` — גרסאות עדכניות יחסית, תואמות ל-Expo
  SDK 54 כפי שמצוין ב-`AGENTS.md`.
- לא הורץ `npm audit` בפועל בסבב הזה (זה primarily domain של package management/CI, לא משהו שיש להריץ באופן
  הרסני ללא הקשר) — ממליץ שזה יהיה חלק מ-CI עתידי (`npm audit --production` כ-step לא חוסם, לפחות בהתחלה).

---

## סיכום מצב נוכחי (עובדתי, לא תיאורטי)

| תחום | מצב בפועל |
|---|---|
| CI (lint/test/typecheck על PR) | לא קיים — אין `.github/workflows`, אין scripts מתאימים ב-`package.json` |
| EAS Build/Update | לא מוגדר — אין `eas.json`, אין `projectId` ב-`app.json` |
| הפרדת סביבות (dev/staging/prod) | לא קיימת — Supabase project יחיד hardcoded בקוד |
| Secrets בקוד | anon publishable key hardcoded (סיכון נמוך, אך anti-pattern); service role key מטופל נכון בצד שרת בלבד |
| ניטור/Alerting | לא קיים כלי ייעודי כלל |
| DR/Backup מתועד | לא נמצא תיעוד בריפו; לא נבדק מול Supabase Dashboard בפועל (מחוץ להיקף הסבב) |
| ניהול מיגרציות SQL | קבצים מגורסנים כקוד, אך אין אוטומציה להרצתם — כרגע 3 מיגרציות ממתינות (29-31) |
