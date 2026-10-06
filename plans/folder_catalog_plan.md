# תיקיות קבועות לתיק הנהג – תוכנית בנייה מלאה

סטטוס: תכנון בלבד (2026-10-05). כל מה שכתוב כאן נבדק מול הקוד ומול מסד הנתונים האמיתי (קריאה בלבד).

---

## א. העיקרון

- **שורת הטופס של החברה (`signing_templates`) היא התיקייה.** לכן המזהה של הטופס אף פעם לא משתנה.
- **"החלף טופס" מעדכן את אותה שורה.** הנוסח הישן נשמר בטבלת נוסחים.
- כל מה שקשור היום לטופס ממשיך לעבוד בלי שינוי: תוקף, שליחה מחדש, מועדי שאלונים, דוחות, התראות.
- **כל כתיבה עוברת דרך השרת** (Edge Function עם service role, או פונקציית SQL שרק השרת יכול להריץ). לדפדפן יש רק הרשאת קריאה.
- **כל חוק חשוב נאכף במסד הנתונים עצמו** (אינדקס ייחודי, טריגר, מפתח זר), לא רק במסך.

---

## ב. מסד נתונים – מיגרציה 107 (`supabase/sql/107_folder_catalog.sql`)

### ב1. טבלאות חדשות

```
folder_catalog
  id uuid pk
  title text not null
  kind text not null check (kind in ('document','checklist'))
  description text
  sort_order int not null default 0
  default_valid_months int null check (between 1 and 120)    -- מסמך בלבד
  default_lead_days int not null default 30 check (between 1 and 365)
  default_repeat_months int null                             -- שאלון בלבד
  retired_at timestamptz null
  created_by, created_at, updated_at
  unique index on lower(regexp_replace(btrim(title), '\s+', ' ', 'g'))

company_catalog_folders
  company_id uuid fk companies on delete cascade
  catalog_id uuid fk folder_catalog on delete restrict
  added_by, added_at, removed_at, removed_by
  primary key (company_id, catalog_id)

signing_template_versions
  id uuid pk
  template_id uuid fk signing_templates on delete cascade
  company_id uuid not null
  version int not null
  docuseal_template_id bigint null
  source_file_path text null
  source_file_name text null
  form_content jsonb null
  replaced_by uuid
  replaced_at timestamptz
  unique (template_id, version)
```

- הרשימה של כל חברה מפתח לתיקייה עם `on delete restrict`. לכן מסד הנתונים עצמו חוסם מחיקה של תיקייה שחברה אי פעם הוסיפה.

### ב2. עמודות חדשות

- `signing_templates.catalog_folder_id uuid null` עם מפתח זר ל-`folder_catalog`, `on delete restrict`.
- `signing_templates.version int not null default 1`.
- `signature_requests.template_version int null`. זה הנוסח שנשלח לנהג.
- אינדקס ייחודי: `(company_id, catalog_folder_id) where catalog_folder_id is not null`. כך יש טופס אחד בלבד לכל תיקייה בכל חברה. **זה גם הפתרון ללחיצה כפולה.**

### ב3. טריגרים

1. **`signing_templates` – התאמה לתיקייה** (before insert/update, כשיש `catalog_folder_id`):
   - הסוג של הטופס חייב להיות זהה לסוג של התיקייה.
   - השם נקבע אוטומטית לשם של התיקייה, ואי אפשר לשנות אותו בנפרד.
   - בהוספה או בהוצאה מארכיון: התיקייה חייבת להיות פעילה בחברה. הבדיקה נועלת את השורה ב-`company_catalog_folders` עם `for share`, ולכן אין מרוץ עם הסרה שקורית באותו רגע.
   - בהעברה לארכיון: מותר רק כשהתיקייה הוסרה. כך גם פעולת הארכיון הישנה של הבעלים לא יכולה לגרום לחוסר סנכרון.
   - אי אפשר לבטל קישור (`catalog_folder_id` חוזר ל-null) ואי אפשר להחליף קישור.
2. **`folder_catalog`**: אסור לשנות את `kind` אחרי שנוצר.
3. **`private.enforce_signing_record_integrity` (טריגר קיים, צריך שינוי).** היום הוא חוסם כל שינוי של `source_file_path` (נמצא בבדיקה). השינוי:
   - שינוי מותר רק כש-`current_setting('app.template_replace', true) = new.id::text`.
   - רק פונקציית ההחלפה מגדירה את הדגל הזה.
4. **`private.log_company_activity`**, הרחבה:
   - שורות חדשות ביומן: "נוסח N לטופס X", "הטופס X שוחזר", "נוספה התיקייה X" ו"הוסרה התיקייה X".
   - הוספה של `'catalog_folder'` ל-`activity_logs_entity_type_check`.
   - טריגר לוג על `company_catalog_folders`.

### ב4. פונקציות SQL

- כל הפונקציות `security definer` עם `search_path ''`.
- כולן `revoke all from public, anon, authenticated` ו-`grant execute to service_role` בלבד.

| פונקציה | מה היא עושה, בטרנזקציה אחת |
|---|---|
| `catalog_add_folder(company, catalog, actor, link_template uuid null)` | upsert של `removed_at = null`; מוציאה מארכיון את הטופס המקושר אם קיים; אם התקבל `link_template` היא מקשרת אותו |
| `catalog_remove_folder(company, catalog, actor, cancel_pending bool)` | נעילה `for update`; אם יש בקשות שממתינות ו-`cancel_pending` כבוי, מחזירה את מספרן בלי לשנות דבר; אחרת מסמנת `removed_at` ומעבירה את הטופס לארכיון |
| `replace_signing_template_version(template, expected_version, new_docuseal_id, new_path, new_name, new_form, actor)` | בודקת `version = expected` (אם לא תואם: conflict); שומרת את הנוסח הנוכחי ב-versions; מגדירה את `app.template_replace`; מעדכנת את השורה עם `version + 1` |
| `restore_signing_template_version(template, version_no, expected_version, actor)` | כמו החלפה, אבל הערכים נלקחים משורת הנוסח הישן. אין קריאה ל-DocuSeal |
| `catalog_rename(catalog, title, actor)` | בודקת שהשם לא תופס שם של מסמך פעיל ולא מקושר בחברה שהוסיפה את התיקייה; מעדכנת את התיקייה ואת כל הטפסים המקושרים; מחזירה את רשימת ה-DocuSeal ids |

- **ביטול הבקשות שממתינות** בהסרת תיקייה רץ בשרת, כמו היום ב-`delete-signing-record` (ביטול ב-DocuSeal ואז עדכון סטטוס). רק אחרי זה נקראת `catalog_remove_folder`.

### ב5. הרשאות (RLS) לטבלאות החדשות

- `enable row level security` על שלוש הטבלאות.
- `revoke all ... from anon, authenticated` ואחר כך `grant select ... to authenticated`.

| טבלה | מי קורא | מי כותב |
|---|---|---|
| `folder_catalog` | `current_role_name() in ('owner','admin')` | אף אחד מהדפדפן (רק השרת) |
| `company_catalog_folders` | `can_manage_company(company_id)` | רק השרת |
| `signing_template_versions` | `can_manage_company(company_id)` | רק השרת |

- **נהג לא רואה את שלוש הטבלאות.**
- העמודות החדשות ב-`signing_templates` נקראות דרך ה-policy הקיים. נהג רואה רק טפסים שנשלחו אליו, כמו היום.

### ב6. חיזוק אבטחה שהתגלה בבדיקה (קיים היום, באותה חברה בלבד)

- **אחסון קבצים:** ה-policy `company managers manage non-evidence documents in storage` מאפשר למנהל לדרוס או למחוק קבצי מקור של טפסים קיימים בתיקייה `<company>/signing-templates/`.
  - עם היסטוריית נוסחים זה כבר חשוב.
  - **התיקון:** בתיקייה `signing-templates` מנהל יכול להעלות קובץ רק לטיוטה שעדיין לא שייכת לשום טופס או נוסח. update ו-delete על קבצים של טפסים קיימים חסומים.
  - **ובנוסף בשרת:** `create` ו-`replace` דוחים `draftId` שהתיקייה שלו כבר בשימוש.
- **הרשאת TRUNCATE:** ל-`anon` ול-`authenticated` יש היום TRUNCATE על `signing_templates`, `signature_requests` ו-`signing_template_rules`.
  - אי אפשר להגיע לזה דרך ה-API של האתר, אבל מנקים: `revoke truncate`.

---

## ג. שרת (Edge Functions)

### ג1. פונקציה חדשה: `folder-catalog`

**פעולות של הבעלים** (`verifyOwner`):
- `catalog-list`, `catalog-create`, `catalog-update` (הסבר, סדר, ברירות מחדל) ו-`catalog-rename`.
  - `catalog-rename` מעדכנת קודם את מסד הנתונים, ואחר כך מנסה לשנות את השם ב-DocuSeal דרך `PUT /templates/:id`. אם זה נכשל, נרשם ביומן השרת וזה לא שובר כלום.
- `catalog-retire`, `catalog-unretire` ו-`catalog-delete`.
  - `catalog-delete` נכשל עם 409 אם חברה הוסיפה את התיקייה, ואז מוצעת האפשרות "הוצא משימוש".

**פעולות של החברה** (`verifyCompanyAccess`, מנהל של אותה חברה או הבעלים):
- `company-list`: התיקיות, הסטטוס של כל אחת, הטופס המקושר, ומסמכים קיימים שאפשר לקשר (אותו סוג, לא מקושרים, ready, לא בארכיון).
- `company-add (catalogId, linkTemplateId?)`.
  - תיקייה שהוצאה משימוש אפשר להוסיף רק אם החברה כבר הייתה בה.
- `company-remove (catalogId, cancelPending)`.
  - אם יש בקשות שממתינות, התשובה הראשונה היא `{pending: N}`. רק בקריאה השנייה עם `cancelPending=true` מבטלים אותן (DocuSeal ואז DB) ומסירים.

### ג2. `company-signing-template` (קיימת, להרחיב)

**`create` עם `catalogFolderId`:**
- התיקייה חייבת להיות פעילה בחברה, והסוג חייב להתאים.
- השם נלקח מהתיקייה ולא מהדפדפן.
- אם לחברה יש מסמך משלה בשם הזה, השרת מחזיר 409 עם `canLink`.
- אם כבר יש טופס בתיקייה, השרת מחזיר 409 "כבר נוצר טופס".
  - **חריג:** אם השורה הקיימת היא `draft` בת יותר מ-15 דקות (שארית מקריסה), היא נמחקת (גם ב-DocuSeal) והיצירה ממשיכה.
- אחרי ההצלחה:
  - בתיקיית מסמך, אם לתיקייה יש `default_valid_months`, נוצר `signing_template_rules` (`on conflict do nothing`) עם `lead_days` מהתיקייה, 30 כברירת מחדל.
  - בתיקיית שאלון, `default_repeat_months` נכנס ל-`form_content.repeatMonths`, אלא אם בונה הטופס כבר קבע ערך.

**`create` בלי תיקייה:**
- חסום לשם של כל תיקייה פעילה בקטלוג, עם 409 והודעה "יש תיקייה מוכנה בשם הזה. הוסף אותה".

**פעולה חדשה `replace (templateId, expectedVersion, ...)`:**
- רק לטופס שמקושר לתיקייה.
- התהליך זהה ל-create: טיוטה, ואז DocuSeal (מסמך) או PDF תצוגה (שאלון). אחר כך `replace_signing_template_version`.
- אם יש conflict או כישלון: מוחקים רק את תבנית ה-DocuSeal **החדשה** ואת הקבצים החדשים.
- **לעולם לא מוחקים את תבנית ה-DocuSeal הישנה.** מחיקה שלה יכולה למחוק חתימות (מוזכר ב-delete-signing-record).
- התשובה כוללת את מספר הנהגים שממתינים על הנוסח הקודם.

**פעולה חדשה `restore-version`:** קוראת ל-`restore_signing_template_version`.

### ג3. שינויים קטנים בפונקציות קיימות

| פונקציה | שינוי |
|---|---|
| `delete-signing-record` | `company-delete`, `permanent-delete` ו-`archive` של טופס מקושר מחזירים 409 עם ההודעה "הסר את התיקייה". `restore` נשאר, והטריגר חוסם אם התיקייה הוסרה |
| `_shared/signingAssign.ts` | שומר `template_version` בכל בקשה. מנגנון ההחלפה הקיים (בקשה שממתינה מבוטלת ונשלחת חדשה) משמש ל"שלח את הנוסח החדש" |
| `delete-company` | ניקוי הקבצים כולל גם `signing_template_versions.source_file_path` |
| `renew-expired-signatures` | בלי שינוי. החידוש יוצא מהנוסח הנוכחי, כי זה אותו `template_id` |
| `checklist-meeting` | בלי שינוי. מילוי שומר עותק של הטופס |

---

## ד. מסכים

### ד1. פאנל הבעלים

- **לשונית "תיקיות"** (`components/owner/FolderCatalogTab.tsx`):
  - רשימה עם גרירה לסדר.
  - "תיקייה חדשה": שם, סוג, הסבר וברירות מחדל.
  - עריכה, "הוצא משימוש" ו"מחק".
  - ליד כל תיקייה: מספר החברות שהוסיפו אותה.
- **בתוך מסך חברה (`CompanyDetailScreen`)**: אזור "תיקיות בתיק הנהג" עם אותו חלון הוספה, "צור טופס" (אותו `CreateDocumentSheet` עם ה-`companyId` של החברה) ו"החלף טופס".
  - העלאת קבצים מותרת לבעלים לפי `can_manage_company`, והשרת מקבל owner.
- **בטלפון**: הלשונית מוצגת לקריאה בלבד, עם ההודעה "ניהול מהמחשב".

### ד2. מסכי החברה במחשב

- **חלון "הוסף תיקייה"** (`components/desktop/signing/AddCatalogFolderSheet.web.tsx`, מבוסס על `Sheet`):
  - נפתח מתיק הנהג (`DriverSigningSection`) ומעמוד "מסמכים" (`SignedDocumentsDesktopView`).
  - רשימה עם הסבר וסוג, ו"תתווסף לכל N הנהגים".
  - אם יש לחברה מסמך באותו שם ואותו סוג: "לקשר אותו?" עם האפשרויות "קשר" או "צור חדש". "צור חדש" חסום עד שמשנים את שם המסמך הישן.
  - **אנימציה בכל פתיחה** (בקשה של דור), בערך 0.9 שניות:
    - בראש החלון אייקון תיקייה. הוא נכנס מלמעלה עם קפיצה קטנה, והמכסה נפתח.
    - כפתור "+" ירוק קופץ לתוכה.
    - שורות הרשימה עולות אחת אחרי השנייה.
    - רק CSS עם keyframes, בלי ספרייה חדשה, באותו סגנון כמו `sd-rise` ו-`sd-alert-in` ב-`signingCss.ts`.
    - ב-`prefers-reduced-motion` אין אנימציה.
    - אותה אנימציה גם בטלפון.
    - כשלוחצים "הוסף", התיקייה "נסגרת" עם וי ירוק, ואז החלון נסגר.
  - **שפה עיצובית אחידה** (בקשה של דור): בלי צבעים, גופנים או רכיבים חדשים.
    - משתמשים במשתני העיצוב הקיימים `--sd-*` ב-`signingCss.ts`, בצללים `--sd-depth-*`, בעקומת התנועה `--sd-sheet`, בכפתורים `sd-sb` ובשורות כמו `sd-choice`.
    - הרקע המטושטש `sd-backdrop` נשאר כמו בשאר החלונות.
    - ההתנהגות של `Sheet`/`useSheetClose` נשמרת: Escape, "בטוח לצאת?" ופוקוס.
    - נוסף רק variant `.sd-float`: חלון ממורכז במקום גיליון בגובה מלא.
  - **רספונסיבי, רכיב אחד למחשב ולאייפון** (האתר הוא אתר בלבד, ולכן אותו קוד web):
    - **מחשב (מ-768px):** חלון מרחף ממורכז, ברוחב `min(560px, 100vw - 40px)`, עם פינות 24px, ו-hover רק במכשירים עם עכבר.
    - **אייפון (עד 767px):**
      - החלון נפתח מלמטה ברוחב מלא, עם ידית גרירה ופינות עליונות 24px. הגובה המקסימלי הוא `90dvh`, והרשימה גוללת בתוכו.
      - שוליים תחתונים לפי `env(safe-area-inset-bottom)`, ואזורי לחיצה של 44px לפחות.
      - כפתור "הוסף" קבוע בתחתית, מעל אזור הבית של האייפון.
      - האנימציה מוקטנת לגודל המסך.
    - הרכיב מזריק את `SIGNING_CSS` בעצמו, כדי שיעבוד גם במסכי הטלפון, שלא טוענים את ה-CSS הזה היום.
    - **אותו כלל לכל המסכים החדשים** (התיקייה הריקה, היסטוריית נוסחים, חלון "מה לשלוח?", "הסר תיקייה" ולשונית הקטלוג אצל הבעלים): בנויים מהרכיבים הקיימים ונבדקים בשני הגדלים.
    - **בדיקה לפני סיום:** ברוחב 375, 390 ו-430 (אייפונים), 768 ו-1280 ומעלה. גם בכיוון אופקי, גם עם מקלדת פתוחה בשדה חיפוש, וגם בלי גלילה רוחבית.
- **תיקייה בלי טופס**: "אין טופס עדיין" עם הכפתורים "צור טופס" ו"בחר טופס קיים".
- **`CreateDocumentSheet`**: props חדשים `catalogFolder?: {id, title, kind}`.
  - השם נעול והסוג נעול. בשאלון: אין בחירה בין עורך להעלאה.
  - אותו רכיב משמש להחלפה עם `replaceOf?: {templateId, version}`. השאלון נפתח עם הסעיפים הנוכחיים.
- **אחרי החלפה, חלון "מה לשלוח?"**:
  - "לא עכשיו".
  - "שלח את הנוסח החדש ל-N שממתינים".
  - "שלח לכל הנהגים לחתימה מחדש".
- **"היסטוריית נוסחים"**: רשימת נוסחים, צפייה בכל נוסח ו"החזר נוסח זה".
- **מחיקה**: בטופס מקושר אין כפתור מחיקה. במקומו יש "הסר תיקייה", עם החלון "N נהגים ממתינים".
- **`lib/signingFolders.ts`, `buildSigningFolders`**:
  - פרמטר חדש לתיקיות שנוספו ואין להן טופס, שמוצגות כתיקיות ריקות.
  - מיון: קודם תיקיות הקטלוג לפי `sort_order`, אחר כך שאר המסמכים לפי שם.
  - גם הצד של הנהג משתמש בפונקציה. נהג לא מקבל את הפרמטר, ולכן הוא לא רואה תיקיות ריקות.
- **"דורש טיפול"**: שורה "תיקייה בלי טופס: X" שמובילה לעמוד מסמכים.
- **הגדרות התראות**:
  - בתיקיית מסמך, שורה נוצרת אוטומטית ברגע שיש לה טופס, כי `useSigningRules` כבר בונה שורה לכל טופס מסמך. השורה מקבלת את ברירת המחדל של התיקייה.
  - בתיקיית שאלון, התדירות נקבעת בתוך הטופס, כמו היום. ההתראה "מועד מילוי" משותפת לכל השאלונים ב-`driver_meeting_due`. אין שינוי בזה.

### ד3. טלפון

- `SignedDocumentsScreen` ו-`DriverSigningDocumentsScreen`/`SigningFolders` מקבלים את חלון ההוספה ואת התיקייה הריקה.
- היום יוצרים טפסים רק מהמחשב. לכן בטלפון "צור טופס" מציג "יוצרים טופס מהמחשב". גם "החלף טופס" במחשב בלבד.

### ד4. תרגום

- טקסטים חדשים באתר מתורגמים ב-`locales/he.json`, `en.json`, `ar.json` ו-`ru.json`.
- שמות התיקיות והטפסים לא מתורגמים.
- `lib/adminApi/types.ts`: הוספת `'catalog_folder'` ל-`entity_type`.

---

## ה. טבלת הרשאות (כל פעולה, מי, ואיפה זה נאכף)

| פעולה | בעלים | מנהל של החברה | מנהל של חברה אחרת | נהג | נאכף ב |
|---|---|---|---|---|---|
| ניהול קטלוג | ✅ | ❌ | ❌ | ❌ | `verifyOwner` + אין policy כתיבה |
| לראות קטלוג | ✅ | ✅ | ✅ (רק את הרשימה) | ❌ | RLS |
| הוספה והסרה של תיקייה | ✅ | ✅ | ❌ | ❌ | `verifyCompanyAccess` + פונקציה רק לשרת |
| יצירה, החלפה ושחזור של טופס | ✅ | ✅ | ❌ | ❌ | `verifyCompanyAccess` + בדיקה ש-`template.company_id = companyId` |
| לראות נוסחים | ✅ | ✅ | ❌ | ❌ | RLS `can_manage_company` |
| חברה מושבתת | ✅ | ❌ | – | ❌ | `verifyUser` + `can_manage_company` |
| להעלות קובץ לטיוטה | ✅ | ✅ (רק טיוטה חדשה) | ❌ | ❌ | storage policy (מתוקן) |

**כל פעולה על טופס בודקת `template.company_id === companyId` בשרת.** כך מנהל לא יכול לשלוח מזהה של טופס של חברה אחרת.

---

## ו. מקרי קצה

| מקרה | תוצאה | איפה נאכף |
|---|---|---|
| יצירה כפולה | השני מקבל "כבר נוצר טופס" | אינדקס ייחודי |
| החלפה כפולה | השני מקבל "עודכן, רענן" | `expected_version` |
| קריסה באמצע יצירה | שארית draft נמחקת אחרי 15 דקות | השרת |
| הסרה בזמן יצירה | הטופס נוצר בארכיון וחוזר כשמוסיפים מחדש | טריגר + נעילה |
| שינוי שם שמתנגש | חסום, והודעה עם שם החברה | `catalog_rename` |
| שם כפול בקטלוג | חסום | אינדקס ייחודי |
| שם של תיקייה קבועה (בריאות וכד') | חסום | השרת |
| מחיקת תיקייה בשימוש | חסום, "הוצא משימוש" במקום | `on delete restrict` |
| שינוי סוג של תיקייה | חסום | טריגר |
| קישור טופס מסוג שונה | חסום | טריגר + השרת |
| מחיקת טופס מקושר | חסום | השרת |
| ארכיון ידני של טופס מקושר | חסום | טריגר |
| נהג ממתין לנוסח ישן | הבקשה הישנה תקפה, ואפשר לשלוח את החדש | `signingAssign` הקיים |
| שחזור נוסח | בלי DocuSeal, מיידי | פונקציית SQL |
| מחיקת חברה | הכל נמחק, כולל קבצי נוסחים | cascade + `delete-company` |
| תיקייה בלי טופס | אין התראות על נהגים; מופיעה ב"דורש טיפול" | אין טופס, ולכן אין חוק |
| בדיקות קצין בטיחות | לא מושפעות (`template_id` null) | – |

---

## ז. סדר הבנייה

1. מיגרציה 107 ב-`supabase/sql`, מקומית בלבד. כולל בדיקת SQL שמריצה כל טריגר וכל חסימה.
2. Edge Functions: `folder-catalog` חדשה ו-`company-signing-template` מורחבת, ואחר כך `delete-signing-record`, `signingAssign` ו-`delete-company`.
3. `lib/folderCatalog.ts` (קריאות) והרחבת `buildSigningFolders`, עם בדיקות יחידה.
4. פאנל הבעלים.
5. מסכי החברה במחשב, ואחר כך בטלפון.
6. תרגומים, ואז `npx tsc`, בדיקות, ו-`graphify update .`.
7. מעבר מלא באתר המקומי לפי טבלת מקרי הקצה, עם בעלים, מנהל, מנהל של חברה אחרת ונהג.
8. **רק עם אישור של דור:** הרצת 107 בייצור, העלאת הפונקציות, ואז `get_advisors` (security) לבדיקה.
