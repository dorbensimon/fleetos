# סוכנים — Briefs למטלות מיידיות (2026-08-29)

**דור:** העביר briefs אלה לכל סוכן בתחומו. כל brief הוא focused, מפורש, וממתין לביצוע בתור הקידום הבא.

---

## 📋 Brief לעידן (Idan) — Product Manager

**נושא:** Approval + Scope Gate

**עדיפות:** P1 (עד סוף היום אם אפשר)

**מה נדרש:**
1. **אישור/דחייה בחזרה:** החלטת "opt-out" ל-`document_sent` notification type — התראה על מסמך חדש לחתימה צריכה להישאר בלא-ניתנת לכיבוי (למרות שוט opt-out infrastructure בDB). ממוקם ב-`rafael-status.md`, סבב שלישי, עם נימוק מלא. זו החלטה עם היבט מוצר (הגבלת שליטת משתמש). סמכותי (רפאל) להמליץ, אבל אתה צריך לחזור OK/NOT OK.

2. **Scope-creep lock:** כשלירון תסיים מסמך רעיונות UX (ברגע שהוא מגיע) — אתה בחזרה עלי: כל רעיון הרחבה (למשל: ספריית טפסים בשם קבוע, תזכורות לחתימה, צירוף תמונות) צריך אישור מפורש מך לפני שמתן/רועי בונים. זה guard לעומס על Stage 2 שלנו.

**דוח חזרה:**
- OK/NOT OK לאפשרות opt-out (Slack או צ'אט לרפאל בתוך 2 שעות)
- לא כתיבה של קוד — רק החלטות

---

## 🎨 Brief ללירון (Liron) — UX/UI Designer

**נושא:** Design Milestones for Stage 2 (Signed Documents — Stage 2)

**סטטוס:** Blocked על Milestone 1 (Schema proposal של מיקה)

**מה שאתה צריכה לדעת:**
- Stage 2 PRD כבר אושר ללא שאלות (`.claude/prds/documents-broadcast-stage2-signing.md`)
- Milestones ברורים (ראה `rafael-timeline.md`)
- Milestone 1 = Mika proposes schema (signature location + RPC + collapse logic)
- ברגע שמיקה תסיים Milestone 1 → **אתה יכולה להתחיל לעצב** (לא צריך לחכות לרועי)

**מה לעצב (Milestone 3):**
1. Signature pad UI (canvas ריק → צייור → נקה → OK)
2. Location marker UI (סימון אזור חתימה על תבנית בעת יצירה)
3. Signed document viewer + "Re-mark location" button (optional)
4. State specs (loading, error, success toast)

**דוח חזרה:**
- Figma file / design document עם 3 screens/flows למעלה
- Spec קצר ל-Matan: button states, transitions, error handling
- Timeframe: יום או שניים אחרי שמיקה תסיים (לא critical path עד Milestone 2 של רועי)

---

## 💻 Brief למתן (Matan) — Frontend Developer

**נושא:** Urgent Bugs (P0) → Then Standby for Stage 2

**עדיפות:** P0 (הבוקר/מחר בבוקר)

**מה נדרש:**
1. **תיקון #2 (P0): תמונת תבנית לא מוצגת ב-`SignatureAreaMarker.tsx`**
   - בעיה: race condition בחישוב יחס-התמונה או timeout בטעינה
   - פתרון: בדוק `<Image>` handlers (onLoad, onError), הוסף spinner + timeout גלוי אחרי 8 שניות
   - קובץ: `components/ui/SignatureAreaMarker.tsx`

2. **תיקון #6 (P0): Document viewer + re-mark location**
   - בעיה: כרגע משתמש `Linking.openURL()` (חוצה לדפדפן), בצריך viewer פנימי
   - פתרון: בנה `InAppDocumentViewer` component (WebView / PDF renderer) עם כפתור "סימן מיקום מחדש" אופציונלי
   - זה אותה קומפוננטה לשני המסכים — בנה פעם אחת

3. **Bundle optimization (P1, 5 דקות):**
   - הסר `expo-clipboard` ו-`expo-status-bar` מ-`package.json`
   - הריץ `npm install`

4. **Docuseal Multi-Tenancy Validation (P2, לפני Stage 2 production):**
   - כשנהג/מנהל שולח template — validate שה-template שייך לחברה שלהם (check company_id)
   - מניעת שליחת template של חברה A לנהגים של חברה B
   - Frontend-level check (UX + protection), RLS ברמת DB (security guarantee)

5. **אחרי שלוקח את 3 דברים למעלה:**
   - הסר את npm deps (5 דקות)
   - אחד את `pickFile` / `pickTemplateFile` helpers (2 שעות refactor)
   - אחד את `NotificationBellButton` / `DriverNotificationsButton` (hook + generic component, 2 שעות)
   - **לא** להתחיל בנייה חדשה של Stage 2 עד שרועי מעביר RPC contract

**דוח חזרה:**
- `git commit` עם תיקוני #2 ו-#6 (verify tsc clean + web build passes)
- company_id validation code (Docuseal)
- Timeframe: היום/מחר בבוקר עבור P0, refactors + Docuseal validation בהמשך

---

## 🛠️ Brief לרועי (Roi) — Backend / Senior Developer

**נושא:** Unblock Milestone 2 (Schema + Migration 38 + RPC)

**דחוף (P0):** דניאל בודק כרגע — **ודא שMigration 37 רצה בפועל ב-Production** (Stage 1 schema). זה חוסם את כל Stage 2.

**Milestone 2 (כשמיקה תוכל הצעה):**
1. **ביקורת ה-proposal של מיקה** — schema design, RPC signature, atomicity של collapse, **company_id isolation**
2. **כתוב Migration 38** — new columns (signature location + company_id), indexes, SECURITY DEFINER function
3. **RLS Policies (Docuseal Multi-Tenancy):** 
   - Driver sees only templates/sends of their company_id
   - Admin sees only templates/sends of their company_id
   - (זה P2, חייב להיות לפני production launch)
4. **Implement RPC signing** — תלות: (driver_id = auth.uid() AND status = 'pending' AND company_id match)
5. **Atomicity guard:** RPC אחיד + Transaction — כל ה-pending sends של (driver_id, template_id) עדכונים ביחד
6. **RLS verification:** וודא שowners לא יכולים לחתום על של נהג אחר, וגם לא cross-company
7. **API Spec:** כתוב spec קצר של inputs/outputs ל-Matan (ראה P2 בניתוח)

**בדיוק בעקבות ה-RPC:**
- וודא Migration 43 (opt-out): ברמת ה-RLS, `document_sent` לא ניתן לopt-out (even historically)

**דוח חזרה:**
- Migration 38 PR (+ comment: "Ready to deploy to staging")
- RPC implementation (+ test: `curl --data '{...}' https://...`
- 1-page API spec (inputs/outputs)
- Timeframe: 3-5 days (depends on Mika)

---

## 🔍 Brief למיקה (Mika) — DBA / Data Engineer

**נושא:** Milestone 1 (Schema Proposal for Signature Location + Company Isolation)

**זו המשימה הראשונה שלך בStage 2.**

**מה לפרופוזה:**
1. **עמודות על `document_templates`:** 
   - איך שומרים "מיקום חתימה"? (עמוד + קואורדינטות? או GeoJSON? או layout-fixed?)
   - שדה חובה, immutable אחרי יצירה (ראה PRD הנחה #6)
   - **עמודה חדשה: `company_id` (NOT NULL, FK)** — כל template שייך לחברה ספציפית

2. **עמודות על `document_sends`:**
   - **עמודה חדשה: `company_id` (NOT NULL, FK)** — נרשמת מה-template's company_id בשליחה

3. **RPC עבור חתימה:**
   - Input: driver_id, document_send_id, signature_base64, location_coords
   - Output: signed_document_url (או error)
   - Security: SECURITY DEFINER, בדיקת ownership + status='pending' **+ company_id match**

4. **Stack-collapse atomicity (FR4 של PRD):**
   - כל ה-pending sends של (driver_id, template_id) חייבות להעדכן ביחד
   - זה הסעיף ה-High-Risk של PRD — תלויה בך

5. **RLS Policies (ביחד עם רועי) — Docuseal Multi-Tenancy:**
   - Driver sees only templates/sends of their company_id
   - Admin sees only templates/sends of their company_id (via company ownership)
   - (זה חדש; לא היה ב-PRD אך נדרש לפני production)

6. **Forward-compatibility:**
   - תוביל בדעה לגבי `signature_file_path` semantics (זה מסמך מורכב מלא, לא קובץ חתימה גולמי)

**ערכים בסיס:**
- 3-4 שעות לפרופוזה מפורטת (includes company_id, RLS)
- מול רועי: פגישה 30 דק לביקורת

**דוח חזרה:**
- Schema proposal (Markdown או SQL DDL) — **include company_id columns + RLS concepts**
- Questions/assumptions (אם יש)
- RPC pseudocode
- Timeframe: מחר בצהריים?

---

## 👨‍⚖️ Brief לעומר (Omer) — QA / Test Engineer

**נושא:** Critical Field Test + Verification

**Urgent (P0) — היום/מחר:**
דור עדיין דיווח שהוא לא מקבל התראה על מסמך לחתימה, גם אחרי תיקונים. בדיקת DB ישירה הראתה נתונים תקינים (טריגר עובד). **השערה:** בנדל ישן על הטלפון. **אבל זה עדיין השערה.**

**P2 (חדש) — לפני production Stage 2:**
Docuseal multi-tenancy by company: כרגע templates/sends מוצגים ללא הפרדה לפי חברה. כשיש 3+ חברות, נהג מחברה A רואה templates של חברה B. **חייב לתקן לפני launch.**

**Test Plan:**
1. בתאום עם דור: מחק לגמרי את Expo Go (לא רק סגור)
2. Build טרי מ-EAS (לא "רענון")
3. שלח מסמך חדש מ-Admin dashboard
4. **תצפה:** התראה בזמן אמת (בפוש + בתוך האפליקציה)
5. **וודא:** זה מופיע ב-NotificationPreferencesScreen
6. **Report:** סטטוס תוך 24 שעות

אם זה עובר → סגור כ-non-issue, move on.
אם זה כשל → חזור לרועי/מתן עם ממצא קונקרטי (not just "it didn't work")

**לאחר P0:**
- בדוק שNotificationPreferencesScreen לנהג מציג toggles (לא Empty State)
- **סטטוס Stage 2:** כשMatan סיים P0 bugs → התחל סקיצה של test plan (collapse scenarios, ownership across drivers, file integrity)

**דוח חזרה:**
- Field test result (email לדור)
- Test plan סקיצה עבור Stage 2 (תוך יומיים)

---

## 🚀 Brief לדניאל (Daniel) — DevOps / Infrastructure

**נושא:** Unblock Production Deployment

**דחוף (P0) — כרגע:**
1. **בדוק status של Migrations 29–31, 37:**
   - האם רצו בפועל ב-Supabase production? (verify via `supabase db execute` or dashboard)
   - אם 37 עדיין pending → תן לדור/עידן לאישור → **הרץ עכשיו**
   - זה חוסם את כל ה-Stage 2 testing

2. **דוח חזרה לרפאל בתוך 2 שעות:** סטטוס + next action

**לאחר P0 (Milestone 2 של רועי):**
- **Staging environment rehearsal:** דוק שMigration 38 + RPC + new Edge Functions עובדים ב-staging לפני production
- Checklist: migrations apply cleanly, no downtime, rollback documented

**לפני Stage 2 Launch:**
- Setup Sentry (client-side error tracking)
- Structured logging (Edge Functions)
- Alerts (failed RPC calls, slow downloads, ownership violations)

**דוח חזרה:**
1. Migrations status (עכשיו)
2. Staging plan (יום)
3. Monitoring setup (לפני launch)

---

## 📌 Summary for Dor

**עודכן:** 2026-08-29, 09:00

**סטטוס ספציפי:**
- 🔴 **P0 Blockers:** Migration 37 verification (Daniel) + Bug fixes #2/#6 (Matan)
- 🟡 **P1 In Flight:** Schema proposal (Mika) + RPC design (Roi)
- 🟢 **P2 Prep:** Design (Liron), Staging rehearsal (Daniel), Monitoring setup

**Timeline if unblocked:**
- Today/Tomorrow: Migration 37 verification, bug fixes, Mika's proposal starts
- 3-5 days: Roi completes Migration 38 + RPC
- 2-3 weeks total: Full Stage 2 implementation + QA

**כלי תקשורת:**
- Rafael ממקד סוכנים דרך brief זה
- כל סוכן דיווח חזרה לרפאל (ולדור כדי צורך)
- רפאל מעדכן `.claude/rafael-status.md` יומי עם progress
