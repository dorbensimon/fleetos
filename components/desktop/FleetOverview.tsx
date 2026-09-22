import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ComplianceItem, DriverRow, Vehicle, VehicleDriverWithProfile } from '../../lib/adminApi';
import { useCompany } from '../../lib/CompanyContext';
import { formatPlate } from '../../lib/plate';
import { expiryState } from '../../lib/theme';
import { DText, HoverPressable, prefersReducedMotion } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';
import { DesktopModal } from './DesktopModal';
import { DepartmentsQuickAction, ReportsQuickAction } from './DashboardWidgets';

/**
 * Top of the desktop dashboard: a personal greeting, a "fleet health"
 * breakdown whose legend rows filter the table below, and an inline
 * "needs attention" queue. Everything is derived from the data FleetScreen
 * already loaded, so the overview and the table can never disagree.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type OverviewFocus =
  | { mode: 'drivers'; filter: 'all' | 'soon' | 'expired' | 'no_vehicle' }
  | { mode: 'vehicles'; filter: 'all' | 'active' | 'maintenance' | 'disabled' };

type AttentionItem = {
  id: string;
  icon: IconName;
  title: string;
  subtitle: string;
  tone: DesktopTone;
  onPress: () => void;
};

const ATTENTION_PREVIEW = 6;
const TONE_ORDER: Record<DesktopTone, number> = { bad: 0, warn: 1, neutral: 2, ok: 3 };
const TABULAR = webOnly({ fontVariantNumeric: 'tabular-nums' });

function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  if (hour >= 17 && hour < 22) return 'ערב טוב';
  return 'לילה טוב';
}

export function FleetOverview({
  drivers,
  vehicles,
  compliance,
  vehicleDrivers,
  loading,
  onFocus,
  onOpenDriver,
  onOpenVehicle,
}: {
  drivers: DriverRow[];
  vehicles: Vehicle[];
  compliance: Map<string, ComplianceItem[]>;
  vehicleDrivers: Map<string, VehicleDriverWithProfile[]>;
  loading: boolean;
  onFocus: (focus: OverviewFocus) => void;
  onOpenDriver: (driverId: string) => void;
  onOpenVehicle: (vehicleId: string) => void;
}) {
  const { profile } = useCompany();
  const [showAll, setShowAll] = useState(false);
  const reduced = prefersReducedMotion();

  const now = new Date();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? '';
  const greeting = firstName ? `${greetingFor(now.getHours())}, ${firstName}` : greetingFor(now.getHours());
  const dateLine = now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

  const liveVehicles = useMemo(() => vehicles.filter((v) => v.status !== 'archived'), [vehicles]);

  const driverHealth = useMemo(() => {
    const counts = { ok: 0, soon: 0, expired: 0, missing: 0, noVehicle: 0 };
    drivers.forEach((d) => {
      const state = expiryState(d.license_expiry);
      counts[state === 'optional' ? 'missing' : state] += 1;
      if (!d.vehicle_plate) counts.noVehicle += 1;
    });
    return counts;
  }, [drivers]);

  const vehicleHealth = useMemo(() => {
    const counts = { active: 0, maintenance: 0, disabled: 0, uninsured: 0 };
    liveVehicles.forEach((v) => {
      if (v.status === 'active' || v.status === 'maintenance' || v.status === 'disabled') counts[v.status] += 1;
      const insurance = compliance.get(v.id)?.find((c) => c.item_type === 'insurance_mandatory');
      const state = expiryState(insurance?.expiry_date);
      if (state === 'missing' || state === 'expired') counts.uninsured += 1;
    });
    return counts;
  }, [liveVehicles, compliance]);

  const attention = useMemo<AttentionItem[]>(() => {
    const rows: AttentionItem[] = [];
    drivers.forEach((d) => {
      const state = expiryState(d.license_expiry);
      if (state === 'expired' || state === 'soon') {
        rows.push({
          id: `dl-${d.id}`,
          icon: 'card-outline',
          title: d.full_name || 'נהג ללא שם',
          subtitle: state === 'expired' ? 'רישיון נהיגה פג תוקף' : 'רישיון נהיגה קרוב לפוג',
          tone: state === 'expired' ? 'bad' : 'warn',
          onPress: () => onOpenDriver(d.id),
        });
      }
    });
    liveVehicles.forEach((v) => {
      const insurance = compliance.get(v.id)?.find((c) => c.item_type === 'insurance_mandatory');
      const state = expiryState(insurance?.expiry_date);
      if (state === 'missing' || state === 'expired') {
        rows.push({
          id: `vi-${v.id}`,
          icon: 'shield-outline',
          title: formatPlate(v.plate_number),
          subtitle: state === 'missing' ? 'ללא ביטוח חובה בתוקף' : 'ביטוח חובה פג תוקף',
          tone: 'bad',
          onPress: () => onOpenVehicle(v.id),
        });
      }
      if (!(vehicleDrivers.get(v.id)?.length)) {
        rows.push({
          id: `vu-${v.id}`,
          icon: 'car-outline',
          title: formatPlate(v.plate_number),
          subtitle: 'ללא נהג משויך',
          tone: 'neutral',
          onPress: () => onOpenVehicle(v.id),
        });
      }
    });
    return rows.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
  }, [drivers, liveVehicles, compliance, vehicleDrivers, onOpenDriver, onOpenVehicle]);

  const urgentCount = attention.filter((row) => row.tone === 'bad').length;
  const validPct = drivers.length ? Math.round((driverHealth.ok / drivers.length) * 100) : 0;

  return (
    <View style={styles.root}>
      <View style={[styles.header, enter(0, reduced)]}>
        <View style={styles.headerText}>
          <DText weight="bold" style={styles.greeting}>{greeting}</DText>
          <DText style={styles.dateLine}>{dateLine}</DText>
        </View>
        <View style={styles.headerActions}>
          <ReportsQuickAction />
          <DepartmentsQuickAction />
        </View>
      </View>

      <View style={styles.grid}>
        {/* מצב הצי */}
        <View style={[styles.panel, styles.healthPanel, enter(1, reduced)]}>
          <PanelTitle title="מצב הצי" caption="לחיצה על שורה מסננת את הרשימה" />
          <View style={styles.healthColumns}>
            <HealthColumn
              label="נהגים פעילים"
              total={drivers.length}
              caption={drivers.length ? `${validPct}% עם רישיון בתוקף` : 'עדיין אין נהגים'}
              loading={loading}
              reduced={reduced}
              segments={[
                { key: 'ok', label: 'רישיון בתוקף', count: driverHealth.ok, tone: 'ok' },
                { key: 'soon', label: 'קרוב לפוג', count: driverHealth.soon, tone: 'warn', onPress: () => onFocus({ mode: 'drivers', filter: 'soon' }) },
                { key: 'expired', label: 'רישיון פג', count: driverHealth.expired, tone: 'bad', onPress: () => onFocus({ mode: 'drivers', filter: 'expired' }) },
                { key: 'missing', label: 'ללא תוקף מוזן', count: driverHealth.missing, tone: 'neutral' },
              ]}
              footnote={{ label: 'ללא רכב משויך', count: driverHealth.noVehicle, onPress: () => onFocus({ mode: 'drivers', filter: 'no_vehicle' }) }}
            />
            <View style={styles.columnRule} />
            <HealthColumn
              label="רכבים בצי"
              total={liveVehicles.length}
              caption={liveVehicles.length ? `${vehicleHealth.active} זמינים לנסיעה` : 'עדיין אין רכבים'}
              loading={loading}
              reduced={reduced}
              segments={[
                { key: 'active', label: 'פעיל', count: vehicleHealth.active, tone: 'ok', onPress: () => onFocus({ mode: 'vehicles', filter: 'active' }) },
                { key: 'maintenance', label: 'בטיפול', count: vehicleHealth.maintenance, tone: 'warn', onPress: () => onFocus({ mode: 'vehicles', filter: 'maintenance' }) },
                { key: 'disabled', label: 'מושבת', count: vehicleHealth.disabled, tone: 'neutral', onPress: () => onFocus({ mode: 'vehicles', filter: 'disabled' }) },
              ]}
              footnote={{ label: 'ביטוח חובה לא בתוקף', count: vehicleHealth.uninsured, tone: vehicleHealth.uninsured > 0 ? 'bad' : undefined }}
            />
          </View>
        </View>

        {/* דרוש טיפול */}
        <View style={[styles.panel, styles.attentionPanel, enter(2, reduced)]}>
          <View style={styles.attentionHead}>
            <PanelTitle title="דרוש טיפול" />
            {!loading && attention.length > 0 && (
              <View style={styles.attentionCount}>
                {urgentCount > 0 && <View style={[styles.pulseDot, !reduced && styles.pulseDotAnim]} />}
                <DText weight="semiBold" style={[styles.attentionCountText, TABULAR]}>
                  {urgentCount > 0 ? `${urgentCount} דחופים · ${attention.length} סה״כ` : `${attention.length} פתוחים`}
                </DText>
              </View>
            )}
          </View>

          {loading ? (
            <View style={styles.attentionList}>
              {Array.from({ length: 4 }, (_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <View style={styles.skeletonIcon} />
                  <View style={styles.skeletonLines}>
                    <View style={[styles.skeletonBar, { width: '55%' }]} />
                    <View style={[styles.skeletonBar, { width: '35%', height: 8 }]} />
                  </View>
                </View>
              ))}
            </View>
          ) : attention.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="checkmark" size={18} color={DESKTOP_TONES.ok.fg} />
              </View>
              <DText weight="semiBold" style={styles.emptyTitle}>אין פריטים פתוחים</DText>
              <DText style={styles.emptyHint}>כל הרישיונות והביטוחים בתוקף, וכל הרכבים משויכים לנהג.</DText>
            </View>
          ) : (
            <>
              <View style={styles.attentionList}>
                {attention.slice(0, ATTENTION_PREVIEW).map((row, index) => (
                  <AttentionRow key={row.id} row={row} style={enterRow(index, reduced)} />
                ))}
              </View>
              {attention.length > ATTENTION_PREVIEW && (
                <HoverPressable style={styles.showAll} hoverStyle={styles.showAllHover} onPress={() => setShowAll(true)}>
                  <DText weight="semiBold" style={styles.showAllText}>הצג את כל {attention.length} הפריטים</DText>
                  <Ionicons name="arrow-back" size={13} color={DESKTOP_COLORS.brand} />
                </HoverPressable>
              )}
            </>
          )}
        </View>
      </View>

      <DesktopModal visible={showAll} title="דרוש טיפול" onClose={() => setShowAll(false)}>
        <View style={styles.modalList}>
          {attention.map((row) => (
            <AttentionRow key={row.id} row={{ ...row, onPress: () => { setShowAll(false); row.onPress(); } }} />
          ))}
        </View>
      </DesktopModal>
    </View>
  );
}

/* ------------------------------------------------------------------ */

type Segment = { key: string; label: string; count: number; tone: DesktopTone; onPress?: () => void };

const SEGMENT_COLOR: Record<DesktopTone, string> = {
  ok: DESKTOP_TONES.ok.fg,
  warn: '#E8930C',
  bad: DESKTOP_TONES.bad.fg,
  neutral: '#C3CBD2',
};

function HealthColumn({
  label,
  total,
  caption,
  segments,
  footnote,
  loading,
  reduced,
}: {
  label: string;
  total: number;
  caption: string;
  segments: Segment[];
  footnote: { label: string; count: number; tone?: DesktopTone; onPress?: () => void };
  loading: boolean;
  reduced: boolean;
}) {
  const visible = segments.filter((s) => s.count > 0);

  return (
    <View style={styles.healthColumn}>
      <DText weight="semiBold" style={styles.columnLabel}>{label}</DText>
      {loading ? (
        <>
          <View style={[styles.skeletonBar, { width: 64, height: 30, marginTop: 6 }]} />
          <View style={[styles.skeletonBar, { width: '100%', height: 8, marginTop: 14 }]} />
        </>
      ) : (
        <>
          <View style={styles.figureRow}>
            <DText weight="bold" style={[styles.figure, TABULAR]}>{total}</DText>
            <DText style={styles.figureCaption}>{caption}</DText>
          </View>
          <View style={styles.bar}>
            {visible.length === 0 ? (
              <View style={[styles.barSegment, { flex: 1, backgroundColor: DESKTOP_COLORS.borderSoft }]} />
            ) : (
              visible.map((segment, index) => (
                <View
                  key={segment.key}
                  style={[
                    styles.barSegment,
                    { flex: segment.count, backgroundColor: SEGMENT_COLOR[segment.tone] },
                    !reduced && barGrow(index),
                  ]}
                />
              ))
            )}
          </View>
        </>
      )}

      <View style={styles.legend}>
        {segments.map((segment) => (
          <LegendRow key={segment.key} label={segment.label} count={segment.count} tone={segment.tone} loading={loading} onPress={segment.onPress} />
        ))}
        <View style={styles.legendRule} />
        <LegendRow label={footnote.label} count={footnote.count} tone={footnote.tone} loading={loading} onPress={footnote.onPress} plain />
      </View>
    </View>
  );
}

function LegendRow({
  label,
  count,
  tone,
  loading,
  onPress,
  plain,
}: {
  label: string;
  count: number;
  tone?: DesktopTone;
  loading: boolean;
  onPress?: () => void;
  plain?: boolean;
}) {
  const muted = !loading && count === 0;
  const content = (
    <>
      {plain ? (
        <Ionicons name="remove-outline" size={10} color={DESKTOP_COLORS.inkFaint} style={styles.legendDash} />
      ) : (
        <View style={[styles.legendSwatch, { backgroundColor: tone ? SEGMENT_COLOR[tone] : DESKTOP_COLORS.inkFaint }, muted && styles.legendSwatchMuted]} />
      )}
      <DText style={[styles.legendLabel, muted && styles.legendMuted]} numberOfLines={1}>{label}</DText>
      <DText
        weight="semiBold"
        style={[
          styles.legendCount,
          TABULAR,
          muted && styles.legendMuted,
          !muted && tone && tone !== 'ok' && tone !== 'neutral' ? { color: DESKTOP_TONES[tone].fg } : null,
        ]}
      >
        {loading ? '–' : count}
      </DText>
      <Ionicons name="chevron-back" size={11} color={onPress ? DESKTOP_COLORS.inkFaint : 'transparent'} />
    </>
  );

  if (!onPress || loading) return <View style={styles.legendRow}>{content}</View>;
  return (
    <HoverPressable style={styles.legendRow} hoverStyle={styles.legendRowHover} pressStyle={styles.pressDown} onPress={onPress}>
      {content}
    </HoverPressable>
  );
}

function AttentionRow({ row, style }: { row: AttentionItem; style?: object | false }) {
  const tone = DESKTOP_TONES[row.tone];
  return (
    <HoverPressable style={[styles.attentionRow, style || null]} hoverStyle={styles.attentionRowHover} pressStyle={styles.pressDown} onPress={row.onPress}>
      <View style={[styles.attentionIcon, { backgroundColor: tone.bg }]}>
        <Ionicons name={row.icon} size={13} color={tone.fg} />
      </View>
      <View style={styles.attentionBody}>
        <DText weight="semiBold" style={styles.attentionTitle} numberOfLines={1}>{row.title}</DText>
        <DText style={[styles.attentionSubtitle, row.tone === 'bad' && { color: tone.fg }]} numberOfLines={1}>{row.subtitle}</DText>
      </View>
      <Ionicons name="chevron-back" size={12} color={DESKTOP_COLORS.inkFaint} />
    </HoverPressable>
  );
}

function PanelTitle({ title, caption }: { title: string; caption?: string }) {
  return (
    <View style={styles.panelTitleRow}>
      <DText weight="bold" style={styles.panelTitle}>{title}</DText>
      {!!caption && <DText style={styles.panelCaption}>{caption}</DText>}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Motion: web-only CSS keyframes, transform + opacity only.           */
/* ------------------------------------------------------------------ */

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

function enter(order: number, reduced: boolean) {
  return webOnly({
    animationKeyframes: reduced
      ? { from: { opacity: 0 }, to: { opacity: 1 } }
      : { from: { opacity: 0, transform: [{ translateY: 8 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } },
    animationDuration: reduced ? '120ms' : '520ms',
    animationTimingFunction: EASE_OUT,
    animationDelay: reduced ? '0ms' : `${order * 70}ms`,
    animationFillMode: 'backwards',
  });
}

function enterRow(index: number, reduced: boolean) {
  if (reduced) return false;
  return webOnly({
    animationKeyframes: { from: { opacity: 0, transform: [{ translateX: -6 }] }, to: { opacity: 1, transform: [{ translateX: 0 }] } },
    animationDuration: '380ms',
    animationTimingFunction: EASE_OUT,
    animationDelay: `${220 + index * 45}ms`,
    animationFillMode: 'backwards',
  });
}

function barGrow(index: number) {
  return webOnly({
    transformOrigin: 'right center',
    animationKeyframes: { from: { transform: [{ scaleX: 0 }] }, to: { transform: [{ scaleX: 1 }] } },
    animationDuration: '700ms',
    animationTimingFunction: EASE_OUT,
    animationDelay: `${180 + index * 90}ms`,
    animationFillMode: 'backwards',
  });
}

const styles = StyleSheet.create({
  root: { marginBottom: 26, gap: 16 },

  header: { flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 },
  headerText: { gap: 2 },
  greeting: { fontSize: 21, color: DESKTOP_COLORS.ink, letterSpacing: -0.3 },
  dateLine: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
  headerActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },

  grid: { flexDirection: 'row-reverse', alignItems: 'stretch', gap: 14 },
  panel: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    ...webOnly({ boxShadow: '0 1px 2px rgba(22,34,46,0.04), 0 12px 28px -18px rgba(22,34,46,0.14)' }),
  },
  healthPanel: { flex: 1.7, minWidth: 0 },
  attentionPanel: { flex: 1, minWidth: 0 },

  panelTitleRow: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 10 },
  panelTitle: { fontSize: 13.5, color: DESKTOP_COLORS.ink },
  panelCaption: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },

  healthColumns: { flexDirection: 'row-reverse', marginTop: 14, gap: 22 },
  columnRule: { width: 1, backgroundColor: DESKTOP_COLORS.borderSoft },
  healthColumn: { flex: 1, minWidth: 0 },
  columnLabel: { fontSize: 11.5, color: DESKTOP_COLORS.inkMuted },
  figureRow: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 10, marginTop: 2 },
  figure: { fontSize: 34, lineHeight: 42, color: DESKTOP_COLORS.ink, letterSpacing: -1 },
  figureCaption: { fontSize: 12, color: DESKTOP_COLORS.inkMuted },

  bar: { flexDirection: 'row-reverse', height: 8, gap: 2, marginTop: 8, borderRadius: 4, overflow: 'hidden' },
  barSegment: { height: 8 },

  legend: { marginTop: 12, gap: 1 },
  legendRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    borderRadius: 6,
    ...webOnly({ transition: 'background-color 140ms ease, transform 100ms ease-out' }),
  },
  legendRowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  legendSwatch: { width: 8, height: 8, borderRadius: 2 },
  legendSwatchMuted: { opacity: 0.35 },
  legendDash: { width: 8 },
  legendLabel: { flex: 1, fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  legendCount: { fontSize: 12.5, color: DESKTOP_COLORS.ink, minWidth: 20, textAlign: 'left' },
  legendMuted: { color: DESKTOP_COLORS.inkFaint },
  legendRule: { height: 1, backgroundColor: DESKTOP_COLORS.borderSoft, marginVertical: 5 },

  attentionHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  attentionCount: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderSoft,
  },
  attentionCountText: { fontSize: 11, color: DESKTOP_COLORS.inkMuted },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: DESKTOP_TONES.bad.fg },
  pulseDotAnim: webOnly({
    animationKeyframes: {
      '0%': { opacity: 1, transform: [{ scale: 1 }] },
      '50%': { opacity: 0.35, transform: [{ scale: 0.8 }] },
      '100%': { opacity: 1, transform: [{ scale: 1 }] },
    },
    animationDuration: '1800ms',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  }),

  attentionList: { marginTop: 10, gap: 1 },
  attentionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderRadius: 8,
    ...webOnly({ transition: 'background-color 140ms ease, transform 100ms ease-out' }),
  },
  attentionRowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  attentionIcon: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  attentionBody: { flex: 1, minWidth: 0, gap: 1 },
  attentionTitle: { fontSize: 12.5, color: DESKTOP_COLORS.ink },
  attentionSubtitle: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },

  showAll: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderRadius: 6,
  },
  showAllHover: { backgroundColor: DESKTOP_COLORS.brandFocusRing },
  showAllText: { fontSize: 12, color: DESKTOP_COLORS.brand },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 26, gap: 6 },
  emptyIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: DESKTOP_TONES.ok.bg, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 13, color: DESKTOP_COLORS.ink },
  emptyHint: { fontSize: 12, color: DESKTOP_COLORS.inkFaint, textAlign: 'center', maxWidth: 240 },

  skeletonRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 7 },
  skeletonIcon: { width: 28, height: 28, borderRadius: 7, backgroundColor: DESKTOP_COLORS.borderSoft },
  skeletonLines: { flex: 1, gap: 6, alignItems: 'flex-end' },
  skeletonBar: { height: 10, borderRadius: 4, backgroundColor: DESKTOP_COLORS.borderSoft },

  modalList: { paddingHorizontal: 18, paddingVertical: 8, gap: 1 },
  pressDown: { transform: [{ scale: 0.985 }] },
});
