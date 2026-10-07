import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DesktopDateField, DesktopInput, DesktopSelect, DText, HoverPressable } from '../desktop/primitives';
import { DesktopModal } from '../desktop/DesktopModal';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../desktop/desktopTheme';
import { GroupLabel, pageStyles } from '../desktop/record/RecordPage';
import { BrandLoader } from '../ui/BrandLoader';
import { formatMoney } from '../../lib/companyAccount';
import { formatDate } from '../../lib/theme';
import { showAlert } from '../../lib/platformAlert';
import { errorMessage } from '../../lib/requestError';
import { getLocale, t } from '../../lib/i18n';
import {
  addCompanyNote,
  addCompanyPayment,
  deleteCompanyNote,
  deleteCompanyPayment,
  listCompanyNotes,
  listCompanyPayments,
  loadOnboarding,
  monthKey,
  PAYMENT_METHODS,
  type CompanyNote,
  type CompanyPayment,
  type OnboardingStep,
  type PaymentMethod,
} from '../../lib/ownerTools';

/**
 * The owner's own cards on a company's page (desktop): where the company is in
 * getting started, the payments it made, and a dated internal log. Each card
 * loads its own rows, so a failure in one leaves the others working.
 */

const TABULAR = webOnly({ fontVariantNumeric: 'tabular-nums' });

export const monthLabel = (period: string) =>
  new Date(`${period.slice(0, 10)}T12:00:00`).toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' });

/* ------------------------------------------------------------------ */
/* Getting started                                                     */
/* ------------------------------------------------------------------ */

export function OnboardingCard({ companyId, managerActive, drivers }: { companyId: string; managerActive: boolean; drivers: number }) {
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
    <View>
      <GroupLabel>{t('ownerTools.onboardingTitle')}</GroupLabel>
      <View style={[pageStyles.card, pageStyles.listCard, styles.onboarding]}>
        <View style={styles.onboardingHead}>
          <DText weight="bold" style={styles.onboardingCount}>{t('ownerTools.stepsDone', { done, total: steps.length })}</DText>
          <DText style={pageStyles.mutedText}>{t('ownerTools.nextStep', { step: t(`ownerTools.step.${next.key}`) })}</DText>
        </View>
        <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: steps.length, now: done }}>
          <View style={[styles.progressFill, { width: `${(done / steps.length) * 100}%` as unknown as number }]} />
        </View>
        <View style={styles.steps}>
          {steps.map((step) => (
            <View key={step.key} style={styles.step}>
              <Ionicons
                name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={step.done ? DESKTOP_TONES.ok.fg : step === next ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint}
              />
              <DText weight={step === next ? 'semiBold' : 'regular'} style={[styles.stepText, step.done && styles.stepDone]}>
                {t(`ownerTools.step.${step.key}`)}
              </DText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

const methodLabel = (m: PaymentMethod | null) => (m ? t(`ownerTools.method.${m}`) : '');

export function PaymentsCard({ companyId, monthlyPrice }: { companyId: string; monthlyPrice: number | null }) {
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

  const remove = (payment: CompanyPayment) =>
    showAlert(t('ownerTools.deletePaymentTitle'), t('ownerTools.deletePaymentBody', { month: monthLabel(payment.period), amount: formatMoney(payment.amount) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.deleteAction'),
        style: 'destructive',
        onPress: () => void deleteCompanyPayment(payment.id).then(load, () => showAlert(t('common.updateFailed'), t('common.tryAgainShortly'))),
      },
    ]);

  return (
    <View>
      <GroupLabel
        action={
          <HoverPressable style={pageStyles.linkBtn} hoverStyle={pageStyles.rowHover} onPress={() => setAdding(true)}>
            <Ionicons name="add" size={15} color={DESKTOP_COLORS.brand} />
            <DText weight="semiBold" style={pageStyles.linkText}>{t('ownerTools.recordPayment')}</DText>
          </HoverPressable>
        }
      >
        {t('ownerTools.paymentsTitle')}
      </GroupLabel>
      <View style={[pageStyles.card, pageStyles.listCard]}>
        {payments == null && !failed ? (
          <View style={styles.cardLoading}><BrandLoader size="small" color={DESKTOP_COLORS.brand} /></View>
        ) : failed ? (
          <DText style={styles.empty}>{t('ownerTools.loadFailed')}</DText>
        ) : (
          <>
            <View style={styles.payHead}>
              <View style={[styles.monthState, { backgroundColor: paidThisMonth ? DESKTOP_TONES.ok.bg : DESKTOP_TONES.warn.bg }]}>
                <Ionicons name={paidThisMonth ? 'checkmark-circle' : 'time-outline'} size={16} color={paidThisMonth ? DESKTOP_TONES.ok.fg : DESKTOP_TONES.warn.fg} />
                <DText weight="semiBold" style={[styles.monthStateText, { color: paidThisMonth ? DESKTOP_TONES.ok.fg : DESKTOP_TONES.warn.fg }]}>
                  {paidThisMonth ? t('ownerTools.paidThisMonth', { amount: formatMoney(paidThisMonth) }) : t('ownerTools.notPaidThisMonth', { month: monthLabel(thisMonth) })}
                </DText>
              </View>
              {total > 0 && <DText style={[pageStyles.rowNote, TABULAR]}>{t('ownerTools.paidTotal', { amount: formatMoney(total) })}</DText>}
            </View>
            {payments!.length === 0 ? (
              <DText style={styles.empty}>{t('ownerTools.noPayments')}</DText>
            ) : (
              shown.map((p) => (
                <View key={p.id} style={[pageStyles.detailRow, pageStyles.rowDivider, styles.payRow]}>
                  <View style={pageStyles.flex}>
                    <DText weight="semiBold" style={styles.rowTitle}>{monthLabel(p.period)}</DText>
                    <DText style={pageStyles.rowNote} numberOfLines={1}>
                      {[t('ownerTools.paidOn', { date: formatDate(p.paid_on) }), methodLabel(p.method), p.note].filter(Boolean).join(' · ')}
                    </DText>
                  </View>
                  <DText weight="bold" style={[styles.amount, TABULAR]}>{formatMoney(p.amount)}</DText>
                  <TrashButton label={t('ownerTools.deletePaymentTitle')} onPress={() => remove(p)} />
                </View>
              ))
            )}
            {payments!.length > 5 && (
              <HoverPressable style={[pageStyles.rowDivider, styles.more]} hoverStyle={pageStyles.rowHover} onPress={() => setShowAll((v) => !v)}>
                <DText weight="semiBold" style={pageStyles.linkText}>{showAll ? t('common.showLess') : t('common.showAllN', { length: payments!.length })}</DText>
              </HoverPressable>
            )}
          </>
        )}
      </View>
      <PaymentDialog
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
    </View>
  );
}

function PaymentDialog({
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
  // Twelve months back and two ahead; the first unpaid one up to this month is preselected.
  const months = Array.from({ length: 15 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() + 2 - i, 1)));
  const [period, setPeriod] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>('transfer');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const firstUnpaid = months.slice(2).reverse().find((m) => !paidMonths.has(m));
    setPeriod(paidMonths.has(monthKey()) ? monthKey() : firstUnpaid ?? monthKey());
    setAmount(defaultAmount ? String(Math.round(defaultAmount)) : '');
    setPaidOn(new Date().toISOString().slice(0, 10));
    setMethod('transfer');
    setNote('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const save = async () => {
    const value = Number(amount.replace(/[^\d.]/g, ''));
    if (!period) return setError(t('ownerTools.chooseMonth'));
    if (!amount.trim() || Number.isNaN(value)) return setError(t('ownerTools.enterAmount'));
    if (!paidOn) return setError(t('ownerTools.choosePaidOn'));
    setSaving(true);
    try {
      await addCompanyPayment({ company_id: companyId, period, amount: value, paid_on: paidOn, method, note: note.trim() || null });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, t('common.tryAgainShortly')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DesktopModal visible={visible} title={t('ownerTools.recordPayment')} onClose={onClose} maxWidth={460}>
      <View style={pageStyles.editBody}>
        <View style={pageStyles.monthYearRow}>
          <View style={pageStyles.monthYearCell}>
            <DText style={pageStyles.editFieldLabel}>{t('ownerTools.forMonth')}</DText>
            <DesktopSelect
              value={period}
              onChange={(v) => {
                setPeriod(v);
                setError(null);
              }}
              options={months.map((m) => ({ value: m, label: paidMonths.has(m) ? `${monthLabel(m)} ✓` : monthLabel(m) }))}
              large
            />
          </View>
          <View style={pageStyles.monthYearCell}>
            <DText style={pageStyles.editFieldLabel}>{t('ownerTools.amount')}</DText>
            <DesktopInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))} keyboardType="number-pad" placeholder="₪" ltr large />
          </View>
        </View>
        <View style={pageStyles.monthYearRow}>
          <View style={pageStyles.monthYearCell}>
            <DText style={pageStyles.editFieldLabel}>{t('ownerTools.paidOnLabel')}</DText>
            <DesktopDateField value={paidOn} onChange={setPaidOn} allowClear={false} large />
          </View>
          <View style={pageStyles.monthYearCell}>
            <DText style={pageStyles.editFieldLabel}>{t('ownerTools.methodLabel')}</DText>
            <DesktopSelect value={method} onChange={setMethod} options={PAYMENT_METHODS.map((m) => ({ value: m, label: methodLabel(m) }))} allowClear large />
          </View>
        </View>
        <View>
          <DText style={pageStyles.editFieldLabel}>{t('ownerTools.noteOptional')}</DText>
          <DesktopInput value={note} onChangeText={setNote} maxLength={300} placeholder={t('ownerTools.paymentNotePlaceholder')} large onSubmitEditing={() => void save()} />
        </View>
        {!!error && <DText style={pageStyles.editError}>{error}</DText>}
        <View style={pageStyles.editActions}>
          <HoverPressable style={[pageStyles.primaryBtn, pageStyles.editActionBtn, saving && pageStyles.disabled]} hoverStyle={pageStyles.primaryBtnHover} pressStyle={pageStyles.pressDown} onPress={() => void save()} disabled={saving}>
            {saving && <BrandLoader size="small" color="#FFFFFF" />}
            <DText weight="semiBold" style={pageStyles.primaryBtnText}>{t('common.save')}</DText>
          </HoverPressable>
          <HoverPressable style={[pageStyles.plainBtn, pageStyles.editActionBtn]} hoverStyle={pageStyles.plainBtnHover} pressStyle={pageStyles.pressDown} onPress={onClose}>
            <DText weight="semiBold" style={pageStyles.plainBtnText}>{t('common.cancel')}</DText>
          </HoverPressable>
        </View>
      </View>
    </DesktopModal>
  );
}

/* ------------------------------------------------------------------ */
/* Internal notes                                                      */
/* ------------------------------------------------------------------ */

export function NotesCard({ companyId }: { companyId: string }) {
  const [notes, setNotes] = useState<CompanyNote[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);

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
      showAlert(t('common.updateFailed'), t('common.tryAgainShortly'));
    } finally {
      setSaving(false);
    }
  };

  const remove = (note: CompanyNote) =>
    showAlert(t('ownerTools.deleteNoteTitle'), t('ownerTools.deleteNoteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.deleteAction'), style: 'destructive', onPress: () => void deleteCompanyNote(note.id).then(load, () => showAlert(t('common.updateFailed'), t('common.tryAgainShortly'))) },
    ]);

  return (
    <View>
      <GroupLabel>{t('ownerTools.notesTitle')}</GroupLabel>
      <View style={[pageStyles.card, pageStyles.listCard]}>
        <View style={styles.compose}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('ownerTools.notePlaceholder')}
            placeholderTextColor={DESKTOP_COLORS.inkFaint}
            multiline
            maxLength={2000}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            accessibilityLabel={t('ownerTools.notesTitle')}
            style={[styles.textarea, focused && styles.textareaFocus]}
            {...({
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void add();
                }
              },
            } as object)}
          />
          <View style={styles.composeFoot}>
            <DText style={pageStyles.rowNote}>{t('ownerTools.notesPrivate')}</DText>
            <HoverPressable
              style={[pageStyles.softBtn, (!draft.trim() || saving) && pageStyles.disabled]}
              hoverStyle={pageStyles.softBtnHover}
              pressStyle={pageStyles.pressDown}
              onPress={() => void add()}
              disabled={!draft.trim() || saving}
            >
              <Ionicons name="add" size={16} color={DESKTOP_COLORS.brand} />
              <DText weight="semiBold" style={pageStyles.softBtnText}>{t('ownerTools.addNote')}</DText>
            </HoverPressable>
          </View>
        </View>
        {failed ? (
          <DText style={styles.empty}>{t('ownerTools.loadFailed')}</DText>
        ) : (
          (notes ?? []).map((note) => (
            <View key={note.id} style={[pageStyles.detailRow, pageStyles.rowDivider, styles.noteRow]}>
              <View style={pageStyles.flex}>
                <DText style={styles.noteBody}>{note.body}</DText>
                <DText style={pageStyles.rowNote}>{formatDate(note.created_at)} · {new Date(note.created_at).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })}</DText>
              </View>
              <TrashButton label={t('ownerTools.deleteNoteTitle')} onPress={() => remove(note)} />
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function TrashButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <HoverPressable style={styles.iconBtn} hoverStyle={styles.iconBtnDanger} pressStyle={pageStyles.pressDown} onPress={onPress} accessibilityLabel={label} {...webOnly({ title: label })}>
      <Ionicons name="trash-outline" size={15} color={DESKTOP_COLORS.inkFaint} />
    </HoverPressable>
  );
}

const styles = StyleSheet.create({
  onboarding: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  onboardingHead: { gap: 2 },
  onboardingCount: { fontSize: 15.5, color: DESKTOP_COLORS.ink, textAlign: 'right' },
  progress: { height: 6, borderRadius: 3, backgroundColor: '#EEF1F4', overflow: 'hidden', flexDirection: 'row-reverse' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: DESKTOP_COLORS.brand, ...webOnly({ transition: 'width 400ms ease' }) },
  steps: { gap: 8, marginTop: 2 },
  step: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  stepText: { fontSize: 14, color: DESKTOP_COLORS.ink },
  stepDone: { color: DESKTOP_COLORS.inkMuted, ...webOnly({ textDecorationLine: 'line-through' }) },

  cardLoading: { paddingVertical: 28, alignItems: 'center' },
  empty: { fontSize: 14, color: DESKTOP_COLORS.inkFaint, textAlign: 'center', paddingVertical: 22, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  payHead: { padding: 14, gap: 8, alignItems: 'flex-end' },
  monthState: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, alignSelf: 'stretch' },
  monthStateText: { fontSize: 13.5 },
  payRow: { minHeight: 54, gap: 10 },
  rowTitle: { fontSize: 14, color: DESKTOP_COLORS.ink },
  amount: { fontSize: 14.5, color: DESKTOP_COLORS.ink },
  more: { paddingVertical: 10, alignItems: 'center' },

  compose: { padding: 12, gap: 8 },
  textarea: {
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: DESKTOP_COLORS.ink,
    textAlign: 'right',
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({ outlineStyle: 'none', resize: 'vertical', transition: 'border-color 150ms ease, box-shadow 150ms ease', fontFamily: 'inherit' }),
  },
  textareaFocus: { borderColor: DESKTOP_COLORS.brand, ...webOnly({ boxShadow: '0 0 0 3px rgba(47,91,255,0.14)' }) },
  composeFoot: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  noteRow: { alignItems: 'flex-start', paddingVertical: 12, gap: 8 },
  noteBody: { fontSize: 14, lineHeight: 21, color: DESKTOP_COLORS.ink, textAlign: 'right' },
  iconBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease' }) },
  iconBtnDanger: { backgroundColor: 'rgba(217,45,32,0.08)' },
});
