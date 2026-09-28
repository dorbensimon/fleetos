import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, DriverPage, EditField, HeroTitle, KitSection, PrimaryAction, Pressy, Reveal, STATUS, Surface } from '../../../components/driverKit';
import { DateField } from '../../../components/ui/DateField';
import { Select } from '../../../components/ui/Select';
import { LiquidGlassSwitch } from '../../../components/ui/LiquidGlassSwitch';
import type { CompanyContactForm, CompanySettingsForm, CompanyType, SafetyOfficerForm } from '../../../components/desktop/CompanySettingsDesktopView';
import { t } from '../../../lib/i18n';

type Props = {
  insetTop: number;
  insetBottom: number;
  form: CompanySettingsForm;
  errors: Record<string, string>;
  dirty: boolean;
  saving: boolean;
  onBack: () => void;
  onChange: <K extends keyof CompanySettingsForm>(field: K, value: CompanySettingsForm[K]) => void;
  onChangeContact: (index: number, field: keyof CompanyContactForm, value: string) => void;
  onChangeOfficer: (index: number, field: keyof SafetyOfficerForm, value: string) => void;
  onFieldBlur: (key: string) => void;
  onPickImage: (kind: 'logo' | 'stamp') => void;
  onClearImage: (kind: 'logo' | 'stamp') => void;
  onSave: () => void;
  onDiscard: () => void;
};

const TYPE_OPTIONS: { value: CompanyType; label: string }[] = [
  { value: 'בע״מ', get label() { return t('company.typeLtd'); } },
  { value: 'עוסק מורשה', label: 'עוסק מורשה' },
];

const digits = (v: string, max = 10) => v.replace(/\D/g, '').slice(0, max);

/**
 * The company's settings on the phone: the same sections as the desktop,
 * one after another. Nothing saves until "שמירה"; the bar that offers it
 * appears only once something changed, with a way to undo.
 */
export function CompanySettingsMobile(p: Props) {
  const { form, errors } = p;
  const errorCount = Object.keys(errors).length;
  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      hero={<HeroTitle title={t('nav.companySettings')} subtitle={form.name || t('settings.companySettingsSubtitle')} onBack={p.onBack} />}
      footer={
        p.dirty ? (
          <View style={styles.footer}>
            {errorCount > 0 && (
              <DKText variant="caption" color={STATUS.expired.fg} style={styles.center}>
                {errorCount === 1 ? t('settings.oneFieldToFixMobile') : t('settings.fieldsToFixMobile', { errorCount })}
              </DKText>
            )}
            <View style={styles.row}>
              <PrimaryAction label={t('settings.discardChanges')} tone="ghost" onPress={p.onDiscard} disabled={p.saving} style={styles.flex} />
              <PrimaryAction label={t('common.save')} icon="checkmark" onPress={p.onSave} loading={p.saving} style={styles.flex} />
            </View>
          </View>
        ) : undefined
      }
    >
      <Reveal index={0}>
        <KitSection>
          <EditField first label={t('company.name')} required value={form.name} onChangeText={(v) => p.onChange('name', v)} onBlur={() => p.onFieldBlur('name')} error={errors.name} />
          <EditField label={t('company.businessId')} required value={form.businessId} onChangeText={(v) => p.onChange('businessId', digits(v, 9))} onBlur={() => p.onFieldBlur('businessId')} error={errors.businessId} keyboardType="number-pad" ltr hint={t('common.9digits')} />
          <EditField label={t('company.type')} editor={<Select value={form.companyType} options={TYPE_OPTIONS} onChange={(v) => p.onChange('companyType', v)} allowClear placeholder={t('common.notSelected')} />} />
          <EditField label={t('company.carrierLicenseExpiry')} editor={<DateField value={form.carrierLicenseExpiry} onChange={(v) => p.onChange('carrierLicenseExpiry', v)} placeholder={t('common.notEntered')} />} />
          <EditField label={t('common.address')} value={form.address} onChangeText={(v) => p.onChange('address', v)} />
        </KitSection>
      </Reveal>

      <Reveal index={1}>
        <KitSection title={t('settings.section.contact')}>
          <EditField first label={t('company.landline')} value={form.landline} onChangeText={(v) => p.onChange('landline', digits(v))} onBlur={() => p.onFieldBlur('landline')} error={errors.landline} keyboardType="phone-pad" ltr />
          <EditField label={t('common.mobilePhone')} value={form.mobile} onChangeText={(v) => p.onChange('mobile', digits(v))} onBlur={() => p.onFieldBlur('mobile')} error={errors.mobile} keyboardType="phone-pad" ltr />
          <EditField label={t('company.fax')} value={form.fax} onChangeText={(v) => p.onChange('fax', digits(v))} onBlur={() => p.onFieldBlur('fax')} error={errors.fax} keyboardType="phone-pad" ltr />
          <EditField label={t('common.email')} value={form.email} onChangeText={(v) => p.onChange('email', v.trim())} onBlur={() => p.onFieldBlur('email')} error={errors.email} keyboardType="email-address" ltr />
          <EditField label={t('company.filesEmail')} value={form.filesEmail} onChangeText={(v) => p.onChange('filesEmail', v.trim())} onBlur={() => p.onFieldBlur('filesEmail')} error={errors.filesEmail} keyboardType="email-address" ltr />
          <EditField label={t('company.filesEmailExtra')} value={form.filesEmail2} onChangeText={(v) => p.onChange('filesEmail2', v.trim())} onBlur={() => p.onFieldBlur('filesEmail2')} error={errors.filesEmail2} keyboardType="email-address" ltr />
        </KitSection>
      </Reveal>

      <Reveal index={2}>
        <KitSection title={t('settings.monthlyMileageReport')}>
          <View style={styles.toggle}>
            <View style={styles.flex}>
              <DKText variant="label">{t('company.autoSend')}</DKText>
              <DKText variant="caption" color={DK.muted}>
                {form.reportAuto ? t('settings.monthlyMileageHint') : t('company.reportNotSent')}
              </DKText>
            </View>
            <LiquidGlassSwitch value={form.reportAuto} onValueChange={(v) => p.onChange('reportAuto', v)} accessibilityLabel={t('settings.autoSendMileage')} tint={DK.accent} />
          </View>
          <EditField label={t('company.reportEmail')} required={form.reportAuto} value={form.reportEmail} onChangeText={(v) => p.onChange('reportEmail', v.trim())} onBlur={() => p.onFieldBlur('reportEmail')} error={errors.reportEmail} keyboardType="email-address" ltr />
        </KitSection>
      </Reveal>

      {form.contacts.map((c, i) => (
        <Reveal key={`contact${i}`} index={3 + i}>
          <KitSection title={t('company.contactN', { v1: i + 1 })}>
            <EditField first label={t('common.fullName')} value={c.name} onChangeText={(v) => p.onChangeContact(i, 'name', v)} />
            <EditField label={t('common.role')} value={c.role} onChangeText={(v) => p.onChangeContact(i, 'role', v)} placeholder={t('company.rolePlaceholder')} />
            <EditField label={t('common.phone')} value={c.phone} onChangeText={(v) => p.onChangeContact(i, 'phone', digits(v))} onBlur={() => p.onFieldBlur(`contact${i}Phone`)} error={errors[`contact${i}Phone`]} keyboardType="phone-pad" ltr />
            <EditField label={t('common.email')} value={c.email} onChangeText={(v) => p.onChangeContact(i, 'email', v.trim())} onBlur={() => p.onFieldBlur(`contact${i}Email`)} error={errors[`contact${i}Email`]} keyboardType="email-address" ltr />
          </KitSection>
        </Reveal>
      ))}

      {form.officers.map((o, i) => (
        <Reveal key={`officer${i}`} index={5 + i}>
          <KitSection title={i === 0 ? t('company.safetyOfficer') : t('company.extraSafetyOfficer')}>
            <EditField first label={t('common.name')} value={o.name} onChangeText={(v) => p.onChangeOfficer(i, 'name', v)} />
            <EditField label={t('common.phone')} value={o.phone} onChangeText={(v) => p.onChangeOfficer(i, 'phone', digits(v))} onBlur={() => p.onFieldBlur(`officer${i}Phone`)} error={errors[`officer${i}Phone`]} keyboardType="phone-pad" ltr />
          </KitSection>
        </Reveal>
      ))}

      <Reveal index={7}>
        <KitSection title={t('settings.section.logoStamp')}>
          <View style={styles.slots}>
            <ImageSlot title={t('company.logo')} icon="image-outline" uri={form.logoUri} onPick={() => p.onPickImage('logo')} onClear={() => p.onClearImage('logo')} />
            <ImageSlot title={t('company.stampShort')} icon="ribbon-outline" uri={form.stampUri} onPick={() => p.onPickImage('stamp')} onClear={() => p.onClearImage('stamp')} />
          </View>
          <DKText variant="caption" color={DK.muted} style={styles.slotHint}>
            {t('settings.logoHint')}
          </DKText>
        </KitSection>
      </Reveal>
    </DriverPage>
  );
}

function ImageSlot({ title, icon, uri, onPick, onClear }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name']; uri: string | null; onPick: () => void; onClear: () => void }) {
  return (
    <View style={styles.slot}>
      <Pressy onPress={onPick} accessibilityLabel={uri ? t('common.replaceTitle', { title }) : t('common.chooseTitle', { title })} pressScale={0.97}>
        <Surface style={[styles.slotBox, !uri && styles.slotEmpty]}>
          {uri ? (
            <Image source={{ uri }} accessibilityLabel={title} style={styles.slotImage} resizeMode="contain" accessibilityIgnoresInvertColors />
          ) : (
            <>
              <Ionicons name={icon} size={26} color={DK.accent} />
              <DKText variant="caption" color={DK.accent}>
                {t('common.chooseImage')}
              </DKText>
            </>
          )}
        </Surface>
      </Pressy>
      <View style={styles.slotCaption}>
        <DKText variant="label">{title}</DKText>
        {!!uri && (
          <Pressy onPress={onClear} accessibilityLabel={t('common.removeTitle', { title })} style={styles.slotClear} pressScale={0.9}>
            <DKText variant="caption" color={STATUS.expired.fg}>
              {t('common.remove')}
            </DKText>
          </Pressy>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row-reverse', gap: 10 },
  footer: { gap: 8 },
  toggle: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12 },
  slots: { flexDirection: 'row-reverse', gap: 12, padding: 16, paddingBottom: 8 },
  slot: { flex: 1, gap: 6 },
  slotBox: { height: 120, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 20, backgroundColor: DK.surfaceSunk, shadowOpacity: 0, elevation: 0 },
  slotEmpty: { backgroundColor: DK.accentSoft, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(47,91,255,0.35)' },
  slotImage: { width: '86%', height: '86%' },
  slotCaption: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', minHeight: 32, paddingHorizontal: 2 },
  slotClear: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 6 },
  slotHint: { paddingHorizontal: 16, paddingBottom: 14 },
});
