import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  DK,
  DKText,
  DriverPage,
  EmptyPanel,
  ErrorPanel,
  FilterPills,
  GlassSearch,
  HeroButton,
  HeroTitle,
  KitSheet,
  ListRow,
  LoadingPanel,
  PrimaryAction,
  STATUS,
  SectionHeader,
  Surface,
} from '../../components/driverKit';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DuePill } from '../../components/checklist/DuePill';
import { useCompany } from '../../lib/CompanyContext';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { formatPlate } from '../../lib/plate';
import { dueState } from '../../lib/meetingPlan';
import {
  INSPECTION_STATE_META,
  formatIsoDay,
  listInspections,
  listStateOf,
  loadInspectionPlan,
  type InspectionListRow,
  type InspectionPlanRow,
  type InspectionState,
} from '../../lib/inspections';
import type { RootStackParamList } from '../../navigation/types';

/**
 * "בדיקות בטיחות": vehicles due for an inspection on top, then every
 * inspection in the company, newest first, with filters by state and a search
 * by plate, vehicle or driver.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'SafetyInspections'>;
type Filter = 'all' | 'awaiting' | 'draft' | 'defects' | 'cancelled';

export default function SafetyInspectionsScreen({ navigation }: Props) {
  const { company } = useCompany();
  const companyId = company?.id ?? '';
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<InspectionListRow[] | null>(null);
  const [plan, setPlan] = useState<InspectionPlanRow[]>([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const [pickQuery, setPickQuery] = useState('');

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const [list, due] = await Promise.all([listInspections(companyId), loadInspectionPlan(companyId).catch(() => [])]);
      setRows(list);
      setPlan(due);
      setError('');
    } catch (e) {
      setError((e as Error)?.message || 'טעינת הבדיקות נכשלה');
    }
  }, [companyId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const drafts = useMemo(() => new Map((rows ?? []).filter((r) => r.status === 'draft').map((r) => [r.vehicle_id, r.id])), [rows]);
  const open = (vehicleId: string) => {
    setPicking(false);
    const draft = drafts.get(vehicleId);
    navigation.navigate('SafetyInspection', draft ? { vehicleId, inspectionId: draft } : { vehicleId });
  };

  const due = plan.filter((p) => p.nextDue && dueState(p.nextDue) !== 'later');
  const withState = (rows ?? []).map((row) => ({ row, state: listStateOf(row) as InspectionState }));
  const matches = (f: Filter, x: { row: InspectionListRow; state: InspectionState }) =>
    f === 'all' ||
    (f === 'awaiting' && (x.state === 'awaiting_driver' || x.state === 'requires_attention')) ||
    (f === 'draft' && x.state === 'draft') ||
    (f === 'defects' && x.row.defect_count > 0 && x.state !== 'cancelled' && x.state !== 'draft') ||
    (f === 'cancelled' && x.state === 'cancelled');
  const q = query.trim();
  const shown = withState.filter((x) => matches(filter, x)).filter((x) =>
    !q || [x.row.vehicle?.plate_number, formatPlate(x.row.vehicle?.plate_number), x.row.vehicle?.manufacturer, x.row.vehicle?.model, x.row.driver?.full_name]
      .some((v) => (v ?? '').includes(q)));
  const count = (f: Filter) => withState.filter((x) => matches(f, x)).length;

  const body = (
    <DriverPage
      insetTop={isDesktop ? 0 : insets.top}
      insetBottom={isDesktop ? 0 : insets.bottom}
      hero={
        <View style={styles.hero}>
          <HeroTitle
            title="בדיקות בטיחות"
            subtitle="בדיקת קצין בטיחות לרכבי החברה"
            onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminHome'))}
            right={<HeroButton icon="settings-outline" label="הגדרות: תדירות ורשימת סעיפים" onPress={() => navigation.navigate('SafetyInspectionSettings')} />}
          />
          <GlassSearch value={query} onChangeText={setQuery} placeholder="חיפוש לפי מספר רכב או נהג" />
        </View>
      }
      overlay={
        <KitSheet visible={picking} onClose={() => setPicking(false)} icon="car-outline" title="איזה רכב בודקים?" footer={<PrimaryAction label="סגירה" tone="ghost" onPress={() => setPicking(false)} />}>
          <GlassSearchLight value={pickQuery} onChange={setPickQuery} />
          <Surface style={styles.list}>
            {plan
              .filter((p) => !pickQuery.trim() || p.plate.includes(pickQuery.replace(/\D/g, '') || '~') || p.vehicleLabel.includes(pickQuery.trim()))
              .map((p, i) => (
                <ListRow key={p.vehicleId} first={i === 0} icon="car-outline" title={formatPlate(p.plate)} subtitle={[p.vehicleLabel, drafts.has(p.vehicleId) ? 'יש טיוטה פתוחה' : null].filter(Boolean).join(' · ')} onPress={() => open(p.vehicleId)} />
              ))}
          </Surface>
        </KitSheet>
      }
    >
      <PrimaryAction label="בדיקה חדשה" icon="add-circle-outline" onPress={() => setPicking(true)} disabled={!plan.length} />
      {error ? <ErrorPanel message={error} onRetry={() => void load()} /> : !rows ? <LoadingPanel /> : (
        <>
          {due.length > 0 && (
            <View>
              <SectionHeader title={`רכבים שצריך לבדוק (${due.length})`} />
              <Surface style={styles.list}>
                {due.map((p, i) => (
                  <ListRow
                    key={p.vehicleId}
                    first={i === 0}
                    icon={dueState(p.nextDue!) === 'late' ? 'alert-circle' : 'time-outline'}
                    tint={dueState(p.nextDue!) === 'late' ? STATUS.expired.fg : STATUS.soon.fg}
                    title={formatPlate(p.plate)}
                    subtitle={[p.vehicleLabel, p.firstInspection ? 'בדיקה ראשונה' : p.lastInspection ? `האחרונה ב-${formatIsoDay(p.lastInspection)}` : null].filter(Boolean).join(' · ')}
                    trailing={<DuePill nextDue={p.nextDue!} />}
                    onPress={() => open(p.vehicleId)}
                  />
                ))}
              </Surface>
            </View>
          )}
          <FilterPills<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'הכל', count: count('all') },
              { value: 'awaiting', label: 'ממתין לחתימה', count: count('awaiting'), tone: 'soon' },
              { value: 'defects', label: 'יש ליקויים', count: count('defects'), tone: 'expired' },
              { value: 'draft', label: 'טיוטות', count: count('draft') },
              { value: 'cancelled', label: 'בוטל', count: count('cancelled') },
            ]}
          />
          {shown.length === 0 ? (
            <EmptyPanel icon="shield-checkmark-outline" title={rows.length ? 'אין בדיקות שמתאימות לחיפוש' : 'עוד אין בדיקות בטיחות'} body={rows.length ? undefined : 'לחצו "בדיקה חדשה", בחרו רכב ועברו על הסעיפים.'} />
          ) : (
            <Surface style={styles.list}>
              {shown.map(({ row, state }, i) => {
                const meta = INSPECTION_STATE_META[state];
                const tone = meta.tone === 'info' ? { fg: DK.accent, soft: DK.accentSoft } : STATUS[meta.tone];
                return (
                  <ListRow
                    key={row.id}
                    first={i === 0}
                    icon="shield-checkmark-outline"
                    title={`${formatPlate(row.vehicle?.plate_number)} · ${formatIsoDay(row.inspection_date)}`}
                    subtitle={[row.driver?.full_name ?? row.facts?.driverName, row.defect_count > 0 && state !== 'draft' ? (row.defect_count === 1 ? 'ליקוי אחד' : `${row.defect_count} ליקויים`) : null].filter(Boolean).join(' · ')}
                    trailing={
                      <View style={[styles.pill, { backgroundColor: tone.soft }]}>
                        <DKText variant="micro" color={tone.fg}>{meta.label}</DKText>
                      </View>
                    }
                    onPress={() => navigation.navigate('SafetyInspection', { vehicleId: row.vehicle_id, inspectionId: row.id })}
                  />
                );
              })}
            </Surface>
          )}
        </>
      )}
    </DriverPage>
  );

  return isDesktop ? <DesktopShell active="SafetyInspections" breadcrumbs={['ניהול', 'בדיקות בטיחות']}>{body}</DesktopShell> : body;
}

function GlassSearchLight({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.pickSearch}>
      <GlassSearch value={value} onChangeText={onChange} placeholder="חיפוש רכב" />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 14 },
  list: { paddingVertical: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pickSearch: { backgroundColor: DK.night[1], borderRadius: 18, padding: 6, marginBottom: 10 },
});
