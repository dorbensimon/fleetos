import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  View,
  TextInput,
  Switch,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ADMIN_BACKGROUND_COLORS, ADMIN_BACKGROUND_LOCATIONS } from '../../components/admin/AdminGradientBackground';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, LoadingState, useToast } from '../../components/ui';
import { Select } from '../../components/ui/Select';
import { COLORS, SPACING, ACCENT_SHADOW } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { getDriver, updateDriver, createDriverAccount, listDepartments, getUserEmail, type Department } from '../../lib/adminApi';
import { formatPhone } from '../../lib/phone';
import { RootStackParamList } from '../../navigation/types';
import { departmentOptions, driverEditableFieldsFromRow, LICENSE_CLASS_OPTIONS } from '../../lib/driverFields';
import {
  countFilledRequiredDriverFields,
  dateOnlyIsoFromLocalDate,
  formatDateDots,
  getRequiredDriverFields,
  validateDriverForm,
} from '../../lib/driverFormValidation';

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

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

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
    if (Object.keys(e).length > 0) return;

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
          Alert.alert('שמירה נכשלה', 'לא נמצאה חברה משויכת לחשבון שלך. נסה להתחבר מחדש');
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
          Alert.alert('יצירת הנהג נכשלה', result.error);
          return;
        }
      }
      showToast(isEdit ? 'השינויים נשמרו' : 'הנהג נוצר בהצלחה');
      if (!isEdit) navigation.goBack();
    } catch (err: any) {
      Alert.alert('שמירה נכשלה', String(err?.message ?? 'נסה שוב'));
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
  const screenTitle = isEdit ? 'עריכת נהג' : 'נהג חדש';
  const isDriverSelfEdit = isEdit && profile?.role === 'driver';
  const displayTitle = isDriverSelfEdit ? 'הפרטים שלי' : screenTitle;
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

  return (
    <View style={styles.screen}>
      <LinearGradient colors={ADMIN_BACKGROUND_COLORS} locations={ADMIN_BACKGROUND_LOCATIONS} style={styles.halo} />
      {/* Header דביק */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.headerTop}>
          <TouchableOpacity
              onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityRole="button"
              accessibilityLabel={isDriverSelfEdit ? 'חזרה לתפריט' : 'חזרה לנהגים'}
          >
            <AppText weight="bold" style={styles.headerBack}>‹ {isDriverSelfEdit ? 'חזרה' : 'נהגים'}</AppText>
          </TouchableOpacity>
          <AppText weight="bold" style={styles.headerTitle}>{displayTitle}</AppText>
          <AppText weight="bold" style={styles.headerDraft}>טיוטה</AppText>
        </View>

        {/* Progress bar */}
        <View style={styles.progressRow}>
          <AppText style={styles.progressCounter}>{filledCount}/{requiredFields.length}</AppText>
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={['#5CBBEE', '#0A7FD0']}
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
            { paddingTop: CREATE_HEADER_HEIGHT + SPACING.lg, paddingBottom: 134 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
        >
          {/* כרטיס זהות */}
          <View style={styles.heroCard}>
            <View style={styles.avatar}>
              <LinearGradient colors={['#66C4F2', '#0A7FD0']} style={styles.avatarGradient}>
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
                    {selectedLicense ? `דרגה ${selectedLicense.label}` : 'נהג חדש'}
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
                placeholder="9 ספרות"
                keyboardType="number-pad"
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
                      placeholder="לפחות 8 תווים"
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
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.lg }]}>
        <LinearGradient colors={['rgba(243,246,249,0)', 'rgba(243,246,249,.92)', '#F3F6F9']} style={StyleSheet.absoluteFill} />
        <BlurView intensity={14} tint="light" style={StyleSheet.absoluteFill} />
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={save}
          disabled={!canSubmit || saving}
          style={[styles.cta, !canSubmit && styles.ctaDisabled, canSubmit && ACCENT_SHADOW]}
          accessibilityRole="button"
          accessibilityLabel={canSubmit ? ctaLabel : 'השלם את שדות החובה'}
        >
          {saving ? (
            <AppText weight="bold" style={styles.ctaText}>שומר...</AppText>
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
  placeholder?: string;
  keyboardType?: any;
  ltr?: boolean;
  last?: boolean;
  fieldKey: FieldKey;
  focusedField: FieldKey | null;
  setFocusedField: (field: FieldKey | null) => void;
  accessibilityLabel?: string;
}

function FormRow({
  label,
  value,
  onChangeText,
  error,
  placeholder,
  keyboardType,
  ltr,
  last,
  fieldKey,
  focusedField,
  setFocusedField,
  accessibilityLabel,
}: FormRowProps) {
  const focused = focusedField === fieldKey;
  return (
    <>
      <View style={[styles.row, last && styles.rowLast, focused && styles.rowFocused]}>
        <View style={[styles.focusRail, focused && styles.focusRailActive]} />
        <AppText style={[styles.label, focused && styles.labelFocused]}>{label}</AppText>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocusedField(fieldKey)}
          onBlur={() => setFocusedField(null)}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textFaint}
          keyboardType={keyboardType}
          style={[styles.input, ltr && styles.ltrInput]}
          accessibilityLabel={accessibilityLabel ?? label.replace(' *', '')}
        />
        {!!value && (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={14} color="#268A59" />
          </View>
        )}
      </View>
      {error && <AppText style={styles.error}>{error}</AppText>}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6F9' },
  halo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    overflow: 'hidden',
    backgroundColor: 'rgba(240,246,251,.72)',
    paddingHorizontal: 18,
    paddingBottom: SPACING.md,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(14,30,43,.06)',
  },
  headerTop: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 52,
  },
  headerBack: { fontSize: 17, lineHeight: 22, color: COLORS.accent },
  headerTitle: { fontSize: 17, lineHeight: 22, color: '#101F2C' },
  headerDraft: { fontSize: 15.5, lineHeight: 21, color: 'rgba(16,31,44,.3)' },
  progressRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 2,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(16,31,44,.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressCounter: { width: 30, fontSize: 12, fontWeight: '700', color: '#101F2C', textAlign: 'right' },
  content: { paddingHorizontal: 18, gap: 20 },
  heroCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 18,
    paddingVertical: 12,
  },
  avatar: { position: 'relative' },
  avatarGradient: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.7)',
    shadowColor: '#0A7FD0',
    shadowOpacity: 0.75,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
    elevation: 9,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },
  heroName: { fontSize: 26, letterSpacing: -0.8, color: '#101F2C', marginBottom: 8 },
  heroBadges: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  glassBadge: {
    minHeight: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,.75)',
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  glassBadgeText: { fontSize: 12.5, color: '#101F2C' },
  heroCaption: { fontSize: 12.5, color: 'rgba(16,31,44,.42)' },
  section: { gap: 9 },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  sectionDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.accent },
  sectionTitle: { fontSize: 12, letterSpacing: 0.8, color: 'rgba(16,31,44,.42)' },
  card: {
    backgroundColor: 'rgba(255,255,255,.92)',
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: 'rgba(16,31,44,.045)',
    shadowColor: '#102A42',
    shadowOpacity: 0.55,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 5,
    overflow: 'hidden',
  },
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
  rowFocused: { backgroundColor: 'rgba(0,136,204,.045)' },
  rowLast: { borderBottomWidth: 0 },
  focusRail: { width: 4, height: 22, borderRadius: 2, backgroundColor: 'transparent' },
  focusRailActive: { backgroundColor: COLORS.accent },
  label: { width: 88, fontSize: 15.5, fontWeight: '600', color: '#101F2C' },
  optionalText: { fontSize: 12, fontWeight: '500', color: 'rgba(16,31,44,.42)' },
  labelFocused: { color: COLORS.accent },
  rowValue: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end' },
  value: { fontSize: 17, fontWeight: '700', color: '#101F2C', flex: 1, textAlign: 'right' },
  input: { flex: 1, fontSize: 16.5, fontWeight: '500', padding: 0, color: '#101F2C', textAlign: 'right' },
  ltrInput: { textAlign: 'left', writingDirection: 'ltr' },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(48,164,108,.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { fontSize: 12.5, color: '#E5484D', marginHorizontal: 20, marginTop: -4, marginBottom: 8 },
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
  dateButtonText: { fontSize: 15, color: COLORS.accent, fontWeight: '700' },
  divider: { height: 0.5, backgroundColor: 'rgba(14,30,43,.07)', marginTop: 16 },
  licenseCardOuter: {
    backgroundColor: 'rgba(255,255,255,.92)',
    borderRadius: 24,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(16,31,44,.045)',
    shadowColor: '#102A42',
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
  licenseHeaderDesc: { flex: 1, textAlign: 'left', fontSize: 12, color: 'rgba(16,31,44,.3)' },
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
  licenseCode: { fontSize: 16, color: '#101F2C' },
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
  warningText: { fontSize: 12.5, color: '#8A5A00', flex: 1 },
  rowLabel: { fontSize: 13.5, color: 'rgba(16,31,44,.42)' },
  readOnlyEmail: { color: '#101F2C', fontSize: 16, writingDirection: 'ltr', textAlign: 'left' },
  readOnlyHint: { fontSize: 12, color: 'rgba(16,31,44,.42)', paddingHorizontal: 20, paddingBottom: 12, textAlign: 'right' },
  passwordToggle: {
    minWidth: 52,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(118,118,128,.09)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  passwordToggleText: { fontSize: 13, color: COLORS.accent },
  smsCard: { marginBottom: SPACING.lg },
  smsHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 16,
  },
  smsTitle: { fontSize: 15.5, color: '#101F2C', marginBottom: 3 },
  smsCaption: { fontSize: 12.5, color: 'rgba(16,31,44,.42)' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 6,
    paddingHorizontal: 18,
    paddingTop: 18,
    overflow: 'hidden',
  },
  cta: {
    height: 56,
    borderRadius: 19,
    backgroundColor: COLORS.accent,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  ctaText: { fontSize: 15.5, color: '#FFFFFF' },
  ctaDisabled: { backgroundColor: 'rgba(118,118,128,.09)', shadowOpacity: 0, elevation: 0 },
  ctaTextDisabled: { color: 'rgba(14,30,43,.35)' },
  remainingText: { fontSize: 12.5, color: 'rgba(16,31,44,.42)', textAlign: 'center', marginTop: 8 },
  dateSheetLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 7,
    justifyContent: 'flex-end',
  },
  dateSheetScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16,31,44,.16)',
  },
  dateSheet: {
    marginHorizontal: 18,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,.96)',
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(16,31,44,.07)',
    shadowColor: '#102A42',
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  dateSheetHeader: {
    height: 50,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(14,30,43,.07)',
  },
  dateSheetTitle: { fontSize: 16, color: '#101F2C' },
  dateSheetCancel: { fontSize: 15, color: 'rgba(16,31,44,.42)' },
  dateSheetConfirm: { fontSize: 15, color: COLORS.accent },
  iosDatePicker: { alignSelf: 'center', height: 190 },
});
