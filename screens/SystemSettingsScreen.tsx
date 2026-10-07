import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DriverPage, HeroTitle, KitSection, ListRow, Reveal } from '../components/driverKit';
import { LanguageRows, LanguageSection } from '../components/LanguagePicker';
import { DesktopShell } from '../components/desktop/DesktopShell';
import { DText, HoverPressable } from '../components/desktop/primitives';
import { DESKTOP_COLORS } from '../components/desktop/desktopTheme';
import { pageStyles } from '../components/desktop/record/RecordPage';
import { useIsDesktop } from '../lib/useDesktopLayout';
import type { RootStackParamList } from '../navigation/types';
import { t, dirIcon } from '../lib/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'SystemSettings'>;
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const LEGAL_ROWS: { doc: RootStackParamList['Legal']['doc']; icon: IconName; label: () => string }[] = [
  { doc: 'terms', icon: 'document-text', label: () => t('legal.terms') },
  { doc: 'privacy', icon: 'lock-closed', label: () => t('legal.privacyPolicyShort') },
  { doc: 'cookies', icon: 'server', label: () => t('legal.cookiePolicy') },
  { doc: 'accessibility', icon: 'accessibility', label: () => t('legal.accessibilityStatement') },
];

/**
 * "הגדרות מערכת", for every role: the app's language, and the terms,
 * privacy, cookies and accessibility pages.
 */
export default function SystemSettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const openLegal = (doc: RootStackParamList['Legal']['doc']) => navigation.navigate('Legal', { doc });

  if (isDesktop) {
    return (
      <DesktopShell active="SystemSettings" breadcrumbs={[t('nav.systemSettings')]}>
        <ScrollView style={pageStyles.root} contentContainerStyle={pageStyles.content}>
          {/* The night header shared with the other desktop pages. */}
          <View style={[pageStyles.hero, pageStyles.heroNight, pageStyles.enter]}>
            <View pointerEvents="none" style={[pageStyles.heroGlow, pageStyles.heroGlowBlue]} />
            <View pointerEvents="none" style={[pageStyles.heroGlow, pageStyles.heroGlowCyan]} />
            <View style={ds.heroIcon}>
              <Ionicons name="settings" size={22} color="#FFFFFF" />
            </View>
            <View style={pageStyles.heroIdentity}>
              <DText weight="bold" style={[pageStyles.heroName, pageStyles.heroNameOnDark]} accessibilityRole="header">{t('nav.systemSettings')}</DText>
              <DText style={[pageStyles.heroSubText, pageStyles.heroSubTextOnDark]}>{t('menu.systemSettingsSubtitle')}</DText>
            </View>
          </View>
          <View style={ds.columns}>
            <View style={ds.column}>
              <DText weight="bold" style={ds.sectionTitle}>{t('settings.language')}</DText>
              <View style={ds.card}>
                <LanguageRows />
              </View>
            </View>
            <View style={ds.column}>
              <DText weight="bold" style={ds.sectionTitle}>{t('menu.legal')}</DText>
              <View style={ds.card}>
                {LEGAL_ROWS.map((row, index) => (
                  <HoverPressable key={row.doc} style={[ds.row, index > 0 && ds.rowDivider]} hoverStyle={ds.rowHover} onPress={() => openLegal(row.doc)} accessibilityRole="link">
                    <Ionicons name={`${row.icon}-outline` as IconName} size={16} color={DESKTOP_COLORS.brand} />
                    <DText weight="medium" style={ds.rowLabel}>{row.label()}</DText>
                    <Ionicons name={dirIcon('chevron-back')} size={15} color={DESKTOP_COLORS.inkFaint} />
                  </HoverPressable>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>
      </DesktopShell>
    );
  }

  return (
    <DriverPage insetTop={insets.top} insetBottom={insets.bottom} hero={<HeroTitle title={t('nav.systemSettings')} onBack={() => navigation.goBack()} />}>
      <Reveal>
        <LanguageSection />
      </Reveal>
      <Reveal index={1}>
        <KitSection title={t('menu.legal')}>
          {LEGAL_ROWS.map((row, index) => (
            <ListRow key={row.doc} first={index === 0} icon={row.icon} title={row.label()} onPress={() => openLegal(row.doc)} />
          ))}
        </KitSection>
      </Reveal>
    </DriverPage>
  );
}

const ds = StyleSheet.create({
  heroIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  columns: { flexDirection: 'row-reverse', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 },
  column: { flexGrow: 1, flexBasis: 360, minWidth: 0 },
  sectionTitle: { fontSize: 14, color: DESKTOP_COLORS.ink, marginTop: 4, marginBottom: 8 },
  card: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 46 },
  rowDivider: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  rowLabel: { flex: 1, fontSize: 13, color: DESKTOP_COLORS.ink },
});
