// דוחות תעבורה: כל הדוחות של החברה במסך אחד
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DText } from '../../components/desktop/primitives';
import { pageStyles } from '../../components/desktop/record/RecordPage';
import { TrafficReportsPanel } from '../../components/desktop/TrafficReportsCenter';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { t } from '../../lib/i18n';

/**
 * The company's traffic reports, opened from the dashboard header button.
 * Same night header as the other desktop pages; the list, filters, export
 * and the report editor are TrafficReportsPanel.
 */
export default function TrafficReportsScreen() {
  const isDesktop = useIsDesktop();
  const page = (
    <ScrollView style={pageStyles.root} contentContainerStyle={pageStyles.content}>
      <View style={[pageStyles.hero, pageStyles.heroNight, pageStyles.enter]}>
        <View style={[pageStyles.heroGlow, pageStyles.heroGlowBlue, { pointerEvents: 'none' }]} />
        <View style={[pageStyles.heroGlow, pageStyles.heroGlowCyan, { pointerEvents: 'none' }]} />
        <View style={styles.heroIcon}>
          <Ionicons name="warning" size={22} color="#FFFFFF" />
        </View>
        <View style={pageStyles.heroIdentity}>
          <DText weight="bold" style={[pageStyles.heroName, pageStyles.heroNameOnDark]} accessibilityRole="header">{t('folder.trafficReports')}</DText>
          <DText style={[pageStyles.heroSubText, pageStyles.heroSubTextOnDark]}>{t('trafficReport.pageSubtitle')}</DText>
        </View>
      </View>
      <View style={[pageStyles.card, styles.card]}>
        <TrafficReportsPanel />
      </View>
    </ScrollView>
  );
  if (!isDesktop) return page;
  return (
    <DesktopShell active="AdminHome" breadcrumbs={[t('nav.management'), t('folder.trafficReports')]}>
      {page}
    </DesktopShell>
  );
}

const styles = StyleSheet.create({
  heroIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16 },
});
