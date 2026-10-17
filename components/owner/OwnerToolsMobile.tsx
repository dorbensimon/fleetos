// כלי הבעלים בטלפון: הודעה לחברות, כסף שנגבה, צעדים ראשונים, תשלומים והערות
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DK_SPACE, DKText, EditField, KitInput, KitSection, KitSheet, PrimaryAction, Pressy, SheetActions, STATUS } from '../driverKit';
import { BrandLoader } from '../ui/BrandLoader';
import { DateField } from '../ui/DateField';
import { ChoiceChips } from './ownerKit';
import { formatMoney } from '../../lib/companyAccount';
import { formatDate } from '../../lib/theme';
import { showAlert } from '../../lib/platformAlert';
import { errorMessage } from '../../lib/requestError';
import { dirIcon, getLocale, t } from '../../lib/i18n';
import {
  addCompanyNote,
  addCompanyPayment,
  deleteCompanyNote,
  deleteCompanyPayment,
  endAnnouncements,
  isLive,
  listAnnouncements,
  listCompanyNotes,
  listCompanyPayments,
  listPaymentsSince,
  loadOnboarding,
  defaultPaymentMonth,
  monthKey,
  paidByMonth,
  PAYMENT_METHODS,
  publishAnnouncement,
  type Announcement,
  type CompanyNote,
  type CompanyPayment,
  type OnboardingStep,
  type PaymentMethod,
} from '../../lib/ownerTools';

/**
 * The owner's tools on the phone, in the app kit's look: the same data and
 * actions as the desktop cards (components/owner/OwnerToolsPanels and
 * components/companyDetail/OwnerCompanyTools), laid out for a thumb.
 */

// שם החודש לתצוגה
const monthLabel = (period: string) => new Date(`${period.slice(0, 10)}T12:00:00`).toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' });
// שם אמצעי התשלום
const methodLabel = (m: PaymentMethod | null) => (m ? t(`ownerTools.method.${m}`) : '');
// ניסיון חוזר אחרי שגיאה
const retryLater = () => showAlert(t('common.updateFailed'), t('common.tryAgainShortly'));

// טעינה קטנה בתוך כרטיס
function CardLoading() {
  return (
    <View style={styles.loading}>
      <BrandLoader size="small" color={DK.accent} />
    </View>
  );
}

// כפתור מחיקה קטן
function TrashButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressy onPress={onPress} accessibilityLabel={label} style={styles.trash} pressScale={0.9}>
      <Ionicons name="trash-outline" size={18} color={DK.muted} />
    </Pressy>
  );
}

// קישור קטן בכותרת של חלק
function SectionLink({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressy onPress={onPress} accessibilityLabel={label} style={styles.linkChip} pressScale={0.95}>
      <Ionicons name={icon} size={15} color={DK.accent} />
      <DKText variant="micro" color={DK.accent}>
        {label}
      </DKText>
    </Pressy>
  );
}

/* ------------------------------------------------------------------ */
/* Announcement                                                        */
/* ------------------------------------------------------------------ */

// כמה זמן הודעה פעילה
const DURATIONS: { value: string; days: number | null; label: () => string }[] = [
  { value: '1', days: 1, label: () => t('ownerTools.forDay') },
  { value: '7', days: 7, label: () => t('ownerTools.forWeek') },
  { value: '30', days: 30, label: () => t('ownerTools.forMonth30') },
  { value: 'none', days: null, label: () => t('ownerTools.untilRemoved') },
];

// כתיבה ופרסום הודעה לכל החברות
export function AnnouncementSection({ style }: { style?: object }) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<Announcement['tone']>('info');
  const [audience, setAudience] = useState<Announcement['audience']>('admins');
  const [duration, setDuration] = useState('7');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => listAnnouncements().then(setItems, () => setItems([])), []);
  useEffect(() => {
    void load();
  }, [load]);

  const live = (items ?? []).find((a) => isLive(a)) ?? null;

  const publish = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      await publishAnnouncement({ message, tone, audience, days: DURATIONS.find((d) => d.value === duration)?.days ?? null });
      setMessage('');
      await load();
    } catch {
      retryLater();
    } finally {
      setBusy(false);
    }
  };

  const end = () =>
    showAlert(t('ownerTools.endAnnouncementTitle'), t('ownerTools.endAnnouncementBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('ownerTools.endAnnouncement'),
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void endAnnouncements()
            .then(load, retryLater)
            .finally(() => setBusy(false));
        },
      },
    ]);

  return (
    <KitSection
      title={t('ownerTools.announcementTitle')}
      style={style}
      trailing={
        live ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <DKText variant="micro" color={STATUS.ok.fg}>
              {t('ownerTools.live')}
            </DKText>
          </View>
        ) : null
      }
    >
      {items == null ? (
        <CardLoading />
      ) : live ? (
        <View style={styles.body}>
          <View style={[styles.preview, { backgroundColor: live.tone === 'warn' ? STATUS.soon.soft : DK.accentSoft }]}>
            <Ionicons name={live.tone === 'warn' ? 'warning' : 'megaphone'} size={18} color={live.tone === 'warn' ? STATUS.soon.fg : DK.accent} />
            <DKText variant="body" style={styles.flex}>
              {live.message}
            </DKText>
          </View>
          <DKText variant="caption" color={DK.muted}>
            {[
              live.audience === 'everyone' ? t('ownerTools.toEveryone') : t('ownerTools.toManagers'),
              live.ends_at ? t('ownerTools.until', { date: formatDate(live.ends_at) }) : t('ownerTools.untilRemoved'),
            ].join(' · ')}
          </DKText>
          <PrimaryAction label={t('ownerTools.endAnnouncement')} icon="stop-circle-outline" tone="danger" onPress={end} loading={busy} />
        </View>
      ) : (
        <View style={styles.body}>
          <DKText variant="caption" color={DK.muted}>
            {t('ownerTools.announcementHint')}
          </DKText>
          <KitInput
            value={message}
            onChangeText={setMessage}
            placeholder={t('ownerTools.announcementPlaceholder')}
            multiline
            maxLength={400}
            accessibilityLabel={t('ownerTools.announcementTitle')}
            style={styles.textarea}
          />
          <ChoiceChips
            label={t('ownerTools.toneLabel')}
            value={tone}
            onChange={(v) => v && setTone(v)}
            options={[
              { value: 'info', label: t('ownerTools.toneInfo'), icon: 'megaphone-outline' },
              { value: 'warn', label: t('ownerTools.toneWarn'), icon: 'warning-outline' },
            ]}
          />
          <ChoiceChips
            label={t('ownerTools.audienceLabel')}
            value={audience}
            onChange={(v) => v && setAudience(v)}
            options={[
              { value: 'admins', label: t('ownerTools.toManagers') },
              { value: 'everyone', label: t('ownerTools.toEveryone') },
            ]}
          />
          <ChoiceChips
            label={t('ownerTools.durationLabel')}
            value={duration}
            onChange={(v) => v && setDuration(v)}
            options={DURATIONS.map((d) => ({ value: d.value, label: d.label() }))}
          />
          <PrimaryAction label={t('ownerTools.publish')} icon="megaphone-outline" onPress={() => void publish()} loading={busy} disabled={!message.trim()} />
        </View>
      )}
    </KitSection>
  );
}

/* ------------------------------------------------------------------ */
/* Money collected                                                     */
/* ------------------------------------------------------------------ */

// כמה חודשים בגרף
const MONTHS = 6;

// הכסף שנגבה בכל חודש מול מה שהמנויים אומרים
export function CollectedSection({ expected, style }: { expected: number; style?: object }) {
  const [months, setMonths] = useState<{ month: string; total: number }[] | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  useEffect(() => {
    const now = new Date();
    const since = monthKey(new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1), 1));
    listPaymentsSince(since).then(
      (rows) => setMonths(paidByMonth(rows, MONTHS)),
      () => setMonths([]),
    );
  }, []);

  const short = (m: string) => new Date(`${m}T12:00:00`).toLocaleDateString(getLocale(), { month: 'short' });
  const max = Math.max(1, expected, ...(months ?? []).map((m) => m.total));
  const current = months?.[months.length - 1];
  const shown = focus != null && months ? months[focus] : current;
  const missing = Math.max(0, expected - (current?.total ?? 0));

  return (
    <KitSection title={t('ownerTools.collectedTitle')} style={style}>
      {!months ? (
        <CardLoading />
      ) : (
        <View style={styles.chartBox}>
          <DKText variant="title" style={styles.tabular}>
            {formatMoney(shown?.total ?? 0)}
          </DKText>
          <DKText variant="caption" color={DK.muted}>
            {focus != null && shown ? monthLabel(shown.month) : missing > 0 ? t('ownerTools.collectedMissing', { amount: formatMoney(missing) }) : t('ownerTools.collectedThisMonth')}
          </DKText>
          <View style={styles.chart} accessible accessibilityLabel={months.map((m) => `${short(m.month)} ${formatMoney(m.total)}`).join(', ')}>
            {expected > 0 && <View style={[styles.expected, { bottom: `${(expected / max) * 100}%` as unknown as number }]} />}
            {months.map((m, i) => (
              <Pressy
                key={m.month}
                onPress={() => setFocus((f) => (f === i ? null : i))}
                accessibilityLabel={`${monthLabel(m.month)}: ${formatMoney(m.total)}`}
                style={styles.slot}
                pressScale={0.96}
              >
                <View
                  style={[
                    styles.bar,
                    { height: `${Math.max(m.total ? 6 : 3, (m.total / max) * 100)}%` as unknown as number },
                    !m.total && styles.barEmpty,
                    (focus === i || (focus == null && i === months.length - 1)) && styles.barOn,
                  ]}
                />
              </Pressy>
            ))}
          </View>
          <View style={styles.axis}>
            {months.map((m) => (
              <DKText key={m.month} variant="micro" color={DK.faint} style={styles.axisText}>
                {short(m.month)}
              </DKText>
            ))}
          </View>
          {expected > 0 && (
            <View style={styles.legend}>
              <View style={styles.legendLine} />
              <DKText variant="caption" color={DK.muted}>
                {t('ownerTools.expectedLine', { amount: formatMoney(expected) })}
              </DKText>
            </View>
          )}
        </View>
      )}
    </KitSection>
  );
}

/* ------------------------------------------------------------------ */
/* Getting started                                                     */
/* ------------------------------------------------------------------ */

// 'צעדים ראשונים' של חברה חדשה (נעלם כשהכול הושלם)
export function OnboardingSection({ companyId, managerActive, drivers, style }: { companyId: string; managerActive: boolean; drivers: number; style?: object }) {
  const [steps, setSteps] = useState<OnboardingStep[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadOnboarding(companyId, managerActive, drivers)
      .then((s) => alive && setSteps(s))
      .catch(() => alive && setSteps(null));
    return () => {
      alive = false;
    };
  }, [companyId, managerActive, drivers]);

  if (!steps) return null;
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done)!;
  return (
    <KitSection title={t('ownerTools.onboardingTitle')} style={style}>
      <View style={styles.body}>
        <View>
          <DKText variant="heading">{t('ownerTools.stepsDone', { done, total: steps.length })}</DKText>
          <DKText variant="caption" color={DK.muted}>
            {t('ownerTools.nextStep', { step: t(`ownerTools.step.${next.key}`) })}
          </DKText>
        </View>
        <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: steps.length, now: done }}>
          <View style={[styles.progressFill, { width: `${(done / steps.length) * 100}%` as unknown as number }]} />
        </View>
        {steps.map((step) => (
          <View key={step.key} style={styles.step}>
            <Ionicons name={step.done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={step.done ? STATUS.ok.fill : step === next ? DK.accent : DK.faint} />
            <DKText variant={step === next ? 'label' : 'body'} color={step.done ? DK.muted : DK.ink} style={step.done ? styles.stepDone : undefined}>
              {t(`ownerTools.step.${step.key}`)}
            </DKText>
          </View>
        ))}
      </View>
    </KitSection>
  );
}

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

// התשלומים של חברה
export function PaymentsSection({ companyId, monthlyPrice, style }: { companyId: string; monthlyPrice: number | null; style?: object }) {
  const [payments, setPayments] = useState<CompanyPayment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setPayments(await listCompanyPayments(companyId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [companyId]);
  useEffect(() => {
    void load();
  }, [load]);

  const thisMonth = monthKey();
  const paidThisMonth = (payments ?? []).filter((p) => p.period.slice(0, 10) === thisMonth).reduce((n, p) => n + p.amount, 0);
  const total = (payments ?? []).reduce((n, p) => n + p.amount, 0);
  const shown = showAll ? payments ?? [] : (payments ?? []).slice(0, 5);
  const state = paidThisMonth ? STATUS.ok : STATUS.soon;

  const remove = (payment: CompanyPayment) =>
    showAlert(t('ownerTools.deletePaymentTitle'), t('ownerTools.deletePaymentBody', { month: monthLabel(payment.period), amount: formatMoney(payment.amount) }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.deleteAction'), style: 'destructive', onPress: () => void deleteCompanyPayment(payment.id).then(load, retryLater) },
    ]);

  return (
    <KitSection title={t('ownerTools.paymentsTitle')} style={style} trailing={<SectionLink icon="add" label={t('ownerTools.recordPayment')} onPress={() => setAdding(true)} />}>
      {payments == null && !failed ? (
        <CardLoading />
      ) : failed ? (
        <DKText variant="caption" color={DK.muted} style={styles.empty}>
          {t('ownerTools.loadFailed')}
        </DKText>
      ) : (
        <>
          <View style={styles.body}>
            <View style={[styles.monthState, { backgroundColor: state.soft }]}>
              <Ionicons name={paidThisMonth ? 'checkmark-circle' : 'time-outline'} size={18} color={state.fg} />
              <DKText variant="label" color={state.fg} style={styles.flex}>
                {paidThisMonth ? t('ownerTools.paidThisMonth', { amount: formatMoney(paidThisMonth) }) : t('ownerTools.notPaidThisMonth', { month: monthLabel(thisMonth) })}
              </DKText>
            </View>
            {total > 0 && (
              <DKText variant="caption" color={DK.muted} style={styles.tabular}>
                {t('ownerTools.paidTotal', { amount: formatMoney(total) })}
              </DKText>
            )}
          </View>
          {payments!.length === 0 ? (
            <DKText variant="caption" color={DK.muted} style={styles.empty}>
              {t('ownerTools.noPayments')}
            </DKText>
          ) : (
            shown.map((p) => (
              <View key={p.id} style={[styles.row, styles.divider]}>
                <View style={styles.flex}>
                  <DKText variant="label">{monthLabel(p.period)}</DKText>
                  <DKText variant="caption" color={DK.muted} numberOfLines={2}>
                    {[t('ownerTools.paidOn', { date: formatDate(p.paid_on) }), methodLabel(p.method), p.note].filter(Boolean).join(' · ')}
                  </DKText>
                </View>
                <DKText variant="label" style={styles.tabular}>
                  {formatMoney(p.amount)}
                </DKText>
                <TrashButton label={t('ownerTools.deletePaymentTitle')} onPress={() => remove(p)} />
              </View>
            ))
          )}
          {payments!.length > 5 && (
            <Pressy onPress={() => setShowAll((v) => !v)} accessibilityLabel={showAll ? t('common.showLess') : t('common.showAllN', { length: payments!.length })} pressScale={0.985}>
              <View style={[styles.more, styles.divider]}>
                <DKText variant="label" color={DK.accent}>
                  {showAll ? t('common.showLess') : t('common.showAllN', { length: payments!.length })}
                </DKText>
              </View>
            </Pressy>
          )}
        </>
      )}
      <PaymentSheet
        visible={adding}
        companyId={companyId}
        defaultAmount={monthlyPrice}
        paidMonths={new Set((payments ?? []).map((p) => p.period.slice(0, 10)))}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          void load();
        }}
      />
    </KitSection>
  );
}

// רישום תשלום
function PaymentSheet({
  visible,
  companyId,
  defaultAmount,
  paidMonths,
  onClose,
  onSaved,
}: {
  visible: boolean;
  companyId: string;
  defaultAmount: number | null;
  paidMonths: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const now = new Date();
  // Twelve months back and two ahead, newest first; the month after the last paid one is preselected.
  const months = Array.from({ length: 15 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() + 2 - i, 1)));
  const [index, setIndex] = useState(2);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod | ''>('transfer');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setIndex(Math.max(0, months.indexOf(defaultPaymentMonth(paidMonths))));
    setAmount(defaultAmount ? String(Math.round(defaultAmount)) : '');
    setPaidOn(new Date().toISOString().slice(0, 10));
    setMethod('transfer');
    setNote('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const period = months[index];
  const save = async () => {
    const value = Number(amount.replace(/[^\d.]/g, ''));
    if (!amount.trim() || Number.isNaN(value)) return setError(t('ownerTools.enterAmount'));
    if (!paidOn) return setError(t('ownerTools.choosePaidOn'));
    setSaving(true);
    try {
      await addCompanyPayment({ company_id: companyId, period, amount: value, paid_on: paidOn, method: method || null, note: note.trim() || null });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, t('common.tryAgainShortly')));
    } finally {
      setSaving(false);
    }
  };

  // The list runs newest first, so an earlier month is further down it.
  const step = (by: 1 | -1) => setIndex((i) => Math.min(months.length - 1, Math.max(0, i + by)));

  return (
    <KitSheet
      visible={visible}
      onClose={onClose}
      title={t('ownerTools.recordPayment')}
      icon="cash-outline"
      footer={
        <SheetActions>
          <PrimaryAction label={t('common.cancel')} tone="ghost" onPress={onClose} style={styles.flex} />
          <PrimaryAction label={t('common.save')} icon="checkmark" onPress={() => void save()} loading={saving} style={styles.flex} />
        </SheetActions>
      }
    >
      <EditField
        first
        label={t('ownerTools.forMonth')}
        editor={
          <View style={styles.monthPicker}>
            {/* Hebrew reads right to left, so the right arrow steps back in time. */}
            <Pressy
              onPress={() => step(1)}
              disabled={index === months.length - 1}
              accessibilityLabel={t('ownerTools.earlierMonth')}
              style={[styles.monthArrow, index === months.length - 1 && styles.dim]}
              pressScale={0.9}
            >
              <Ionicons name={dirIcon('chevron-forward')} size={20} color={DK.ink} />
            </Pressy>
            <View style={styles.monthValue}>
              <DKText variant="label">{monthLabel(period)}</DKText>
              {paidMonths.has(period) && <Ionicons name="checkmark-circle" size={16} color={STATUS.ok.fill} accessibilityLabel={t('ownerTools.monthPaid')} />}
            </View>
            <Pressy onPress={() => step(-1)} disabled={index === 0} accessibilityLabel={t('ownerTools.laterMonth')} style={[styles.monthArrow, index === 0 && styles.dim]} pressScale={0.9}>
              <Ionicons name={dirIcon('chevron-back')} size={20} color={DK.ink} />
            </Pressy>
          </View>
        }
      />
      <EditField label={t('ownerTools.amount')} value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))} keyboardType="number-pad" placeholder="₪" ltr />
      <EditField label={t('ownerTools.paidOnLabel')} editor={<DateField value={paidOn} onChange={setPaidOn} />} />
      <EditField
        label={t('ownerTools.methodLabel')}
        editor={<ChoiceChips label={t('ownerTools.methodLabel')} value={method} onChange={setMethod} clearable options={PAYMENT_METHODS.map((m) => ({ value: m, label: methodLabel(m) }))} />}
      />
      <EditField label={t('ownerTools.noteOptional')} value={note} onChangeText={setNote} maxLength={300} placeholder={t('ownerTools.paymentNotePlaceholder')} error={error ?? undefined} />
    </KitSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Internal notes                                                      */
/* ------------------------------------------------------------------ */

// הערות פנימיות על חברה
export function NotesSection({ companyId, style }: { companyId: string; style?: object }) {
  const [notes, setNotes] = useState<CompanyNote[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setNotes(await listCompanyNotes(companyId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [companyId]);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      await addCompanyNote(companyId, draft);
      setDraft('');
      await load();
    } catch {
      retryLater();
    } finally {
      setSaving(false);
    }
  };

  const remove = (note: CompanyNote) =>
    showAlert(t('ownerTools.deleteNoteTitle'), t('ownerTools.deleteNoteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.deleteAction'), style: 'destructive', onPress: () => void deleteCompanyNote(note.id).then(load, retryLater) },
    ]);

  return (
    <KitSection title={t('ownerTools.notesTitle')} style={style}>
      <View style={styles.body}>
        <KitInput value={draft} onChangeText={setDraft} placeholder={t('ownerTools.notePlaceholder')} multiline maxLength={2000} accessibilityLabel={t('ownerTools.notesTitle')} style={styles.textarea} />
        <DKText variant="caption" color={DK.muted}>
          {t('ownerTools.notesPrivate')}
        </DKText>
        <PrimaryAction label={t('ownerTools.addNote')} icon="add" tone="ghost" onPress={() => void add()} loading={saving} disabled={!draft.trim()} />
      </View>
      {notes == null && !failed ? (
        <CardLoading />
      ) : failed ? (
        <DKText variant="caption" color={DK.muted} style={styles.empty}>
          {t('ownerTools.loadFailed')}
        </DKText>
      ) : (
        (notes ?? []).map((note) => (
          <View key={note.id} style={[styles.row, styles.divider, styles.noteRow]}>
            <View style={styles.flex}>
              <DKText variant="body">{note.body}</DKText>
              <DKText variant="caption" color={DK.muted}>
                {formatDate(note.created_at)} · {new Date(note.created_at).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })}
              </DKText>
            </View>
            <TrashButton label={t('ownerTools.deleteNoteTitle')} onPress={() => remove(note)} />
          </View>
        ))
      )}
    </KitSection>
  );
}

// עיצוב
const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  dim: { opacity: 0.35 },
  loading: { paddingVertical: 26, alignItems: 'center' },
  body: { padding: DK_SPACE.md, gap: 12 },
  empty: { textAlign: 'center', paddingVertical: 20, paddingHorizontal: DK_SPACE.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  textarea: { minHeight: 96, paddingTop: 14, paddingBottom: 14, textAlignVertical: 'top' },
  linkChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: DK.accentSoft },
  trash: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  liveBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: STATUS.ok.soft },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: STATUS.ok.fill },
  preview: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 16 },

  // גרף הכסף שנגבה
  chartBox: { padding: DK_SPACE.md, gap: 2 },
  chart: { flexDirection: 'row-reverse', alignItems: 'flex-end', height: 96, gap: 8, marginTop: 14 },
  expected: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: DK.faint },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4, backgroundColor: '#A9BCFF' },
  barEmpty: { backgroundColor: '#E3E8F0' },
  barOn: { backgroundColor: DK.accent },
  axis: { flexDirection: 'row-reverse', gap: 8, marginTop: 6 },
  axisText: { flex: 1, textAlign: 'center' },
  legend: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 10 },
  legendLine: { width: 18, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: DK.faint },

  // צעדים ראשונים
  progress: { height: 8, borderRadius: 4, backgroundColor: '#E3E8F0', overflow: 'hidden', flexDirection: 'row-reverse' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: DK.accent },
  step: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  stepDone: { textDecorationLine: 'line-through' },

  // תשלומים
  monthState: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: DK_SPACE.md, paddingVertical: 8 },
  noteRow: { alignItems: 'flex-start', paddingVertical: 12 },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  monthPicker: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 16, backgroundColor: DK.surfaceSunk, paddingHorizontal: 6 },
  monthArrow: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  monthValue: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
