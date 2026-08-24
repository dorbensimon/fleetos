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

**דורש אישור אם נרצה לקדם** (לא בוצע, רק המלצה): הוספת Sentry/כלי ניטור, יצירת `eas.json` + profiles, מעבר anon key ל-env vars דרך `app.config.js`+EAS Secrets, ובניית GitHub Action בסיסי ל-typecheck/lint על PR.

פירוט מלא: `.claude/daniel-findings.md`
