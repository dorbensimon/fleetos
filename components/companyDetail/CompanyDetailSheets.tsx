import React, { useState } from 'react';
import { Linking, Platform, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, EditField, KitSection, KitSheet, ListRow, PrimaryAction, Pressy, SheetActions, STATUS, Surface } from '../driverKit';
import { formatPhone } from '../../lib/phone';
import { CompanyUser } from './types';
import { t, textEnd } from '../../lib/i18n';

/**
 * Every dialog of the owner's company page, in the app kit (a sheet on the
 * phone, a dialog on desktop): a person's actions, adding a manager, editing
 * a person, a new temporary password, removing a person, and the sign-in
 * details to pass on afterwards.
 */

function randomDigits(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String(Math.floor(Math.random() * 10));
  return out;
}

function ErrorLine({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={18} color={STATUS.expired.fg} />
      <DKText variant="caption" color={STATUS.expired.fg} style={styles.flex}>
        {message}
      </DKText>
    </View>
  );
}

function PasswordField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <KitSection
      title={t('password.temporary')}
      trailing={
        <Pressy onPress={() => onChange(randomDigits(6))} accessibilityLabel={t('password.generateRandom')} style={styles.linkChip} pressScale={0.95}>
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
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        autoComplete="off"
        ltr
        placeholder={t('validation.min4DigitsPlaceholder')}
        error={error}
        hint={t('users.nextSignInChoose')}
      />
    </KitSection>
  );
}

// ── A person's actions ───────────────────────────────────────────────────

export function UserActionsSheet({
  user,
  onClose,
  onEdit,
  onReset,
  onRemove,
}: {
  user: CompanyUser | null;
  onClose: () => void;
  onEdit: () => void;
  onReset: () => void;
  onRemove: () => void;
}) {
  const role = user?.role === 'admin' ? t('role.manager') : t('role.driver');
  return (
    <KitSheet
      visible={!!user}
      onClose={onClose}
      title={user?.full_name || t('common.unnamed')}
      subtitle={[role, user?.must_change_password ? t('users.notSignedInYet') : null].filter(Boolean).join(' · ')}
    >
      <Surface style={styles.list}>
        <ListRow first icon="mail-outline" title={t('common.emailShort')} value={user?.email || '—'} ltrValue />
        <ListRow icon="call-outline" title={t('common.phone')} value={user?.phone ? formatPhone(user.phone) : '—'} ltrValue />
      </Surface>
      <Surface style={[styles.list, styles.gap]}>
        <ListRow first icon="create-outline" title={t('profile.editDetails')} subtitle={t('users.nameAndPhone')} onPress={onEdit} />
        <ListRow icon="key-outline" title={t('password.newTemporary')} subtitle={t('users.whenCantSignIn')} onPress={onReset} />
      </Surface>
      <Surface style={[styles.list, styles.gap]}>
        <ListRow first icon="trash-outline" tint={STATUS.expired.fg} title={t('users.removeRole', { role })} subtitle={t('users.removeHint')} onPress={onRemove} />
      </Surface>
    </KitSheet>
  );
}

// ── Add a manager ────────────────────────────────────────────────────────

export type NewAdminForm = { firstName: string; lastName: string; email: string; phone: string; password: string };
export const EMPTY_NEW_ADMIN_FORM: NewAdminForm = { firstName: '', lastName: '', email: '', phone: '', password: '' };

export function AddAdminSheet({
  visible,
  companyName,
  form,
  fieldErrors,
  submitting,
  submitError,
  onClose,
  onChangeForm,
  onSubmit,
}: {
  visible: boolean;
  companyName: string;
  form: NewAdminForm;
  fieldErrors: Record<string, string>;
  submitting: boolean;
  submitError: string;
  onClose: () => void;
  onChangeForm: (updater: (f: NewAdminForm) => NewAdminForm) => void;
  onSubmit: () => void;
}) {
  const set = <K extends keyof NewAdminForm>(key: K, value: NewAdminForm[K]) => onChangeForm((f) => ({ ...f, [key]: value }));
  return (
    <KitSheet
      visible={visible}
      onClose={onClose}
      dismissable={!submitting}
      icon="person-add"
      title={t('users.additionalManager')}
      subtitle={t('users.canManageFleet', { companyName })}
      footer={
        <View style={styles.footer}>
          <ErrorLine message={submitError} />
          <SheetActions>
            <PrimaryAction label={t('common.cancel')} tone="ghost" onPress={onClose} disabled={submitting} style={styles.grow} />
            <PrimaryAction label={t('common.add')} icon="checkmark" onPress={onSubmit} loading={submitting} style={styles.grow} />
          </SheetActions>
        </View>
      }
    >
      <View style={styles.stack}>
        <KitSection>
          <View style={styles.pairRow}>
            <View style={styles.flex}>
              <EditField first label={t('common.firstName')} required value={form.firstName} onChangeText={(v) => set('firstName', v)} error={fieldErrors.firstName} />
            </View>
            <View style={styles.flex}>
              <EditField first label={t('common.lastName')} required value={form.lastName} onChangeText={(v) => set('lastName', v)} error={fieldErrors.lastName} />
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
            placeholder="name@company.co.il"
            error={fieldErrors.email}
          />
          <EditField
            label={t('common.mobilePhone')}
            required
            value={formatPhone(form.phone)}
            onChangeText={(v) => set('phone', v.replace(/\D/g, ''))}
            keyboardType="phone-pad"
            ltr
            placeholder="050-0000000"
            error={fieldErrors.phone}
          />
        </KitSection>
        <PasswordField value={form.password} onChange={(v) => set('password', v)} error={fieldErrors.password} />
      </View>
    </KitSheet>
  );
}

// ── Edit a person ────────────────────────────────────────────────────────

export type EditUserForm = { firstName: string; lastName: string; phone: string };

export function EditUserSheet({
  target,
  form,
  fieldErrors,
  submitting,
  submitError,
  onClose,
  onChangeForm,
  onSubmit,
}: {
  target: CompanyUser | null;
  form: EditUserForm;
  fieldErrors: Record<string, string>;
  submitting: boolean;
  submitError: string;
  onClose: () => void;
  onChangeForm: (updater: (f: EditUserForm) => EditUserForm) => void;
  onSubmit: () => void;
}) {
  return (
    <KitSheet
      visible={!!target}
      onClose={onClose}
      dismissable={!submitting}
      icon="create"
      title={t('profile.editDetails')}
      subtitle={target?.email ?? undefined}
      footer={
        <View style={styles.footer}>
          <ErrorLine message={submitError} />
          <SheetActions>
            <PrimaryAction label={t('common.cancel')} tone="ghost" onPress={onClose} disabled={submitting} style={styles.grow} />
            <PrimaryAction label={t('common.save')} icon="checkmark" onPress={onSubmit} loading={submitting} style={styles.grow} />
          </SheetActions>
        </View>
      }
    >
      <KitSection>
        <View style={styles.pairRow}>
          <View style={styles.flex}>
            <EditField first label={t('common.firstName')} required value={form.firstName} onChangeText={(v) => onChangeForm((f) => ({ ...f, firstName: v }))} error={fieldErrors.firstName} />
          </View>
          <View style={styles.flex}>
            <EditField first label={t('common.lastName')} required value={form.lastName} onChangeText={(v) => onChangeForm((f) => ({ ...f, lastName: v }))} error={fieldErrors.lastName} />
          </View>
        </View>
        <EditField
          label={t('common.mobilePhone')}
          required
          value={formatPhone(form.phone)}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, phone: v.replace(/\D/g, '') }))}
          keyboardType="phone-pad"
          ltr
          error={fieldErrors.phone}
        />
      </KitSection>
    </KitSheet>
  );
}

// ── A new temporary password ─────────────────────────────────────────────

export function ResetPasswordSheet({
  target,
  password,
  error,
  submitting,
  submitError,
  onClose,
  onChange,
  onSubmit,
}: {
  target: CompanyUser | null;
  password: string;
  error?: string;
  submitting: boolean;
  submitError: string;
  onClose: () => void;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <KitSheet
      visible={!!target}
      onClose={onClose}
      dismissable={!submitting}
      icon="key"
      title={t('password.newTemporary')}
      subtitle={t('users.forUserOldStops', { v1: target?.full_name || target?.email || t('users.user') })}
      footer={
        <View style={styles.footer}>
          <ErrorLine message={submitError} />
          <SheetActions>
            <PrimaryAction label={t('common.cancel')} tone="ghost" onPress={onClose} disabled={submitting} style={styles.grow} />
            <PrimaryAction label={t('password.setThe')} icon="checkmark" onPress={onSubmit} loading={submitting} style={styles.grow} />
          </SheetActions>
        </View>
      }
    >
      <PasswordField value={password} onChange={onChange} error={error} />
    </KitSheet>
  );
}

// ── Remove a person ──────────────────────────────────────────────────────

export function RemoveUserSheet({
  target,
  removing,
  onClose,
  onConfirm,
}: {
  target: CompanyUser | null;
  removing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const admin = target?.role === 'admin';
  return (
    <KitSheet
      visible={!!target}
      onClose={onClose}
      dismissable={!removing}
      icon="trash"
      tone="danger"
      title={t('users.removeQuestion', { v1: target?.full_name || target?.email || t('users.theUser') })}
      subtitle={
        admin
          ? t('users.removeManagerWarning')
          : t('users.removeDriverWarning')
      }
      footer={
        <SheetActions>
          <PrimaryAction label={t('common.keep')} tone="ghost" onPress={onClose} disabled={removing} style={styles.grow} />
          <PrimaryAction label={t('users.removePermanently')} tone="destructive" onPress={onConfirm} loading={removing} style={styles.grow} />
        </SheetActions>
      }
    />
  );
}

// ── Sign-in details to pass on ───────────────────────────────────────────

export type Credentials = { title: string; subtitle: string; name: string; email: string; password: string; phone?: string | null };

/** 050-1234567 → 972501234567 for a WhatsApp link, or null when it isn't an Israeli mobile. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;
  if (/^9725\d{8}$/.test(digits)) return digits;
  return null;
}

export function openWhatsapp(number: string, message: string) {
  void Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(message)}`).catch(() => {});
}

/**
 * "שליחת הפרטים": the share menu where there is one; a computer browser
 * usually has none, so there it copies the message and says so.
 */
export function useSendMessage(message: string) {
  const [copied, setCopied] = useState(false);
  const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  const send = () => {
    if (canShare) {
      void Share.share({ message }).catch(() => {});
      return;
    }
    void navigator.clipboard?.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return {
    send,
    label: canShare ? t('addCompany.sendDetails') : copied ? t('companyPage.copied') : t('users.copyDetails'),
    icon: (canShare ? 'share-outline' : copied ? 'checkmark' : 'copy-outline') as 'share-outline' | 'checkmark' | 'copy-outline',
  };
}

export function CredentialsSheet({ details, onClose }: { details: Credentials | null; onClose: () => void }) {
  const message = details
    ? t('users.shareCredentials', { name: details.name, email: details.email, password: details.password })
    : '';
  const sender = useSendMessage(message);
  const whatsapp = whatsappNumber(details?.phone);
  return (
    <KitSheet
      visible={!!details}
      onClose={onClose}
      icon="checkmark-circle"
      title={details?.title ?? ''}
      subtitle={details?.subtitle}
      footer={
        <SheetActions>
          <PrimaryAction label={t('common.close')} tone="ghost" onPress={onClose} style={styles.grow} />
          {!!whatsapp && (
            <PrimaryAction label={t('users.sendWhatsapp')} icon="logo-whatsapp" tone="ghost" onPress={() => openWhatsapp(whatsapp, message)} style={styles.grow} />
          )}
          <PrimaryAction label={sender.label} icon={sender.icon} onPress={sender.send} style={styles.grow} />
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
  gap: { marginTop: 12 },
  list: { overflow: 'hidden' },
  pairRow: { flexDirection: 'row-reverse' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  errorBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: STATUS.expired.soft },
  linkChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: DK.accentSoft },
  sumRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, minHeight: 52 },
  sumValue: { flexShrink: 1, textAlign: textEnd() },
});
