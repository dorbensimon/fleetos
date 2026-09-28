import React from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, EditField, KitSection, KitSheet, ListRow, PrimaryAction, Pressy, SheetActions, STATUS, Surface } from '../driverKit';
import { formatPhone } from '../../lib/phone';
import { CompanyUser } from './types';

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
      title="סיסמה זמנית"
      trailing={
        <Pressy onPress={() => onChange(randomDigits(6))} accessibilityLabel="יצירת סיסמה אקראית" style={styles.linkChip} pressScale={0.95}>
          <Ionicons name="sparkles" size={14} color={DK.accent} />
          <DKText variant="micro" color={DK.accent}>
            יצירה אוטומטית
          </DKText>
        </Pressy>
      }
    >
      <EditField
        first
        label="סיסמה"
        required
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        autoComplete="off"
        ltr
        placeholder="לפחות 4 ספרות"
        error={error}
        hint="בכניסה הבאה יתבקש לבחור סיסמה קבועה משלו."
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
  const role = user?.role === 'admin' ? 'מנהל' : 'נהג';
  return (
    <KitSheet
      visible={!!user}
      onClose={onClose}
      title={user?.full_name || 'ללא שם'}
      subtitle={[role, user?.must_change_password ? 'עוד לא נכנס' : null].filter(Boolean).join(' · ')}
    >
      <Surface style={styles.list}>
        <ListRow first icon="mail-outline" title="מייל" value={user?.email || '—'} ltrValue />
        <ListRow icon="call-outline" title="טלפון" value={user?.phone ? formatPhone(user.phone) : '—'} ltrValue />
      </Surface>
      <Surface style={[styles.list, styles.gap]}>
        <ListRow first icon="create-outline" title="עריכת פרטים" subtitle="שם וטלפון" onPress={onEdit} />
        <ListRow icon="key-outline" title="סיסמה זמנית חדשה" subtitle="כשהוא לא מצליח להיכנס" onPress={onReset} />
      </Surface>
      <Surface style={[styles.list, styles.gap]}>
        <ListRow first icon="trash-outline" tint={STATUS.expired.fg} title={`הסרת ה${role}`} subtitle="מחיקה לצמיתות של המשתמש והגישה שלו" onPress={onRemove} />
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
      title="מנהל נוסף"
      subtitle={`יוכל לנהל את הצי של ${companyName}.`}
      footer={
        <View style={styles.footer}>
          <ErrorLine message={submitError} />
          <SheetActions>
            <PrimaryAction label="ביטול" tone="ghost" onPress={onClose} disabled={submitting} style={styles.grow} />
            <PrimaryAction label="הוספה" icon="checkmark" onPress={onSubmit} loading={submitting} style={styles.grow} />
          </SheetActions>
        </View>
      }
    >
      <View style={styles.stack}>
        <KitSection>
          <View style={styles.pairRow}>
            <View style={styles.flex}>
              <EditField first label="שם פרטי" required value={form.firstName} onChangeText={(v) => set('firstName', v)} error={fieldErrors.firstName} />
            </View>
            <View style={styles.flex}>
              <EditField first label="שם משפחה" required value={form.lastName} onChangeText={(v) => set('lastName', v)} error={fieldErrors.lastName} />
            </View>
          </View>
          <EditField
            label="מייל"
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
            label="טלפון נייד"
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
      title="עריכת פרטים"
      subtitle={target?.email ?? undefined}
      footer={
        <View style={styles.footer}>
          <ErrorLine message={submitError} />
          <SheetActions>
            <PrimaryAction label="ביטול" tone="ghost" onPress={onClose} disabled={submitting} style={styles.grow} />
            <PrimaryAction label="שמירה" icon="checkmark" onPress={onSubmit} loading={submitting} style={styles.grow} />
          </SheetActions>
        </View>
      }
    >
      <KitSection>
        <View style={styles.pairRow}>
          <View style={styles.flex}>
            <EditField first label="שם פרטי" required value={form.firstName} onChangeText={(v) => onChangeForm((f) => ({ ...f, firstName: v }))} error={fieldErrors.firstName} />
          </View>
          <View style={styles.flex}>
            <EditField first label="שם משפחה" required value={form.lastName} onChangeText={(v) => onChangeForm((f) => ({ ...f, lastName: v }))} error={fieldErrors.lastName} />
          </View>
        </View>
        <EditField
          label="טלפון נייד"
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
      title="סיסמה זמנית חדשה"
      subtitle={`ל${target?.full_name || target?.email || 'משתמש'}. הסיסמה הקודמת תפסיק לעבוד מיד.`}
      footer={
        <View style={styles.footer}>
          <ErrorLine message={submitError} />
          <SheetActions>
            <PrimaryAction label="ביטול" tone="ghost" onPress={onClose} disabled={submitting} style={styles.grow} />
            <PrimaryAction label="קביעת הסיסמה" icon="checkmark" onPress={onSubmit} loading={submitting} style={styles.grow} />
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
      title={`להסיר את ${target?.full_name || target?.email || 'המשתמש'}?`}
      subtitle={
        admin
          ? 'המנהל יימחק לצמיתות ולא יוכל להיכנס. הנהגים והרכבים של החברה נשארים.'
          : 'הנהג יימחק לצמיתות, יחד עם הגישה שלו למערכת. אי אפשר לשחזר.'
      }
      footer={
        <SheetActions>
          <PrimaryAction label="השארה" tone="ghost" onPress={onClose} disabled={removing} style={styles.grow} />
          <PrimaryAction label="הסרה לצמיתות" tone="destructive" onPress={onConfirm} loading={removing} style={styles.grow} />
        </SheetActions>
      }
    />
  );
}

// ── Sign-in details to pass on ───────────────────────────────────────────

export type Credentials = { title: string; subtitle: string; name: string; email: string; password: string };

export function CredentialsSheet({ details, onClose }: { details: Credentials | null; onClose: () => void }) {
  const message = details
    ? `שלום ${details.name},\nפרטי הכניסה שלך ל-icar:\nמייל: ${details.email}\nסיסמה זמנית: ${details.password}\nבכניסה תתבקש לבחור סיסמה קבועה.\nhttps://icar-app.com`
    : '';
  return (
    <KitSheet
      visible={!!details}
      onClose={onClose}
      icon="checkmark-circle"
      title={details?.title ?? ''}
      subtitle={details?.subtitle}
      footer={
        <SheetActions>
          <PrimaryAction label="סגירה" tone="ghost" onPress={onClose} style={styles.grow} />
          <PrimaryAction label="שליחת הפרטים" icon="share-outline" onPress={() => void Share.share({ message }).catch(() => {})} style={styles.grow} />
        </SheetActions>
      }
    >
      {!!details && (
        <KitSection>
          <View style={styles.sumRow}>
            <DKText variant="caption" color={DK.muted}>
              מייל לכניסה
            </DKText>
            <DKText variant="label" ltr selectable style={styles.sumValue}>
              {details.email}
            </DKText>
          </View>
          <View style={[styles.sumRow, styles.divider]}>
            <DKText variant="caption" color={DK.muted}>
              סיסמה זמנית
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
  sumValue: { flexShrink: 1, textAlign: 'left' },
});
