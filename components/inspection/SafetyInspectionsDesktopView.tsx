import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DesktopModal } from '../desktop/DesktopModal';
import { DesktopInput, DLtrText, DText, HoverPressable, StatusPill } from '../desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly, type DesktopTone } from '../desktop/desktopTheme';
import { Fact, GroupLabel, NIGHT_TONES, pageStyles } from '../desktop/record/RecordPage';
import { InspectionRemindersCard } from './InspectionRemindersCard';
import { defectsText } from './VehicleInspectionsCard';
import { formatPlate } from '../../lib/plate';
import { dueState, dueText } from '../../lib/meetingPlan';
import {
  INSPECTION_STATE_META,
  formatIsoDay,
  listStateOf,
  type InspectionListRow,
  type InspectionPlanRow,
  type InspectionState,
} from '../../lib/inspections';
import { t, dirIcon } from '../../lib/i18n';

export type InspectionFilter = 'all' | 'awaiting' | 'defects' | 'draft' | 'cancelled';

const STATE_TONE: Record<string, DesktopTone> = { ok: 'ok', soon: 'warn', expired: 'bad', missing: 'neutral', info: 'neutral' };

/**
 * "בדיקות בטיחות" on the desktop: the numbers that matter on top, every
 * inspection in a searchable table, and beside it the vehicles that are due
 * and the reminders that bring them up.
 */
export function SafetyInspectionsDesktopView({
  companyId,
  rows,
  plan,
  error,
  repeatMonths,
  onRepeatSaved,
  onRetry,
  onOpen,
  onStart,
  onEditList,
}: {
  companyId: string;
  rows: InspectionListRow[] | null;
  plan: InspectionPlanRow[];
  error: string;
  repeatMonths: number;
  onRepeatSaved: (months: number) => void;
  onRetry: () => void;
  onOpen: (vehicleId: string, inspectionId: string) => void;
  /** Starts an inspection of a vehicle, or continues its open draft. */
  onStart: (vehicleId: string) => void;
  onEditList: () => void;
}) {
  const [filter, setFilter] = useState<InspectionFilter>('all');
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const [pickQuery, setPickQuery] = useState('');

  const withState = useMemo(() => (rows ?? []).map((row) => ({ row, state: listStateOf(row) as InspectionState })), [rows]);
  const drafts = useMemo(() => new Set(withState.filter((x) => x.state === 'draft').map((x) => x.row.vehicle_id)), [withState]);
  const matches = (f: InspectionFilter, x: { row: InspectionListRow; state: InspectionState }) =>
    f === 'all' ||
    (f === 'awaiting' && (x.state === 'awaiting_driver' || x.state === 'requires_attention')) ||
    (f === 'draft' && x.state === 'draft') ||
    (f === 'defects' && x.row.defect_count > 0 && x.state !== 'cancelled' && x.state !== 'draft') ||
    (f === 'cancelled' && x.state === 'cancelled');
  const count = (f: InspectionFilter) => withState.filter((x) => matches(f, x)).length;
  const q = query.trim();
  const shown = withState
    .filter((x) => matches(filter, x))
    .filter((x) => !q || [x.row.vehicle?.plate_number, formatPlate(x.row.vehicle?.plate_number), x.row.vehicle?.manufacturer, x.row.vehicle?.model, x.row.driver?.full_name, x.row.officer_name]
      .some((v) => (v ?? '').includes(q)));

  const due = plan.filter((p) => p.nextDue && dueState(p.nextDue) !== 'later');
  const late = due.filter((p) => dueState(p.nextDue!) === 'late').length;
  const withDefects = plan.filter((p) => p.lastDefects > 0).length;

  const pq = pickQuery.trim();
  const pickable = plan.filter((p) => !pq || p.plate.includes(pq.replace(/\D/g, '') || '~') || p.vehicleLabel.includes(pq));
  const start = (vehicleId: string) => {
    setPicking(false);
    setPickQuery('');
    onStart(vehicleId);
  };

  const filters: { value: InspectionFilter; label: string }[] = [
    { value: 'all', label: t('common.allShort') },
    { value: 'awaiting', label: t('signing.pendingSignature') },
    { value: 'defects', label: t('vehicle.hasDefects') },
    { value: 'draft', label: t('inspection.drafts') },
    { value: 'cancelled', label: t('common.cancelled') },
  ];

  return (
    <ScrollView style={pageStyles.root} contentContainerStyle={pageStyles.content}>
      <View style={[pageStyles.hero, pageStyles.heroNight, pageStyles.enter]}>
        <View pointerEvents="none" style={[pageStyles.heroGlow, pageStyles.heroGlowBlue]} />
        <View pointerEvents="none" style={[pageStyles.heroGlow, pageStyles.heroGlowCyan]} />
        <View style={styles.heroIcon}>
          <Ionicons name="shield-checkmark" size={22} color="#FFFFFF" />
        </View>
        <View style={pageStyles.heroIdentity}>
          <DText weight="bold" style={[pageStyles.heroName, pageStyles.heroNameOnDark]} accessibilityRole="header">{t('nav.safetyInspections')}</DText>
          <DText style={[pageStyles.heroSubText, pageStyles.heroSubTextOnDark]}>{t('inspection.listSubtitle')}</DText>
        </View>
        {rows && (
          <View style={pageStyles.facts}>
            <Fact onDark label={t('inspection.kpiLate')} value={String(late)} color={late ? NIGHT_TONES.bad : undefined} muted={!late} />
            <Fact onDark label={t('inspection.kpiSoon')} value={String(due.length - late)} color={due.length - late ? NIGHT_TONES.warn : undefined} muted={!(due.length - late)} />
            <Fact onDark label={t('inspection.kpiAwaiting')} value={String(count('awaiting'))} muted={!count('awaiting')} />
            <Fact onDark label={t('inspection.kpiDefects')} value={String(withDefects)} color={withDefects ? NIGHT_TONES.bad : undefined} muted={!withDefects} />
          </View>
        )}
        <HoverPressable
          style={pageStyles.primaryBtn}
          hoverStyle={pageStyles.primaryBtnHover}
          pressStyle={pageStyles.pressDown}
          onPress={() => setPicking(true)}
          disabled={!plan.length}
        >
          <Ionicons name="add" size={17} color="#FFFFFF" />
          <DText weight="semiBold" style={pageStyles.primaryBtnText}>{t('inspection.new')}</DText>
        </HoverPressable>
      </View>

      <View style={pageStyles.gridRow}>
        <View style={pageStyles.mainCell}>
          <GroupLabel>{t('inspection.all')}</GroupLabel>
          <View style={[pageStyles.card, pageStyles.listCard]}>
            <View style={styles.toolbar}>
              <View style={styles.search}>
                <Ionicons name="search" size={15} color={DESKTOP_COLORS.inkFaint} style={styles.searchIcon} />
                <DesktopInput value={query} onChangeText={setQuery} placeholder={t('inspection.searchPlaceholder')} style={styles.searchInput} />
              </View>
              <View style={styles.tabs} accessibilityRole="tablist">
                {filters.map((f) => {
                  const on = f.value === filter;
                  const n = count(f.value);
                  return (
                    <HoverPressable
                      key={f.value}
                      style={[styles.tab, on && styles.tabOn]}
                      hoverStyle={on ? undefined : styles.tabHover}
                      onPress={() => setFilter(f.value)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${f.label}, ${n}`}
                    >
                      <DText weight="semiBold" style={[styles.tabText, on && styles.tabTextOn]}>{f.label}</DText>
                      <DText style={[styles.tabCount, on && styles.tabCountOn]}>{n}</DText>
                    </HoverPressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.tableHead}>
              <DText weight="semiBold" style={[styles.th, styles.colDate]}>{t('inspection.colDate')}</DText>
              <DText weight="semiBold" style={[styles.th, styles.colVehicle]}>{t('inspection.colVehicle')}</DText>
              <DText weight="semiBold" style={[styles.th, styles.colPerson]}>{t('inspection.colDriver')}</DText>
              <DText weight="semiBold" style={[styles.th, styles.colPerson]}>{t('inspection.colOfficer')}</DText>
              <DText weight="semiBold" style={[styles.th, styles.colDefects]}>{t('inspection.colDefects')}</DText>
              <DText weight="semiBold" style={[styles.th, styles.colStatus]}>{t('inspection.colStatus')}</DText>
              <View style={styles.colChevron} />
            </View>

            {error ? (
              <View style={styles.state}>
                <Ionicons name="cloud-offline-outline" size={22} color={DESKTOP_TONES.bad.fg} />
                <DText style={styles.stateText}>{error}</DText>
                <HoverPressable style={pageStyles.softBtn} hoverStyle={pageStyles.softBtnHover} onPress={onRetry}>
                  <DText weight="semiBold" style={pageStyles.softBtnText}>{t('common.tryAgain')}</DText>
                </HoverPressable>
              </View>
            ) : !rows ? (
              [0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={[styles.tr, i > 0 && pageStyles.rowDivider]}>
                  <View style={[styles.skeleton, { width: 76 }]} />
                  <View style={[styles.skeleton, { width: 120 }]} />
                  <View style={[styles.skeleton, { flex: 1 }]} />
                </View>
              ))
            ) : shown.length === 0 ? (
              <View style={styles.state}>
                <Ionicons name="shield-checkmark-outline" size={24} color={DESKTOP_COLORS.inkFaint} />
                <DText weight="semiBold" style={styles.stateTitle}>{rows.length ? t('inspection.noneMatchSearch') : t('inspection.noneYet')}</DText>
                {!rows.length && <DText style={styles.stateText}>{t('inspection.emptyHint')}</DText>}
              </View>
            ) : (
              shown.map(({ row, state }, i) => {
                const meta = INSPECTION_STATE_META[state];
                const defects = row.defect_count > 0 && state !== 'draft' && state !== 'cancelled';
                const model = [row.vehicle?.manufacturer, row.vehicle?.model].filter(Boolean).join(' ');
                return (
                  <HoverPressable
                    key={row.id}
                    style={[styles.tr, i > 0 && pageStyles.rowDivider]}
                    hoverStyle={pageStyles.rowHover}
                    onPress={() => onOpen(row.vehicle_id, row.id)}
                    accessibilityLabel={t('inspection.fromLabel', { v1: formatIsoDay(row.inspection_date), label: meta.label, v2: defects ? `, ${defectsText(row.defect_count)}` : '' })}
                  >
                    <DLtrText style={[styles.td, styles.colDate]}>{formatIsoDay(row.inspection_date)}</DLtrText>
                    <View style={styles.colVehicle}>
                      <DLtrText weight="semiBold" style={styles.plate}>{formatPlate(row.vehicle?.plate_number)}</DLtrText>
                      {!!model && <DText style={styles.sub} numberOfLines={1}>{model}</DText>}
                    </View>
                    <DText style={[styles.td, styles.colPerson]} numberOfLines={1}>{row.driver?.full_name ?? row.facts?.driverName ?? '-'}</DText>
                    <DText style={[styles.td, styles.colPerson]} numberOfLines={1}>{row.officer_name || '-'}</DText>
                    <View style={styles.colDefects}>
                      {defects ? (
                        <View style={styles.defects}>
                          <Ionicons name="warning" size={13} color={DESKTOP_TONES.bad.fg} />
                          <DText weight="semiBold" style={styles.defectsText}>{row.defect_count}</DText>
                        </View>
                      ) : (
                        <DText style={styles.muted}>{state === 'draft' || state === 'cancelled' ? '-' : t('common.noneShort')}</DText>
                      )}
                    </View>
                    <View style={styles.colStatus}>
                      <StatusPill tone={STATE_TONE[meta.tone]} label={meta.label} />
                    </View>
                    <Ionicons name={dirIcon('chevron-back')} size={15} color={DESKTOP_COLORS.inkFaint} style={styles.colChevron} />
                  </HoverPressable>
                );
              })
            )}
          </View>
        </View>

        <View style={pageStyles.sideCell}>
          <GroupLabel>{t('inspection.vehiclesToCheck', { length: due.length })}</GroupLabel>
          <View style={[pageStyles.card, pageStyles.listCard]}>
            {!rows ? (
              <DText style={[pageStyles.mutedText, styles.pad]}>{t('common.loadingEllipsis')}</DText>
            ) : due.length === 0 ? (
              <View style={styles.allGood}>
                <View style={styles.allGoodIcon}>
                  <Ionicons name="checkmark" size={18} color={DESKTOP_TONES.ok.fg} />
                </View>
                <View style={pageStyles.flex}>
                  <DText weight="semiBold" style={styles.allGoodTitle}>{t('inspection.allOnTime')}</DText>
                  <DText style={styles.sub}>{t('inspection.allOnTimeHint')}</DText>
                </View>
              </View>
            ) : (
              due.map((p, i) => {
                const lateRow = dueState(p.nextDue!) === 'late';
                return (
                  <HoverPressable
                    key={p.vehicleId}
                    style={[styles.dueRow, i > 0 && pageStyles.rowDivider]}
                    hoverStyle={pageStyles.rowHover}
                    onPress={() => onStart(p.vehicleId)}
                    accessibilityLabel={`${formatPlate(p.plate)}, ${dueText(p.nextDue!)}`}
                  >
                    <View style={[styles.dueIcon, { backgroundColor: lateRow ? DESKTOP_TONES.bad.bg : DESKTOP_TONES.warn.bg }]}>
                      <Ionicons name={lateRow ? 'alert-circle' : 'time-outline'} size={16} color={lateRow ? DESKTOP_TONES.bad.fg : DESKTOP_TONES.warn.fg} />
                    </View>
                    <View style={pageStyles.flex}>
                      <DLtrText weight="semiBold" style={styles.plate}>{formatPlate(p.plate)}</DLtrText>
                      <DText style={styles.sub} numberOfLines={1}>
                        {[p.vehicleLabel, drafts.has(p.vehicleId) ? t('inspection.openDraft') : p.firstInspection ? t('inspection.firstShort') : null].filter(Boolean).join(' · ')}
                      </DText>
                    </View>
                    <StatusPill tone={lateRow ? 'bad' : 'warn'} label={dueText(p.nextDue!)} />
                  </HoverPressable>
                );
              })
            )}
          </View>

          <View style={styles.sideGap} />
          <GroupLabel>{t('inspection.remindersTitle')}</GroupLabel>
          <InspectionRemindersCard companyId={companyId} repeatMonths={repeatMonths} onRepeatSaved={onRepeatSaved} />

          <View style={styles.sideGap} />
          <View style={[pageStyles.card, pageStyles.listCard]}>
            <HoverPressable style={styles.linkRow} hoverStyle={pageStyles.rowHover} onPress={onEditList}>
              <View style={styles.dueIcon}>
                <Ionicons name="list-outline" size={16} color={DESKTOP_COLORS.inkMuted} />
              </View>
              <View style={pageStyles.flex}>
                <DText weight="semiBold" style={styles.plate}>{t('inspection.itemList')}</DText>
                <DText style={styles.sub}>{t('inspection.editListHint')}</DText>
              </View>
              <Ionicons name={dirIcon('chevron-back')} size={15} color={DESKTOP_COLORS.inkFaint} />
            </HoverPressable>
          </View>
        </View>
      </View>

      <DesktopModal visible={picking} title={t('inspection.whichVehicle')} onClose={() => setPicking(false)} maxWidth={480}>
        <View style={styles.pickBody}>
          <View style={styles.search}>
            <Ionicons name="search" size={15} color={DESKTOP_COLORS.inkFaint} style={styles.searchIcon} />
            <DesktopInput value={pickQuery} onChangeText={setPickQuery} placeholder={t('vehicle.search')} style={styles.searchInput} />
          </View>
          <View style={[pageStyles.card, pageStyles.listCard]}>
            {pickable.length === 0 ? (
              <DText style={[pageStyles.mutedText, styles.pad]}>{t('common.noResults')}</DText>
            ) : (
              pickable.map((p, i) => (
                <HoverPressable key={p.vehicleId} style={[styles.dueRow, i > 0 && pageStyles.rowDivider]} hoverStyle={pageStyles.rowHover} onPress={() => start(p.vehicleId)}>
                  <View style={styles.dueIcon}>
                    <Ionicons name="car-outline" size={16} color={DESKTOP_COLORS.inkMuted} />
                  </View>
                  <View style={pageStyles.flex}>
                    <DLtrText weight="semiBold" style={styles.plate}>{formatPlate(p.plate)}</DLtrText>
                    <DText style={styles.sub} numberOfLines={1}>{[p.vehicleLabel, drafts.has(p.vehicleId) ? t('inspection.openDraft') : null].filter(Boolean).join(' · ')}</DText>
                  </View>
                  {p.nextDue && dueState(p.nextDue) !== 'later' && <StatusPill tone={dueState(p.nextDue) === 'late' ? 'bad' : 'warn'} label={dueText(p.nextDue)} />}
                </HoverPressable>
              ))
            )}
          </View>
        </View>
      </DesktopModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heroIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  toolbar: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 12, flexWrap: 'wrap', borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  search: { flexGrow: 1, flexBasis: 220, justifyContent: 'center' },
  searchIcon: { position: 'absolute', start: 12, zIndex: 1 },
  searchInput: { paddingStart: 34 },
  tabs: { flexDirection: 'row-reverse', gap: 2, padding: 3, borderRadius: 10, backgroundColor: DESKTOP_COLORS.canvas },
  tab: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10, borderRadius: 8, ...webOnly({ transition: 'background-color 150ms ease' }) },
  tabHover: { backgroundColor: 'rgba(22,34,46,0.05)' },
  tabOn: { backgroundColor: DESKTOP_COLORS.surface, ...webOnly({ boxShadow: '0 1px 2px rgba(22,34,46,0.10)' }) },
  tabText: { fontSize: 13, color: DESKTOP_COLORS.inkMuted },
  tabTextOn: { color: DESKTOP_COLORS.ink },
  tabCount: { fontSize: 12, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  tabCountOn: { color: DESKTOP_COLORS.brand },
  tableHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, height: 36, paddingHorizontal: 16, backgroundColor: DESKTOP_COLORS.surfaceMuted, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  th: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  tr: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 16, paddingVertical: 8, ...webOnly({ transition: 'background-color 150ms ease' }) },
  td: { fontSize: 14, color: DESKTOP_COLORS.ink, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  colDate: { width: 88 },
  colVehicle: { flex: 1.3, minWidth: 0 },
  colPerson: { flex: 1, minWidth: 0 },
  colDefects: { width: 64 },
  colStatus: { width: 150, alignItems: 'flex-end' },
  colChevron: { width: 15 },
  plate: { fontSize: 14.5, color: DESKTOP_COLORS.ink },
  sub: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  muted: { fontSize: 13.5, color: DESKTOP_COLORS.inkFaint },
  defects: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, alignSelf: 'flex-end', paddingHorizontal: 8, height: 24, borderRadius: 999, backgroundColor: DESKTOP_TONES.bad.bg },
  defectsText: { fontSize: 13, color: DESKTOP_TONES.bad.fg },
  skeleton: { height: 12, borderRadius: 6, backgroundColor: DESKTOP_COLORS.borderSoft },
  state: { alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 24 },
  stateTitle: { fontSize: 15, textAlign: 'center' },
  stateText: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted, textAlign: 'center' },
  pad: { padding: 16 },
  allGood: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 16 },
  allGoodIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: DESKTOP_TONES.ok.bg, alignItems: 'center', justifyContent: 'center' },
  allGoodTitle: { fontSize: 14.5 },
  dueRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 16, paddingVertical: 8, ...webOnly({ transition: 'background-color 150ms ease' }) },
  dueIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: DESKTOP_COLORS.canvas, alignItems: 'center', justifyContent: 'center' },
  linkRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 16, paddingVertical: 10, ...webOnly({ transition: 'background-color 150ms ease' }) },
  sideGap: { height: 10 },
  pickBody: { padding: 16, gap: 12 },
});
