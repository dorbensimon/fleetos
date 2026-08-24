# סיכום דניאל (DevOps/תשתית) לצוות

בדקתי CI/CD, ניהול build, ניטור, גיבויים ואבטחת תשתית — ללא נגיעה בגישה חיה ל-DB (זה בסבב נפרד).

**המצב בפועל היום:**
- **אין CI כלל** — אין `.github/workflows`, ואין אפילו סקריפטים ל-lint/typecheck/test ב-`package.json` שאפשר להריץ בו.
- **אין EAS מוגדר** — אין `eas.json`, ואין `projectId` ב-`app.json`. הפרויקט כנראה לא קושר ל-EAS בכלל. כל build הוא ידני היום.
- **אין הפרדת סביבות** — יש פרויקט Supabase יחיד, ה-URL וה-anon key שלו hardcoded בקוד (`lib/supabase.ts`). כל build (גם dev מקומי) פוגע באותו DB פרודקשן.
- **secrets מטופלים נכון ברובם**: אין `.env` בריפו, ה-service role key נטען אך ורק בצד השרת ב-Edge Functions ולא נחשף לקליינט. ה-anon key שכן hardcoded הוא מפתח "publishable" מטבעו מיועד לצד קליינט — סיכון נמוך, אבל עדיין anti-pattern (לא ניתן להחלפה בין סביבות בלי commit).
- **אין ניטור/Alerting ייעודי** (לא Sentry או דומה) — רק מה ש-Supabase Dashboard נותן out-of-the-box.
- **אין תוכנית DR מתועדת בריפו**; PITR בפועל בפרויקט Supabase לא נבדק כאן (מחוץ להיקף — בדיקה מול Dashboard בסבב הבא).
- **מיגרציות SQL מגורסנות כקוד אבל אין אוטומציה להרצתן** — מאשר את מה שכבר ידוע: 3 מיגרציות (29-31) ממתינות בפועל.

**עדכון 2026-08-24 — שלושה תיקונים בוצעו (מאושרים, `.claude/idan-final-plan.md` 1.11-1.13):**
- תוקן תזמון ה-cron של מיגרציה 31: רץ בפועל ב-07:00 IDT (קיץ) במקום לפני מיקה/עומר כמתוכנן במקור. נוספה מיגרציה
  חדשה `supabase/sql/33_fix_expiry_notifications_cron_schedule.sql` (append-only, לא נגעתי ב-31) שמאחדת הכל
  לריצה ב-06:00 IDT (03:00 UTC). ממוספרת 33 כדי לא להתנגש עם מיגרציה 32 של רועי (RLS fix). **טרם רצה מול
  production** — מצטרפת לתור מיגרציות ממתינות (29, 30, 31, 33) לביצוע ע"י רועי. שימו לב: pg_cron לא DST-aware,
  אז בעונת חורף התזמון יזוז בחזרה (בעיה קיימת, לא נפתרה כאן — דורשת החלטה נפרדת אם רוצים דיוק שנתי מלא).
- `.gitignore`: נוספה שורת `.env` גורפת (לצד `.env*.local` הקיים) — כיסוי מונע, אין סיכון בפועל היום.
- `package.json`: נוסף `"typecheck": "tsc --noEmit"`. הרצתי בפועל — עובר נקי. `tsconfig.json` הקיים לא דרש שינוי.

**דורש אישור אם נרצה לקדם** (לא בוצע, רק המלצה): הוספת Sentry/כלי ניטור, יצירת `eas.json` + profiles, מעבר anon key ל-env vars דרך `app.config.js`+EAS Secrets, ובניית GitHub Action בסיסי ל-typecheck/lint על PR.

פירוט מלא: `.claude/daniel-findings.md`
