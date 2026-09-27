import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Avatar,
  Banner,
  DK,
  DKText,
  DriverPage,
  ErrorPanel,
  HeroTitle,
  KitInput,
  KitSheet,
  LoadingPanel,
  PrimaryAction,
  Pressy,
  Reveal,
  STATUS,
  SheetActions,
  Surface,
  useReducedMotion,
} from '../../components/driverKit';
import { ChecklistItemCard } from '../../components/checklist/ChecklistItemCard';
import { SignaturePad } from '../../components/checklist/SignaturePad';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { getDriver, type DriverRow } from '../../lib/adminApi';
import {
  CHECKLIST_LIMITS,
  STATUS_META,
  allAnswered,
  answeredCount,
  driverSignMeeting,
  filledItems,
  formatIsoDay,
  getChecklistTemplate,
  getMeeting,
  getRequestStatus,
  notifyMeetingDriver,
  readForm,
  recentOfficerNames,
  saveMeetingDraft,
  signMeeting,
  statusOptions,
  todayIso,
  type ChecklistAnswers,
  type ChecklistForm,
  type ChecklistStatus,
  type MeetingRow,
} from '../../lib/checklistForms';
import { getSigningSession, syncSigningRequest } from '../../lib/docuseal';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import type { RootStackParamList } from '../../navigation/types';

/**
 * A meeting on a "רשימת סעיפים" form, from the first answer to the last
 * signature. One clear action per screen:
 *
 *   fill     mark every item, notes if wanted
 *   officer  the officer's name and hand signature
 *   choose   the driver signs now, here, or gets it on their own phone
 *   handoff  the phone goes to the driver
 *   driver   the driver reads what was marked and signs
 *   done / sent
 *
 * The same screens run on the manager's phone and on the desktop site.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'ChecklistMeeting'>;
type Step = 'fill' | 'officer' | 'choose' | 'handoff' | 'driver' | 'done' | 'sent';
type Busy = '' | 'save' | 'next' | 'sign' | 'driver' | 'notify' | 'open';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export default function ChecklistMeetingScreen({ navigation, route }: Props) {
  // What the screen was opened with. Once a draft exists the address points
  // at it (a refresh resumes the same meeting), without loading it again.
  const [{ driverId, templateId, meetingId }] = useState(route.params);
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const reduce = useReducedMotion();

  const [loadError, setLoadError] = useState('');
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [title, setTitle] = useState('');
  const [form, setForm] = useState<ChecklistForm | null>(null);
  const [meeting, setMeeting] = useState<MeetingRow | null>(null);
  const [answers, setAnswers] = useState<ChecklistAnswers>({});
  const [officerName, setOfficerName] = useState('');
  const [officerSig, setOfficerSig] = useState<string | null>(null);
  const [driverSig, setDriverSig] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [step, setStep] = useState<Step>('fill');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [filePending, setFilePending] = useState(false);
  const [busy, setBusy] = useState<Busy>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [leaving, setLeaving] = useState<null | { go: () => void }>(null);
  const allowLeave = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const companyId = driver?.company_id ?? '';
  const driverName = driver?.full_name?.trim() || 'הנהג';
  const items = useMemo(() => (form ? filledItems(form) : []), [form]);
  const options = useMemo(() => (form ? statusOptions(form) : []), [form]);
  const marked = form ? answeredCount(form, answers) : 0;
  const complete = !!form && allAnswered(form, answers);
  const today = todayIso();

  // ── load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const target = await getDriver(driverId);
        if (!target?.company_id) throw new Error('הנהג לא נמצא');
        let loadedForm: ChecklistForm | null = null;
        let loadedTitle = '';
        let loadedMeeting: MeetingRow | null = null;
        let nextStep: Step = 'fill';
        let request: string | null = null;
        if (meetingId) {
          loadedMeeting = await getMeeting(meetingId);
          if (!loadedMeeting || loadedMeeting.driver_id !== driverId) throw new Error('המפגש לא נמצא');
          if (loadedMeeting.status === 'cancelled') throw new Error('המפגש הזה בוטל');
          loadedForm = readForm(loadedMeeting.form);
          loadedTitle = loadedMeeting.title;
          if (loadedMeeting.status === 'signed' && loadedMeeting.signature_request_id) {
            request = loadedMeeting.signature_request_id;
            const requestStatus = await getRequestStatus(request);
            if (requestStatus === 'cancelled') throw new Error('המפגש הזה בוטל');
            nextStep = requestStatus === 'completed' ? 'done' : 'choose';
          }
        } else if (templateId) {
          const template = await getChecklistTemplate(templateId);
          if (!template) throw new Error('הטופס לא נמצא');
          loadedForm = template.form;
          loadedTitle = template.title;
        }
        if (!loadedForm) throw new Error('הטופס לא נמצא');
        const names = await recentOfficerNames(target.company_id);
        if (!active) return;
        setDriver(target);
        setForm(loadedForm);
        setTitle(loadedTitle);
        setMeeting(loadedMeeting);
        setAnswers(loadedMeeting?.answers ?? {});
        setOfficerName(loadedMeeting?.officer_name ?? '');
        setRequestId(request);
        setStep(nextStep);
        setRecent(names);
      } catch (err) {
        if (active) setLoadError((err as Error)?.message || 'טעינת המפגש נכשלה');
      }
    })();
    return () => {
      active = false;
    };
  }, [driverId, meetingId, templateId]);

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
    else navigation.navigate('DriverDetail', { driverId });
  }, [driverId, navigation]);

  const toTop = () => scrollRef.current?.scrollTo({ y: 0, animated: !reduce });

  // ── answers ───────────────────────────────────────────────────────────
  const setStatus = useCallback((itemId: string, status: ChecklistStatus) => {
    setAnswers((prev) => ({ ...prev, [itemId]: { status, note: prev[itemId]?.note ?? '' } }));
    setDirty(true);
  }, []);
  const setNote = useCallback((itemId: string, note: string) => {
    setAnswers((prev) => ({ ...prev, [itemId]: { status: prev[itemId]?.status ?? null, note: note.slice(0, CHECKLIST_LIMITS.note) } }));
    setDirty(true);
  }, []);
  const markTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => markTimers.current.forEach(clearTimeout), []);
  const markRest = () => {
    const open = items.filter((item) => !answers[item.id]?.status);
    markTimers.current.forEach(clearTimeout);
    // The marks land one after another, top to bottom, so the eye can follow them.
    open.forEach((item, i) => {
      if (reduce) setStatus(item.id, 'done');
      else markTimers.current.push(setTimeout(() => setStatus(item.id, 'done'), i * 55));
    });
  };

  // ── server ────────────────────────────────────────────────────────────
  const persist = async (): Promise<MeetingRow> => {
    const input = { answers, officerName, meetingDate: today };
    const saved = meeting
      ? await saveMeetingDraft(companyId, { meetingId: meeting.id }, input)
      : await saveMeetingDraft(companyId, { templateId: templateId!, driverId }, input);
    setMeeting(saved);
    setDirty(false);
    if (!meeting) navigation.setParams({ meetingId: saved.id, templateId: undefined });
    return saved;
  };
  const run = async (kind: Busy, task: () => Promise<void>) => {
    setBusy(kind);
    setError('');
    setNotice('');
    try {
      await task();
    } catch (err) {
      setError((err as Error)?.message || 'הפעולה נכשלה. נסו שוב.');
      toTop();
    } finally {
      setBusy('');
    }
  };

  const saveDraft = () =>
    run('save', async () => {
      await persist();
      setNotice('נשמר. אפשר להמשיך אחר כך מאותה נקודה, מתוך תיק הנהג.');
      toTop();
    });
  const toOfficer = () =>
    run('next', async () => {
      await persist();
      setStep('officer');
    });
  const officerSigns = () =>
    run('sign', async () => {
      const current = meeting ?? (await persist());
      const result = await signMeeting(companyId, current.id, {
        answers,
        officerName: officerName.trim(),
        meetingDate: today,
        officerSignature: officerSig!,
        notifyDriver: false,
      });
      setMeeting(result.meeting);
      setRequestId(result.requestId);
      setNextDue(result.nextDue ?? null);
      setDirty(false);
      setStep('choose');
    });
  const sendToDriver = () =>
    run('notify', async () => {
      await notifyMeetingDriver(companyId, meeting!.id);
      setStep('sent');
    });
  const driverSigns = () =>
    run('driver', async () => {
      const result = await driverSignMeeting(companyId, meeting!.id, driverSig!);
      setFilePending(result.filePending);
      setStep('done');
    });
  const openDocument = () =>
    run('open', async () => {
      if (!requestId) return;
      if (filePending) await syncSigningRequest(requestId).catch(() => undefined);
      const session = await getSigningSession(requestId);
      navigation.navigate('DocusealWebView', { ...session, title, requestId, allowDownload: true });
    });

  // ── frames ────────────────────────────────────────────────────────────
  const inShell = (content: React.ReactNode) =>
    isDesktop ? (
      <DesktopShell active="AdminHome" breadcrumbs={['נהגים', driverName, title || 'מפגש']}>
        {content}
      </DesktopShell>
    ) : (
      content
    );
  const topInset = isDesktop ? 0 : insets.top;
  const bottomInset = isDesktop ? 0 : insets.bottom;

  if (loadError || !form || !driver) {
    return inShell(
      <DriverPage insetTop={topInset} insetBottom={bottomInset} hero={<HeroTitle title={title || 'מפגש'} onBack={leave} />}>
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

  // ── fill ──────────────────────────────────────────────────────────────
  if (step === 'fill') {
    const left = items.length - marked;
    return inShell(
      <DriverPage
        key={step}
        insetTop={topInset}
        insetBottom={bottomInset}
        scrollRef={scrollRef}
        hero={
          <View>
            <HeroTitle
              title={title}
              onBack={leave}
              right={
                <Pressy onPress={() => void saveDraft()} disabled={!!busy} accessibilityLabel="שמירה והמשך אחר כך" style={styles.glassPill} pressScale={0.94}>
                  <Ionicons name={busy === 'save' ? 'hourglass-outline' : 'bookmark-outline'} size={17} color={DK.onNight} />
                  <DKText variant="label" color={DK.onNight}>
                    שמירה
                  </DKText>
                </Pressy>
              }
            />
            <View style={styles.who}>
              <Avatar name={driverName} size={52} tone="night" />
              <View style={styles.flex}>
                <DKText variant="heading" color={DK.onNight}>
                  {driverName}
                </DKText>
                <DKText variant="caption" color={DK.onNightMuted}>
                  {[driver.license_classes ? `רישיון ${driver.license_classes}` : null, `המפגש היום, ${formatIsoDay(today)}`].filter(Boolean).join(' · ')}
                </DKText>
              </View>
            </View>
            <Progress marked={marked} total={items.length} />
          </View>
        }
        footer={
          <View style={styles.footer}>
            <View style={styles.need} accessibilityLiveRegion="polite">
              {left > 0 ? (
                <>
                  <Ionicons name="information-circle-outline" size={18} color={DK.muted} />
                  <DKText variant="caption" color={DK.muted}>
                    {left === 1 ? 'נשאר סעיף אחד לסימון' : `נשארו ${left} סעיפים לסימון`}
                  </DKText>
                </>
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color={STATUS.ok.fg} />
                  <DKText variant="label" color={STATUS.ok.fg}>
                    כל הסעיפים מסומנים
                  </DKText>
                </>
              )}
            </View>
            <PrimaryAction label="המשך לחתימה" icon="arrow-back" onPress={() => void toOfficer()} disabled={!complete} loading={busy === 'next'} />
          </View>
        }
        overlay={
          <KitSheet
            visible={!!leaving}
            onClose={() => setLeaving(null)}
            icon="bookmark-outline"
            title="לשמור את מה שסומן?"
            subtitle="אם תשמרו, אפשר יהיה להמשיך את המפגש אחר כך מאותה נקודה."
            footer={
              <View style={styles.sheetStack}>
                <PrimaryAction
                  label="שמירה ויציאה"
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
                  <PrimaryAction label="להמשיך למלא" tone="ghost" onPress={() => setLeaving(null)} style={styles.flex} />
                  <PrimaryAction
                    label="יציאה בלי לשמור"
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
        }
      >
        {messages}
        {!!form.intro && (
          <Reveal>
            <Surface style={styles.intro}>
              <DKText variant="body" color={DK.inkSoft}>
                {form.intro}
              </DKText>
            </Surface>
          </Reveal>
        )}
        {left > 0 && (
          <Reveal>
            <Pressy onPress={markRest} accessibilityLabel={marked ? 'סימון כל השאר כבוצע' : 'סימון הכל כבוצע'} style={styles.markAll} pressScale={0.97} haptic>
              <Ionicons name="checkmark-done" size={21} color={DK.accent} />
              <DKText variant="label" color={DK.accent}>
                {marked ? 'סימון כל השאר כבוצע' : 'סימון הכל כבוצע'}
              </DKText>
            </Pressy>
          </Reveal>
        )}
        {items.map((item, index) => (
          <Reveal key={item.id} index={Math.min(index, 8)}>
            <ChecklistItemCard index={index} item={item} answer={answers[item.id]} options={options} onStatus={setStatus} onNote={setNote} />
          </Reveal>
        ))}
      </DriverPage>,
    );
  }

  // ── officer ───────────────────────────────────────────────────────────
  if (step === 'officer') {
    const canSign = !!officerName.trim() && !!officerSig;
    return inShell(
      <DriverPage
        key={step}
        insetTop={topInset}
        insetBottom={bottomInset}
        scrollRef={scrollRef}
        scrollEnabled={!drawing}
        hero={<HeroTitle title={form.labels.officer} subtitle={`המפגש עם ${driverName}, ${formatIsoDay(today)}`} onBack={() => setStep('fill')} />}
        footer={
          <View style={styles.footer}>
            <View style={styles.need}>
              <Ionicons name="lock-closed-outline" size={17} color={DK.muted} />
              <DKText variant="caption" color={DK.muted}>
                אחרי השמירה אי אפשר לשנות את הסעיפים
              </DKText>
            </View>
            <PrimaryAction label="שמירת החתימה והמשך" icon="checkmark-circle" onPress={() => void officerSigns()} disabled={!canSign} loading={busy === 'sign'} />
          </View>
        }
      >
        {messages}
        <Reveal>
          <Surface style={styles.block}>
            <DKText variant="label" color={DK.inkSoft} nativeID="officer-name-label">
              השם של מי שחותם
            </DKText>
            <KitInput
              value={officerName}
              onChangeText={setOfficerName}
              placeholder="לדוגמה: רונית שגיא"
              autoComplete="name"
              textContentType="name"
              maxLength={CHECKLIST_LIMITS.officerName}
              accessibilityLabel="השם של מי שחותם"
              accessibilityLabelledBy="officer-name-label"
            />
            {recent.length > 0 && (
              <>
                <DKText variant="caption" color={DK.muted}>
                  שמות שכבר חתמו:
                </DKText>
                <View style={styles.chips}>
                  {recent.map((name) => {
                    const on = officerName.trim() === name;
                    return (
                      <Pressy key={name} onPress={() => setOfficerName(name)} accessibilityLabel={`${name}${on ? ', נבחר' : ''}`} style={[styles.chip, on && styles.chipOn]} pressScale={0.95}>
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
            <DKText variant="caption" color={DK.muted}>
              השם יודפס מתחת לחתימה, כדי שיהיה ברור מי חתם.
            </DKText>
          </Surface>
        </Reveal>
        <Reveal index={1}>
          <Surface style={styles.block}>
            <SignaturePad title={form.labels.officer} onChange={setOfficerSig} onDrawing={setDrawing} disabled={busy === 'sign'} />
            <DKText variant="caption" color={DK.muted}>
              החתימה לא נשמרת במכשיר. בכל מפגש חותמים מחדש.
            </DKText>
          </Surface>
        </Reveal>
      </DriverPage>,
    );
  }

  // ── choose ────────────────────────────────────────────────────────────
  if (step === 'choose') {
    const first = firstName(driverName);
    return inShell(
      <DriverPage key={step} insetTop={topInset} insetBottom={bottomInset} scrollRef={scrollRef} hero={<HeroTitle title={`החתימה של ${first}`} subtitle="בחרו אחת משתי הדרכים" onBack={leave} />}>
        {messages}
        <Reveal>
          <SignedBy image={officerSig} label={form.labels.officer} name={meeting?.officer_name ?? officerName} date={formatIsoDay(meeting?.meeting_date ?? today)} />
        </Reveal>
        <Reveal index={1}>
          <Choice
            icon={isDesktop ? 'desktop-outline' : 'phone-portrait-outline'}
            tone="accent"
            title={isDesktop ? 'עכשיו, על המחשב הזה' : 'עכשיו, על הטלפון הזה'}
            body={`הנהג כאן? ${isDesktop ? 'מפנים אליו את המסך' : 'מעבירים לו את הטלפון'}, והחתימה נעשית במקום.`}
            tag="הכי נפוץ"
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
            title={`שליחה ל${first} לחתימה`}
            body={`הטופס יגיע לאפליקציה של ${first}, והחתימה תיעשה משם. בינתיים בתיק מופיע ״ממתין לחתימת הנהג״.`}
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
                {isDesktop ? `עכשיו החתימה של ${driverName}` : `העבירו את הטלפון ל${driverName}`}
              </DKText>
            </Reveal>
            <Reveal index={2}>
              <DKText variant="body" color={DK.onNightMuted} style={styles.center}>
                על המסך יופיע רק הטופס הזה, לחתימה.
              </DKText>
            </Reveal>
            <Reveal index={3}>
              <View style={styles.lockLine}>
                <Ionicons name="lock-closed" size={15} color={DK.onNightMuted} />
                <DKText variant="caption" color={DK.onNightMuted}>
                  שאר המערכת סגורה עד סוף החתימה
                </DKText>
              </View>
            </Reveal>
          </View>
          <View style={styles.nightActions}>
            <Pressy onPress={() => setStep('driver')} haptic accessibilityLabel={`אני ${first}, אפשר להתחיל`} style={styles.whiteCta}>
              <DKText variant="heading" color={DK.nightInk}>
                אני {first}, אפשר להתחיל
              </DKText>
              <Ionicons name="arrow-back" size={21} color={DK.nightInk} />
            </Pressy>
            <Pressy onPress={() => setStep('choose')} accessibilityLabel="חזרה, הנהג לא חותם עכשיו" style={styles.quietLink} pressScale={0.96}>
              <DKText variant="label" color={DK.onNightMuted}>
                חזרה, החתימה לא עכשיו
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
              <DKText variant="title">שלום {first}</DKText>
              <DKText variant="body" color={DK.inkSoft}>
                הטופס ״{title}״ מולא במפגש שלכם על ידי {meeting?.officer_name ?? officerName}. עברו על מה שסומן וחתמו למטה.
              </DKText>
            </Surface>
          </Reveal>
          <Reveal index={1}>
            <DKText variant="heading" style={styles.sectionTitle}>
              מה סומן במפגש
            </DKText>
            <Surface style={styles.summary}>
              {items.map((item, index) => {
                const answer = answers[item.id];
                const meta = answer?.status ? STATUS_META[answer.status] : null;
                return (
                  <View key={item.id} style={[styles.sumRow, index > 0 && styles.divider]}>
                    {meta && (
                      <View style={[styles.pill, { backgroundColor: meta.soft }]}>
                        <Ionicons name={meta.icon} size={15} color={meta.fg} />
                        <DKText variant="micro" color={meta.fg}>
                          {meta.label}
                        </DKText>
                      </View>
                    )}
                    <View style={styles.flex}>
                      <DKText variant="body">{item.text}</DKText>
                      {!!answer?.note && (
                        <DKText variant="caption" color={DK.muted}>
                          הערה: {answer.note}
                        </DKText>
                      )}
                    </View>
                  </View>
                );
              })}
            </Surface>
          </Reveal>
          <Reveal index={2}>
            <SignedBy image={officerSig} label={form.labels.officer} name={meeting?.officer_name ?? officerName} date={formatIsoDay(meeting?.meeting_date ?? today)} />
          </Reveal>
          <Reveal index={3}>
            <Surface style={styles.block}>
              <SignaturePad title={form.labels.driver} onChange={setDriverSig} onDrawing={setDrawing} disabled={busy === 'driver'} />
            </Surface>
          </Reveal>
          <Pressy onPress={() => setStep('choose')} accessibilityLabel="החזרה למנהל בלי לחתום" style={styles.quietLinkDark} pressScale={0.96}>
            <DKText variant="label" color={DK.muted}>
              החזרה למנהל בלי לחתום
            </DKText>
          </Pressy>
        </ScrollView>
        <View style={[styles.pageFooter, { paddingBottom: insets.bottom + 12 }]}>
          <PrimaryAction label="חתימה" icon="create-outline" onPress={() => void driverSigns()} disabled={!driverSig} loading={busy === 'driver'} />
        </View>
      </View>
    );
  }

  // ── done / sent ───────────────────────────────────────────────────────
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
            {sent ? `הטופס נשלח ל${first}` : 'תודה, הטופס נחתם'}
          </DKText>
        </Reveal>
        <Reveal index={3}>
          <DKText variant="body" color={DK.inkSoft} style={styles.center}>
            {sent
              ? `החתימה של ${meeting?.officer_name ?? officerName} כבר על הטופס. ההודעה תגיע לאפליקציה של ${first}, והחתימה תיעשה משם. עד אז בתיק הנהג מופיע ״ממתין לחתימת הנהג״.`
              : `המסמך החתום נשמר בתיק של ${driverName}, בתיקייה ״${title}״.`}
          </DKText>
        </Reveal>
        {nextDue ? (
          <Reveal index={4}>
            <Surface style={styles.nextDue}>
              <View style={styles.nextDueIcon}>
                <Ionicons name="calendar" size={22} color={DK.accent} />
              </View>
              <View style={styles.flex}>
                <DKText variant="caption" color={DK.muted}>המפגש הבא עם {first}</DKText>
                <DKText variant="heading">{formatIsoDay(nextDue)}</DKText>
              </View>
            </Surface>
            <DKText variant="caption" color={DK.muted} style={styles.center}>נזכיר לכם שבוע לפני. אפשר לשנות את התאריך בתיק הנהג.</DKText>
          </Reveal>
        ) : null}
        <Reveal index={5} style={styles.doneActions}>
          {!sent && <PrimaryAction label="צפייה במסמך החתום" icon="document-text-outline" onPress={() => void openDocument()} loading={busy === 'open'} />}
          <PrimaryAction label="סיום" tone={sent ? 'accent' : 'ghost'} onPress={leave} />
        </Reveal>
      </ScrollView>
    </View>,
  );
}

// ── pieces ───────────────────────────────────────────────────────────────

function Progress({ marked, total }: { marked: number; total: number }) {
  const reduce = useReducedMotion();
  const value = total ? marked / total : 0;
  const width = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: value, duration: reduce ? 0 : 240, easing: EASE_OUT, useNativeDriver: false }).start();
  }, [reduce, value, width]);
  return (
    <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: marked }} accessibilityLabel={`סומנו ${marked} מתוך ${total}`}>
      <View style={styles.progressRow}>
        <DKText variant="caption" color={DK.onNightMuted}>
          התקדמות
        </DKText>
        <DKText variant="label" color={DK.onNight}>
          סומנו {marked} מתוך {total}
        </DKText>
      </View>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
    </View>
  );
}

function SignedBy({ image, label, name, date }: { image: string | null; label: string; name: string; date: string }) {
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
            {label}
          </DKText>
        </View>
        <DKText variant="caption" color={DK.inkSoft}>
          נחתם על ידי {name}, {date}
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
      <LinearGradient
        colors={tone === 'accent' ? ['#4C74FF', DK.accent] : ['#3FD3F5', '#0E9FC8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.choiceIcon}
      >
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
      <Ionicons name="chevron-back" size={22} color={DK.faint} />
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
    // The tick draws on while the disc is still settling, not after it.
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
      <Animated.View
        style={[
          styles.tickDisc,
          { backgroundColor: color, opacity: disc, transform: [{ scale: reduce ? 1 : disc.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] },
        ]}
      >
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
  progress: { marginTop: 18, gap: 8, padding: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  progressRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.16)', overflow: 'hidden', flexDirection: 'row-reverse' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: DK.mint },
  footer: { gap: 10 },
  need: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sheetStack: { gap: 10 },
  intro: { padding: 16 },
  markAll: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: DK.accentSoft,
    borderWidth: 1.5,
    borderColor: 'rgba(47,91,255,0.18)',
  },
  block: { padding: 16, gap: 12 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: DK.accentSoft },
  chipOn: { backgroundColor: DK.accent },
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
  sectionTitle: { marginBottom: 8, paddingHorizontal: 6 },
  summary: { paddingHorizontal: 14, paddingVertical: 4 },
  sumRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  pill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, minWidth: 86, justifyContent: 'center' },
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
  nextDue: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 8 },
  nextDueIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  tickWrap: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tickRing: { position: 'absolute', width: 116, height: 116, borderRadius: 58, borderWidth: 3 },
  tickDisc: { width: 116, height: 116, borderRadius: 58, alignItems: 'center', justifyContent: 'center' },
});
