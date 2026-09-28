import React, { useEffect, useState } from 'react';
import { Image, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, EditField, KitSection, KitSheet, PrimaryAction, Pressy, SheetActions, STATUS, Surface } from '../driverKit';
import { BrandLoader } from '../ui/BrandLoader';
import { formatPhone } from '../../lib/phone';
import { validateCompanyStep, type CompanyStep, type OwnerCompanyForm } from '../../lib/newCompanyForm';
import { AccountFields } from './CompanyAccountSheet';
import { ChoiceChips } from './ownerKit';
import { t, dirIcon, textEnd } from '../../lib/i18n';

/**
 * Opening a new customer, in three short steps on one sheet (a dialog on
 * desktop): the company, its first manager with a temporary password, and
 * the subscription. Each step checks its own fields before moving on; the
 * last one creates everything. After it, `CompanyCreatedSheet` hands the
 * owner the sign-in details to pass on.
 */

export { emptyOwnerCompanyForm, type OwnerCompanyForm } from '../../lib/newCompanyForm';

type FieldErrors = Record<string, string>;

const STEPS: { title: string; subtitle: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { get title() { return t('owner.theCompany'); }, get subtitle() { return t('addCompany.step.companyHint'); }, icon: 'business' },
  { get title() { return t('addCompany.step.manager'); }, get subtitle() { return t('addCompany.step.managerHint'); }, icon: 'person' },
  { get title() { return t('addCompany.step.subscription'); }, get subtitle() { return t('addCompany.step.subscriptionHint'); }, icon: 'card' },
];

function randomDigits(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String(Math.floor(Math.random() * 10));
  return out;
}

export function AddCompanySheet({
  visible,
  form,
  uploadingLogo,
  logoError,
  createError,
  creating,
  onClose,
  onChangeForm,
  onPickLogo,
  onSubmit,
}: {
  visible: boolean;
  form: OwnerCompanyForm;
  uploadingLogo: boolean;
  logoError: string;
  createError: string;
  creating: boolean;
  onClose: () => void;
  onChangeForm: (updater: (f: OwnerCompanyForm) => OwnerCompanyForm) => void;
  onPickLogo: () => void;
  onSubmit: () => void;
}) {
  const [step, setStep] = useState<CompanyStep>(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(true);

  useEffect(() => {
    if (visible) {
      setStep(0);
      setErrors({});
    }
  }, [visible]);

  const set = <K extends keyof OwnerCompanyForm>(key: K, value: OwnerCompanyForm[K]) => {
    onChangeForm((f) => ({ ...f, [key]: value }));
    if (errors[key as string]) setErrors((e) => ({ ...e, [key as string]: '' }));
  };

  const next = () => {
    const found = validateCompanyStep(step, form);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    if (step < 2) setStep((step + 1) as CompanyStep);
    else onSubmit();
  };

  const back = () => (step === 0 ? onClose() : setStep((step - 1) as CompanyStep));

  const accountErrors = Object.fromEntries(
    Object.entries(errors)
      .filter(([k, v]) => k.startsWith('account.') && v)
      .map(([k, v]) => [k.slice('account.'.length), v]),
  );

  return (
    <KitSheet
      visible={visible}
      onClose={onClose}
      dismissable={!creating}
      title={t('owner.newCompany')}
      scrollKey={step}
      subtitle={t('addCompany.stepOf3', { v1: step + 1, subtitle: STEPS[step].subtitle })}
      footer={
        <View style={styles.footer}>
          {!!createError && (
            <View style={styles.errorBox} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={18} color={STATUS.expired.fg} />
              <DKText variant="caption" color={STATUS.expired.fg} style={styles.flex}>
                {createError}
              </DKText>
            </View>
          )}
          <SheetActions>
            <PrimaryAction label={step === 0 ? t('common.cancel') : t('common.goBack')} tone="ghost" onPress={back} disabled={creating} style={styles.grow} />
            <PrimaryAction
              label={step < 2 ? t('common.continue') : t('addCompany.create')}
              icon={step < 2 ? dirIcon('arrow-back') : 'checkmark'}
              onPress={next}
              loading={creating}
              style={styles.grow}
            />
          </SheetActions>
        </View>
      }
    >
      <Stepper step={step} onJump={(s) => s < step && setStep(s)} />

      {step === 0 && (
        <View style={styles.stack}>
          <Pressy onPress={onPickLogo} disabled={uploadingLogo} accessibilityLabel={form.logoUrl ? t('company.replaceLogo') : t('company.uploadLogo')} pressScale={0.98}>
            <Surface style={styles.logoCard}>
              <View style={styles.logoBox}>
                {uploadingLogo ? (
                  <BrandLoader size={26} />
                ) : form.logoUrl ? (
                  <Image source={{ uri: form.logoUrl }} accessibilityLabel={t('company.logo')} style={styles.logoImage} resizeMode="contain" />
                ) : (
                  <DKText variant="title" color={DK.accent}>
                    {form.name.trim().charAt(0) || <Ionicons name="image-outline" size={26} color={DK.accent} />}
                  </DKText>
                )}
              </View>
              <View style={styles.flex}>
                <DKText variant="label">{form.logoUrl ? t('company.logoUploaded') : t('company.logo')}</DKText>
                <DKText variant="caption" color={logoError ? STATUS.expired.fg : DK.muted}>
                  {logoError || (form.logoUrl ? t('company.clickToReplace') : t('company.logoOptional'))}
                </DKText>
              </View>
              <Ionicons name={form.logoUrl ? 'swap-horizontal' : 'cloud-upload-outline'} size={20} color={DK.accent} />
            </Surface>
          </Pressy>

          <KitSection>
            <EditField first label={t('company.name')} required value={form.name} onChangeText={(v) => set('name', v)} placeholder={t('company.nameExample')} error={errors.name} />
            <View style={styles.block}>
              <DKText variant="caption" color={DK.inkSoft}>
                {t('company.typeOf')}
              </DKText>
              <ChoiceChips
                label={t('company.typeOf')}
                clearable
                options={[
                  { value: 'בע״מ', label: 'בע״מ' },
                  { value: 'עוסק מורשה', label: 'עוסק מורשה' },
                ]}
                value={form.companyType}
                onChange={(v) => set('companyType', v as OwnerCompanyForm['companyType'])}
              />
            </View>
            <EditField
              label={form.companyType === 'עוסק מורשה' ? t('company.dealerNumber') : t('company.regNumber')}
              value={form.businessId}
              onChangeText={(v) => set('businessId', v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              ltr
              placeholder="512345678"
              maxLength={9}
              error={errors.businessId}
              hint={t('company.completeLaterHint')}
            />
          </KitSection>
        </View>
      )}

      {step === 1 && (
        <View style={styles.stack}>
          <KitSection title={t('addCompany.managerDetails')}>
            <View style={styles.pairRow}>
              <View style={styles.flex}>
                <EditField first label={t('common.firstName')} required value={form.adminFirstName} onChangeText={(v) => set('adminFirstName', v)} placeholder={t('common.firstNameExample')} error={errors.adminFirstName} />
              </View>
              <View style={styles.flex}>
                <EditField first label={t('common.lastName')} required value={form.adminLastName} onChangeText={(v) => set('adminLastName', v)} placeholder={t('common.lastNameExample')} error={errors.adminLastName} />
              </View>
            </View>
            <EditField
              label={t('common.emailShort')}
              required
              value={form.email}
              onChangeText={(v) => set('email', v.trim())}
              keyboardType="email-address"
              autoComplete="off"
              ltr
              placeholder="admin@company.co.il"
              error={errors.email}
              hint={t('addCompany.managerSignsInWith')}
            />
            <EditField
              label={t('common.mobilePhone')}
              required
              value={formatPhone(form.phone)}
              onChangeText={(v) => set('phone', v.replace(/\D/g, ''))}
              keyboardType="phone-pad"
              ltr
              placeholder="050-0000000"
              error={errors.phone}
            />
          </KitSection>

          <KitSection
            title={t('password.temporary')}
            trailing={
              <Pressy onPress={() => set('password', randomDigits(6))} accessibilityLabel={t('password.generateRandom')} style={styles.linkChip} pressScale={0.95}>
                <Ionicons name="sparkles" size={14} color={DK.accent} />
                <DKText variant="micro" color={DK.accent}>
                  {t('password.autoGenerate')}
                </DKText>
              </Pressy>
            }
          >
            <EditField
              first
              label={t('common.password')}
              required
              value={form.password}
              onChangeText={(v) => set('password', v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              secureTextEntry={!showPassword}
              autoComplete="off"
              ltr
              placeholder={t('validation.min4DigitsPlaceholder')}
              error={errors.password}
            />
            <Pressy onPress={() => setShowPassword((v) => !v)} accessibilityLabel={showPassword ? t('password.hideThe') : t('password.showThe')} style={styles.showRow} pressScale={0.98}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={17} color={DK.muted} />
              <DKText variant="caption" color={DK.muted}>
                {showPassword ? t('password.hideThe') : t('password.showThe')}
              </DKText>
            </Pressy>
          </KitSection>

          <View style={styles.note}>
            <Ionicons name="shield-checkmark" size={16} color={DK.accent} />
            <DKText variant="caption" color={DK.inkSoft} style={styles.flex}>
              {t('addCompany.tempPasswordNote')}
            </DKText>
          </View>
        </View>
      )}

      {step === 2 && (
        <View style={styles.stack}>
          <AccountFields form={form.account} errors={accountErrors} onChange={(u) => onChangeForm((f) => ({ ...f, account: u(f.account) }))} showContact={false} />
          <Summary form={form} />
        </View>
      )}
    </KitSheet>
  );
}

function Stepper({ step, onJump }: { step: CompanyStep; onJump: (s: CompanyStep) => void }) {
  return (
    <View style={styles.stepper} accessibilityLabel={t('addCompany.stepTitle', { v1: step + 1, title: STEPS[step].title })}>
      {STEPS.map((s, i) => {
        const done = i < step;
        const on = i === step;
        const body = (
          <>
            <View style={[styles.stepBar, (done || on) && styles.stepBarOn]} />
            <View style={styles.stepLabel}>
              {done ? (
                <Ionicons name="checkmark-circle" size={15} color={DK.accent} />
              ) : (
                <Ionicons name={s.icon} size={14} color={on ? DK.ink : DK.faint} />
              )}
              <DKText variant="micro" color={on ? DK.ink : done ? DK.accent : DK.faint}>
                {s.title}
              </DKText>
            </View>
          </>
        );
        // Only a finished step can be gone back to.
        return done ? (
          <Pressy key={s.title} onPress={() => onJump(i as CompanyStep)} accessibilityLabel={t('addCompany.backToStep', { v1: i + 1, title: s.title })} style={styles.stepItem} pressScale={0.97}>
            {body}
          </Pressy>
        ) : (
          <View key={s.title} style={styles.stepItem}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

function Summary({ form }: { form: OwnerCompanyForm }) {
  const lines: [string, string][] = [
    [t('owner.col.company'), [form.name.trim(), form.companyType].filter(Boolean).join(' ')],
    [t('role.manager'), `${form.adminFirstName.trim()} ${form.adminLastName.trim()}`.trim()],
    [t('addCompany.signIn'), form.email.trim()],
  ];
  return (
    <KitSection title={t('addCompany.beforeCreating')}>
      {lines.map(([label, value], i) => (
        <View key={label} style={[styles.sumRow, i > 0 && styles.divider]}>
          <DKText variant="caption" color={DK.muted}>
            {label}
          </DKText>
          <DKText variant="label" numberOfLines={1} style={styles.sumValue}>
            {value || '—'}
          </DKText>
        </View>
      ))}
    </KitSection>
  );
}

/** After creation: the sign-in details, ready to pass on to the new manager. */
export function CompanyCreatedSheet({
  visible,
  details,
  onClose,
  onOpenCompany,
}: {
  visible: boolean;
  details: { companyId: string | null; companyName: string; email: string; password: string } | null;
  onClose: () => void;
  onOpenCompany: (id: string) => void;
}) {
  const message = details
    ? t('addCompany.shareMessage', { companyName: details.companyName, email: details.email, password: details.password })
    : '';
  return (
    <KitSheet
      visible={visible}
      onClose={onClose}
      icon="checkmark-circle"
      title={t('addCompany.created')}
      subtitle={details ? t('addCompany.readyShare', { companyName: details.companyName }) : undefined}
      footer={
        <SheetActions>
          {details?.companyId ? (
            <PrimaryAction
              label={t('owner.notif.toCompany')}
              tone="ghost"
              onPress={() => {
                const id = details.companyId!;
                onClose();
                onOpenCompany(id);
              }}
              style={styles.grow}
            />
          ) : (
            <PrimaryAction label={t('common.close')} tone="ghost" onPress={onClose} style={styles.grow} />
          )}
          <PrimaryAction label={t('addCompany.sendDetails')} icon="share-outline" onPress={() => void Share.share({ message }).catch(() => {})} style={styles.grow} />
        </SheetActions>
      }
    >
      {!!details && (
        <KitSection>
          <View style={styles.sumRow}>
            <DKText variant="caption" color={DK.muted}>
              {t('addCompany.signInEmail')}
            </DKText>
            <DKText variant="label" ltr selectable style={styles.sumValue}>
              {details.email}
            </DKText>
          </View>
          <View style={[styles.sumRow, styles.divider]}>
            <DKText variant="caption" color={DK.muted}>
              {t('password.temporary')}
            </DKText>
            <DKText variant="number" ltr selectable style={styles.sumValue}>
              {details.password}
            </DKText>
          </View>
        </KitSection>
      )}
    </KitSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flex: 1 },
  stack: { gap: 18 },
  footer: { gap: 10 },
  block: { paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  pairRow: { flexDirection: 'row-reverse' },
  errorBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: STATUS.expired.soft },

  stepper: { flexDirection: 'row-reverse', gap: 8, marginBottom: 18 },
  stepItem: { flex: 1, gap: 8 },
  stepBar: { height: 4, borderRadius: 2, backgroundColor: DK.hairline },
  stepBarOn: { backgroundColor: DK.accent },
  stepLabel: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },

  logoCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, padding: 14 },
  logoBox: { width: 60, height: 60, borderRadius: 18, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImage: { width: 60, height: 60 },

  linkChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: DK.accentSoft },
  showRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 14, minHeight: 36 },
  note: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, padding: 14, borderRadius: 16, backgroundColor: DK.accentSoft },

  sumRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, minHeight: 52 },
  sumValue: { flexShrink: 1, textAlign: textEnd() },
});
