import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { showAlert } from '../../lib/platformAlert';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LoadingState, useToast } from '../../components/ui';
import { ActionRow, Banner, DK, DKText, DriverPage, EditField, HeroTitle, KitSection, LoadingPanel, Plate, PrimaryAction, Pressy, Reveal, STATUS, Segmented } from '../../components/driverKit';
import { DateField } from '../../components/ui/DateField';
import { Select } from '../../components/ui/Select';
import { VehicleDriversEditor } from '../../components/VehicleDriversEditor';
import { COLORS, parseDateValue } from '../../lib/theme';
import { isStaleDepartmentError } from '../../lib/driverFields';
import { useCompany } from '../../lib/CompanyContext';
import { getVehicle, createVehicle, updateVehicle, listVehicles, listDepartments, listDrivers, listActiveVehicleDrivers, listCompliance, upsertCompliance, Vehicle, VehicleStatus, VehicleType, AcquisitionType, VehicleDriverWithProfile } from '../../lib/adminApi';
import { VEHICLE_STATUS_LABELS, ACQUISITION_TYPE_LABELS } from '../../lib/compliance';
import { formatPlate } from '../../lib/plate';
import { RootStackParamList } from '../../navigation/types';
import { lookupVehicleRegistry, VehicleRegistryDetails } from '../../lib/vehicleRegistry';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { VehicleFormDesktopView } from '../../components/desktop/VehicleFormDesktopView';

type Props = NativeStackScreenProps<RootStackParamList, 'VehicleForm'>;
type FormVehicleType = VehicleType | '';

interface FormState {
  plate_number: string;
  vehicle_type: FormVehicleType;
  manufacturer: string;
  model: string;
  color: string;
  internal_code: string;
  vin: string;
  odometer: string;
  production_year: string;
  production_month: string;
  road_registration_date: string;
  vehicle_license_expiry: string;
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
  color: '',
  internal_code: '',
  vin: '',
  odometer: '',
  production_year: '',
  production_month: '',
  road_registration_date: '',
  vehicle_license_expiry: '',
  acquisition_type: null,
  usage_type: '',
  status: 'active',
  department_id: null,
};

const REQUIRED_FIELDS = ['plate_number', 'vehicle_type', 'status'] as const;

const VEHICLE_TYPE_OPTIONS = [
  { value: 'car', label: 'פרטי', description: 'רכב נוסעים' },
  { value: 'minibus', label: 'מסחרי', description: 'עד 3.5 טון' },
  { value: 'truck', label: 'משא', description: 'מעל 3.5 טון' },
  { value: 'bus', label: 'אוטובוס', description: 'הסעת נוסעים' },
] as const satisfies readonly { value: VehicleType; label: string; description: string }[];

const STATUS_OPTIONS = [
  { value: 'active', label: 'פעיל', color: COLORS.okText, bg: 'rgba(48,164,108,.12)' },
  { value: 'maintenance', label: 'בטיפול', color: COLORS.warnText, bg: 'rgba(240,166,30,.14)' },
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

function formatKm(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString() : '';
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
  const isDesktop = useIsDesktop();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  const [drivers, setDrivers] = useState<{ value: string; label: string }[]>([]);
  const [vehicleDrivers, setVehicleDrivers] = useState<VehicleDriverWithProfile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);


  const years = useMemo(() => yearOptions(), []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const load = useCallback(async () => {
    if (!companyId) return;

    const [deps, drvs] = await Promise.all([listDepartments(companyId), listDrivers(companyId)]);
    setDepartments(deps.map((department) => ({ value: department.id, label: department.name })));
    setDrivers(drvs.map((driver) => ({ value: driver.id, label: driver.full_name ?? 'ללא שם' })));

    if (vehicleId) {
      const [vehicle, assignments, compliance] = await Promise.all([
        getVehicle(vehicleId),
        listActiveVehicleDrivers(vehicleId),
        listCompliance('vehicle', vehicleId),
      ]);
      setVehicleDrivers(assignments);
      if (vehicle) {
        setForm({
          plate_number: vehicle.plate_number,
          vehicle_type: vehicle.vehicle_type,
          manufacturer: vehicle.manufacturer ?? '',
          model: vehicle.model ?? '',
          color: vehicle.color ?? '',
          internal_code: vehicle.internal_code ?? '',
          vin: vehicle.vin ?? '',
          odometer: vehicle.odometer ? String(vehicle.odometer) : '',
          production_year: vehicle.production_year ? String(vehicle.production_year) : '',
          production_month: vehicle.production_month ? String(vehicle.production_month).padStart(2, '0') : '',
          road_registration_date: vehicle.road_registration_date ?? '',
          vehicle_license_expiry: compliance.find((item) => item.item_type === 'vehicle_license')?.expiry_date ?? '',
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

  // Unlike `load`, this never touches `form` — safe to call after a failed
  // save without wiping the user's unsaved edits.
  const refreshDepartments = useCallback(async () => {
    if (!companyId) return;
    const deps = await listDepartments(companyId);
    setDepartments(deps.map((department) => ({ value: department.id, label: department.name })));
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

  const applyRegistryDetails = (details: VehicleRegistryDetails) => {
    setForm((current) => ({
      ...current,
      manufacturer: details.manufacturer ?? current.manufacturer,
      model: details.model ?? current.model,
      color: details.color ?? current.color,
      production_year: details.productionYear ? String(details.productionYear) : current.production_year,
      vehicle_license_expiry: details.licenseExpiry ?? current.vehicle_license_expiry,
    }));
    setLookupMessage('פרטי הרכב מולאו לפי מאגר משרד התחבורה. בדוק ואשר לפני השמירה.');
  };

  const lookupVehicle = async () => {
    const plate = form.plate_number.replace(/\D/g, '');
    if (!/^\d{7,8}$/.test(plate)) {
      setErrors((current) => ({ ...current, plate_number: 'מספר הרישוי חייב להכיל 7-8 ספרות' }));
      return;
    }

    setLookupLoading(true);
    setLookupMessage(null);
    try {
      const details = await lookupVehicleRegistry(plate);
      if (!details) {
        setLookupMessage('לא נמצא רכב עם מספר הרישוי הזה. אפשר למלא את הפרטים ידנית.');
        return;
      }

      showAlert(
        'נמצאו פרטי רכב',
        'נמלא את היצרן, הדגם, השנה, הצבע ותוקף רישיון הרכב. תמיד אפשר לערוך את הפרטים לפני השמירה.',
        [
          { text: 'ביטול', style: 'cancel' },
          { text: 'מלא פרטים', onPress: () => applyRegistryDetails(details) },
        ]
      );
    } catch (err: any) {
      setLookupMessage(err?.message || 'לא ניתן לחפש את פרטי הרכב כרגע. אפשר לנסות שוב או למלא ידנית.');
    } finally {
      setLookupLoading(false);
    }
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
        color: form.color.trim() || null,
        internal_code: form.internal_code.trim() || null,
        vin: form.vin.trim().toUpperCase() || null,
        odometer: num(form.odometer) ?? 0,
        production_year: num(form.production_year),
        production_month: num(form.production_month),
        road_registration_date: form.road_registration_date || null,
        acquisition_type: form.acquisition_type,
        usage_type: form.usage_type.trim() || null,
        status: form.status,
        department_id: form.department_id,
      };

      let savedVehicleId: string;
      if (isEdit) {
        await updateVehicle(vehicleId!, payload);
        savedVehicleId = vehicleId!;
      } else {
        const created = await createVehicle({
          ...payload,
          company_id: companyId,
          plate_number: plateDigits,
          last_service_km: 0,
        });
        savedVehicleId = created.id;
      }

      if (form.vehicle_license_expiry) {
        try {
          await upsertCompliance({
            companyId,
            ownerType: 'vehicle',
            ownerId: savedVehicleId,
            category: 'licensing',
            itemType: 'vehicle_license',
            expiryDate: form.vehicle_license_expiry,
          });
        } catch {
          showToast('הרכב נשמר, אך תוקף הרישיון לא נשמר. אפשר לעדכן אותו בתיק הרכב.');
          navigation.goBack();
          return;
        }
      }

      showToast(isEdit ? 'השינויים נשמרו' : 'הרכב נוצר בהצלחה');
      navigation.goBack();
    } catch (err: any) {
      const message = String(err?.message ?? '');
      if (isStaleDepartmentError(message)) {
        set('department_id', null);
        void refreshDepartments().catch(() => {});
        showAlert('שמירה נכשלה', 'המחלקה שנבחרה נמחקה בינתיים. בחר מחלקה אחרת ונסה שוב.');
        return;
      }
      showAlert(
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
    if (isDesktop) {
      return (
        <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'רכבים', vehicleId ? 'עריכת רכב' : 'רכב חדש']}>
          <LoadingState />
        </DesktopShell>
      );
    }
    return (
      <DriverPage insetTop={insets.top} insetBottom={insets.bottom} hero={<HeroTitle title={isEdit ? 'עריכת רכב' : 'רכב חדש'} onBack={() => navigation.goBack()} />}>
        <LoadingPanel />
      </DriverPage>
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

  const remainingText = canSubmit
    ? (isEdit ? 'השינויים יישמרו בתיק הרכב' : 'אחרי היצירה תוכל לשייך נהגים ומסמכים')
    : remainingCount === 1 ? 'נותר שדה חובה אחד' : `נותרו ${remainingCount} שדות חובה`;

  if (isDesktop) {
    return (
      <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'רכבים', screenTitle]}>
        <VehicleFormDesktopView
          isEdit={isEdit}
          vehicleId={vehicleId}
          form={form}
          set={set}
          errors={errors}
          departments={departments}
          vehicleTypeOptions={VEHICLE_TYPE_OPTIONS as unknown as { value: VehicleType; label: string; description: string }[]}
          statusOptions={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          dealTypeOptions={DEAL_TYPE_OPTIONS}
          monthOptions={MONTH_OPTIONS}
          yearOptions={years}
          drivers={drivers}
          vehicleDrivers={vehicleDrivers}
          onReloadVehicleDrivers={() => void reloadVehicleDrivers()}
          onLookupVehicle={() => void lookupVehicle()}
          lookupLoading={lookupLoading}
          lookupMessage={lookupMessage}
          canSubmit={canSubmit}
          saving={saving}
          ctaLabel={ctaLabel}
          remainingText={remainingText}
          onSave={() => void save()}
        />
      </DesktopShell>
    );
  }

  const statusTone = form.status === 'active' ? STATUS.ok.fill : form.status === 'maintenance' ? STATUS.soon.fill : DK.onNightFaint;
  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={
        <View>
          <HeroTitle title={screenTitle} subtitle={heroTitle} onBack={() => navigation.goBack()} />
          <View style={styles.preview}>
            <Plate number={form.plate_number ? formatPlate(form.plate_number) : '00-000-00'} />
            <View style={styles.glassChip}>
              <DKText variant="micro" color={DK.onNight}>
                {selectedType?.label ?? 'סוג לא נבחר'}
              </DKText>
            </View>
            <View style={styles.glassChip}>
              <View style={[styles.dot, { backgroundColor: statusTone }]} />
              <DKText variant="micro" color={DK.onNight}>
                {selectedStatus.label}
              </DKText>
            </View>
          </View>
          <View style={styles.progress} accessible accessibilityLabel={`${filledCount} מתוך ${REQUIRED_FIELDS.length} שדות חובה מולאו`}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(4, progress * 100)}%` }]} />
            </View>
            <DKText variant="micro" color={DK.onNightMuted} ltr>
              {`${filledCount}/${REQUIRED_FIELDS.length}`}
            </DKText>
          </View>
        </View>
      }
      footer={
        <View style={styles.footer}>
          <PrimaryAction label={canSubmit ? ctaLabel : 'השלמת שדות החובה'} icon={isEdit ? 'checkmark' : 'add'} onPress={() => void save()} loading={saving} disabled={!canSubmit} />
          <DKText variant="caption" color={canSubmit ? STATUS.ok.fg : DK.muted} style={styles.center}>
            {remainingText}
          </DKText>
        </View>
      }
    >
      <Reveal index={0}>
        <KitSection>
          <EditField
            first
            label="מספר רישוי"
            required
            value={formatPlate(form.plate_number)}
            onChangeText={(value) => set('plate_number', value.replace(/\D/g, '').slice(0, 8))}
            error={errors.plate_number}
            placeholder="12-345-67"
            keyboardType="number-pad"
            maxLength={11}
            ltr
          />
          <ActionRow
            first={false}
            icon="cloud-download-outline"
            label={lookupLoading ? 'מחפש במאגר…' : 'מילוי אוטומטי לפי מספר הרישוי'}
            hint="יצרן, דגם, שנה, צבע ותוקף הרישוי ממאגר משרד התחבורה"
            onPress={() => void lookupVehicle()}
            disabled={lookupLoading}
          />
        </KitSection>
      </Reveal>
      {!!lookupMessage && <Banner tone="info">{lookupMessage}</Banner>}

      <Reveal index={1}>
        <KitSection title="סוג הרכב">
          <View style={styles.types} accessibilityRole="radiogroup">
            {VEHICLE_TYPE_OPTIONS.map((option) => {
              const active = form.vehicle_type === option.value;
              return (
                <Pressy
                  key={option.value}
                  onPress={() => set('vehicle_type', option.value)}
                  accessibilityLabel={`${option.label}, ${option.description}`}
                  style={[styles.type, active && styles.typeActive]}
                  pressScale={0.96}
                >
                  <Ionicons name={TYPE_ICONS[option.value]} size={22} color={active ? '#FFFFFF' : DK.accent} />
                  <DKText variant="label" color={active ? '#FFFFFF' : DK.ink}>
                    {option.label}
                  </DKText>
                  <DKText variant="micro" color={active ? 'rgba(255,255,255,0.8)' : DK.muted}>
                    {option.description}
                  </DKText>
                </Pressy>
              );
            })}
          </View>
          {!!errors.vehicle_type && <DKText variant="caption" color={STATUS.expired.fg} style={styles.typeError}>{errors.vehicle_type}</DKText>}
        </KitSection>
      </Reveal>

      <Reveal index={2}>
        <KitSection title="פרטי הרכב">
          <EditField first label="יצרן" value={form.manufacturer} onChangeText={(value) => set('manufacturer', value)} placeholder="לא חובה" />
          <EditField label="דגם" value={form.model} onChangeText={(value) => set('model', value)} placeholder="לא חובה" />
          <EditField label="צבע" value={form.color} onChangeText={(value) => set('color', value)} placeholder="לא חובה" />
          <EditField
            label="שנת ייצור"
            error={errors.production_year || errors.production_month}
            editor={
              <View style={styles.pair}>
                <View style={styles.flex}>
                  <Select value={form.production_month || null} onChange={(value) => set('production_month', value ?? '')} options={MONTH_OPTIONS} placeholder="חודש" allowClear hasError={!!errors.production_month} />
                </View>
                <View style={styles.flex}>
                  <Select value={form.production_year || null} onChange={(value) => set('production_year', value ?? '')} options={years} placeholder="שנה" allowClear hasError={!!errors.production_year} />
                </View>
              </View>
            }
          />
          <EditField label="עלייה לכביש" error={errors.road_registration_date} editor={<DateField value={form.road_registration_date || null} onChange={(value) => set('road_registration_date', value ?? '')} placeholder="בחירת תאריך" hasError={!!errors.road_registration_date} />} />
          <EditField label="תוקף רישיון הרכב" editor={<DateField value={form.vehicle_license_expiry || null} onChange={(value) => set('vehicle_license_expiry', value ?? '')} placeholder="בחירת תאריך" />} hint="תזכורת תישלח לפני שהתוקף פג" />
          <EditField label="קילומטראז׳ נוכחי" value={formatKm(form.odometer)} onChangeText={(value) => set('odometer', value.replace(/\D/g, ''))} placeholder="לא חובה" keyboardType="number-pad" ltr />
        </KitSection>
      </Reveal>

      <Reveal index={3}>
        <KitSection title="זיהוי וארגון">
          <EditField first label="מספר שלדה (VIN)" value={form.vin} onChangeText={(value) => set('vin', value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17))} error={errors.vin} placeholder="17 תווים" ltr />
          <EditField label="קוד פנימי" value={form.internal_code} onChangeText={(value) => set('internal_code', value)} placeholder="לא חובה" ltr />
          <EditField
            label="סטטוס"
            required
            error={errors.status}
            editor={
              <Segmented<VehicleStatus>
                value={STATUS_OPTIONS.some((o) => o.value === form.status) ? form.status : 'active'}
                onChange={(value) => set('status', value)}
                options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            }
          />
          <EditField label="מחלקה" editor={<Select value={form.department_id} onChange={(value) => set('department_id', value)} options={departments} placeholder={departments.length ? 'בחירת מחלקה' : 'לא הוגדרו מחלקות'} allowClear />} />
          <EditField label="שימוש ברכב" value={form.usage_type} onChangeText={(value) => set('usage_type', value)} placeholder="לא חובה" />
          <EditField label="סוג עסקה" editor={<Select<AcquisitionType> value={form.acquisition_type} onChange={(value) => set('acquisition_type', value)} options={DEAL_TYPE_OPTIONS} placeholder="בחירת סוג עסקה" allowClear />} />
        </KitSection>
      </Reveal>

      <Reveal index={4}>
        {isEdit ? (
          <KitSection title="נהגים משויכים" surfaceStyle={styles.pad}>
            <VehicleDriversEditor vehicleId={vehicleId!} assignments={vehicleDrivers} driverOptions={drivers} onChanged={reloadVehicleDrivers} />
          </KitSection>
        ) : (
          <Banner tone="info" icon="people" title="נהגים משויכים">
            אחרי שמירת הרכב אפשר לשייך אליו נהגים מתוך תיק הרכב.
          </Banner>
        )}
      </Reveal>
    </DriverPage>
  );
}

const TYPE_ICONS: Record<VehicleType, React.ComponentProps<typeof Ionicons>['name']> = {
  car: 'car-sport',
  minibus: 'bus-outline',
  truck: 'cube',
  bus: 'bus',
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  pad: { padding: 16 },
  preview: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  glassChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: DK.glass, borderWidth: 1, borderColor: DK.glassBorder },
  dot: { width: 8, height: 8, borderRadius: 4 },
  progress: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginTop: 16 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden', flexDirection: 'row-reverse' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: DK.mint },
  footer: { gap: 6 },
  types: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, padding: 14 },
  type: { width: '47%', flexGrow: 1, minHeight: 96, borderRadius: 18, padding: 12, gap: 2, justifyContent: 'center', backgroundColor: DK.surfaceSunk },
  typeActive: { backgroundColor: DK.accent },
  typeError: { paddingHorizontal: 16, paddingBottom: 12 },
  pair: { flexDirection: 'row-reverse', gap: 10 },
});
