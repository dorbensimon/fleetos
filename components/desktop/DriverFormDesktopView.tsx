import React from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatPhone } from '../../lib/phone';
import { DesktopDateField, DesktopFieldRow, DesktopInput, DesktopSelect, DesktopSelectOption, DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES } from './desktopTheme';

interface FormState {
  full_name: string;
  phone: string;
  email: string;
  password: string;
  national_id: string;
  employee_number: string;
  license_classes: string;
  license_classes_2: string;
  license_expiry: string;
  department_id: string | null;
  smsInvite: boolean;
  showPassword: boolean;
}

/**
 * Desktop body of the driver create/edit form: a dense two-column card
 * (label left of a bounded-width control) instead of the mobile glass
 * card stack. Purely presentational — DriverFormScreen owns state and
 * validation.
 */
export function DriverFormDesktopView({
  isEdit,
  form,
  set,
  errors,
  liveErrors,
  departments,
  licenseOptions,
  selectedLicenseLabel,
  canSubmit,
  saving,
  ctaLabel,
  remainingText,
  onSave,
}: {
  isEdit: boolean;
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  errors: Record<string, string>;
  liveErrors: Record<string, string>;
  departments: DesktopSelectOption<string>[];
  licenseOptions: { value: string; label: string; description: string }[];
  selectedLicenseLabel: string | null;
  canSubmit: boolean;
  saving: boolean;
  ctaLabel: string;
  remainingText: string;
  onSave: () => void;
}) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.heroRow}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={26} color={DESKTOP_COLORS.brand} />
        </View>
        <View style={styles.heroText}>
          <DText weight="bold" style={styles.heroName}>{form.full_name || 'נהג ללא שם'}</DText>
          <DText style={styles.heroSub}>
            {selectedLicenseLabel ? `דרגה ${selectedLicenseLabel}` : isEdit ? 'נהג קיים' : 'נהג חדש'}
          </DText>
        </View>
      </View>

      <Section title="פרטים אישיים">
        <DesktopFieldRow label="שם מלא" required error={errors.full_name}>
          <DesktopInput
            value={form.full_name}
            onChangeText={(v) => set('full_name', v)}
            placeholder="לדוגמה: דני לוי"
            hasError={!!errors.full_name}
          />
        </DesktopFieldRow>
        <DesktopFieldRow label="טלפון" required error={errors.phone}>
          <DesktopInput
            value={formatPhone(form.phone)}
            onChangeText={(v) => set('phone', v.replace(/\D/g, ''))}
            placeholder="052-7898655"
            keyboardType="phone-pad"
            ltr
            hasError={!!errors.phone}
          />
        </DesktopFieldRow>
        <DesktopFieldRow label="תעודת זהות" required error={errors.national_id}>
          <DesktopInput
            value={form.national_id}
            onChangeText={(v) => set('national_id', v.replace(/\D/g, '').slice(0, 9))}
            placeholder="9 ספרות"
            keyboardType="number-pad"
            maxLength={9}
            ltr
            hasError={!!errors.national_id}
          />
        </DesktopFieldRow>
        <DesktopFieldRow label="מספר עובד">
          <DesktopInput
            value={form.employee_number}
            onChangeText={(v) => set('employee_number', v)}
            placeholder="אופציונלי"
            ltr
          />
        </DesktopFieldRow>
        <DesktopFieldRow label="מחלקה" last>
          <DesktopSelect
            value={form.department_id}
            onChange={(v) => set('department_id', v)}
            options={departments}
            placeholder={departments.length ? 'בחר מחלקה' : 'לא הוגדרו מחלקות'}
            allowClear
          />
        </DesktopFieldRow>
      </Section>

      <Section title="רישיון נהיגה">
        <DesktopFieldRow label="דרגת רישיון" required error={errors.license_classes}>
          <DesktopSelect
            value={form.license_classes || null}
            onChange={(value) => {
              set('license_classes', value ?? '');
              if (!value || value === form.license_classes_2) set('license_classes_2', '');
            }}
            options={licenseOptions.map((o) => ({ value: o.value, label: o.label, description: o.description }))}
            placeholder="בחר דרגת רישיון"
            hasError={!!errors.license_classes}
          />
        </DesktopFieldRow>
        {!!form.license_classes && (
          <DesktopFieldRow label="דרגה נוספת">
            <DesktopSelect
              value={form.license_classes_2 || null}
              onChange={(value) => set('license_classes_2', value ?? '')}
              options={licenseOptions
                .filter((o) => o.value !== form.license_classes)
                .map((o) => ({ value: o.value, label: o.label, description: o.description }))}
              placeholder="אופציונלי"
              allowClear
            />
          </DesktopFieldRow>
        )}
        <DesktopFieldRow label="תוקף רישיון" required error={errors.license_expiry} last>
          <DesktopDateField
            value={form.license_expiry || null}
            onChange={(iso) => set('license_expiry', iso ?? '')}
            placeholder="לא נבחר תאריך"
            hasError={!!errors.license_expiry}
            allowClear={false}
          />
        </DesktopFieldRow>
      </Section>

      {isEdit ? (
        <Section title="גישה לאפליקציה">
          <DesktopFieldRow label="מייל" last>
            <DesktopInput value={form.email || 'לא נמצא מייל'} editable={false} ltr />
          </DesktopFieldRow>
        </Section>
      ) : (
        <Section title="גישה לאפליקציה">
          <DesktopFieldRow label="מייל" required error={errors.email}>
            <DesktopInput
              value={form.email}
              onChangeText={(v) => set('email', v)}
              placeholder="name@company.com"
              keyboardType="email-address"
              ltr
              hasError={!!errors.email}
            />
          </DesktopFieldRow>
          <DesktopFieldRow label="סיסמה" required error={errors.password}>
            <View style={styles.passwordRow}>
              <DesktopInput
                value={form.password}
                onChangeText={(v) => set('password', v)}
                placeholder="לפחות 4 ספרות"
                keyboardType="number-pad"
                secureTextEntry={!form.showPassword}
                ltr
                hasError={!!errors.password}
                style={styles.passwordInput}
              />
              <HoverPressable
                style={styles.passwordToggle}
                hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                onPress={() => set('showPassword', !form.showPassword)}
              >
                <DText weight="semiBold" style={styles.passwordToggleText}>
                  {form.showPassword ? 'הסתר' : 'הצג'}
                </DText>
              </HoverPressable>
            </View>
          </DesktopFieldRow>
          <DesktopFieldRow label="הזמנה ב-SMS" last>
            <View style={styles.smsRow}>
              <Switch
                value={form.smsInvite}
                onValueChange={(v) => set('smsInvite', v)}
                trackColor={{ false: DESKTOP_COLORS.borderInput, true: DESKTOP_TONES.ok.fg }}
                thumbColor={DESKTOP_COLORS.surface}
              />
              <DText style={styles.smsCaption}>הנהג יקבל קישור להורדת האפליקציה</DText>
            </View>
          </DesktopFieldRow>
        </Section>
      )}

      <View style={styles.footer}>
        <HoverPressable
          style={[styles.cta, !canSubmit && styles.ctaDisabled]}
          hoverStyle={canSubmit ? { backgroundColor: DESKTOP_COLORS.brandHover } : undefined}
          onPress={onSave}
          disabled={!canSubmit || saving}
        >
          <DText weight="bold" style={[styles.ctaText, !canSubmit && styles.ctaTextDisabled]}>
            {saving ? 'שומר…' : canSubmit ? ctaLabel : 'השלם את שדות החובה'}
          </DText>
        </HoverPressable>
        <DText style={styles.remainingText}>{remainingText}</DText>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <DText weight="bold" style={styles.sectionTitle}>{title}</DText>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' },
  heroRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, marginBottom: 22 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { gap: 2 },
  heroName: { fontSize: 17 },
  heroSub: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
  section: { marginBottom: 18, gap: 8 },
  sectionTitle: { fontSize: 12, letterSpacing: 0.4, color: DESKTOP_COLORS.inkMuted },
  card: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  passwordRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  passwordInput: { flex: 1 },
  passwordToggle: { height: 34, paddingHorizontal: 10, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  passwordToggleText: { fontSize: 12, color: DESKTOP_COLORS.brand },
  smsRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  smsCaption: { fontSize: 12, color: DESKTOP_COLORS.inkFaint, flex: 1 },
  footer: { alignItems: 'center', gap: 8, marginTop: 8 },
  cta: {
    height: 38,
    minWidth: 200,
    borderRadius: 7,
    backgroundColor: DESKTOP_COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  ctaDisabled: { backgroundColor: DESKTOP_COLORS.surfaceMuted, borderWidth: 1, borderColor: DESKTOP_COLORS.border },
  ctaText: { fontSize: 13, color: '#FFFFFF' },
  ctaTextDisabled: { color: DESKTOP_COLORS.inkFaint },
  remainingText: { fontSize: 12, color: DESKTOP_COLORS.inkFaint },
});
