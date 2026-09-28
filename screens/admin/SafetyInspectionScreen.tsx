import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Linking, Platform, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Banner,
  DK,
  DKText,
  DriverPage,
  ErrorPanel,
  HeroTitle,
  KitInput,
  KitSheet,
  LoadingPanel,
  Plate,
  PrimaryAction,
  Pressy,
  Reveal,
  STATUS,
  SheetActions,
  Surface,
  statusOfDate,
  useReducedMotion,
} from '../../components/driverKit';
import { InspectionItemCard } from '../../components/inspection/InspectionItemCard';
import { SignaturePad } from '../../components/checklist/SignaturePad';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { getVehicle, listCompliance, listDrivers, type ComplianceItem, type DriverRow, type Vehicle } from '../../lib/adminApi';
import { formatPlate } from '../../lib/plate';
import { downloadRemoteFileOnWeb } from '../../lib/webDownload';
import {
  DEFAULT_INSPECTION_FORM,
  INSPECTION_DISCLAIMER,
  INSPECTION_LIMITS,
  INSPECTION_STATE_META,
  INSPECTION_STATUS_META,
  INSPECTION_TITLE,
  answeredCount,
  cancelInspection,
  closeInspection,
  defectLines,
  driverSignInspection,
  formItems,
  formatIsoDay,
  getInspection,
  getInspectionSettings,
  hasDocument,
  inspectionDocument,
  inspectionProblem,
  inspectionState,
  notifyInspectionDriver,
  readExtraDefects,
  readInspectionForm,
  recentInspectorNames,
  saveInspectionDraft,
  signInspection,
  todayIso,
  type InspectionAnswers,
  type InspectionForm,
  type InspectionRow,
  type InspectionState,
  type InspectionStatus,
} from '../../lib/inspections';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import type { RootStackParamList } from '../../navigation/types';
import { t, dirIcon, getLocale } from '../../lib/i18n';

/**
 * One safety inspection of one vehicle, from the first mark to the last
 * signature, with one clear action per screen (like a checklist meeting,
 * ChecklistMeetingScreen):
 *
 *   fill     the odometer, the driver, every item; what is wrong on each defect
 *   officer  the officer's name and hand signature
 *   choose   the driver signs now, here, or gets it on their own phone
 *   handoff  the device goes to the driver
 *   driver   the driver reads the result and signs
 *   done / sent
 *   view     an inspection opened again: its result, its document, and what
 *            can still be done (the driver signs, close without them, cancel)
 *
 * The same screens run on the manager's phone and on the desktop site.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'SafetyInspection'>;
type Step = 'fill' | 'officer' | 'choose' | 'handoff' | 'driver' | 'done' | 'sent' | 'view';
type Busy = '' | 'save' | 'next' | 'sign' | 'driver' | 'notify' | 'download' | 'close' | 'cancel';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** The test's date, as the app reads it everywhere: its expiry, or a year after it was done. */
function testUntil(items: ComplianceItem[]): string | null {
  const test = items.find((c) => c.item_type === 'annual_test');
  if (test?.expiry_date) return test.expiry_date;
  if (!test?.last_date) return null;
  const date = new Date(`${test.last_date}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 365);
  return date.toISOString().slice(0, 10);
}

export default function SafetyInspectionScreen({ navigation, route }: Props) {
  // What the screen was opened with. Once a draft exists the address points
  // at it (a refresh resumes the same inspection), without loading it again.
  const [{ vehicleId, inspectionId }] = useState(route.params);
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const reduce = useReducedMotion();

  const [loadError, setLoadError] = useState('');
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [form, setForm] = useState<InspectionForm | null>(null);
  const [inspection, setInspection] = useState<InspectionRow | null>(null);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [answers, setAnswers] = useState<InspectionAnswers>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [odometer, setOdometer] = useState('');
  const [driverId, setDriverId] = useState<string | null>(null);
  const [officerName, setOfficerName] = useState('');
  const [officerSig, setOfficerSig] = useState<string | null>(null);
  const [driverSig, setDriverSig] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [step, setStep] = useState<Step>('fill');
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [leaving, setLeaving] = useState<null | { go: () => void }>(null);
  const [pickDriver, setPickDriver] = useState(false);
  const [driverQuery, setDriverQuery] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeNote, setCloseNote] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const allowLeave = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const companyId = vehicle?.company_id ?? '';
  const plate = formatPlate(vehicle?.plate_number);
  const vehicleLabel = [vehicle?.manufacturer, vehicle?.model].filter(Boolean).join(' ');
  const items = useMemo(() => (form ? formItems(form) : []), [form]);
  const marked = form ? answeredCount(form, answers) : 0;
  const problem = form ? inspectionProblem(form, answers) : null;
  const odometerValue = /^\d{1,7}$/.test(odometer.replace(/[,\s]/g, '')) ? Number(odometer.replace(/[,\s]/g, '')) : null;
  const driver = drivers.find((d) => d.id === driverId) ?? null;
  const driverName = driver?.full_name?.trim() || inspection?.facts?.driverName || t('common.theDriver');
  const vehicleDrivers = useMemo(
    () =>
      drivers
        .filter((d) => d.vehicles.some((v) => v.id === vehicleId))
        .sort((a, b) => Number(b.vehicles.find((v) => v.id === vehicleId)?.is_primary) - Number(a.vehicles.find((v) => v.id === vehicleId)?.is_primary)),
    [drivers, vehicleId],
  );
  const today = todayIso();
  const state: InspectionState | null = inspection ? inspectionState(inspection, requestStatus) : null;

  // ── load ──────────────────────────────────────────────────────────────
  const loadInspection = useCallback(async (id: string) => {
    const row = await getInspection(id);
    if (!row || row.vehicle_id !== vehicleId) throw new Error(t('inspection.notFound'));
    const loadedForm = readInspectionForm(row.form);
    if (!loadedForm) throw new Error(t('inspection.itemListInvalid'));
    setInspection(row);
    setRequestStatus(row.request?.status ?? null);
    setForm(loadedForm);
    setAnswers(row.answers ?? {});
    setExtra(readExtraDefects(row.extra_defects));
    setOdometer(row.odometer != null ? String(row.odometer) : '');
    setDriverId(row.driver_id);
    setOfficerName(row.officer_name ?? '');
    setOfficerSig(row.officer_signature ?? null);
    return row;
  }, [vehicleId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const target = await getVehicle(vehicleId);
        if (!target) throw new Error(t('vehicle.notFound'));
        const [companyDrivers, items, names] = await Promise.all([
          listDrivers(target.company_id),
          listCompliance('vehicle', vehicleId),
          recentInspectorNames(target.company_id),
        ]);
        if (!active) return;
        setVehicle(target);
        setDrivers(companyDrivers);
        setCompliance(items);
        setRecent(names);
        if (inspectionId) {
          const row = await loadInspection(inspectionId);
          if (!active) return;
          setStep(row.status === 'draft' ? 'fill' : 'view');
        } else {
          if (target.status === 'archived') throw new Error(t('inspection.archivedVehicle'));
          const settings = await getInspectionSettings(target.company_id).catch(() => null);
          if (!active) return;
          setForm(settings?.form ?? DEFAULT_INSPECTION_FORM);
          // The vehicle's own driver, the primary one first.
          const own = companyDrivers
            .filter((d) => d.vehicles.some((v) => v.id === vehicleId))
            .sort((a, b) => Number(b.vehicles.find((v) => v.id === vehicleId)?.is_primary) - Number(a.vehicles.find((v) => v.id === vehicleId)?.is_primary));
          setDriverId(own[0]?.id ?? null);
          setStep('fill');
        }
      } catch (err) {
        if (active) setLoadError((err as Error)?.message || t('inspection.loadOneFailed'));
      }
    })();
    return () => {
      active = false;
    };
  }, [inspectionId, loadInspection, vehicleId]);

  // ── leaving ───────────────────────────────────────────────────────────
  // While the driver holds the device, the rest of the app stays closed.
  const driverHolds = step === 'handoff' || step === 'driver';
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !driverHolds });
  }, [driverHolds, navigation]);
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (allowLeave.current) return;
        if (driverHolds) {
          event.preventDefault();
          return;
        }
        if (step === 'fill' && dirty) {
          event.preventDefault();
          setLeaving({ go: () => navigation.dispatch(event.data.action) });
        }
      }),
    [dirty, driverHolds, navigation, step],
  );
  const leave = useCallback(() => {
    allowLeave.current = true;
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('SafetyInspections');
  }, [navigation]);

  const toTop = () => scrollRef.current?.scrollTo({ y: 0, animated: !reduce });

  // ── answers ───────────────────────────────────────────────────────────
  const setStatus = useCallback((itemId: string, status: InspectionStatus) => {
    setAnswers((prev) => ({ ...prev, [itemId]: { status, note: prev[itemId]?.note ?? '' } }));
    setDirty(true);
  }, []);
  const setNote = useCallback((itemId: string, note: string) => {
    setAnswers((prev) => ({ ...prev, [itemId]: { status: prev[itemId]?.status ?? null, note: note.slice(0, INSPECTION_LIMITS.note) } }));
    setDirty(true);
  }, []);
  const markGroupOk = (groupId: string) => {
    const group = form?.groups.find((g) => g.id === groupId);
    if (!group) return;
    setAnswers((prev) => {
      const next = { ...prev };
      for (const item of group.items) if (!next[item.id]?.status) next[item.id] = { status: 'ok', note: next[item.id]?.note ?? '' };
      return next;
    });
    setDirty(true);
  };
  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setDirty(true);
  };

  // ── server ────────────────────────────────────────────────────────────
  const input = () => ({
    answers,
    extraDefects: extra.map((line) => line.trim()).filter(Boolean),
    odometer: odometerValue,
    officerName: officerName.trim(),
    driverId,
  });
  const persist = async (): Promise<InspectionRow> => {
    const saved = inspection
      ? await saveInspectionDraft(companyId, { inspectionId: inspection.id }, input())
      : await saveInspectionDraft(companyId, { vehicleId }, input());
    setInspection(saved);
    setDirty(false);
    if (!inspection) navigation.setParams({ inspectionId: saved.id });
    return saved;
  };
  const run = async (kind: Busy, task: () => Promise<void>) => {
    setBusy(kind);
    setError('');
    setNotice('');
    try {
      await task();
    } catch (err) {
      setError((err as Error)?.message || t('common.actionFailedRetryPlural'));
      toTop();
    } finally {
      setBusy('');
    }
  };

  const fillReady = !problem && odometerValue != null && !!driverId;
  const saveDraft = () =>
    run('save', async () => {
      await persist();
      setNotice(t('inspection.savedContinueLater'));
      toTop();
    });
  const toOfficer = () => {
    if (!fillReady) {
      setShowErrors(true);
      setError(odometerValue == null ? t('inspection.enterMileage') : !driverId ? t('inspection.chooseSigningDriver') : problem ?? '');
      toTop();
      return;
    }
    void run('next', async () => {
      await persist();
      setStep('officer');
    });
  };
  const officerSigns = () =>
    run('sign', async () => {
      const current = inspection ?? (await persist());
      const result = await signInspection(companyId, current.id, { ...input(), officerSignature: officerSig!, notifyDriver: false });
      setInspection(result.inspection);
      setRequestStatus('pending');
      setNextDue(result.nextDue ?? null);
      setDirty(false);
      setStep('choose');
    });
  const sendToDriver = () =>
    run('notify', async () => {
      await notifyInspectionDriver(companyId, inspection!.id);
      setStep('sent');
    });
  const driverSigns = () =>
    run('driver', async () => {
      await driverSignInspection(companyId, inspection!.id, driverSig!);
      setRequestStatus('completed');
      setStep('done');
    });
  const download = () =>
    run('download', async () => {
      const { url, fileName } = await inspectionDocument(companyId, inspection!.id);
      const saved = await downloadRemoteFileOnWeb(url, fileName).catch(() => false);
      if (!saved) await Linking.openURL(url);
    });
  const closeWithoutDriver = () =>
    run('close', async () => {
      await closeInspection(companyId, inspection!.id, closeNote.trim());
      await loadInspection(inspection!.id);
      setClosing(false);
      setCloseNote('');
      setNotice(t('inspection.closedWithNote'));
      setStep('view');
    });
  const cancel = () =>
    run('cancel', async () => {
      const result = await cancelInspection(companyId, inspection!.id);
      setCancelling(false);
      if (result.removed) {
        allowLeave.current = true;
        leave();
        return;
      }
      await loadInspection(inspection!.id);
      setNotice(t('inspection.cancelledKept'));
      setStep('view');
    });

  // ── frames ────────────────────────────────────────────────────────────
  const inShell = (content: React.ReactNode) =>
    isDesktop ? (
      <DesktopShell active="SafetyInspections" breadcrumbs={[t('nav.management'), t('nav.safetyInspections'), plate || t('inspection.inspection')]}>
        {content}
      </DesktopShell>
    ) : (
      content
    );
  const topInset = isDesktop ? 0 : insets.top;
  const bottomInset = isDesktop ? 0 : insets.bottom;

  if (loadError || !form || !vehicle) {
    return inShell(
      <DriverPage insetTop={topInset} insetBottom={bottomInset} hero={<HeroTitle title={t('notifications.cat.safetyCheck')} onBack={leave} />}>
        {loadError ? <ErrorPanel message={loadError} /> : <LoadingPanel />}
      </DriverPage>,
    );
  }

  const messages = (
    <>
      {!!error && (
        <Reveal>
          <Banner tone="expired">{error}</Banner>
        </Reveal>
      )}
      {!!notice && (
        <Reveal>
          <Banner tone="ok" icon="checkmark-circle">
            {notice}
          </Banner>
        </Reveal>
      )}
    </>
  );

  const live = {
    test: testUntil(compliance),
    insurance: compliance.find((c) => c.item_type === 'insurance_mandatory')?.expiry_date ?? null,
  };
  const facts = inspection?.facts;

  // ── fill ──────────────────────────────────────────────────────────────
  if (step === 'fill') {
    const left = items.length - marked;
    const needOdometer = showErrors && odometerValue == null;
    const needDriver = showErrors && !driverId;
    let number = 0;
    return inShell(
      <DriverPage
        key={step}
        insetTop={topInset}
        insetBottom={bottomInset}
        scrollRef={scrollRef}
        hero={
          <View>
            <HeroTitle
              title={t('notifications.cat.safetyCheck')}
              onBack={leave}
              right={
                <Pressy onPress={() => void saveDraft()} disabled={!!busy} accessibilityLabel={t('common.saveAndContinueLater')} style={styles.glassPill} pressScale={0.94}>
                  <Ionicons name={busy === 'save' ? 'hourglass-outline' : 'bookmark-outline'} size={17} color={DK.onNight} />
                  <DKText variant="label" color={DK.onNight}>
                    {t('common.save')}
                  </DKText>
                </Pressy>
              }
            />
            <View style={styles.who}>
              <Plate number={plate} />
              <View style={styles.flex}>
                <DKText variant="heading" color={DK.onNight} numberOfLines={1}>
                  {vehicleLabel || t('vehicle.vehicle')}
                </DKText>
                <DKText variant="caption" color={DK.onNightMuted}>
                  {t('inspection.todayComma')} {formatIsoDay(today)}
                </DKText>
              </View>
            </View>
            <Progress marked={marked} total={items.length} />
          </View>
        }
        footer={
          <View style={styles.footer}>
            <View style={styles.need} accessibilityLiveRegion="polite">
              {left > 0 || problem || odometerValue == null || !driverId ? (
                <>
                  <Ionicons name="information-circle-outline" size={18} color={DK.muted} />
                  <DKText variant="caption" color={DK.muted}>
                    {problem ?? (odometerValue == null ? t('inspection.mileageMissing') : t('inspection.signerMissing'))}
                  </DKText>
                </>
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color={STATUS.ok.fg} />
                  <DKText variant="label" color={STATUS.ok.fg}>
                    {t('inspection.allMarkedSign')}
                  </DKText>
                </>
              )}
            </View>
            <PrimaryAction label={t('common.continueToSign')} icon={dirIcon('arrow-back')} onPress={toOfficer} loading={busy === 'next'} disabled={!!busy && busy !== 'next'} />
          </View>
        }
        overlay={
          <>
            <KitSheet
              visible={!!leaving}
              onClose={() => setLeaving(null)}
              icon="bookmark-outline"
              title={t('common.saveMarkedQuestion')}
              subtitle={t('inspection.saveHint')}
              footer={
                <View style={styles.sheetStack}>
                  <PrimaryAction
                    label={t('common.saveAndExit')}
                    icon="bookmark"
                    loading={busy === 'save'}
                    onPress={() =>
                      void run('save', async () => {
                        await persist();
                        allowLeave.current = true;
                        const go = leaving?.go;
                        setLeaving(null);
                        go?.();
                      })
                    }
                  />
                  <SheetActions>
                    <PrimaryAction label={t('common.keepFilling')} tone="ghost" onPress={() => setLeaving(null)} style={styles.flex} />
                    <PrimaryAction
                      label={t('common.exitWithoutSaving')}
                      tone="danger"
                      onPress={() => {
                        allowLeave.current = true;
                        const go = leaving?.go;
                        setLeaving(null);
                        go?.();
                      }}
                      style={styles.flex}
                    />
                  </SheetActions>
                </View>
              }
            />
            <KitSheet
              visible={pickDriver}
              onClose={() => setPickDriver(false)}
              icon="person-outline"
              title={t('inspection.whoIsDriver')}
              subtitle={t('inspection.driverWhoSigns')}
              footer={<PrimaryAction label={t('common.close')} tone="ghost" onPress={() => setPickDriver(false)} />}
            >
              <KitInput value={driverQuery} onChangeText={setDriverQuery} placeholder={t('common.searchByName')} accessibilityLabel={t('driver.searchByName')} />
              <View style={styles.pickList}>
                {drivers
                  .filter((d) => !driverQuery.trim() || (d.full_name ?? '').includes(driverQuery.trim()))
                  .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'he'))
                  .slice(0, 60)
                  .map((d) => {
                    const on = d.id === driverId;
                    return (
                      <Pressy
                        key={d.id}
                        onPress={() => {
                          edit(setDriverId)(d.id);
                          setPickDriver(false);
                          setDriverQuery('');
                        }}
                        accessibilityLabel={`${d.full_name ?? t('common.unnamed')}${on ? t('common.selectedSuffix') : ''}`}
                        style={[styles.pickRow, on && styles.pickRowOn]}
                        pressScale={0.98}
                      >
                        <Ionicons name={on ? 'checkmark-circle' : 'person-circle-outline'} size={22} color={on ? DK.accent : DK.muted} />
                        <DKText variant="label" style={styles.flex}>
                          {d.full_name ?? t('common.unnamed')}
                        </DKText>
                        {!!d.vehicle_plate && (
                          <DKText variant="caption" color={DK.muted} ltr>
                            {formatPlate(d.vehicle_plate)}
                          </DKText>
                        )}
                      </Pressy>
                    );
                  })}
                {!drivers.length && (
                  <DKText variant="body" color={DK.muted}>
                    {t('driver.noActiveDriversDot')}
                  </DKText>
                )}
              </View>
            </KitSheet>
          </>
        }
      >
        {messages}
        <Reveal>
          <Surface style={styles.block}>
            <DKText variant="heading">{t('inspection.details')}</DKText>
            <View style={styles.field}>
              <DKText variant="label" color={DK.inkSoft} nativeID="odometer-label">
                {t('inspection.mileageToday')}
              </DKText>
              <KitInput
                value={odometer}
                onChangeText={(text) => edit(setOdometer)(text.replace(/[^\d]/g, '').slice(0, 7))}
                placeholder={vehicle.odometer ? t('inspection.currentlyRecorded', { v1: vehicle.odometer.toLocaleString(getLocale()) }) : t('inspection.mileageExample')}
                keyboardType="number-pad"
                inputMode="numeric"
                ltr
                hasError={needOdometer}
                accessibilityLabel={t('inspection.mileageToday')}
                accessibilityLabelledBy="odometer-label"
              />
              {odometerValue != null && vehicle.odometer > odometerValue ? (
                <DKText variant="caption" color={STATUS.soon.fg}>
                  {t('inspection.lowerThanRecorded')}{vehicle.odometer.toLocaleString(getLocale())}{t('inspection.recordedStays')}
                </DKText>
              ) : (
                <DKText variant="caption" color={DK.muted}>
                  {t('inspection.higherUpdates')}
                </DKText>
              )}
            </View>
            <View style={styles.field}>
              <DKText variant="label" color={DK.inkSoft}>
                {t('inspection.signingDriver')}
              </DKText>
              <View style={styles.chips}>
                {vehicleDrivers.map((d) => {
                  const on = d.id === driverId;
                  return (
                    <Pressy key={d.id} onPress={() => edit(setDriverId)(d.id)} accessibilityLabel={`${d.full_name ?? t('common.unnamed')}${on ? t('common.selectedSuffix') : ''}`} style={[styles.chip, on && styles.chipOn]} pressScale={0.95}>
                      <Ionicons name={on ? 'checkmark' : 'person-outline'} size={16} color={on ? '#FFFFFF' : DK.accent} />
                      <DKText variant="label" color={on ? '#FFFFFF' : DK.accent}>
                        {d.full_name ?? t('common.unnamed')}
                      </DKText>
                    </Pressy>
                  );
                })}
                {driver && !vehicleDrivers.some((d) => d.id === driver.id) && (
                  <View style={[styles.chip, styles.chipOn]}>
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    <DKText variant="label" color="#FFFFFF">
                      {driver.full_name ?? t('common.unnamed')}
                    </DKText>
                  </View>
                )}
                <Pressy onPress={() => setPickDriver(true)} accessibilityLabel={t('inspection.chooseOtherDriver')} style={[styles.chip, styles.chipGhost, needDriver && styles.chipError]} pressScale={0.95}>
                  <Ionicons name="people-outline" size={16} color={DK.inkSoft} />
                  <DKText variant="label" color={DK.inkSoft}>
                    {vehicleDrivers.length ? t('inspection.otherDriver') : t('inspection.chooseDriver')}
                  </DKText>
                </Pressy>
              </View>
            </View>
            <View style={styles.validity}>
              <Validity label={t('inspection.testValidUntil')} date={live.test} />
              <Validity label={t('inspection.insuranceValidUntil')} date={live.insurance} />
            </View>
          </Surface>
        </Reveal>

        {form.groups.map((group, groupIndex) => {
          const open = group.items.filter((item) => !answers[item.id]?.status).length;
          const defects = group.items.filter((item) => answers[item.id]?.status === 'not_ok').length;
          return (
            <View key={group.id} style={styles.group}>
              <View style={styles.groupHead}>
                <View style={styles.groupNum}>
                  <DKText variant="label" color={DK.accent}>
                    {groupIndex + 1}
                  </DKText>
                </View>
                <DKText variant="title" style={styles.flex} accessibilityRole="header">
                  {group.title}
                </DKText>
                {defects > 0 ? (
                  <View style={[styles.countPill, { backgroundColor: STATUS.expired.soft }]}>
                    <DKText variant="micro" color={STATUS.expired.fg}>
                      {defects === 1 ? t('inspection.oneDefect') : t('inspection.defectsCountN', { defects })}
                    </DKText>
                  </View>
                ) : open === 0 ? (
                  <View style={[styles.countPill, { backgroundColor: STATUS.ok.soft }]}>
                    <DKText variant="micro" color={STATUS.ok.fg}>
                      {t('inspection.allMarkedShort')}
                    </DKText>
                  </View>
                ) : null}
              </View>
              {open > 0 && (
                <Pressy onPress={() => markGroupOk(group.id)} haptic accessibilityLabel={t('inspection.markRestOk', { title: group.title })} style={styles.markAll} pressScale={0.97}>
                  <Ionicons name="checkmark-done" size={20} color={DK.accent} />
                  <DKText variant="label" color={DK.accent}>
                    {open === group.items.length ? t('common.allOk') : t('inspection.restOk')}
                  </DKText>
                </Pressy>
              )}
              {group.items.map((item) => {
                number += 1;
                return <InspectionItemCard key={item.id} number={number} item={item} answer={answers[item.id]} onStatus={setStatus} onNote={setNote} />;
              })}
            </View>
          );
        })}

        <Surface style={styles.block}>
          <DKText variant="heading">{t('inspection.unlistedDefect')}</DKText>
          <DKText variant="caption" color={DK.muted}>
            {t('inspection.unlistedHint')}
          </DKText>
          {extra.map((line, index) => (
            <View key={index} style={styles.extraRow}>
              <KitInput
                value={line}
                onChangeText={(text) => edit(setExtra)(extra.map((l, i) => (i === index ? text.slice(0, INSPECTION_LIMITS.note) : l)))}
                placeholder={t('inspection.whatFound')}
                accessibilityLabel={t('inspection.extraDefectN', { v1: index + 1 })}
                style={styles.flex}
              />
              <Pressy onPress={() => edit(setExtra)(extra.filter((_, i) => i !== index))} accessibilityLabel={t('inspection.deleteExtraDefect', { v1: index + 1 })} style={styles.iconButton} pressScale={0.9}>
                <Ionicons name="trash-outline" size={20} color={STATUS.expired.fg} />
              </Pressy>
            </View>
          ))}
          {extra.length < INSPECTION_LIMITS.extraDefects && (
            <Pressy onPress={() => setExtra((prev) => [...prev, ''])} accessibilityLabel={t('inspection.addDefect')} style={styles.noteAdd} pressScale={0.97}>
              <Ionicons name="add" size={19} color={DK.accent} />
              <DKText variant="label" color={DK.accent}>
                {t('inspection.addDefect')}
              </DKText>
            </Pressy>
          )}
        </Surface>

        {inspection && (
          <Pressy onPress={() => setCancelling(true)} accessibilityLabel={t('meeting.deleteDraft')} style={styles.quietLinkDark} pressScale={0.96}>
            <DKText variant="label" color={STATUS.expired.fg}>
              {t('meeting.deleteDraft')}
            </DKText>
          </Pressy>
        )}
        <CancelSheet visible={cancelling} draft onClose={() => setCancelling(false)} onConfirm={() => void cancel()} loading={busy === 'cancel'} />
      </DriverPage>,
    );
  }

  // ── officer ───────────────────────────────────────────────────────────
  if (step === 'officer') {
    const canSign = !!officerName.trim() && !!officerSig;
    const defects = defectLines(form, answers, extra);
    return inShell(
      <DriverPage
        key={step}
        insetTop={topInset}
        insetBottom={bottomInset}
        scrollRef={scrollRef}
        scrollEnabled={!drawing}
        hero={<HeroTitle title="חתימת קצין הבטיחות" subtitle={`${plate}, ${formatIsoDay(today)}`} onBack={() => setStep('fill')} />}
        footer={
          <View style={styles.footer}>
            <View style={styles.need}>
              <Ionicons name="lock-closed-outline" size={17} color={DK.muted} />
              <DKText variant="caption" color={DK.muted}>
                {t('inspection.cantChangeAfterSign')}
              </DKText>
            </View>
            <PrimaryAction label={t('common.saveSignatureContinue')} icon="checkmark-circle" onPress={() => void officerSigns()} disabled={!canSign} loading={busy === 'sign'} />
          </View>
        }
      >
        {messages}
        <Reveal>
          <DefectsCard lines={defects} />
        </Reveal>
        <Reveal index={1}>
          <Surface style={styles.block}>
            <DKText variant="label" color={DK.inkSoft} nativeID="officer-name-label">
              {t('inspection.officerName')}
            </DKText>
            <KitInput
              value={officerName}
              onChangeText={setOfficerName}
              placeholder={t('signature.nameExample')}
              autoComplete="name"
              textContentType="name"
              maxLength={INSPECTION_LIMITS.officerName}
              accessibilityLabel={t('inspection.officerName')}
              accessibilityLabelledBy="officer-name-label"
            />
            {recent.length > 0 && (
              <>
                <DKText variant="caption" color={DK.muted}>
                  {t('signature.namesSigned')}
                </DKText>
                <View style={styles.chips}>
                  {recent.map((name) => {
                    const on = officerName.trim() === name;
                    return (
                      <Pressy key={name} onPress={() => setOfficerName(name)} accessibilityLabel={`${name}${on ? t('common.selectedSuffix') : ''}`} style={[styles.chip, on && styles.chipOn]} pressScale={0.95}>
                        <Ionicons name={on ? 'checkmark' : 'person-outline'} size={16} color={on ? '#FFFFFF' : DK.accent} />
                        <DKText variant="label" color={on ? '#FFFFFF' : DK.accent}>
                          {name}
                        </DKText>
                      </Pressy>
                    );
                  })}
                </View>
              </>
            )}
          </Surface>
        </Reveal>
        <Reveal index={2}>
          <Surface style={styles.block}>
            <SignaturePad title="חתימת קצין הבטיחות" onChange={setOfficerSig} onDrawing={setDrawing} disabled={busy === 'sign'} />
            <DKText variant="caption" color={DK.muted}>
              {t('inspection.signatureNotStored')}
            </DKText>
          </Surface>
        </Reveal>
        <Reveal index={3}>
          <Disclaimer />
        </Reveal>
      </DriverPage>,
    );
  }

  // ── choose ────────────────────────────────────────────────────────────
  if (step === 'choose') {
    const first = firstName(driverName);
    return inShell(
      <DriverPage key={step} insetTop={topInset} insetBottom={bottomInset} scrollRef={scrollRef} hero={<HeroTitle title={t('signature.ofFirst', { first })} subtitle={t('signature.chooseWay')} onBack={() => setStep('view')} />}>
        {messages}
        <Reveal>
          <SignedBy image={officerSig} name={inspection?.officer_name ?? officerName} date={formatIsoDay(inspection?.inspection_date ?? today)} />
        </Reveal>
        <Reveal index={1}>
          <Choice
            icon={isDesktop ? 'desktop-outline' : 'phone-portrait-outline'}
            tone="accent"
            title={isDesktop ? t('signature.nowComputer') : t('signature.nowPhone')}
            body={t('signature.driverHere', { v1: isDesktop ? t('signature.turnScreen') : t('signature.handPhone') })}
            tag={t('signature.mostCommon')}
            onPress={() => {
              setError('');
              setDriverSig(null);
              setStep('handoff');
            }}
            disabled={!!busy}
          />
        </Reveal>
        <Reveal index={2}>
          <Choice
            icon="paper-plane-outline"
            tone="cyan"
            title={t('signature.sendToFirst', { first })}
            body={t('inspection.toSiteOfFirst', { first })}
            onPress={() => void sendToDriver()}
            loading={busy === 'notify'}
            disabled={!!busy}
          />
        </Reveal>
      </DriverPage>,
    );
  }

  // ── handoff (the device goes to the driver) ───────────────────────────
  if (step === 'handoff') {
    const first = firstName(driverName);
    return (
      <View style={styles.night}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={DK.night} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={[styles.nightBody, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.nightMid}>
            <Reveal>
              <View style={styles.handIcon}>
                <Ionicons name={isDesktop ? 'desktop-outline' : 'phone-portrait-outline'} size={44} color={DK.onNight} />
              </View>
            </Reveal>
            <Reveal index={1}>
              <DKText variant="display" color={DK.onNight} style={styles.center}>
                {isDesktop ? t('signature.nowDriver', { driverName }) : t('signature.passPhoneTo', { driverName })}
              </DKText>
            </Reveal>
            <Reveal index={2}>
              <DKText variant="body" color={DK.onNightMuted} style={styles.center}>
                {t('inspection.onlyResults')}
              </DKText>
            </Reveal>
            <Reveal index={3}>
              <View style={styles.lockLine}>
                <Ionicons name="lock-closed" size={15} color={DK.onNightMuted} />
                <DKText variant="caption" color={DK.onNightMuted}>
                  {t('signature.systemLocked')}
                </DKText>
              </View>
            </Reveal>
          </View>
          <View style={styles.nightActions}>
            <Pressy onPress={() => setStep('driver')} haptic accessibilityLabel={t('signature.iAmReady', { first })} style={styles.whiteCta}>
              <DKText variant="heading" color={DK.nightInk}>
                {t('signature.iAm')} {first}{t('signature.readyToStart')}
              </DKText>
              <Ionicons name={dirIcon('arrow-back')} size={21} color={DK.nightInk} />
            </Pressy>
            <Pressy onPress={() => setStep('choose')} accessibilityLabel={t('signature.backDriverNotSigning')} style={styles.quietLink} pressScale={0.96}>
              <DKText variant="label" color={DK.onNightMuted}>
                {t('signature.backNotNow')}
              </DKText>
            </Pressy>
          </View>
        </View>
      </View>
    );
  }

  // ── driver ────────────────────────────────────────────────────────────
  if (step === 'driver') {
    const first = firstName(driverName);
    return (
      <View style={styles.page}>
        <StatusBar barStyle="dark-content" />
        <ScrollView
          ref={scrollRef}
          scrollEnabled={!drawing}
          contentContainerStyle={[styles.driverBody, { paddingTop: insets.top + 24, paddingBottom: 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          {messages}
          <Reveal>
            <Surface style={styles.hello}>
              <DKText variant="title">{t('common.hello')} {first}</DKText>
              <DKText variant="body" color={DK.inkSoft}>
                {inspection?.officer_name ?? officerName} {t('inspection.checkedTodayBy')} {plate}{t('inspection.reviewAndSign')}
              </DKText>
            </Surface>
          </Reveal>
          <Reveal index={1}>
            <DefectsCard lines={defectLines(form, answers, extra)} />
          </Reveal>
          <Reveal index={2}>
            <ResultList form={form} answers={answers} />
          </Reveal>
          <Reveal index={3}>
            <Disclaimer />
          </Reveal>
          <Reveal index={4}>
            <SignedBy image={officerSig} name={inspection?.officer_name ?? officerName} date={formatIsoDay(inspection?.inspection_date ?? today)} />
          </Reveal>
          <Reveal index={5}>
            <Surface style={styles.block}>
              <SignaturePad title="חתימת הנהג" onChange={setDriverSig} onDrawing={setDrawing} disabled={busy === 'driver'} />
            </Surface>
          </Reveal>
          <Pressy onPress={() => setStep('choose')} accessibilityLabel={t('signature.returnWithoutSigning')} style={styles.quietLinkDark} pressScale={0.96}>
            <DKText variant="label" color={DK.muted}>
              {t('signature.returnWithoutSigning')}
            </DKText>
          </Pressy>
        </ScrollView>
        <View style={[styles.pageFooter, { paddingBottom: insets.bottom + 12 }]}>
          <PrimaryAction label={t('field.signature')} icon="create-outline" onPress={() => void driverSigns()} disabled={!driverSig} loading={busy === 'driver'} />
        </View>
      </View>
    );
  }

  // ── done / sent ───────────────────────────────────────────────────────
  if (step === 'done' || step === 'sent') {
    const sent = step === 'sent';
    const first = firstName(driverName);
    return inShell(
      <View style={styles.page}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={[styles.doneBody, { paddingTop: topInset + 48, paddingBottom: bottomInset + 24 }]}>
          {messages}
          <SuccessTick tone={sent ? 'accent' : 'ok'} />
          <Reveal index={2}>
            <DKText variant="display" style={styles.center} accessibilityRole="header">
              {sent ? t('inspection.sentTo', { first }) : t('inspection.thanksSigned')}
            </DKText>
          </Reveal>
          <Reveal index={3}>
            <DKText variant="body" color={DK.inkSoft} style={styles.center}>
              {sent
                ? t('inspection.sentBody', { first })
                : t('inspection.signedSavedIn', { driverName })}
            </DKText>
          </Reveal>
          {nextDue ? (
            <Reveal index={4}>
              <Surface style={styles.nextDue}>
                <View style={styles.nextDueIcon}>
                  <Ionicons name="calendar" size={22} color={DK.accent} />
                </View>
                <View style={styles.flex}>
                  <DKText variant="caption" color={DK.muted}>{t('inspection.vehicleNext')}</DKText>
                  <DKText variant="heading">{formatIsoDay(nextDue)}</DKText>
                </View>
              </Surface>
              <DKText variant="caption" color={DK.muted} style={styles.center}>{t('inspection.remindChangeDate')}</DKText>
            </Reveal>
          ) : null}
          <Reveal index={5} style={styles.doneActions}>
            {!sent && <PrimaryAction label={t('signing.downloadSigned')} icon="download-outline" onPress={() => void download()} loading={busy === 'download'} />}
            <PrimaryAction label={t('common.done')} tone={sent ? 'accent' : 'ghost'} onPress={leave} />
          </Reveal>
        </ScrollView>
      </View>,
    );
  }

  // ── view (an inspection opened again) ─────────────────────────────────
  const meta = state ? INSPECTION_STATE_META[state] : null;
  const canDriverSign = state === 'awaiting_driver';
  const canClose = state === 'awaiting_driver' || state === 'requires_attention';
  const documentReady = !!inspection && hasDocument(inspection, requestStatus);
  const shownFacts = [
    { label: t('vehicle.number'), value: facts ? formatPlate(facts.plate) : plate },
    { label: t('vehicle.makeAndModel'), value: facts?.vehicle || vehicleLabel || '—' },
    { label: t('vehicle.mileage'), value: (facts?.odometer ?? inspection?.odometer)?.toLocaleString(getLocale()) ?? '—' },
    { label: t('role.driver'), value: facts?.driverName ?? driverName },
    { label: t('inspection.date'), value: formatIsoDay(inspection?.inspection_date) },
    { label: t('company.safetyOfficer'), value: inspection?.officer_name ?? '—' },
  ];
  return inShell(
    <DriverPage
      key={step}
      insetTop={topInset}
      insetBottom={bottomInset}
      scrollRef={scrollRef}
      hero={
        <View>
          <HeroTitle title={t('notifications.cat.safetyCheck')} subtitle={`${vehicleLabel ? `${vehicleLabel} · ` : ''}${formatIsoDay(inspection?.inspection_date)}`} onBack={leave} />
          <View style={styles.heroChips}>
            <Plate number={plate} size="sm" />
            {meta && (
              <View style={styles.statePill}>
                <DKText variant="label" color={DK.onNight}>
                  {meta.label}
                </DKText>
              </View>
            )}
          </View>
        </View>
      }
      overlay={
        <>
          <KitSheet
            visible={closing}
            onClose={() => setClosing(false)}
            icon="lock-closed-outline"
            title={t('inspection.closeWithoutDriver')}
            subtitle={t('inspection.closeWithoutDriverBody')}
            footer={
              <SheetActions>
                <PrimaryAction label={t('common.goBack')} tone="ghost" onPress={() => setClosing(false)} style={styles.flex} />
                <PrimaryAction label={t('inspection.close')} icon="lock-closed" onPress={() => void closeWithoutDriver()} disabled={!closeNote.trim()} loading={busy === 'close'} style={styles.flex} />
              </SheetActions>
            }
          >
            <KitInput
              value={closeNote}
              onChangeText={(text) => setCloseNote(text.slice(0, INSPECTION_LIMITS.closedNote))}
              placeholder={t('inspection.closeReasonExample')}
              accessibilityLabel={t('inspection.whyNotSigned')}
              multiline
              style={styles.noteInput}
            />
          </KitSheet>
          <CancelSheet visible={cancelling} onClose={() => setCancelling(false)} onConfirm={() => void cancel()} loading={busy === 'cancel'} />
        </>
      }
    >
      {messages}
      {state === 'requires_attention' && (
        <Reveal>
          <Banner tone="expired" title={t('inspection.driverCannotSign')}>
            {t('inspection.driverCannotSignBody')}
          </Banner>
        </Reveal>
      )}
      {state === 'closed' && !!inspection?.closed_note && (
        <Reveal>
          <Banner tone="info" icon="lock-closed" title={t('inspection.closedNoDriver')}>
            {inspection.closed_note}
          </Banner>
        </Reveal>
      )}
      <Reveal>
        <Surface style={styles.factsGrid}>
          {shownFacts.map((fact) => (
            <View key={fact.label} style={styles.fact}>
              <DKText variant="caption" color={DK.muted}>
                {fact.label}
              </DKText>
              <DKText variant="label">{fact.value}</DKText>
            </View>
          ))}
        </Surface>
      </Reveal>
      {(canDriverSign || canClose || documentReady) && (
        <Reveal index={1}>
          <Surface style={styles.block}>
            {documentReady && <PrimaryAction label={t('viewer.downloadDocument')} icon="download-outline" onPress={() => void download()} loading={busy === 'download'} />}
            {canDriverSign && (
              <PrimaryAction
                label={t('inspection.driverSignsNowHere')}
                icon={isDesktop ? 'desktop-outline' : 'phone-portrait-outline'}
                onPress={() => {
                  setError('');
                  setNotice('');
                  setDriverSig(null);
                  setStep('handoff');
                }}
                disabled={!!busy}
              />
            )}
            {canDriverSign && <PrimaryAction label={t('inspection.sendReminder')} icon="paper-plane-outline" tone="ghost" onPress={() => void run('notify', async () => { await notifyInspectionDriver(companyId, inspection!.id); setNotice(t('inspection.reminderSent')); })} loading={busy === 'notify'} />}
            {canClose && <PrimaryAction label={t('inspection.closeWithoutDriver')} icon="lock-closed-outline" tone="ghost" onPress={() => setClosing(true)} disabled={!!busy} />}
          </Surface>
        </Reveal>
      )}
      <Reveal index={2}>
        <DefectsCard lines={defectLines(form, answers, extra)} />
      </Reveal>
      <Reveal index={3}>
        <ResultList form={form} answers={answers} />
      </Reveal>
      {!!officerSig && (
        <Reveal index={4}>
          <SignedBy image={officerSig} name={inspection?.officer_name ?? ''} date={formatIsoDay(inspection?.inspection_date)} />
        </Reveal>
      )}
      {state !== 'cancelled' && (
        <Pressy onPress={() => setCancelling(true)} accessibilityLabel={t('inspection.cancel')} style={styles.quietLinkDark} pressScale={0.96}>
          <DKText variant="label" color={STATUS.expired.fg}>
            {t('inspection.cancel')}
          </DKText>
        </Pressy>
      )}
    </DriverPage>,
  );
}

// ── pieces ───────────────────────────────────────────────────────────────

function Validity({ label, date }: { label: string; date: string | null }) {
  const status = statusOfDate(date);
  const s = STATUS[status];
  return (
    <View style={[styles.validityItem, { backgroundColor: s.soft }]}>
      <Ionicons name={s.icon} size={18} color={s.fg} />
      <View style={styles.flex}>
        <DKText variant="caption" color={s.fg}>
          {label}
        </DKText>
        <DKText variant="label" color={s.fg}>
          {date ? formatIsoDay(date) : t('common.notEntered')}
        </DKText>
      </View>
    </View>
  );
}

function DefectsCard({ lines }: { lines: string[] }) {
  if (!lines.length) {
    return (
      <Surface style={[styles.defects, { backgroundColor: STATUS.ok.soft }]}>
        <View style={styles.signedTitle}>
          <Ionicons name="checkmark-circle" size={20} color={STATUS.ok.fg} />
          <DKText variant="heading" color={STATUS.ok.fg}>
            {t('inspection.noDefects')}
          </DKText>
        </View>
      </Surface>
    );
  }
  return (
    <Surface style={[styles.defects, { backgroundColor: STATUS.expired.soft }]}>
      <View style={styles.signedTitle}>
        <Ionicons name="alert-circle" size={20} color={STATUS.expired.fg} />
        <DKText variant="heading" color={STATUS.expired.fg}>
          {lines.length === 1 ? t('inspection.oneDefectFound') : t('inspection.defectsFound', { length: lines.length })}
        </DKText>
      </View>
      {lines.map((line, index) => (
        <DKText key={index} variant="body" color={DK.ink}>
          {index + 1}. {line}
        </DKText>
      ))}
    </Surface>
  );
}

function ResultList({ form, answers }: { form: InspectionForm; answers: InspectionAnswers }) {
  return (
    <Surface style={styles.summary}>
      {form.groups.map((group, groupIndex) => (
        <View key={group.id} style={groupIndex > 0 && styles.divider}>
          <DKText variant="heading" style={styles.sumGroup}>
            {group.title}
          </DKText>
          {group.items.map((item) => {
            const answer = answers[item.id];
            const meta = answer?.status ? INSPECTION_STATUS_META[answer.status] : null;
            return (
              <View key={item.id} style={styles.sumRow}>
                {meta ? (
                  <View style={[styles.pill, { backgroundColor: meta.soft }]}>
                    <Ionicons name={meta.icon} size={15} color={meta.fg} />
                    <DKText variant="micro" color={meta.fg}>
                      {meta.label}
                    </DKText>
                  </View>
                ) : (
                  <View style={[styles.pill, { backgroundColor: DK.surfaceSunk }]}>
                    <DKText variant="micro" color={DK.muted}>
                      {t('inspection.notMarked')}
                    </DKText>
                  </View>
                )}
                <View style={styles.flex}>
                  <DKText variant="body">{item.text}</DKText>
                  {!!answer?.note && (
                    <DKText variant="caption" color={answer.status === 'not_ok' ? STATUS.expired.fg : DK.muted}>
                      {answer.note}
                    </DKText>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </Surface>
  );
}

function Disclaimer() {
  return (
    <View style={styles.disclaimer}>
      <Ionicons name="information-circle-outline" size={18} color={DK.inkSoft} style={styles.noteIcon} />
      <DKText variant="caption" color={DK.inkSoft} style={styles.flex}>
        <DKText variant="caption" color={DK.ink} style={styles.bold}>
          {t('common.attention')}{' '}
        </DKText>
        {INSPECTION_DISCLAIMER}
      </DKText>
    </View>
  );
}

function CancelSheet({ visible, draft = false, onClose, onConfirm, loading }: { visible: boolean; draft?: boolean; onClose: () => void; onConfirm: () => void; loading: boolean }) {
  return (
    <KitSheet
      visible={visible}
      onClose={onClose}
      tone="danger"
      icon={draft ? 'trash-outline' : 'close-circle-outline'}
      title={draft ? t('meeting.deleteDraftQuestion') : t('inspection.cancelQuestion')}
      subtitle={
        draft
          ? t('inspection.cancelDraftBody')
          : t('inspection.cancelSignedBody')
      }
      footer={
        <SheetActions>
          <PrimaryAction label={t('common.goBack')} tone="ghost" onPress={onClose} style={styles.flex} />
          <PrimaryAction label={draft ? t('common.deleteAction') : t('inspection.cancel')} tone="destructive" onPress={onConfirm} loading={loading} style={styles.flex} />
        </SheetActions>
      }
    />
  );
}

function Progress({ marked, total }: { marked: number; total: number }) {
  const reduce = useReducedMotion();
  const value = total ? marked / total : 0;
  const width = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: value, duration: reduce ? 0 : 240, easing: EASE_OUT, useNativeDriver: false }).start();
  }, [reduce, value, width]);
  return (
    <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: marked }} accessibilityLabel={t('common.markedOfTotal', { marked, total })}>
      <View style={styles.progressRow}>
        <DKText variant="caption" color={DK.onNightMuted}>
          {t('common.progress')}
        </DKText>
        <DKText variant="label" color={DK.onNight}>
          {t('common.marked')} {marked} {t('common.of')} {total}
        </DKText>
      </View>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
    </View>
  );
}

function SignedBy({ image, name, date }: { image: string | null; name: string; date: string }) {
  return (
    <Surface style={styles.signedBy}>
      {image ? (
        <View style={styles.signedImage}>
          <Image source={{ uri: image }} style={styles.signedImg} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>
      ) : null}
      <View style={styles.flex}>
        <View style={styles.signedTitle}>
          <Ionicons name="checkmark-circle" size={19} color={STATUS.ok.fg} />
          <DKText variant="label" color={STATUS.ok.fg}>
            חתימת קצין הבטיחות
          </DKText>
        </View>
        <DKText variant="caption" color={DK.inkSoft}>
          {t('signature.signedBy')} {name}, {date}
        </DKText>
      </View>
    </Surface>
  );
}

function Choice({
  icon,
  tone,
  title,
  body,
  tag,
  onPress,
  loading,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: 'accent' | 'cyan';
  title: string;
  body: string;
  tag?: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressy onPress={onPress} disabled={disabled} haptic accessibilityLabel={`${title}. ${body}`} style={styles.choice} pressScale={0.98}>
      <LinearGradient colors={tone === 'accent' ? ['#4C74FF', DK.accent] : ['#3FD3F5', '#0E9FC8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.choiceIcon}>
        <Ionicons name={loading ? 'hourglass-outline' : icon} size={30} color="#FFFFFF" />
      </LinearGradient>
      <View style={styles.flex}>
        <DKText variant="heading">{title}</DKText>
        <DKText variant="caption" color={DK.muted}>
          {body}
        </DKText>
        {!!tag && (
          <View style={styles.tag}>
            <Ionicons name="sparkles" size={13} color={DK.accent} />
            <DKText variant="micro" color={DK.accent}>
              {tag}
            </DKText>
          </View>
        )}
      </View>
      <Ionicons name={dirIcon('chevron-back')} size={22} color={DK.faint} />
    </Pressy>
  );
}

/** The one moment of delight: a ring settles in and the tick draws on. */
function SuccessTick({ tone }: { tone: 'ok' | 'accent' }) {
  const reduce = useReducedMotion();
  const disc = useRef(new Animated.Value(0)).current;
  const tick = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const native = Platform.OS !== 'web';
    Animated.parallel([
      Animated.spring(disc, { toValue: 1, useNativeDriver: native, speed: 14, bounciness: reduce ? 0 : 9 }),
      Animated.sequence([
        Animated.delay(reduce ? 0 : 160),
        Animated.parallel([
          Animated.timing(tick, { toValue: 1, duration: 220, easing: EASE_OUT, useNativeDriver: native }),
          Animated.timing(ring, { toValue: 1, duration: 700, easing: EASE_OUT, useNativeDriver: native }),
        ]),
      ]),
    ]).start();
  }, [disc, reduce, ring, tick]);
  const color = tone === 'ok' ? STATUS.ok.fill : DK.accent;
  return (
    <View style={styles.tickWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {!reduce && (
        <Animated.View
          style={[
            styles.tickRing,
            { borderColor: color, opacity: ring.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.5, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.45] }) }] },
          ]}
        />
      )}
      <Animated.View style={[styles.tickDisc, { backgroundColor: color, opacity: disc, transform: [{ scale: reduce ? 1 : disc.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>
        <Animated.View style={{ opacity: tick, transform: [{ scale: reduce ? 1 : tick.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
          <Ionicons name="checkmark" size={62} color="#FFFFFF" />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  bold: { fontWeight: '700' },
  page: { flex: 1, backgroundColor: DK.canvas },
  glassPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: DK.glass,
    borderWidth: 1,
    borderColor: DK.glassBorder,
  },
  who: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginTop: 4 },
  heroChips: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  statePill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: DK.glass, borderWidth: 1, borderColor: DK.glassBorder },
  progress: { marginTop: 18, gap: 8, padding: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  progressRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.16)', overflow: 'hidden', flexDirection: 'row-reverse' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: DK.mint },
  footer: { gap: 10 },
  need: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sheetStack: { gap: 10 },
  block: { padding: 16, gap: 12 },
  field: { gap: 8 },
  validity: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  validityItem: { flexGrow: 1, flexBasis: 200, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16 },
  group: { gap: 12 },
  groupHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 4, marginTop: 8 },
  groupNum: { width: 32, height: 32, borderRadius: 10, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  markAll: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: DK.accentSoft,
    borderWidth: 1.5,
    borderColor: 'rgba(47,91,255,0.18)',
  },
  extraRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  iconButton: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: STATUS.expired.soft },
  noteAdd: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-end', paddingHorizontal: 4 },
  noteIcon: { marginTop: 1 },
  noteInput: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: DK.accentSoft },
  chipOn: { backgroundColor: DK.accent },
  chipGhost: { backgroundColor: DK.surfaceSunk },
  chipError: { borderWidth: 1.5, borderColor: STATUS.expired.fg },
  pickList: { gap: 6, marginTop: 10 },
  pickRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 12, borderRadius: 14, backgroundColor: DK.surfaceSunk },
  pickRowOn: { backgroundColor: DK.accentSoft },
  defects: { padding: 16, gap: 6 },
  disclaimer: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, padding: 14, borderRadius: 16, backgroundColor: DK.surfaceSunk },
  factsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', padding: 8 },
  fact: { flexGrow: 1, flexBasis: 150, padding: 10, gap: 2 },
  signedBy: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, padding: 14 },
  signedImage: { width: 96, height: 56, borderRadius: 12, backgroundColor: DK.surfaceSunk, padding: 4 },
  signedImg: { width: '100%', height: '100%' },
  signedTitle: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  choice: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, padding: 18, borderRadius: 24, backgroundColor: DK.surface, minHeight: 112 },
  choiceIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tag: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: DK.accentSoft },
  night: { flex: 1, backgroundColor: DK.night[1] },
  nightBody: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between', width: '100%', maxWidth: 560, alignSelf: 'center' },
  nightMid: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  handIcon: { width: 96, height: 96, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: DK.glass, borderWidth: 1, borderColor: DK.glassBorder },
  lockLine: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  nightActions: { gap: 8 },
  whiteCta: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 60, borderRadius: 20, backgroundColor: '#FFFFFF' },
  quietLink: { alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  quietLinkDark: { alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  driverBody: { paddingHorizontal: 16, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hello: { padding: 18, gap: 6 },
  summary: { paddingHorizontal: 14, paddingVertical: 4 },
  sumGroup: { paddingTop: 12, paddingBottom: 2 },
  sumRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  pill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, minWidth: 92, justifyContent: 'center' },
  pageFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: DK.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: DK.hairline,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  doneBody: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 14, width: '100%', maxWidth: 520, alignSelf: 'center' },
  doneActions: { alignSelf: 'stretch', gap: 10, marginTop: 14 },
  nextDue: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 8, padding: 14 },
  nextDueIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  tickWrap: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tickRing: { position: 'absolute', width: 116, height: 116, borderRadius: 58, borderWidth: 3 },
  tickDisc: { width: 116, height: 116, borderRadius: 58, alignItems: 'center', justifyContent: 'center' },
});
