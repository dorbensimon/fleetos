import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ADMIN_BACKGROUND_COLORS, ADMIN_BACKGROUND_LOCATIONS } from '../../components/admin/AdminGradientBackground';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, LoadingState, useToast } from '../../components/ui';
import { Select } from '../../components/ui/Select';
import { VehicleDriversEditor } from '../../components/VehicleDriversEditor';
import { COLORS, SPACING, ACCENT_SHADOW, parseDateValue } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import {
  getVehicle,
  createVehicle,
  updateVehicle,
  listVehicles,
  listDepartments,
  listDrivers,
  listActiveVehicleDrivers,
  Vehicle,
  VehicleStatus,
  VehicleType,
  AcquisitionType,
  VehicleDriverWithProfile,
} from '../../lib/adminApi';
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS, ACQUISITION_TYPE_LABELS } from '../../lib/compliance';
import { formatPlate } from '../../lib/plate';
import { RootStackParamList } from '../../navigation/types';
import { dateOnlyIsoFromLocalDate, formatDateDots } from '../../lib/driverFormValidation';

type Props = NativeStackScreenProps<RootStackParamList, 'VehicleForm'>;
type FormVehicleType = VehicleType | '';
type FieldKey = keyof FormState;

interface FormState {
  plate_number: string;
  vehicle_type: FormVehicleType;
  manufacturer: string;
  model: string;
  internal_code: string;
  vin: string;
  production_year: string;
  production_month: string;
  road_registration_date: string;
  acquisition_type: AcquisitionType | null;
  usage_type: string;
  status: VehicleStatus;
  department_id: string | null;
}

const EMPTY: FormState = {
  plate_number: '',
  vehicle_type: '',
  manufacturer: '',
  model: '',
  internal_code: '',
  vin: '',
  production_year: '',
  production_month: '',
  road_registration_date: '',
  acquisition_type: null,
  usage_type: '',
  status: 'active',
  department_id: null,
};

const VEHICLE_HEADER_HEIGHT = 126;
const REQUIRED_FIELDS = ['plate_number', 'vehicle_type', 'status'] as const;

const VEHICLE_TYPE_OPTIONS = [
  { value: 'car', label: 'פרטי', description: 'רכב נוסעים' },
  { value: 'minibus', label: 'מסחרי', description: 'עד 3.5 טון' },
  { value: 'truck', label: 'משא', description: 'מעל 3.5 טון' },
  { value: 'bus', label: 'אוטובוס', description: 'הסעת נוסעים' },
] as const satisfies readonly { value: VehicleType; label: string; description: string }[];

const STATUS_OPTIONS = [
  { value: 'active', label: 'פעיל', color: '#30A46C', bg: 'rgba(48,164,108,.12)' },
  { value: 'maintenance', label: 'בטיפול', color: '#E09312', bg: 'rgba(240,166,30,.14)' },
  { value: 'disabled', label: 'מושבת', color: '#6B7A88', bg: 'rgba(107,122,136,.14)' },
] as const satisfies readonly { value: VehicleStatus; label: string; color: string; bg: string }[];

const DEAL_TYPE_OPTIONS = Object.entries(ACQUISITION_TYPE_LABELS).map(([value, label]) => ({
  value: value as AcquisitionType,
  label,
}));

const MONTH_OPTIONS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
].map((label, index) => ({ value: String(index + 1).padStart(2, '0'), label }));

function yearOptions(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear();
  const years: { value: string; label: string }[] = [];
  for (let year = currentYear; year >= 1980; year--) {
    years.push({ value: String(year), label: String(year) });
  }
  return years;
}

function num(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function validateVehicleForm(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  const plateDigits = form.plate_number.replace(/\D/g, '');

  if (!plateDigits) errors.plate_number = 'שדה חובה';
  else if (!/^\d{7,8}$/.test(plateDigits)) errors.plate_number = 'מספר רישוי חייב להכיל 7-8 ספרות';

  if (!form.vehicle_type) errors.vehicle_type = 'שדה חובה';
  if (!form.status) errors.status = 'שדה חובה';

  const vin = form.vin.trim().toUpperCase();
  if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    errors.vin = 'VIN חייב להכיל 17 תווים ללא I/O/Q';
  }

  const productionYear = num(form.production_year);
  const currentYear = new Date().getFullYear();
  if (form.production_year.trim() && (!productionYear || productionYear < 1980 || productionYear > currentYear)) {
    errors.production_year = 'שנת ייצור לא יכולה להיות עתידית';
  }

  const productionMonth = num(form.production_month);
  if (form.production_month.trim() && (!productionMonth || productionMonth < 1 || productionMonth > 12)) {
    errors.production_month = 'חודש ייצור לא תקין';
  }

  if (form.road_registration_date && productionYear) {
    const roadDate = parseDateValue(form.road_registration_date);
    if (!Number.isNaN(roadDate.getTime()) && roadDate.getFullYear() < productionYear) {
      errors.road_registration_date = 'עליה לכביש לא יכולה להיות לפני שנת הייצור';
    }
  }

  return errors;
}

export default function VehicleFormScreen({ route, navigation }: Props) {
  const vehicleId = route.params?.vehicleId;
  const isEdit = !!vehicleId;
  const { companyId } = useCompany();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  const [drivers, setDrivers] = useState<{ value: string; label: string }[]>([]);
  const [vehicleDrivers, setVehicleDrivers] = useState<VehicleDriverWithProfile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [focusedField, setFocusedField] = useState<FieldKey | null>(null);
  const [showRoadDatePicker, setShowRoadDatePicker] = useState(false);
  const [draftRoadDate, setDraftRoadDate] = useState<Date | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  const years = useMemo(() => yearOptions(), []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const load = useCallback(async () => {
    if (!companyId) return;

    const [deps, drvs] = await Promise.all([listDepartments(companyId), listDrivers(companyId)]);
    setDepartments(deps.map((department) => ({ value: department.id, label: department.name })));
    setDrivers(drvs.map((driver) => ({ value: driver.id, label: driver.full_name ?? 'ללא שם' })));

    if (vehicleId) {
      const [vehicle, assignments] = await Promise.all([
        getVehicle(vehicleId),
        listActiveVehicleDrivers(vehicleId),
      ]);
      setVehicleDrivers(assignments);
      if (vehicle) {
        setForm({
          plate_number: vehicle.plate_number,
          vehicle_type: vehicle.vehicle_type,
          manufacturer: vehicle.manufacturer ?? '',
          model: vehicle.model ?? '',
          internal_code: vehicle.internal_code ?? '',
          vin: vehicle.vin ?? '',
          production_year: vehicle.production_year ? String(vehicle.production_year) : '',
          production_month: vehicle.production_month ? String(vehicle.production_month).padStart(2, '0') : '',
          road_registration_date: vehicle.road_registration_date ?? '',
          acquisition_type: vehicle.acquisition_type,
          usage_type: vehicle.usage_type ?? '',
          status: vehicle.status,
          department_id: vehicle.department_id,
        });
      }
    }
  }, [companyId, vehicleId]);

  const reloadVehicleDrivers = useCallback(async () => {
    if (!vehicleId) return;
    setVehicleDrivers(await listActiveVehicleDrivers(vehicleId));
  }, [vehicleId]);

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

  const openRoadDatePicker = () => {
    setDraftRoadDate(form.road_registration_date ? parseDateValue(form.road_registration_date) : new Date());
    setShowRoadDatePicker(true);
  };

  const handleRoadDateChange = (_: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowRoadDatePicker(false);
      if (selectedDate) set('road_registration_date', dateOnlyIsoFromLocalDate(selectedDate));
      return;
    }
    if (selectedDate) setDraftRoadDate(selectedDate);
  };

  const confirmRoadDatePicker = () => {
    const selectedDate = draftRoadDate ?? new Date();
    set('road_registration_date', dateOnlyIsoFromLocalDate(selectedDate));
    setShowRoadDatePicker(false);
  };

  const save = async () => {
    if (!companyId) return;

    const nextErrors = validateVehicleForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const plateDigits = form.plate_number.replace(/\D/g, '');
    setSaving(true);
    try {
      const existingVehicles = await listVehicles(companyId, true);
      const duplicate = existingVehicles.find(
        (vehicle) => vehicle.plate_number === plateDigits && vehicle.id !== vehicleId
      );
      if (duplicate) {
        setErrors((current) => ({ ...current, plate_number: 'קיים כבר רכב עם מספר הרישוי הזה בחברה' }));
        return;
      }

      const payload: Partial<Vehicle> = {
        plate_number: plateDigits,
        vehicle_type: form.vehicle_type as VehicleType,
        manufacturer: form.manufacturer.trim() || null,
        model: form.model.trim() || null,
        internal_code: form.internal_code.trim() || null,
        vin: form.vin.trim().toUpperCase() || null,
        production_year: num(form.production_year),
        production_month: num(form.production_month),
        road_registration_date: form.road_registration_date || null,
        acquisition_type: form.acquisition_type,
        usage_type: form.usage_type.trim() || null,
        status: form.status,
        department_id: form.department_id,
      };

      if (isEdit) {
        await updateVehicle(vehicleId!, payload);
      } else {
        await createVehicle({
          ...payload,
          company_id: companyId,
          plate_number: plateDigits,
          odometer: 0,
          last_service_km: 0,
        });
      }

      showToast(isEdit ? 'השינויים נשמרו' : 'הרכב נוצר בהצלחה');
      navigation.goBack();
    } catch (err: any) {
      const message = String(err?.message ?? '');
      Alert.alert(
        'שמירה נכשלה',
        message.includes('duplicate') || message.includes('unique')
          ? 'קיים כבר רכב עם מספר הרישוי הזה בחברה'
          : message || 'נסה שוב'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={ADMIN_BACKGROUND_COLORS} locations={ADMIN_BACKGROUND_LOCATIONS} style={styles.halo} />
        <LoadingState />
      </View>
    );
  }

  const filledCount = REQUIRED_FIELDS.filter((field) => String(form[field] ?? '').trim()).length;
  const progress = filledCount / REQUIRED_FIELDS.length;
  const remainingCount = REQUIRED_FIELDS.length - filledCount;
  const canSubmit = filledCount === REQUIRED_FIELDS.length;
  const screenTitle = isEdit ? 'עריכת רכב' : 'רכב חדש';
  const ctaLabel = isEdit ? 'שמור שינויים' : 'צור רכב';
  const selectedType = VEHICLE_TYPE_OPTIONS.find((option) => option.value === form.vehicle_type);
  const selectedStatus =
    STATUS_OPTIONS.find((option) => option.value === form.status) ??
    { value: form.status, label: VEHICLE_STATUS_LABELS[form.status] ?? 'בארכיון', color: '#6B7A88', bg: 'rgba(107,122,136,.14)' };
  const heroTitle =
    [form.manufacturer, form.model].filter(Boolean).join(' ').trim() ||
    (form.plate_number ? formatPlate(form.plate_number) : 'רכב ללא זיהוי');

  return (
    <View style={styles.screen}>
      <LinearGradient colors={ADMIN_BACKGROUND_COLORS} locations={ADMIN_BACKGROUND_LOCATIONS} style={styles.halo} />

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="חזרה לרכבים"
          >
            <AppText weight="bold" style={styles.headerBack}>‹ רכבים</AppText>
          </TouchableOpacity>
          <AppText weight="bold" style={styles.headerTitle}>{screenTitle}</AppText>
          <AppText weight="bold" style={styles.headerDraft}>טיוטה</AppText>
        </View>
        <View style={styles.progressRow}>
          <AppText style={styles.progressCounter}>{filledCount}/{REQUIRED_FIELDS.length}</AppText>
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
            { paddingTop: VEHICLE_HEADER_HEIGHT + SPACING.lg, paddingBottom: 136 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
        >
          <View style={styles.heroCard}>
            <View style={styles.avatar}>
              <LinearGradient colors={['#66C4F2', '#0A7FD0']} style={styles.avatarGradient}>
                <Ionicons name="car-sport-outline" size={38} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.avatarBadge}>
                <Ionicons name="camera-outline" size={15} color={COLORS.accent} />
              </View>
            </View>
            <View style={styles.heroText}>
              <AppText weight="bold" style={[styles.heroName, !form.plate_number && !heroTitle.trim() && styles.placeholderText]} numberOfLines={1}>
                {heroTitle}
              </AppText>
              <View style={styles.heroBadges}>
                <View style={styles.glassBadge}>
                  <AppText weight="bold" style={styles.glassBadgeText}>
                    {selectedType?.label ?? 'סוג לא נבחר'}
                  </AppText>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: selectedStatus.bg }]}>
                  <View style={[styles.statusDot, { backgroundColor: selectedStatus.color }]} />
                  <AppText weight="bold" style={[styles.statusBadgeText, { color: selectedStatus.color }]}>
                    {selectedStatus.label}
                  </AppText>
                </View>
              </View>
            </View>
          </View>

          <Section title="זיהוי הרכב">
            <View style={styles.identityCard}>
              <View style={styles.plateRow}>
                <View style={styles.plateTextWrap}>
                  <AppText weight="bold" style={styles.fieldTitle}>מספר רישוי *</AppText>
                  <TextInput
                    value={formatPlate(form.plate_number)}
                    onChangeText={(value) => set('plate_number', value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="12-345-67"
                    placeholderTextColor="rgba(16,31,44,.3)"
                    keyboardType="number-pad"
                    maxLength={11}
                    style={[styles.plateInput, errors.plate_number && styles.inputWithError]}
                    accessibilityLabel="מספר רישוי"
                  />
                </View>
                <LinearGradient colors={['#FFDD3C', '#F4C81E']} style={styles.plateBadge}>
                  <AppText weight="bold" style={styles.plateBadgeText}>
                    {form.plate_number ? formatPlate(form.plate_number) : 'IL'}
                  </AppText>
                </LinearGradient>
              </View>
              {!!errors.plate_number && <AppText style={styles.error}>{errors.plate_number}</AppText>}

              <View style={styles.fullDivider} />

              <View style={styles.choiceHeader}>
                <AppText weight="bold" style={styles.fieldTitle}>סוג רכב *</AppText>
                <AppText weight="bold" style={styles.choiceDesc}>
                  {selectedType?.description ?? 'בחר סוג'}
                </AppText>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeChips}>
                {VEHICLE_TYPE_OPTIONS.map((option) => {
                  const active = form.vehicle_type === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.typeChip, active && styles.typeChipActive]}
                      onPress={() => set('vehicle_type', option.value)}
                      accessibilityRole="radio"
                      accessibilityLabel={`${option.label} - ${option.description}`}
                      accessibilityState={{ selected: active }}
                    >
                      <AppText weight="bold" style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                        {option.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {!!errors.vehicle_type && <AppText style={styles.error}>{errors.vehicle_type}</AppText>}

              <View style={styles.fullDivider} />

              <VehicleFormRow
                fieldKey="manufacturer"
                label="יצרן"
                value={form.manufacturer}
                onChangeText={(value) => set('manufacturer', value)}
                placeholder="אופציונלי"
                focusedField={focusedField}
                setFocusedField={setFocusedField}
              />
              <VehicleFormRow
                fieldKey="model"
                label="דגם"
                value={form.model}
                onChangeText={(value) => set('model', value)}
                placeholder="אופציונלי"
                focusedField={focusedField}
                setFocusedField={setFocusedField}
              />
              <VehicleFormRow
                fieldKey="internal_code"
                label="קוד פנימי"
                value={form.internal_code}
                onChangeText={(value) => set('internal_code', value)}
                placeholder="אופציונלי"
                focusedField={focusedField}
                setFocusedField={setFocusedField}
                ltr
              />
              <VehicleFormRow
                fieldKey="vin"
                label="שילדה (VIN)"
                value={form.vin}
                onChangeText={(value) => set('vin', value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17))}
                placeholder="אופציונלי"
                focusedField={focusedField}
                setFocusedField={setFocusedField}
                error={errors.vin}
                ltr
              />

              <View style={styles.selectRow}>
                <View style={styles.focusRail} />
                <AppText style={styles.labelWide}>שנת ייצור</AppText>
                <View style={styles.monthYearWrap}>
                  <View style={styles.selectHalf}>
                    <Select
                      value={form.production_month || null}
                      onChange={(value) => set('production_month', value ?? '')}
                      options={MONTH_OPTIONS}
                      placeholder="חודש"
                      allowClear
                      hasError={!!errors.production_month}
                    />
                  </View>
                  <View style={styles.selectHalf}>
                    <Select
                      value={form.production_year || null}
                      onChange={(value) => set('production_year', value ?? '')}
                      options={years}
                      placeholder="שנה"
                      allowClear
                      hasError={!!errors.production_year}
                    />
                  </View>
                </View>
              </View>
              {!!(errors.production_year || errors.production_month) && (
                <AppText style={styles.error}>{errors.production_year || errors.production_month}</AppText>
              )}

              <TouchableOpacity
                style={[styles.dateRow, styles.rowLast]}
                onPress={openRoadDatePicker}
                accessibilityRole="button"
                accessibilityLabel="בחירת תאריך עליה לכביש"
              >
                <View style={styles.focusRail} />
                <AppText style={styles.labelWide}>עליה לכביש</AppText>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={openRoadDatePicker}
                  accessibilityRole="button"
                  accessibilityLabel="בחר תאריך עליה לכביש"
                >
                  <AppText weight="bold" style={styles.dateButtonText}>בחר תאריך</AppText>
                </TouchableOpacity>
                <View style={styles.dateTextWrap}>
                  <AppText weight="bold" style={[styles.dateValue, !form.road_registration_date && styles.placeholderText]}>
                    {formatDateDots(form.road_registration_date) || 'לא נבחר תאריך'}
                  </AppText>
                </View>
              </TouchableOpacity>
              {!!errors.road_registration_date && <AppText style={styles.error}>{errors.road_registration_date}</AppText>}
            </View>
          </Section>

          <Section title="שיוך וסטטוס">
            <View style={styles.card}>
              <View style={styles.statusControl} accessibilityRole="radiogroup">
                {STATUS_OPTIONS.map((option) => {
                  const active = form.status === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.statusOption, active && { backgroundColor: option.color }]}
                      onPress={() => set('status', option.value)}
                      accessibilityRole="radio"
                      accessibilityLabel={`סטטוס ${option.label}`}
                      accessibilityState={{ selected: active }}
                    >
                      <View style={[styles.statusOptionDot, { backgroundColor: active ? '#FFFFFF' : option.color }]} />
                      <AppText weight="bold" style={[styles.statusOptionText, active && styles.statusOptionTextActive]}>
                        {option.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!!errors.status && <AppText style={styles.error}>{errors.status}</AppText>}

              <View style={styles.selectRow}>
                <View style={styles.focusRail} />
                <AppText style={styles.labelWide}>מחלקה</AppText>
                <View style={styles.selectFill}>
                  <Select
                    value={form.department_id}
                    onChange={(value) => set('department_id', value)}
                    options={departments}
                    placeholder={departments.length ? 'בחר מחלקה' : 'לא הוגדרו מחלקות'}
                    allowClear
                  />
                </View>
              </View>

              <VehicleFormRow
                fieldKey="usage_type"
                label="שימוש הרכב"
                value={form.usage_type}
                onChangeText={(value) => set('usage_type', value)}
                placeholder="אופציונלי"
                focusedField={focusedField}
                setFocusedField={setFocusedField}
              />

              <View style={[styles.selectRow, styles.rowLast]}>
                <View style={styles.focusRail} />
                <AppText style={styles.labelWide}>סוג עסקה</AppText>
                <View style={styles.selectFill}>
                  <Select<AcquisitionType>
                    value={form.acquisition_type}
                    onChange={(value) => set('acquisition_type', value)}
                    options={DEAL_TYPE_OPTIONS}
                    placeholder="בחר סוג עסקה"
                    allowClear
                  />
                </View>
              </View>
            </View>
          </Section>

          <Section title="נהגים משויכים">
            {isEdit ? (
              <View style={styles.card}>
                <VehicleDriversEditor
                  vehicleId={vehicleId!}
                  assignments={vehicleDrivers}
                  driverOptions={drivers}
                  onChanged={reloadVehicleDrivers}
                />
              </View>
            ) : (
              <View style={styles.infoCard}>
                <View style={styles.infoIcon}>
                  <Ionicons name="people-outline" size={22} color={COLORS.accent} />
                </View>
                <AppText style={styles.infoText}>
                  ניתן לשייך נהגים לרכב לאחר יצירתו — שמור את הרכב תחילה, ואז פתח את תיק הרכב כדי להוסיף נהגים.
                </AppText>
              </View>
            )}
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>

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
              <Ionicons name={isEdit ? 'checkmark-circle' : 'add-circle'} size={18} color={canSubmit ? '#FFFFFF' : 'rgba(16,31,44,.33)'} />
              <AppText weight="bold" style={[styles.ctaText, !canSubmit && styles.ctaTextDisabled]}>
                {canSubmit ? ctaLabel : 'השלם את שדות החובה'}
              </AppText>
            </>
          )}
        </TouchableOpacity>
        <AppText style={styles.remainingText}>
          {canSubmit
            ? (isEdit ? 'השינויים יישמרו בתיק הרכב' : 'אחרי היצירה תוכל לשייך נהגים ומסמכים')
            : remainingCount === 1
              ? 'נותר שדה חובה אחד'
              : `נותרו ${remainingCount} שדות חובה`}
        </AppText>
      </View>

      {showRoadDatePicker && (
        Platform.OS === 'ios' ? (
          <View style={styles.dateSheetLayer}>
            <TouchableOpacity
              activeOpacity={1}
              style={StyleSheet.absoluteFill}
              onPress={() => setShowRoadDatePicker(false)}
              accessibilityRole="button"
              accessibilityLabel="סגור בחירת תאריך"
            >
              <BlurView intensity={10} tint="light" style={StyleSheet.absoluteFill} />
              <View style={styles.dateSheetScrim} />
            </TouchableOpacity>
            <View style={[styles.dateSheet, { marginBottom: insets.bottom + 106 }]}>
              <View style={styles.dateSheetHeader}>
                <TouchableOpacity onPress={() => setShowRoadDatePicker(false)} hitSlop={8}>
                  <AppText weight="bold" style={styles.dateSheetCancel}>ביטול</AppText>
                </TouchableOpacity>
                <AppText weight="bold" style={styles.dateSheetTitle}>עליה לכביש</AppText>
                <TouchableOpacity onPress={confirmRoadDatePicker} hitSlop={8}>
                  <AppText weight="bold" style={styles.dateSheetConfirm}>אישור</AppText>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={draftRoadDate ?? new Date()}
                mode="date"
                display="spinner"
                onChange={handleRoadDateChange}
                style={styles.iosDatePicker}
              />
            </View>
          </View>
        ) : (
          <DateTimePicker
            value={form.road_registration_date ? parseDateValue(form.road_registration_date) : new Date()}
            mode="date"
            display="default"
            onChange={handleRoadDateChange}
          />
        )
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionDot} />
        <AppText weight="bold" style={styles.sectionTitle}>{title}</AppText>
      </View>
      {children}
    </View>
  );
}

function VehicleFormRow({
  label,
  value,
  onChangeText,
  placeholder,
  focusedField,
  setFocusedField,
  fieldKey,
  error,
  ltr,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  focusedField: FieldKey | null;
  setFocusedField: (field: FieldKey | null) => void;
  fieldKey: FieldKey;
  error?: string;
  ltr?: boolean;
}) {
  const focused = focusedField === fieldKey;
  return (
    <>
      <View style={[styles.formRow, focused && styles.rowFocused]}>
        <View style={[styles.focusRail, focused && styles.focusRailActive]} />
        <AppText style={[styles.labelWide, focused && styles.labelFocused]}>{label}</AppText>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocusedField(fieldKey)}
          onBlur={() => setFocusedField(null)}
          placeholder={placeholder}
          placeholderTextColor="rgba(16,31,44,.3)"
          style={[styles.input, ltr && styles.ltrInput]}
          accessibilityLabel={label}
        />
        {!!value && (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={14} color="#268A59" />
          </View>
        )}
      </View>
      {!!error && <AppText style={styles.error}>{error}</AppText>}
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
  progressFill: { height: '100%', borderRadius: 3 },
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
  statusBadge: {
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 12.5 },
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
  identityCard: {
    backgroundColor: 'rgba(255,255,255,.92)',
    borderRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(16,31,44,.045)',
    shadowColor: '#102A42',
    shadowOpacity: 0.55,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 5,
    overflow: 'hidden',
  },
  plateRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingBottom: 14,
  },
  plateTextWrap: { flex: 1, gap: 5 },
  fieldTitle: { fontSize: 13, color: 'rgba(16,31,44,.42)' },
  plateInput: {
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#101F2C',
    padding: 0,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  inputWithError: { color: '#E5484D' },
  plateBadge: {
    width: 64,
    height: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(16,31,44,.14)',
    shadowColor: '#102A42',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  plateBadgeText: { fontSize: 13, color: '#1A1A0E', textAlign: 'center' },
  fullDivider: {
    height: 0.5,
    backgroundColor: 'rgba(16,31,44,.06)',
    marginHorizontal: -16,
    marginBottom: 14,
  },
  choiceHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  choiceDesc: { flex: 1, textAlign: 'left', fontSize: 12, color: 'rgba(16,31,44,.3)' },
  typeChips: { flexDirection: 'row-reverse', gap: 7, flexGrow: 1, paddingBottom: 14 },
  typeChip: {
    flex: 1,
    minWidth: 58,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(118,118,128,.09)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  typeChipActive: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.85,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  typeChipText: { fontSize: 13.5, color: '#101F2C' },
  typeChipTextActive: { color: '#FFFFFF' },
  formRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    minHeight: 56,
    marginHorizontal: -16,
    paddingRight: 6,
    paddingLeft: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(14,30,43,.07)',
    gap: 10,
  },
  selectRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    minHeight: 58,
    paddingRight: 6,
    paddingLeft: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(14,30,43,.07)',
    gap: 10,
  },
  dateRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    minHeight: 64,
    marginHorizontal: -16,
    paddingRight: 6,
    paddingLeft: 16,
    gap: 10,
  },
  rowLast: { borderBottomWidth: 0 },
  rowFocused: { backgroundColor: 'rgba(0,136,204,.045)' },
  focusRail: { width: 4, height: 22, borderRadius: 2, backgroundColor: 'transparent' },
  focusRailActive: { backgroundColor: COLORS.accent },
  labelWide: { width: 112, fontSize: 15.5, fontWeight: '600', color: '#101F2C', textAlign: 'right', writingDirection: 'rtl' },
  labelFocused: { color: COLORS.accent },
  input: { flex: 1, fontSize: 16.5, fontWeight: '500', padding: 0, color: '#101F2C', textAlign: 'right', writingDirection: 'rtl' },
  ltrInput: { textAlign: 'left', writingDirection: 'ltr' },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(48,164,108,.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectFill: { flex: 1 },
  monthYearWrap: { flex: 1, flexDirection: 'row-reverse', gap: 8 },
  selectHalf: { flex: 1 },
  dateTextWrap: { flex: 1, alignItems: 'flex-start', justifyContent: 'center' },
  dateValue: { fontSize: 15, color: '#101F2C', textAlign: 'left', writingDirection: 'ltr' },
  placeholderText: { color: 'rgba(16,31,44,.3)' },
  dateButton: {
    height: 42,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,136,204,.09)',
    borderRadius: 15,
    borderWidth: 0.5,
    borderColor: 'rgba(0,136,204,.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dateButtonText: { fontSize: 15, color: COLORS.accent },
  error: { fontSize: 12.5, color: '#E5484D', marginBottom: 10, textAlign: 'right' },
  statusControl: {
    flexDirection: 'row-reverse',
    gap: 4,
    margin: 16,
    padding: 3,
    borderRadius: 14,
    backgroundColor: 'rgba(118,118,128,.09)',
  },
  statusOption: {
    flex: 1,
    height: 38,
    borderRadius: 11,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statusOptionDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusOptionText: { fontSize: 14.5, color: 'rgba(16,31,44,.55)' },
  statusOptionTextActive: { color: '#FFFFFF' },
  infoCard: {
    minHeight: 86,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,.92)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 13,
    padding: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(16,31,44,.045)',
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: 'rgba(0,136,204,.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: 'rgba(16,31,44,.5)' },
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
  ctaTextDisabled: { color: 'rgba(16,31,44,.33)' },
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
