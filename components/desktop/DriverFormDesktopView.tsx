import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatPhone } from '../../lib/phone';
import { formatDate } from '../../lib/theme';
import { getRequiredDriverFields, type DriverFormField } from '../../lib/driverFormValidation';
import { DesktopDateField, DesktopInput, DesktopSelect, DesktopSelectOption, DLtrText, DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, webOnly } from './desktopTheme';
import { ChoiceTiles, CreateDock, FormCell, FormPanel, FormSection, GhostBar, LiveCard, RecordFormPage, RecordHero, useSectionJump, type FormStep } from './form/RecordFormKit';
import { ConsentCheck } from '../legal/ConsentCheck';
import { DRIVER_DATA_NOTICE } from '../../lib/legal/documents';

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
  dataNotice: boolean;
  showPassword: boolean;
}

type StepKey = 'personal' | 'license' | 'access';

const FIELD_META: Record<DriverFormField, { label: string; step: StepKey }> = {
  full_name: { label: 'שם מלא', step: 'personal' },
  phone: { label: 'טלפון', step: 'personal' },
  national_id: { label: 'תעודת זהות', step: 'personal' },
  license_classes: { label: 'דרגת רישיון', step: 'license' },
  license_expiry: { label: 'תוקף רישיון', step: 'license' },
  email: { label: 'מייל', step: 'access' },
  password: { label: 'סיסמה', step: 'access' },
};

/** Up to this many license classes show as tiles; the full legacy list stays a dropdown. */
const MAX_LICENSE_TILES = 8;

/**
 * Desktop body of the driver create/edit form, in the shared record-form
 * design (form/RecordFormKit): the driver's card builds itself in the hero
 * while the three numbered steps are filled, and the dock always says what
 * is left. Purely presentational — DriverFormScreen owns state and validation.
 */
export function DriverFormDesktopView({
  isEdit,
  form,
  set,
  errors,
  departments,
  licenseOptions,
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
  const { scrollRef, track, jump } = useSectionJump<StepKey>();
  const required = getRequiredDriverFields(isEdit);
  const isRequired = (f: DriverFormField) => required.includes(f);
  const isFilled = (f: DriverFormField) => form[f].trim().length > 0;
  const filled = required.filter(isFilled).length;

  const stepOf = (key: StepKey, label: string): FormStep<StepKey> => {
    const fields = required.filter((f) => FIELD_META[f].step === key);
    return { key, label, total: fields.length, filled: fields.filter(isFilled).length };
  };
  const steps = [stepOf('personal', 'פרטים אישיים'), stepOf('license', 'רישיון נהיגה'), stepOf('access', 'גישה לאפליקציה')];
  const stepDone = (i: number) => steps[i].total > 0 && steps[i].filled === steps[i].total;

  const missing = required
    .filter((f) => !isFilled(f))
    .map((f) => ({ label: FIELD_META[f].label, onPress: () => jump(FIELD_META[f].step) }));
  if (!isEdit && !form.dataNotice) missing.push({ label: 'אישור יידוע הנהג', onPress: () => jump('access') });

  const secondOptions = licenseOptions.filter((o) => o.value !== form.license_classes);

  return (
    <RecordFormPage
      scrollRef={scrollRef}
      dock={
        <CreateDock
          total={required.length}
          filled={filled}
          missing={missing}
          canSubmit={canSubmit}
          saving={saving}
          ctaLabel={ctaLabel}
          ctaIcon={isEdit ? 'checkmark-circle' : 'person-add'}
          readyText={remainingText}
          onSave={onSave}
        />
      }
    >
      <RecordHero
        icon="person"
        eyebrow={isEdit ? 'עריכת נהג' : 'נהג חדש'}
        title={isEdit ? form.full_name.trim() || 'פרטי הנהג' : 'בואו נוסיף נהג לצי'}
        subtitle={
          isEdit
            ? 'כל שינוי כאן נשמר בתיק הנהג ומתעדכן גם באפליקציה שלו.'
            : 'שלושה שלבים קצרים. כרטיס הנהג משמאל מתמלא תוך כדי — ובסוף הנהג מקבל גישה לאפליקציה.'
        }
        steps={steps}
        onJump={jump}
        card={<DriverCard form={form} />}
      />

      <FormSection index={0} title="פרטים אישיים" hint="מי הנהג ואיך משיגים אותו." done={stepDone(0)} onLayout={track('personal')}>
        <FormPanel>
          <FormCell label="שם מלא" required={isRequired('full_name')} error={errors.full_name}>
            <DesktopInput
              large
              value={form.full_name}
              onChangeText={(v) => set('full_name', v)}
              placeholder="לדוגמה: דני לוי"
              hasError={!!errors.full_name}
            />
          </FormCell>
          <FormCell label="טלפון נייד" required={isRequired('phone')} error={errors.phone}>
            <DesktopInput
              large
              value={formatPhone(form.phone)}
              onChangeText={(v) => set('phone', v.replace(/\D/g, ''))}
              placeholder="052-7898655"
              keyboardType="phone-pad"
              ltr
              hasError={!!errors.phone}
            />
          </FormCell>
          <FormCell label="תעודת זהות" required={isRequired('national_id')} error={errors.national_id} hint="9 ספרות, כולל ספרת ביקורת">
            <DesktopInput
              large
              value={form.national_id}
              onChangeText={(v) => set('national_id', v.replace(/\D/g, '').slice(0, 9))}
              placeholder="000000000"
              keyboardType="number-pad"
              maxLength={9}
              ltr
              hasError={!!errors.national_id}
            />
          </FormCell>
          <FormCell label="מספר עובד">
            <DesktopInput
              large
              value={form.employee_number}
              onChangeText={(v) => set('employee_number', v)}
              placeholder="לא חובה"
              ltr
            />
          </FormCell>
          <FormCell label="מחלקה">
            <DesktopSelect
              large
              value={form.department_id}
              onChange={(v) => set('department_id', v)}
              options={departments}
              placeholder={departments.length ? 'בחירת מחלקה' : 'לא הוגדרו מחלקות'}
              allowClear
            />
          </FormCell>
        </FormPanel>
      </FormSection>

      <FormSection
        index={1}
        title="רישיון נהיגה"
        hint="הדרגה והתוקף. נזכיר לכם לפני שהרישיון פג."
        done={stepDone(1)}
        onLayout={track('license')}
      >
        <FormPanel>
          <FormCell label="דרגת רישיון" required={isRequired('license_classes')} error={errors.license_classes}>
            {licenseOptions.length <= MAX_LICENSE_TILES ? (
              <ChoiceTiles
                label="דרגת רישיון"
                value={form.license_classes || null}
                options={licenseOptions}
                hasError={!!errors.license_classes}
                onChange={(value) => {
                  set('license_classes', value);
                  if (value === form.license_classes_2) set('license_classes_2', '');
                }}
              />
            ) : (
              <DesktopSelect
                large
                value={form.license_classes || null}
                onChange={(value) => {
                  set('license_classes', value ?? '');
                  if (!value || value === form.license_classes_2) set('license_classes_2', '');
                }}
                options={licenseOptions}
                placeholder="בחירת דרגת רישיון"
                hasError={!!errors.license_classes}
              />
            )}
          </FormCell>
          {!!form.license_classes && (
            <FormCell label="דרגה נוספת" hint="רק אם לנהג יש עוד דרגה ברישיון">
              <DesktopSelect
                large
                value={form.license_classes_2 || null}
                onChange={(value) => set('license_classes_2', value ?? '')}
                options={secondOptions}
                placeholder="אין דרגה נוספת"
                allowClear
              />
            </FormCell>
          )}
          <FormCell label="תוקף רישיון" required={isRequired('license_expiry')} error={errors.license_expiry}>
            <DesktopDateField
              large
              value={form.license_expiry || null}
              onChange={(iso) => set('license_expiry', iso ?? '')}
              placeholder="בחירת תאריך"
              hasError={!!errors.license_expiry}
              allowClear={false}
            />
          </FormCell>
        </FormPanel>
      </FormSection>

      <FormSection
        index={2}
        title="גישה לאפליקציה"
        hint={isEdit ? 'המייל שאיתו הנהג נכנס לאפליקציה.' : 'עם המייל והסיסמה האלה הנהג נכנס לאפליקציה בטלפון.'}
        done={isEdit || stepDone(2)}
        onLayout={track('access')}
      >
        <FormPanel>
          {isEdit ? (
            <FormCell label="מייל" hint="את המייל אי אפשר לשנות מכאן">
              <DesktopInput large value={form.email || 'לא נמצא מייל'} editable={false} ltr />
            </FormCell>
          ) : (
            <>
              <FormCell label="מייל" required error={errors.email}>
                <DesktopInput
                  large
                  value={form.email}
                  onChangeText={(v) => set('email', v)}
                  placeholder="name@company.com"
                  keyboardType="email-address"
                  ltr
                  hasError={!!errors.email}
                />
              </FormCell>
              <FormCell label="סיסמה ראשונה" required error={errors.password} hint="הנהג יתבקש להחליף אותה בכניסה הראשונה">
                <View style={styles.passwordRow}>
                  <DesktopInput
                    large
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
                    hoverStyle={styles.passwordToggleHover}
                    onPress={() => set('showPassword', !form.showPassword)}
                    accessibilityLabel={form.showPassword ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'}
                  >
                    <Ionicons name={form.showPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={DESKTOP_COLORS.brand} />
                    <DText weight="semiBold" style={styles.passwordToggleText}>
                      {form.showPassword ? 'הסתרה' : 'הצגה'}
                    </DText>
                  </HoverPressable>
                </View>
              </FormCell>
              <ConsentCheck value={form.dataNotice} onChange={(v) => set('dataNotice', v)} label={DRIVER_DATA_NOTICE} />
            </>
          )}
        </FormPanel>
      </FormSection>
    </RecordFormPage>
  );
}

/** The driver as a card, filling in while the form is typed. Empty values show as soft placeholder bars. */
function DriverCard({ form }: { form: FormState }) {
  const name = form.full_name.trim();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('');
  const classes = [form.license_classes, form.license_classes_2].filter(Boolean);

  return (
    <LiveCard label={name ? `כרטיס הנהג ${name}` : 'כרטיס נהג חדש'}>
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardBrand}>
            <View style={styles.cardBrandDot} />
            <DText weight="bold" style={styles.cardBrandText}>כרטיס נהג</DText>
          </View>
          <View style={styles.cardClasses}>
            {classes.length ? (
              classes.map((c) => (
                <View key={c} style={styles.classBadge}>
                  <DLtrText weight="extraBold" style={styles.classBadgeText}>{c}</DLtrText>
                </View>
              ))
            ) : (
              <View style={[styles.classBadge, styles.classBadgeEmpty]}>
                <DText weight="bold" style={styles.classBadgeEmptyText}>?</DText>
              </View>
            )}
          </View>
        </View>

        <View style={styles.cardMid}>
          <View style={styles.photo}>
            {initials ? (
              <DText weight="extraBold" style={styles.photoText}>{initials}</DText>
            ) : (
              <Ionicons name="person" size={30} color="rgba(255,255,255,0.9)" />
            )}
          </View>
          <View style={styles.cardLines}>
            {name ? (
              <DText weight="extraBold" style={styles.cardName} numberOfLines={1}>{name}</DText>
            ) : (
              <GhostBar width={150} dark />
            )}
            {form.national_id ? (
              <DLtrText weight="semiBold" style={[styles.cardValue, styles.tabular]}>{form.national_id}</DLtrText>
            ) : (
              <GhostBar width={96} />
            )}
            {form.phone ? (
              <DLtrText weight="medium" style={[styles.cardValueMuted, styles.tabular]}>{formatPhone(form.phone)}</DLtrText>
            ) : (
              <GhostBar width={110} />
            )}
          </View>
        </View>

        <View style={styles.cardFoot}>
          <DText style={styles.cardFootLabel}>תוקף רישיון</DText>
          {form.license_expiry ? (
            <DLtrText weight="bold" style={[styles.cardFootValue, styles.tabular]}>{formatDate(form.license_expiry)}</DLtrText>
          ) : (
            <GhostBar width={80} />
          )}
        </View>
      </View>
    </LiveCard>
  );
}

const styles = StyleSheet.create({
  tabular: webOnly({ fontVariantNumeric: 'tabular-nums' }),
  passwordRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  passwordInput: { flex: 1 },
  passwordToggle: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E6F4FB',
    ...webOnly({ transition: 'background-color 150ms ease' }),
  },
  passwordToggleHover: { backgroundColor: '#D6EDF9' },
  passwordToggleText: { fontSize: 15, color: DESKTOP_COLORS.brand },

  // Driver card
  card: { flex: 1, padding: 18, justifyContent: 'space-between' },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  cardBrand: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  cardBrandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: DESKTOP_COLORS.brand,
    ...webOnly({ boxShadow: '0 0 0 3px rgba(0,136,204,0.18)' }),
  },
  cardBrandText: { fontSize: 13, letterSpacing: 0.4, color: DESKTOP_COLORS.inkMuted },
  cardClasses: { flexDirection: 'row', gap: 5 },
  classBadge: {
    minWidth: 30,
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: DESKTOP_COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  classBadgeText: { fontSize: 13.5, color: '#FFFFFF' },
  classBadgeEmpty: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(22,34,46,0.2)' },
  classBadgeEmptyText: { fontSize: 13, color: DESKTOP_COLORS.inkFaint },
  cardMid: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  photo: {
    width: 68,
    height: 80,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DESKTOP_COLORS.brand,
    ...webOnly({
      backgroundImage: 'linear-gradient(160deg, #5FC1F0 0%, #0075B3 60%, #0070A8 100%)',
      boxShadow: '0 6px 14px -6px rgba(0,136,204,0.6)',
    }),
  },
  photoText: { fontSize: 26, color: '#FFFFFF', letterSpacing: -0.5 },
  cardLines: { flex: 1, minWidth: 0, gap: 9 },
  cardName: { fontSize: 20, lineHeight: 24, letterSpacing: -0.4, color: DESKTOP_COLORS.ink },
  cardValue: { fontSize: 15, color: DESKTOP_COLORS.ink, letterSpacing: 1 },
  cardValueMuted: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  cardFoot: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(22,34,46,0.08)',
  },
  cardFootLabel: { fontSize: 13, color: DESKTOP_COLORS.inkFaint },
  cardFootValue: { fontSize: 14.5, color: DESKTOP_COLORS.ink },
});
