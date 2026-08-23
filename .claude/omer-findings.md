# ממצאי עומר — יומן ביקורת קוד

יומן מצטבר של ממצאים מסריקות קוד. כל ממצא נשאר עד שמישהו מטפל בו ומעדכן את הסטטוס.

---

## [סטטוס: טופל — 2026-08-23, מיגרציה `29_notifications_delete_policy.sql` (ממתינה להרצה מול ה-DB)] ניקוי התראות בנות 7+ ימים לא באמת קורה — חסרה מדיניות RLS ל-DELETE
- **קובץ:** `lib/adminApi.ts:370` (הקריאה שמנסה למחוק), `supabase/sql/25_driver_full_self_edit_and_notifications.sql:36-47` (ה-RLS החסר), `supabase/sql/27_remove_notifications_cron.sql`
- **קטגוריה:** באג
- **חומרה:** גבוהה
- **תיאור:** מיגרציה 27 הסירה את ה-cron job שמחק התראות ישנות (מיגרציה 26), בהנחה מפורשת (לפי ההערה בקובץ) שהניקוי "עובר ל-`listNotifications()`" שרץ בצד הלקוח בכל פתיחה של מסך ההתראות. אבל `listNotifications()` מבצע `supabase.from('notifications').delete()...` תחת ה-role `authenticated`, וטבלת `public.notifications` מוגדרת עם RLS מופעל (`alter table ... enable row level security`) ויש לה רק שתי policies: `for select` ו-`for update` (שתיהן ב-25_driver_full_self_edit_and_notifications.sql). **אין policy מסוג `for delete`.** ה-`grant ... delete ... to authenticated` שבסוף אותה מיגרציה נותן הרשאת GRANT ברמת הטבלה, אבל בלי RLS policy תואם, PostgreSQL חוסם את כל השורות בשקט — הפעולה מצליחה (ללא שגיאה), אבל מוחקת 0 שורות בפועל.
- **תרחיש כשל:** אדמין פותח את מסך "התראות" יום אחרי שהתראה בת 8 ימים כבר הייתה אמורה להימחק. `listNotifications` רץ, מנסה את ה-DELETE, מקבל הצלחה שקטה עם 0 rows affected (כי אין policy שמתירה למי-שהוא למחוק), ואז שולף את כל ההתראות כולל הישנות מ-`select`. בפועל טבלת ה-notifications גדלה ללא הגבלה וההתראות "פג תוקפן" מעולם לא נמחקות בפועל, בניגוד מוחלט לכוונה המתועדת בקוד ובמיגרציה 27.
- **הצעת כיוון לתיקון:** להוסיף policy מסוג `for delete` על `public.notifications` שמתירה מחיקה לפחות ל-managers של אותה חברה (`using (can_manage_company(company_id))`), בדומה ל-policy של ה-update הקיים; או לחלופין להחזיר מנגנון ניקוי שרץ עם הרשאות גבוהות (כמו ה-cron/trigger שהיה במיגרציה 26, או פונקציית `security definer`).
- **נמצא בתאריך:** 2026-08-23

---

## [סטטוס: טופל — 2026-08-23, מיגרציה `30_document_upload_trigger_owner_check.sql` (ממתינה להרצה מול ה-DB)] טריגר ההתראה על העלאת מסמך לא בודק ש-owner_id שייך למעלה בפועל
- **קובץ:** `supabase/sql/28_notify_on_driver_document_upload.sql:15-19`
- **קטגוריה:** ביצועים/עקביות (חוסן קוד, לא חור אבטחה בפועל)
- **חומרה:** נמוכה
- **תיאור:** הפונקציה `log_driver_document_upload()` בודקת רק ש-`current_role_name() = 'driver'` וש-`new.owner_type = 'driver'`, אך לא בודקת ש-`new.owner_id = auth.uid()` (בניגוד לטריגר המקביל `log_driver_self_edit()` במיגרציה 25, ששם יש בדיקה מפורשת `new.id is distinct from auth.uid()`). כרגע זה לא מנוצל לרעה כי ה-RLS policy "driver manages own documents" (22_driver_self_service.sql) כבר אוכפת `owner_id = auth.uid()` ברמת ה-insert, כך שבפועל התנאי תמיד מתקיים — אבל זו אי-עקביות בין שני הטריגרים הדומים, ואם ה-RLS policy אי-פעם תשתנה (למשל תתאפשר לאדמין להעלות מסמך בשם נהג), הטריגר הזה יתחיל לשלוח התראות עם ניסוח שגוי ("X העלה/תה מסמך") גם כשלא X העלה בפועל.
- **הצעת כיוון לתיקון:** להוסיף `or new.owner_id is distinct from auth.uid()` לתנאי היציאה המוקדמת של הפונקציה, ליישור עם הדפוס של `log_driver_self_edit()`.
- **נמצא בתאריך:** 2026-08-23
