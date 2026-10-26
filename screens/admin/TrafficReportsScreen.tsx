// דוחות תעבורה: כל הדוחות של החברה במסך אחד
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DText, HoverPressable } from '../../components/desktop/primitives';
import { webOnly } from '../../components/desktop/desktopTheme';
import { PageTour, type TourStep } from '../../components/desktop/PageTour';
import { pageStyles } from '../../components/desktop/record/RecordPage';
import { TrafficReportsPanel } from '../../components/desktop/TrafficReportsCenter';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { t } from '../../lib/i18n';

/**
 * The company's traffic reports, opened from the dashboard header button.
 * Same night header as the other desktop pages; the list, filters, export
 * and the report editor are TrafficReportsPanel. On a computer the "?"
 * next to the title walks through the page.
 */
export default function TrafficReportsScreen() {
  const isDesktop = useIsDesktop();
  const [touring, setTouring] = useState(false);
  const page = (
    <ScrollView style={pageStyles.root} contentContainerStyle={pageStyles.content}>
      <View nativeID="tour-hero" style={[pageStyles.hero, pageStyles.heroNight, pageStyles.enter]}>
        <View style={[pageStyles.heroGlow, pageStyles.heroGlowBlue, { pointerEvents: 'none' }]} />
        <View style={[pageStyles.heroGlow, pageStyles.heroGlowCyan, { pointerEvents: 'none' }]} />
        <View style={styles.heroIcon}>
          <Ionicons name="warning" size={22} color="#FFFFFF" />
        </View>
        <View style={pageStyles.heroIdentity}>
          <View style={styles.titleRow}>
            <DText weight="bold" style={[pageStyles.heroName, pageStyles.heroNameOnDark]} accessibilityRole="header">{t('folder.trafficReports')}</DText>
            {isDesktop && (
              <HoverPressable
                style={styles.helpBtn}
                hoverStyle={styles.helpBtnHover}
                onPress={() => setTouring(true)}
                accessibilityRole="button"
                accessibilityLabel={t('trafficReport.tourHelp')}
                {...webOnly({ title: t('trafficReport.tourHelp') })}
              >
                <DText weight="bold" style={styles.helpText}>?</DText>
              </HoverPressable>
            )}
          </View>
          <DText style={[pageStyles.heroSubText, pageStyles.heroSubTextOnDark]}>{t('trafficReport.pageSubtitle')}</DText>
        </View>
      </View>
      <View style={[pageStyles.card, styles.card]}>
        <TrafficReportsPanel />
      </View>
      {touring && <PageTour steps={TOUR_STEPS()} onClose={() => setTouring(false)} />}
    </ScrollView>
  );
  if (!isDesktop) return page;
  return (
    <DesktopShell active="AdminHome" breadcrumbs={[t('nav.management'), t('folder.trafficReports')]}>
      {page}
    </DesktopShell>
  );
}

// שלבי ההסבר על המסך
const TOUR_STEPS = (): TourStep[] =>
  (['intro', 'totals', 'views', 'search', 'export', 'new', 'range', 'list'] as const).map((k) => ({
    target: k === 'intro' ? 'tour-hero' : `tour-${k}`,
    title: t(`trafficReport.tour.${k}.title`),
    body: t(`trafficReport.tour.${k}.body`),
  }));

const styles = StyleSheet.create({
  heroIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  helpBtn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)' },
  helpBtnHover: { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: '#FFFFFF' },
  helpText: { fontSize: 14, lineHeight: 18, color: '#FFFFFF' },
  card: { padding: 16 },
});
