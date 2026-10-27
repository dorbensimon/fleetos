// החלונות של דף החברה אצל הבעלים: פעולות על אדם, הוספת מנהל, סיסמה, הסרה ושליחת פרטים
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, EditField, KitSection, KitSheet, ListRow, PrimaryAction, Pressy, SheetActions, STATUS, Surface } from '../driverKit';
import { formatPhone } from '../../lib/phone';
import { CompanyUser } from './types';
import { t, textEnd } from '../../lib/i18n';
import { isValidEmail } from '../../lib/validation';
import { addCompanyAdmin } from '../../lib/companyApi';

/**
 * Every dialog of the owner's company page, in the app kit (a sheet on the
 * phone, a dialog on desktop): a person's actions, adding a manager, editing
 * a person, a new temporary password, removing a person, and the sign-in
 * details to pass on afterwards.
 */

// סיסמה זמנית אקראית מספרות
function randomDigits(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String(Math.floor(Math.random() * 10));
  return out;
}

// שורת שגיאה בחלון
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

// שדה סיסמה עם כפתור הגרלה
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

// חלון הפעולות על אדם
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
  const [copied, setCopied] = useState(false);
  const canCopy = !!user?.email && typeof navigator !== 'undefined' && !!navigator.clipboard;
  const copyEmail = () =>
    void navigator.clipboard.writeText(user!.email!).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  return (
    <KitSheet
      visible={!!user}
      onClose={onClose}
      title={user?.full_name || t('common.unnamed')}
      subtitle={[
        role,
        (user?.company_count ?? 1) > 1 ? t('users.managerOfCompanies', { count: user?.company_count }) : null,
        user?.must_change_password ? t('users.notSignedInYet') : null,
      ].filter(Boolean).join(' · ')}
    >
      <Surface style={styles.list}>
        <ListRow
          first
          icon={copied ? 'checkmark' : 'mail-outline'}
          title={t('common.emailShort')}
          subtitle={canCopy ? (copied ? t('companyPage.copied') : t('companyPage.copyEmail')) : null}
          value={user?.email || '—'}
          ltrValue
          onPress={canCopy ? copyEmail : undefined}
        />
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

export type NewAdminForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  /** The email already belongs to an account: a manager to link (block null), or why it cannot be. */
  existingManager?: { fullName: string | null; block: string | null } | null;
};
// טופס מנהל חדש ריק
export const EMPTY_NEW_ADMIN_FORM: NewAdminForm = { firstName: '', lastName: '', email: '', phone: '', password: '' };

// חלון הוספת מנהל
export function AddAdminSheet({
  visible,
  companyId,
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
  companyId: string;
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
  // An email that is already a manager is linked instead (same email and
  // password), so their name, phone and password are not asked for.
  const [checkingEmail, setCheckingEmail] = useState(false);
  const emailCheck = useRef(0);
  useEffect(() => {
    const email = form.email.trim();
    const version = ++emailCheck.current;
    onChangeForm((f) => (f.existingManager ? { ...f, existingManager: null } : f));
    if (!visible || !isValidEmail(email)) {
      setCheckingEmail(false);
      return;
    }
    setCheckingEmail(true);
    const timer = setTimeout(async () => {
      const { data } = await addCompanyAdmin({ checkEmail: true, companyId, adminEmail: email }).catch(() => ({ data: null }));
      if (version !== emailCheck.current) return;
      setCheckingEmail(false);
      const account = data?.account ?? null;
      onChangeForm((f) => ({ ...f, existingManager: account ? { fullName: account.fullName ?? null, block: account.block ?? null } : null }));
    }, 450);
    return () => clearTimeout(timer);
    // onChangeForm is a new function every render of the company page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.email, visible, companyId]);
  const existing = form.existingManager;
  const linking = !!existing && !existing.block;
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
            <PrimaryAction label={t('common.add')} icon="checkmark" onPress={onSubmit} loading={submitting || checkingEmail} style={styles.grow} />
          </SheetActions>
        </View>
      }
    >
      <View style={styles.stack}>
        <KitSection>
          <EditField
            first
            label={t('common.emailShort')}
            required
            value={form.email}
            onChangeText={(v) => set('email', v.trim())}
            keyboardType="email-address"
            autoComplete="off"
            ltr
            placeholder="name@company.co.il"
            error={fieldErrors.email || existing?.block || undefined}
          />
          {linking ? (
            <View style={styles.linkNote}>
              <Ionicons name="person-circle" size={16} color={DK.accent} />
              <DKText variant="caption" color={DK.inkSoft} style={styles.flex}>
                {t('users.existingManager', { name: existing?.fullName || form.email.trim(), companyName })}
              </DKText>
            </View>
          ) : (
            <>
              <View style={styles.pairRow}>
                <View style={styles.flex}>
                  <EditField label={t('common.firstName')} required value={form.firstName} onChangeText={(v) => set('firstName', v)} error={fieldErrors.firstName} />
                </View>
                <View style={styles.flex}>
                  <EditField label={t('common.lastName')} required value={form.lastName} onChangeText={(v) => set('lastName', v)} error={fieldErrors.lastName} />
                </View>
              </View>
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
            </>
          )}
        </KitSection>
        {!linking && <PasswordField value={form.password} onChange={(v) => set('password', v)} error={fieldErrors.password} />}
      </View>
    </KitSheet>
  );
}

// ── Edit a person ────────────────────────────────────────────────────────

export type EditUserForm = { firstName: string; lastName: string; phone: string };

// חלון עריכת פרטי אדם
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

// חלון סיסמה זמנית חדשה
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

// חלון הסרת אדם
export function RemoveUserSheet({
  target,
  removing,
  onClose,
  onConfirm,
}: {
  target: CompanyUser | null;
  removing: boolean;
  onClose: () => void;
  /** 'company': only from this company (a manager of other companies keeps the account); 'all': the whole account. */
  onConfirm: (scope: 'company' | 'all') => void;
}) {
  const admin = target?.role === 'admin';
  const others = admin ? (target?.company_count ?? 1) - 1 : 0;
  const name = target?.full_name || target?.email || t('users.theUser');
  return (
    <KitSheet
      visible={!!target}
      onClose={onClose}
      dismissable={!removing}
      icon="trash"
      tone="danger"
      title={others > 0 ? t('users.removeFromCompanyQuestion', { v1: name }) : t('users.removeQuestion', { v1: name })}
      subtitle={
        others > 0
          ? t('users.removeSharedManagerWarning', { count: others })
          : admin
            ? t('users.removeManagerWarning')
            : t('users.removeDriverWarning')
      }
      footer={
        <SheetActions>
          <PrimaryAction label={t('common.keep')} tone="ghost" onPress={onClose} disabled={removing} style={styles.grow} />
          {others > 0 && (
            <PrimaryAction label={t('users.deleteFromAllCompanies', { count: others + 1 })} tone="ghost" onPress={() => onConfirm('all')} disabled={removing} style={styles.grow} />
          )}
          <PrimaryAction
            label={others > 0 ? t('users.removeFromCompany') : t('users.removePermanently')}
            tone="destructive"
            onPress={() => onConfirm(others > 0 ? 'company' : 'all')}
            loading={removing}
            style={styles.grow}
          />
        </SheetActions>
      }
    />
  );
}

// ── Sign-in details to pass on ───────────────────────────────────────────

export type Credentials = { title: string; subtitle: string; name: string; email: string; password: string; phone?: string | null };

// ממיר מספר נייד לפורמט של וואטסאפ
/** 050-1234567 → 972501234567 for a WhatsApp link, or null when it isn't an Israeli mobile. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;
  if (/^9725\d{8}$/.test(digits)) return digits;
  return null;
}

// פותח וואטסאפ עם הודעה
export function openWhatsapp(number: string, message: string) {
  void Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(message)}`).catch(() => {});
}

// שליחת פרטי כניסה: שיתוף או העתקה
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

// חלון פרטי הכניסה של מנהל חדש
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

// עיצוב החלונות
const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flex: 1 },
  stack: { gap: 18 },
  // שורת הכפתורים בתחתית
  footer: { gap: 10 },
  gap: { marginTop: 12 },
  list: { overflow: 'hidden' },
  pairRow: { flexDirection: 'row-reverse' },
  linkNote: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  // תיבת שגיאה
  errorBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: STATUS.expired.soft },
  linkChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: DK.accentSoft },
  sumRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, minHeight: 52 },
  sumValue: { flexShrink: 1, textAlign: textEnd() },
});
