import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DK, DKText, EditField, KitSection, KitSheet, PrimaryAction, SheetActions, Surface } from '../driverKit';
import { DateField } from '../ui/DateField';
import { formatPhone } from '../../lib/phone';
import {
  ACCOUNT_PLANS,
  ACCOUNT_STATUSES,
  BILLING_CYCLES,
  accountToForm,
  formToAccountInput,
  validateAccountForm,
  type AccountForm,
  type CompanyAccount,
} from '../../lib/companyAccount';
import { saveCompanyAccount } from '../../lib/companyAccountApi';
import { ChoiceChips } from './ownerKit';
import { t } from '../../lib/i18n';

/**
 * The commercial side of one company, as the owner keeps it: where the
 * customer stands, what it pays, when it renews and who to call about
 * billing. `AccountFields` is the form body (also the last step of creating
 * a company); `CompanyAccountSheet` edits an existing account in a sheet.
 */

type Errors = Partial<Record<keyof AccountForm, string>>;

export function AccountFields({
  form,
  errors,
  onChange,
  showContact = true,
}: {
  form: AccountForm;
  errors: Errors;
  onChange: (updater: (f: AccountForm) => AccountForm) => void;
  showContact?: boolean;
}) {
  const set = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) => onChange((f) => ({ ...f, [key]: value }));
  return (
    <View style={styles.stack}>
      <KitSection title={t('account.customerStatus')}>
        <View style={styles.block}>
          <ChoiceChips label={t('account.customerStatus')} options={ACCOUNT_STATUSES} value={form.status} onChange={(v) => v && set('status', v)} />
          <DKText variant="caption" color={DK.muted}>
            {form.status === 'trial'
              ? t('account.trialHint')
              : form.status === 'active'
                ? t('account.payingHint')
                : form.status === 'overdue'
                  ? t('account.overdueHint')
                  : t('account.cancelledHint')}
          </DKText>
        </View>
        {form.status === 'trial' ? (
          <EditField
            label={t('account.trialEnd')}
            error={errors.trialEndsAt}
            editor={<DateField value={form.trialEndsAt || null} onChange={(v) => set('trialEndsAt', v ?? '')} placeholder={t('account.notSet')} />}
          />
        ) : form.status !== 'cancelled' ? (
          <EditField
            label={t('account.nextRenewal')}
            error={errors.renewalDate}
            hint={t('account.renewalAlertHint')}
            editor={<DateField value={form.renewalDate || null} onChange={(v) => set('renewalDate', v ?? '')} placeholder={t('account.notSet')} />}
          />
        ) : null}
      </KitSection>

      <KitSection title={t('account.planAndPrice')}>
        <View style={styles.block}>
          <DKText variant="caption" color={DK.inkSoft}>
            {t('account.planLabel')}
          </DKText>
          <ChoiceChips label={t('account.planLabel')} options={ACCOUNT_PLANS} value={form.plan} onChange={(v) => set('plan', v)} clearable />
        </View>
        <View style={[styles.block, styles.divider]}>
          <DKText variant="caption" color={DK.inkSoft}>
            {t('account.billingLabel')}
          </DKText>
          <ChoiceChips label={t('account.billingLabel')} options={BILLING_CYCLES} value={form.billingCycle} onChange={(v) => v && set('billingCycle', v)} />
        </View>
        <EditField
          label={t('account.monthlyPrice')}
          value={form.monthlyPrice}
          onChangeText={(v) => set('monthlyPrice', v.replace(/[^\d.]/g, ''))}
          keyboardType="decimal-pad"
          ltr
          placeholder="0"
          error={errors.monthlyPrice}
          hint={form.billingCycle === 'yearly' ? t('account.yearlyPriceHint') : undefined}
        />
        <EditField
          label={t('account.vehicleQuota')}
          value={form.vehicleLimit}
          onChangeText={(v) => set('vehicleLimit', v.replace(/\D/g, ''))}
          keyboardType="number-pad"
          ltr
          placeholder={t('account.unlimited')}
          error={errors.vehicleLimit}
          hint={t('account.quotaHint')}
        />
      </KitSection>

      {showContact && (
        <KitSection title={t('account.billingContact')}>
          <EditField first label={t('common.name')} value={form.contactName} onChangeText={(v) => set('contactName', v)} placeholder={t('account.billingContactExample')} />
          <EditField
            label={t('common.phone')}
            value={formatPhone(form.contactPhone)}
            onChangeText={(v) => set('contactPhone', v.replace(/\D/g, ''))}
            keyboardType="phone-pad"
            ltr
            placeholder="050-0000000"
          />
          <EditField
            label={t('common.emailShort')}
            value={form.contactEmail}
            onChangeText={(v) => set('contactEmail', v)}
            keyboardType="email-address"
            ltr
            placeholder="billing@company.co.il"
            error={errors.contactEmail}
          />
          <EditField
            label={t('account.internalNotes')}
            value={form.notes}
            onChangeText={(v) => set('notes', v)}
            placeholder={t('account.onlyYouSee')}
            error={errors.notes}
            maxLength={2000}
          />
        </KitSection>
      )}
    </View>
  );
}

export function CompanyAccountSheet({
  companyId,
  companyName,
  account,
  visible,
  onClose,
  onSaved,
}: {
  companyId: string | null;
  companyName: string;
  account: CompanyAccount | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<AccountForm>(() => accountToForm(account));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setForm(accountToForm(account));
    setErrors({});
    setSaveError('');
  }, [visible, account]);

  const save = async () => {
    if (!companyId) return;
    const next = validateAccountForm(form);
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setSaveError('');
    try {
      await saveCompanyAccount(companyId, formToAccountInput(form));
      onSaved();
      onClose();
    } catch {
      setSaveError(t('common.saveFailedTryAgain'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KitSheet
      visible={visible}
      onClose={onClose}
      dismissable={!saving}
      icon="card"
      title={t('owner.subscriptionAndPayment')}
      subtitle={t('account.onlyYouSeeDetails', { companyName })}
      footer={
        <View style={styles.footer}>
          {!!saveError && (
            <Surface style={styles.error}>
              <DKText variant="caption" color="#C21F37">
                {saveError}
              </DKText>
            </Surface>
          )}
          <SheetActions>
            <PrimaryAction label={t('common.cancel')} tone="ghost" onPress={onClose} disabled={saving} style={styles.grow} />
            <PrimaryAction label={t('common.save')} icon="checkmark" onPress={() => void save()} loading={saving} style={styles.grow} />
          </SheetActions>
        </View>
      }
    >
      <AccountFields form={form} errors={errors} onChange={setForm} />
    </KitSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 20 },
  block: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  grow: { flex: 1 },
  footer: { gap: 10 },
  error: { padding: 12, backgroundColor: '#FFE8EB' },
});
