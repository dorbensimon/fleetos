import React, { useCallback, useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, View, TextInput, Switch, Animated } from 'react-native';
import { BrandLoader } from '../../components/ui/BrandLoader';
import { showAlert } from '../../lib/platformAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { ADMIN_BACKGROUND_COLORS, ADMIN_BACKGROUND_LOCATIONS } from '../../components/admin/AdminGradientBackground';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, BackButton, LoadingState, useToast } from '../../components/ui';
import { formScreenStyles } from '../../components/admin/formScreenStyles';
import { FormFieldRow } from '../../components/ui/FormFieldRow';
import { Select } from '../../components/ui/Select';
import { COLORS, CONTENT_MAX_WIDTH, SPACING, ACCENT_SHADOW, FONT, FONT_SIZE, BRAND } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { getDriver, updateDriver, createDriverAccount, listDepartments, getUserEmail, type Department } from '../../lib/adminApi';
import { formatPhone } from '../../lib/phone';
import { RootStackParamList } from '../../navigation/types';
import { departmentOptions, driverEditableFieldsFromRow, isStaleDepartmentError, LICENSE_CLASS_OPTIONS } from '../../lib/driverFields';
import {
  countFilledRequiredDriverFields,
  dateOnlyIsoFromLocalDate,
  formatDateDots,
  getRequiredDriverFields,
  validateDriverForm,
} from '../../lib/driverFormValidation';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DriverFormDesktopView } from '../../components/desktop/DriverFormDesktopView';
import { BrandSymbol } from '../../components/ui/Brand';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverForm'>;
type FieldKey = keyof FormState;

const NEW_DRIVER_LICENSE_OPTIONS = [
  { value: 'B', label: 'B', description: 'רכב פרטי' },
  { value: 'C1', label: 'C1', description: 'משא עד 12 טון' },
  { value: 'C', label: 'C', description: 'משא כבד' },
  { value: 'D', label: 'D', description: 'אוטובוס' },
  { value: 'E', label: 'E', description: 'נגרר' },
  { value: 'A', label: 'A', description: 'דו-גלגלי' },
  { value: '1', label: '1', description: 'טרקטור' },
] as const;

const CREATE_HEADER_HEIGHT = 128;

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

const EMPTY: FormState = {
  full_name: '',
  phone: '',
  email: '',
  password: '',
  national_id: '',
  employee_number: '',
  license_classes: '',
  license_classes_2: '',
  license_expiry: '',
  department_id: null,
  smsInvite: true,
  showPassword: false,
};

export default function DriverFormScreen({ route, navigation }: Props) {
  const driverId = route.params?.driverId;
  const isEdit = !!driverId;
  const { companyId, profile } = useCompany();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [draftLicenseExpiry, setDraftLicenseExpiry] = useState<Date | null>(null);
  const [focusedField, setFocusedField] = useState<FieldKey | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const load = useCallback(async () => {
    if (companyId) {
      const deps = await listDepartments(companyId);
      setDepartments(departmentOptions(deps as Department[]));
    }
    if (driverId) {
      const emailPromise = profile?.id === driverId
        ? supabase.auth.getUser().then(({ data }) => data.user?.email ?? null)
        : companyId
          ? getUserEmail(driverId, companyId)
          : Promise.resolve(null);
      const [d, email] = await Promise.all([
        getDriver(driverId),
        emailPromise,
      ]);
      if (d) {
        const editable = driverEditableFieldsFromRow(d);
        setForm({
          full_name: d.full_name ?? '',
          phone: editable.phone,
          email: email ?? '',
          password: '',
          national_id: editable.national_id,
          employee_number: editable.employee_number,
          license_classes: editable.license_classes,
          license_classes_2: editable.license_classes_2,
          license_expiry: editable.license_expiry,
          department_id: editable.department_id,
          smsInvite: true,
          showPassword: false,
        });
      }
    }
  }, [driverId, companyId, profile]);

  // Unlike `load`, this never touches `form` — safe to call after a failed
  // save without wiping the user's unsaved edits.
  const refreshDepartments = useCallback(async () => {
    if (!companyId) return;
    const deps = await listDepartments(companyId);
    setDepartments(departmentOptions(deps as Department[]));
  }, [companyId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const save = async () => {
    const e = validateDriverForm(form, isEdit);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      showAlert('לא ניתן לשמור', 'יש לתקן את השדות המסומנים באדום ולנסות שוב.');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await updateDriver(driverId!, {
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          national_id: form.national_id.trim(),
          employee_number: form.employee_number.trim(),
          license_classes: [form.license_classes, form.license_classes_2].filter(Boolean).join(', '),
          license_expiry: form.license_expiry.trim(),
          department_id: form.department_id,
        });
      } else {
        let activeCompanyId = companyId;
        if (!activeCompanyId) {
          const { data: auth } = await supabase.auth.getUser();
          if (auth.user) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('company_id')
              .eq('id', auth.user.id)
              .single();
            activeCompanyId = prof?.company_id ?? null;
          }
        }
        if (!activeCompanyId) {
          showAlert('שמירה נכשלה', 'לא נמצאה חברה משויכת לחשבון שלך. נסה להתחבר מחדש');
          return;
        }
        const result = await createDriverAccount({
          companyId: activeCompanyId,
          email: form.email.trim(),
          password: form.password,
          fullName: form.full_name.trim(),
          phone: form.phone.trim(),
          details: {
            national_id: form.national_id.trim(),
            employee_number: form.employee_number.trim(),
            license_classes: [form.license_classes, form.license_classes_2].filter(Boolean).join(', '),
            license_expiry: form.license_expiry.trim(),
            department_id: form.department_id,
          },
        });
        if (!result.ok) {
          if (isStaleDepartmentError(result.error)) {
            setForm((current) => ({ ...current, department_id: null }));
            void refreshDepartments().catch(() => {});
            showAlert('שמירה נכשלה', 'המחלקה שנבחרה נמחקה בינתיים. בחר מחלקה אחרת ונסה שוב.');
            return;
          }
          showAlert('יצירת הנהג נכשלה', result.error);
          return;
        }
      }
      showToast(isEdit ? 'השינויים נשמרו' : 'הנהג נוצר בהצלחה');
      if (!isEdit) navigation.goBack();
    } catch (err: any) {
      const message = String(err?.message ?? '');
      if (isStaleDepartmentError(message)) {
        setForm((current) => ({ ...current, department_id: null }));
        void refreshDepartments().catch(() => {});
        showAlert('שמירה נכשלה', 'המחלקה שנבחרה נמחקה בינתיים. בחר מחלקה אחרת ונסה שוב.');
        return;
      }
      showAlert('שמירה נכשלה', message || 'נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  const openDatePicker = () => {
    setDraftLicenseExpiry(form.license_expiry ? new Date(form.license_expiry) : new Date());
    setShowDatePicker(true);
  };

  const handleDateChange = (_: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (selectedDate) {
        const iso = dateOnlyIsoFromLocalDate(selectedDate);
        set('license_expiry', iso);
      }
      return;
    }

    if (selectedDate) {
      setDraftLicenseExpiry(selectedDate);
    }
  };

  const confirmDatePicker = () => {
    const selectedDate = draftLicenseExpiry ?? new Date();
    set('license_expiry', dateOnlyIsoFromLocalDate(selectedDate));
    setShowDatePicker(false);
  };

  if (loading) {
    if (isDesktop) {
      return (
        <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'נהגים', driverId ? 'עריכת נהג' : 'נהג חדש']}>
          <LoadingState />
        </DesktopShell>
      );
    }
    return (
      <LinearGradient colors={ADMIN_BACKGROUND_COLORS} locations={ADMIN_BACKGROUND_LOCATIONS} style={styles.screen}>
        <LoadingState />
      </LinearGradient>
    );
  }

  const requiredFields = getRequiredDriverFields(isEdit);
  const filledCount = countFilledRequiredDriverFields(form, isEdit);
  const progress = filledCount / requiredFields.length;
  const remainingCount = requiredFields.length - filledCount;

  const canSubmit = filledCount === requiredFields.length;
  const liveErrors = validateDriverForm(form, isEdit);
  const screenTitle = isEdit ? 'עריכת נהג' : 'נהג חדש';
  const isDriverSelfEdit = isEdit && profile?.role === 'driver';
  const displayTitle = isDriverSelfEdit ? 'הפרטים שלי' : screenTitle;
  // An existing driver's page must never be presented as a new-driver flow.
  const backLabel = isEdit || isDriverSelfEdit ? 'חזור' : 'נהגים';
  const ctaLabel = isEdit ? 'שמור שינויים' : 'צור נהג';
  const selectedLicense =
    NEW_DRIVER_LICENSE_OPTIONS.find((option) => option.value === form.license_classes) ??
    LICENSE_CLASS_OPTIONS.map((option) => {
      const [label, description = ''] = option.label.split(' — ');
      return { value: option.value, label, description };
    }).find((option) => option.value === form.license_classes);
  const licenseOptions = isEdit
    ? LICENSE_CLASS_OPTIONS.map((option) => {
        const [label, description = ''] = option.label.split(' — ');
        return { value: option.value, label, description };
      })
    : [...NEW_DRIVER_LICENSE_OPTIONS];

  const remainingText = canSubmit
    ? (isEdit ? 'השינויים יישמרו בפרטי הנהג' : 'הנהג יתווסף לצי ויקבל הרשאות מיד')
    : remainingCount === 1
      ? 'נותר שדה חובה אחד'
      : `נותרו ${remainingCount} שדות חובה`;

  if (isDesktop) {
    return (
      <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'נהגים', displayTitle]}>
        <DriverFormDesktopView
          isEdit={isEdit}
          form={form}
          set={set}
          errors={errors}
          liveErrors={liveErrors}
          departments={departments}
          licenseOptions={licenseOptions as { value: string; label: string; description: string }[]}
          selectedLicenseLabel={selectedLicense?.label ?? null}
          canSubmit={canSubmit}
          saving={saving}
          ctaLabel={ctaLabel}
          remainingText={remainingText}
          onSave={() => void save()}
        />
      </DesktopShell>
    );
  }

  return (
    <View style={styles.screen}>
      <LinearGradient colors={ADMIN_BACKGROUND_COLORS} locations={ADMIN_BACKGROUND_LOCATIONS} style={styles.halo} />
      {/* Header דביק */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.headerTop}>
          <BackButton
            onPress={() => navigation.goBack()}
            accessibilityLabel={backLabel === 'חזור' ? 'חזור' : 'חזרה לנהגים'}
          />
          <AppText weight="bold" style={styles.headerTitle}>{displayTitle}</AppText>
          {/* Balances the back action so the title stays visually centered. */}
          <View style={styles.headerSideSpacer}>
            <BrandSymbol size={22} />
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressRow}>
          <AppText style={styles.progressCounter}>{filledCount}/{requiredFields.length}</AppText>
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={BRAND.heroGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${progress * 100}%` }]}
            />
          </View>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingTop: CREATE_HEADER_HEIGHT + SPACING.lg, paddingBottom: insets.bottom + SPACING.xl },
          ]}
          keyboardShouldPersistTaps="handled"
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
        >
          {/* כרטיס זהות */}
          <View style={styles.heroCard}>
            <View style={styles.avatar}>
              <LinearGradient colors={BRAND.heroGradient} style={styles.avatarGradient}>
                <Ionicons name="person" size={38} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.avatarBadge}>
                <Ionicons name="add" size={16} color={COLORS.accent} />
              </View>
            </View>
            <View style={styles.heroText}>
              <AppText weight="bold" style={styles.heroName}>
                {form.full_name || 'נהג ללא שם'}
              </AppText>
              <View style={styles.heroBadges}>
                <View style={styles.glassBadge}>
                  <AppText weight="bold" style={styles.glassBadgeText}>
                    {selectedLicense
                      ? `דרגה ${selectedLicense.label}`
                      : isEdit
                        ? 'נהג קיים'
                        : 'נהג חדש'}
                  </AppText>
                </View>
                <AppText style={styles.heroCaption}>הוסף תמונה</AppText>
              </View>
            </View>
          </View>

          {/* פרטים אישיים */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionDot} />
              <AppText weight="bold" style={styles.sectionTitle}>פרטים אישיים</AppText>
            </View>
            <View style={styles.card}>
              <FormRow
                fieldKey="full_name"
                focusedField={focusedField}
                setFocusedField={setFocusedField}
                label="שם מלא *"
                value={form.full_name}
                onChangeText={(v) => set('full_name', v)}
                error={errors.full_name}
                valid={!!form.full_name.trim() && !liveErrors.full_name}
                placeholder="לדוגמה: דני לוי"
                accessibilityLabel="שם מלא"
              />
              <FormRow
                fieldKey="phone"
                focusedField={focusedField}
                setFocusedField={setFocusedField}
                label="טלפון *"
                value={formatPhone(form.phone)}
                onChangeText={(v) => set('phone', v.replace(/\D/g, ''))}
                error={errors.phone}
                valid={!!form.phone.trim() && !liveErrors.phone}
                placeholder="052-7898655"
                keyboardType="phone-pad"
                ltr
                accessibilityLabel="טלפון"
              />
              <FormRow
                fieldKey="national_id"
                focusedField={focusedField}
                setFocusedField={setFocusedField}
                label="תעודת זהות *"
                value={form.national_id}
                onChangeText={(v) => set('national_id', v.replace(/\D/g, '').slice(0, 9))}
                error={errors.national_id}
                valid={!!form.national_id.trim() && !liveErrors.national_id}
                placeholder="9 ספרות"
                keyboardType="number-pad"
                maxLength={9}
                ltr
                accessibilityLabel="תעודת זהות"
              />
              <FormRow
                fieldKey="employee_number"
                focusedField={focusedField}
                setFocusedField={setFocusedField}
                label="מספר עובד"
                value={form.employee_number}
                onChangeText={(v) => set('employee_number', v)}
                valid={!!form.employee_number.trim()}
                placeholder="אופציונלי"
                ltr
                accessibilityLabel="מספר עובד"
              />
              <View style={[styles.row, styles.rowLast]}>
                <View style={styles.focusRail} />
                <AppText style={styles.label}>מחלקה</AppText>
                <View style={styles.rowValue}>
                  <View style={{ flex: 1 }}>
                    <Select
                      value={form.department_id}
                      onChange={(v) => set('department_id', v)}
                      options={departments}
                      placeholder={departments.length ? 'בחר מחלקה' : 'לא הוגדרו מחלקות'}
                      allowClear
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* רישיון נהיגה */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionDot} />
              <AppText weight="bold" style={styles.sectionTitle}>רישיון נהיגה</AppText>
            </View>
            <View style={styles.licenseCardOuter}>
              <View style={styles.licenseHeader}>
                <AppText weight="bold" style={styles.rowLabel}>דרגת רישיון *</AppText>
                <AppText weight="bold" style={styles.licenseHeaderDesc}>
                  {selectedLicense?.description || 'בחר דרגה'}
                </AppText>
              </View>

              <Select
                value={form.license_classes || null}
                onChange={(value) => {
                  set('license_classes', value ?? '');
                  if (!value || value === form.license_classes_2) set('license_classes_2', '');
                }}
                options={licenseOptions.map((option) => ({ value: option.value, label: `${option.label}${option.description ? ` — ${option.description}` : ''}` }))}
                placeholder="בחר דרגת רישיון"
                hasError={!!errors.license_classes}
              />
              {errors.license_classes && <AppText style={styles.error}>{errors.license_classes}</AppText>}

              {form.license_classes && (
                <>
                  <AppText weight="bold" style={[styles.rowLabel, { marginTop: 18, marginBottom: 8 }]}>דרגת רישיון נוספת <AppText style={styles.optionalText}>(אופציונלי)</AppText></AppText>
                  <Select
                    value={form.license_classes_2 || null}
                    onChange={(value) => set('license_classes_2', value ?? '')}
                    options={licenseOptions
                      .filter((option) => option.value !== form.license_classes)
                      .map((option) => ({ value: option.value, label: `${option.label}${option.description ? ` — ${option.description}` : ''}` }))}
                    placeholder="בחר דרגה נוספת (אם יש)"
                    allowClear
                  />
                </>
              )}

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.row}
                onPress={openDatePicker}
                accessibilityRole="button"
                accessibilityLabel="בחירת תוקף רישיון"
              >
                <View style={styles.focusRail} />
                <AppText style={styles.label}>תוקף רישיון *</AppText>
                <View style={styles.rowValue}>
                  <AppText style={[styles.value, !form.license_expiry && { color: COLORS.textFaint }]}>
                    {formatDateDots(form.license_expiry) || 'לא נבחר תאריך'}
                  </AppText>
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={openDatePicker}
                    accessibilityRole="button"
                    accessibilityLabel="בחר תאריך"
                  >
                    <AppText style={styles.dateButtonText}>בחר תאריך</AppText>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
              {errors.license_expiry && <AppText style={styles.error}>{errors.license_expiry}</AppText>}

              {form.license_expiry && (
                <View style={styles.warningBox}>
                  <Ionicons name="alert-circle-outline" size={14} color={COLORS.warnText} />
                  <AppText style={styles.warningText}>
                    נשלח תזכורת אוטומטית 30 יום לפני פקיעת התוקף.
                  </AppText>
                </View>
              )}
            </View>
          </View>

          {isEdit && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionDot} />
                <AppText weight="bold" style={styles.sectionTitle}>גישה לאפליקציה</AppText>
              </View>
              <View style={styles.card}>
                <View style={[styles.row, styles.rowLast]}>
                  <View style={styles.focusRail} />
                  <AppText style={styles.label}>מייל</AppText>
                  <AppText style={[styles.value, styles.readOnlyEmail]} numberOfLines={1}>
                    {form.email || 'לא נמצא מייל'}
                  </AppText>
                  <Ionicons name="lock-closed-outline" size={15} color={COLORS.textFaint} />
                </View>
                <AppText style={styles.readOnlyHint}>המייל משמש להתחברות ולא ניתן לשינוי ממסך זה.</AppText>
              </View>
            </View>
          )}

          {!isEdit && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionDot} />
                <AppText weight="bold" style={styles.sectionTitle}>גישה לאפליקציה</AppText>
              </View>
              <View style={styles.card}>
                <FormRow
                  fieldKey="email"
                  focusedField={focusedField}
                  setFocusedField={setFocusedField}
                  label="מייל *"
                  value={form.email}
                  onChangeText={(v) => set('email', v)}
                  error={errors.email}
                  valid={!!form.email.trim() && !liveErrors.email}
                  placeholder="name@company.com"
                  keyboardType="email-address"
                  ltr
                  accessibilityLabel="מייל"
                />
                <View style={[styles.row, styles.rowLast, focusedField === 'password' && styles.rowFocused]}>
                  <View style={[styles.focusRail, focusedField === 'password' && styles.focusRailActive]} />
                  <AppText style={styles.label}>סיסמה *</AppText>
                  <View style={styles.rowValue}>
                    <TextInput
                      value={form.password}
                      onChangeText={(v) => set('password', v)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      secureTextEntry={!form.showPassword}
                      placeholder="לפחות 4 ספרות"
                      keyboardType="number-pad"
                      placeholderTextColor={COLORS.textFaint}
                      style={[styles.input, styles.ltrInput, { color: COLORS.text }]}
                      accessibilityLabel="סיסמה"
                    />
                    <TouchableOpacity
                      onPress={() => set('showPassword', !form.showPassword)}
                      hitSlop={8}
                      style={styles.passwordToggle}
                      accessibilityRole="button"
                      accessibilityLabel={form.showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                    >
                      <AppText weight="bold" style={styles.passwordToggleText}>
                        {form.showPassword ? 'הסתר' : 'הצג'}
                      </AppText>
                    </TouchableOpacity>
                  </View>
                </View>
                {errors.password && <AppText style={styles.error}>{errors.password}</AppText>}
              </View>

              <View style={[styles.card, styles.smsCard]}>
                <View style={styles.smsHeader}>
                  <View>
                    <AppText weight="bold" style={styles.smsTitle}>שלח הזמנה ב־SMS</AppText>
                    <AppText style={styles.smsCaption}>הנהג יקבל קישור להורדת האפליקציה</AppText>
                  </View>
                  <Switch
                    value={form.smsInvite}
                    onValueChange={(v) => set('smsInvite', v)}
                    trackColor={{ false: COLORS.fieldBorder, true: COLORS.okText }}
                    thumbColor={COLORS.card}
                    ios_backgroundColor={COLORS.fieldBorder}
                    accessibilityRole="switch"
                    accessibilityLabel="שלח הזמנה ב-SMS"
                    accessibilityState={{ checked: form.smsInvite }}
                  />
                </View>
              </View>
            </View>
          )}
          <View style={styles.footer}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={save}
              disabled={!canSubmit || saving}
              style={[styles.cta, !canSubmit && styles.ctaDisabled, canSubmit && ACCENT_SHADOW]}
              accessibilityRole="button"
              accessibilityLabel={canSubmit ? ctaLabel : 'השלם את שדות החובה'}
            >
              {saving ? (
                <BrandLoader color="#FFFFFF" accessibilityLabel="שומר" />
              ) : (
                <>
                  <Ionicons name={isEdit ? 'checkmark-circle' : 'add-circle'} size={18} color={canSubmit ? '#FFFFFF' : 'rgba(14,30,43,.35)'} />
                  <AppText weight="bold" style={[styles.ctaText, !canSubmit && styles.ctaTextDisabled]}>
                    {canSubmit ? ctaLabel : 'השלם את שדות החובה'}
                  </AppText>
                </>
              )}
            </TouchableOpacity>
            <AppText style={styles.remainingText}>
              {canSubmit
                ? (isEdit ? 'השינויים יישמרו בפרטי הנהג' : 'הנהג יתווסף לצי ויקבל הרשאות מיד')
                : remainingCount === 1
                  ? 'נותר שדה חובה אחד'
                  : `נותרו ${remainingCount} שדות חובה`}
            </AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date picker */}
      {showDatePicker && (
        Platform.OS === 'ios' ? (
          <View style={styles.dateSheetLayer}>
            <TouchableOpacity
              activeOpacity={1}
              style={StyleSheet.absoluteFill}
              onPress={() => setShowDatePicker(false)}
              accessibilityRole="button"
              accessibilityLabel="סגור בחירת תאריך"
            >
              <BlurView intensity={10} tint="light" style={StyleSheet.absoluteFill} />
              <View style={styles.dateSheetScrim} />
            </TouchableOpacity>
            <View style={[styles.dateSheet, { marginBottom: insets.bottom + 106 }]}>
              <View style={styles.dateSheetHeader}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)} hitSlop={8}>
                  <AppText weight="bold" style={styles.dateSheetCancel}>ביטול</AppText>
                </TouchableOpacity>
                <AppText weight="bold" style={styles.dateSheetTitle}>תוקף רישיון</AppText>
                <TouchableOpacity onPress={confirmDatePicker} hitSlop={8}>
                  <AppText weight="bold" style={styles.dateSheetConfirm}>אישור</AppText>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={draftLicenseExpiry ?? new Date()}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                style={styles.iosDatePicker}
              />
            </View>
          </View>
        ) : (
          <DateTimePicker
            value={form.license_expiry ? new Date(form.license_expiry) : new Date()}
            mode="date"
            display="default"
            onChange={handleDateChange}
          />
        )
      )}
    </View>
  );
}

interface FormRowProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  valid?: boolean;
  placeholder?: string;
  keyboardType?: any;
  ltr?: boolean;
  last?: boolean;
  maxLength?: number;
  fieldKey: FieldKey;
  focusedField: FieldKey | null;
  setFocusedField: (field: FieldKey | null) => void;
  accessibilityLabel?: string;
}

function FormRow(props: FormRowProps) {
  return <FormFieldRow {...props} errorStyle={styles.error} />;
}

const styles = StyleSheet.create({
  ...formScreenStyles,
  heroCaption: { fontSize: FONT_SIZE.sm, color: BRAND.inkSecondary },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingRight: 6,
    paddingLeft: 16,
    minHeight: 56,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(14,30,43,.07)',
    gap: 10,
  },
  label: { width: 88, fontSize: FONT_SIZE.lg, fontFamily: FONT.semibold, color: BRAND.ink },
  optionalText: { fontSize: FONT_SIZE.sm, fontFamily: FONT.medium, color: BRAND.inkSecondary },
  rowValue: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end' },
  value: { fontSize: FONT_SIZE.xl, fontFamily: FONT.bold, color: BRAND.ink, flex: 1, textAlign: 'right' },
  input: { flex: 1, fontSize: FONT_SIZE.xl, fontFamily: FONT.medium, padding: 0, color: BRAND.ink, textAlign: 'right' },
  error: { fontSize: FONT_SIZE.sm, color: COLORS.dangerText, marginHorizontal: 20, marginTop: -4, marginBottom: 8 },
  dateButton: {
    height: 42,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,136,204,.10)',
    borderRadius: 15,
    borderWidth: 0.5,
    borderColor: 'rgba(0,136,204,.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateButtonText: { fontSize: FONT_SIZE.lg, color: COLORS.accent, fontFamily: FONT.bold },
  divider: { height: 0.5, backgroundColor: 'rgba(14,30,43,.07)', marginTop: 16 },
  licenseCardOuter: {
    backgroundColor: 'rgba(255,255,255,.92)',
    borderRadius: 24,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(16,31,44,.045)',
    shadowColor: BRAND.ink,
    shadowOpacity: 0.55,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 5,
    overflow: 'hidden',
  },
  licenseHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  licenseHeaderDesc: { flex: 1, textAlign: 'left', fontSize: FONT_SIZE.sm, color: 'rgba(16,31,44,.3)' },
  carouselContent: { flexDirection: 'row-reverse', gap: 7, flexGrow: 1 },
  licenseCard: {
    flex: 1,
    minWidth: 38,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(118,118,128,.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  licenseCardSelected: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.85,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  licenseCode: { fontSize: FONT_SIZE.lg, color: BRAND.ink },
  warningBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(240,166,30,.12)',
    borderRadius: 14,
  },
  warningText: { fontSize: FONT_SIZE.sm, color: '#8A5A00', flex: 1 },
  rowLabel: { fontSize: FONT_SIZE.md, color: BRAND.inkSecondary },
  readOnlyEmail: { color: BRAND.ink, fontSize: FONT_SIZE.lg, writingDirection: 'ltr', textAlign: 'left' },
  readOnlyHint: { fontSize: FONT_SIZE.sm, color: BRAND.inkSecondary, paddingHorizontal: 20, paddingBottom: 12, textAlign: 'right' },
  passwordToggle: {
    minWidth: 52,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(118,118,128,.09)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  passwordToggleText: { fontSize: FONT_SIZE.sm, color: COLORS.accent },
  smsCard: { marginBottom: SPACING.lg },
  smsHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 16,
  },
  smsTitle: { fontSize: FONT_SIZE.lg, color: BRAND.ink, marginBottom: 3 },
  smsCaption: { fontSize: FONT_SIZE.sm, color: BRAND.inkSecondary },
  ctaTextDisabled: { color: 'rgba(14,30,43,.35)' },
});
