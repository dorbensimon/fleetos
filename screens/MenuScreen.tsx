import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from '../lib/signOut';
import { showAlert } from '../lib/platformAlert';
import { useCompany } from '../lib/CompanyContext';
import { RootStackParamList } from '../navigation/types';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { countUnreadNotifications } from '../lib/adminApi';
import { countUnreadOwnerNotifications } from '../lib/ownerNotifications';
import { listSignatureRequests } from '../lib/docuseal';
import { STATUS } from '../components/driverKit/theme';
import { MenuMobile, type MenuGroup } from './MenuMobile';
import { t } from '../lib/i18n';

/**
 * Full-screen menu reached from the home screen's menu button. The same
 * screen for every role; the groups are chosen by `profile.role`.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'Menu'>;

const ROLE_LABEL: Record<string, string> = {
  get owner() { return t('role.owner'); },
  get admin() { return t('role.fleetManager'); },
  get driver() { return t('role.driver'); },
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
      role === 'owner'
        ? countUnreadOwnerNotifications().catch(() => 0)
        : company?.id
          ? countUnreadNotifications(company.id).catch(() => 0)
          : Promise.resolve(0),
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
      await signOut();
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch {
      showAlert(t('auth.signOutFailed'), t('common.tryAgainShortly'));
    }
  };

  const logout = () => {
    showAlert(t('auth.signOut'), t('auth.signOutConfirmLong'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.signOutAction'), style: 'destructive', onPress: completeLogout },
    ]);
  };

  const notifications: MenuGroup = {
    title: t('notifications.title'),
    rows: [
      {
        key: 'notifications',
        icon: 'notifications',
        title: t('menu.allNotifications'),
        subtitle: counts.unread ? t('menu.newCount', { unread: counts.unread }) : t('menu.noNew'),
        count: counts.unread,
        onPress: () => navigation.navigate('Notifications'),
      },
      {
        key: 'prefs',
        icon: 'options',
        title: t('owner.notif.manage'),
        subtitle: t('owner.notif.manageHint'),
        onPress: () => navigation.navigate('NotificationPreferences'),
      },
    ],
  };

  const system: MenuGroup = {
    rows: [
      { key: 'system', icon: 'cog', title: t('nav.systemSettings'), subtitle: t('menu.systemSettingsSubtitle'), onPress: () => navigation.navigate('SystemSettings') },
    ],
  };

  const roleGroups: MenuGroup[] =
    role === 'driver'
      ? [
          {
            rows: [
              { key: 'profile', icon: 'person', title: t('nav.myDetails'), subtitle: t('menu.driverDetailsSubtitle'), onPress: () => navigation.navigate('DriverProfile') },
              { key: 'docs', icon: 'folder-open', title: t('nav.myDocuments'), subtitle: t('driver.licenseFileTraining'), onPress: () => navigation.navigate('DriverDocuments') },
              {
                key: 'signing',
                icon: 'create',
                title: t('nav.signingDocuments'),
                subtitle: counts.signatures ? t('signing.waitingForYou') : t('menu.nothingToSign'),
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
                { key: 'profile', icon: 'person', title: t('nav.myDetails'), subtitle: t('menu.profileSubtitle'), onPress: () => navigation.navigate('AdminProfile') },
                { key: 'attention', icon: 'alert-circle', tint: STATUS.expired.fg, title: t('status.needsAttention'), subtitle: t('menu.attentionSubtitle'), onPress: () => navigation.navigate('Attention') },
              ],
            },
            {
              title: t('menu.fleetManagement'),
              rows: [
                { key: 'departments', icon: 'business', title: t('departments.title'), subtitle: t('menu.departmentsSubtitle'), onPress: () => navigation.navigate('Departments') },
                { key: 'archive', icon: 'archive', title: t('fleet.driverArchive'), subtitle: t('menu.archiveSubtitle'), onPress: () => navigation.navigate('DriverArchive') },
                { key: 'reports', icon: 'stats-chart', title: t('reports.export'), subtitle: t('menu.reportsSubtitle'), onPress: () => navigation.navigate('Reports') },
              ],
            },
            {
              title: t('owner.theCompany'),
              rows: [
                { key: 'companyDocs', icon: 'folder-open', title: t('nav.companyDocuments'), subtitle: t('menu.companyDocsSubtitle'), onPress: () => navigation.navigate('CompanyDocuments') },
                { key: 'signedDocs', icon: 'create', title: t('nav.signedDocuments'), subtitle: t('menu.signedDocsSubtitle'), onPress: () => navigation.navigate('SignedDocuments') },
                { key: 'inspections', icon: 'shield-checkmark', title: t('nav.safetyInspections'), subtitle: t('menu.inspectionsSubtitle'), onPress: () => navigation.navigate('SafetyInspections') },
                { key: 'settings', icon: 'settings', title: t('nav.companySettings'), subtitle: t('settings.companySettingsSubtitle'), onPress: () => navigation.navigate('CompanySettings') },
              ],
            },
            notifications,
          ]
        : [
            // The owner runs the platform, not a fleet: no departments or
            // drivers here, only the companies and their own feed.
            {
              rows: [
                { key: 'profile', icon: 'person', title: t('nav.myDetails'), subtitle: t('menu.profileSubtitle'), onPress: () => navigation.navigate('AdminProfile') },
                { key: 'console', icon: 'business', title: t('nav.controlCenter'), subtitle: t('menu.consoleSubtitle'), onPress: () => navigation.navigate('OwnerHome') },
              ],
            },
            {
              ...notifications,
              rows: notifications.rows.map((row) =>
                row.key === 'notifications' ? { ...row, subtitle: counts.unread ? t('menu.ownerNewUpdates', { unread: counts.unread }) : t('menu.ownerUpdatesSubtitle') } : row,
              ),
            },
          ];

  const groups = [...roleGroups, system];

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
