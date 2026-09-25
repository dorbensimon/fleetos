import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { showAlert } from '../lib/platformAlert';
import { useCompany } from '../lib/CompanyContext';
import { RootStackParamList } from '../navigation/types';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { countUnreadNotifications } from '../lib/adminApi';
import { listSignatureRequests } from '../lib/docuseal';
import { STATUS } from '../components/driverKit/theme';
import { MenuMobile, type MenuGroup } from './MenuMobile';

/**
 * Full-screen menu reached from the home screen's menu button. The same
 * screen for every role; the groups are chosen by `profile.role`.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'Menu'>;

const ROLE_LABEL: Record<string, string> = {
  owner: 'בעל החברה',
  admin: 'מנהל צי',
  driver: 'נהג',
};

export default function MenuScreen({ navigation }: Props) {
  const { profile, company } = useCompany();
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const role = profile?.role;
  const [counts, setCounts] = React.useState({ unread: 0, signatures: 0 });

  // Live counts beside the menu items; the menu works without them.
  React.useEffect(() => {
    if (isDesktop || !role) return;
    let alive = true;
    Promise.all([
      company?.id ? countUnreadNotifications(company.id).catch(() => 0) : Promise.resolve(0),
      role === 'driver'
        ? listSignatureRequests()
            .then((rows) => rows.filter((r) => r.status === 'pending' && !!r.docuseal_submitter_slug).length)
            .catch(() => 0)
        : Promise.resolve(0),
    ]).then(([unread, signatures]) => alive && setCounts({ unread, signatures }));
    return () => {
      alive = false;
    };
  }, [company?.id, isDesktop, role]);

  // The desktop sidebar already exposes every item this menu offers, so
  // anyone who lands on its URL there goes to their own profile instead.
  React.useEffect(() => {
    if (isDesktop) navigation.replace(role === 'driver' ? 'DriverProfile' : 'AdminProfile');
  }, [isDesktop, navigation, role]);
  if (isDesktop) return null;

  const completeLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch {
      showAlert('ההתנתקות נכשלה', 'נסה שוב בעוד רגע.');
    }
  };

  const logout = () => {
    showAlert('התנתקות', 'האם אתה בטוח שברצונך להתנתק מהחשבון?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'התנתק', style: 'destructive', onPress: completeLogout },
    ]);
  };

  const notifications: MenuGroup = {
    title: 'התראות',
    rows: [
      {
        key: 'notifications',
        icon: 'notifications',
        title: 'כל ההתראות',
        subtitle: counts.unread ? `${counts.unread} חדשות` : 'אין התראות חדשות',
        count: counts.unread,
        onPress: () => navigation.navigate('Notifications'),
      },
      {
        key: 'prefs',
        icon: 'options',
        title: 'ניהול התראות',
        subtitle: 'בחירת העדכונים שיישלחו אליך',
        onPress: () => navigation.navigate('NotificationPreferences'),
      },
    ],
  };

  const legal: MenuGroup = {
    title: 'מידע משפטי ונגישות',
    rows: [
      { key: 'terms', icon: 'document-text', title: 'תנאי שימוש', onPress: () => navigation.navigate('Legal', { doc: 'terms' }) },
      { key: 'privacy', icon: 'lock-closed', title: 'מדיניות פרטיות', onPress: () => navigation.navigate('Legal', { doc: 'privacy' }) },
      { key: 'cookies', icon: 'server', title: 'מדיניות עוגיות', onPress: () => navigation.navigate('Legal', { doc: 'cookies' }) },
      { key: 'accessibility', icon: 'accessibility', title: 'הצהרת נגישות', onPress: () => navigation.navigate('Legal', { doc: 'accessibility' }) },
    ],
  };

  const roleGroups: MenuGroup[] =
    role === 'driver'
      ? [
          {
            rows: [
              { key: 'profile', icon: 'person', title: 'הפרטים שלי', subtitle: 'טלפון, כתובת ורישיון נהיגה', onPress: () => navigation.navigate('DriverProfile') },
              { key: 'docs', icon: 'folder-open', title: 'המסמכים שלי', subtitle: 'רישיון, תיק נהג והדרכות', onPress: () => navigation.navigate('DriverDocuments') },
              {
                key: 'signing',
                icon: 'create',
                title: 'מסמכים לחתימה',
                subtitle: counts.signatures ? 'מחכים לחתימה שלך' : 'אין כרגע מה לחתום',
                count: counts.signatures,
                countTone: 'soon',
                onPress: () => navigation.navigate('DriverSigningDocuments'),
              },
            ],
          },
          notifications,
        ]
      : role === 'admin'
        ? [
            {
              rows: [
                { key: 'profile', icon: 'person', title: 'הפרטים שלי', subtitle: 'שם, טלפון, מייל וסיסמה', onPress: () => navigation.navigate('AdminProfile') },
                { key: 'attention', icon: 'alert-circle', tint: STATUS.expired.fg, title: 'דורש טיפול', subtitle: 'רישיונות, ביטוחים ורכבים בלי נהג', onPress: () => navigation.navigate('Attention') },
              ],
            },
            {
              title: 'ניהול הצי',
              rows: [
                { key: 'departments', icon: 'business', title: 'מחלקות', subtitle: 'חלוקת הנהגים והרכבים', onPress: () => navigation.navigate('Departments') },
                { key: 'archive', icon: 'archive', title: 'ארכיון נהגים', subtitle: 'שחזור או מחיקה לצמיתות', onPress: () => navigation.navigate('DriverArchive') },
                { key: 'reports', icon: 'stats-chart', title: 'ייצוא דוחות', subtitle: 'דוחות נהגים ורכבים לאקסל', onPress: () => navigation.navigate('Reports') },
              ],
            },
            {
              title: 'החברה',
              rows: [
                { key: 'companyDocs', icon: 'folder-open', title: 'מסמכי חברה', subtitle: 'רישיון מוביל, ביטוחים ונהלים', onPress: () => navigation.navigate('CompanyDocuments') },
                { key: 'signedDocs', icon: 'create', title: 'מסמכים חתומים', subtitle: 'צפייה, שליחה לנהגים ומחיקה', onPress: () => navigation.navigate('SignedDocuments') },
                { key: 'settings', icon: 'settings', title: 'הגדרות החברה', subtitle: 'פרטים, אנשי קשר, לוגו וחותמת', onPress: () => navigation.navigate('CompanySettings') },
              ],
            },
            notifications,
          ]
        : [
            {
              rows: [
                { key: 'profile', icon: 'person', title: 'הפרטים שלי', onPress: () => navigation.navigate('AdminProfile') },
                { key: 'departments', icon: 'business', title: 'מחלקות', onPress: () => navigation.navigate('Departments') },
              ],
            },
            notifications,
          ];

  const groups = [...roleGroups, legal];

  return (
    <MenuMobile
      insetTop={insets.top}
      insetBottom={insets.bottom}
      name={profile?.full_name || ''}
      subtitle={profile?.job_title || (role ? ROLE_LABEL[role] : '')}
      companyName={company?.name || ''}
      groups={groups}
      onBack={() => navigation.goBack()}
      onProfile={() => navigation.navigate(role === 'driver' ? 'DriverProfile' : 'AdminProfile')}
      onLogout={logout}
    />
  );
}
