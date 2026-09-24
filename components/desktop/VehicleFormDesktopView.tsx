import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatPlate } from '../../lib/plate';
import { VehicleDriversEditor } from '../VehicleDriversEditor';
import { AcquisitionType, VehicleDriverWithProfile, VehicleStatus, VehicleType } from '../../lib/adminApi';
import { DesktopDateField, DesktopFieldRow, DesktopInput, DesktopSelect, DesktopSelectOption, DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS } from './desktopTheme';
import { formDesktopStyles } from './formDesktopStyles';

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

/**
 * Desktop body of the vehicle create/edit form — same dense-row pattern as
 * DriverFormDesktopView. Purely presentational; VehicleFormScreen owns
 * state, validation, registry lookup and the date pickers.
 */
export function VehicleFormDesktopView({
  isEdit,
  vehicleId,
  form,
  set,
  errors,
  departments,
  vehicleTypeOptions,
  statusOptions,
  dealTypeOptions,
  monthOptions,
  yearOptions,
  drivers,
  vehicleDrivers,
  onReloadVehicleDrivers,
  onLookupVehicle,
  lookupLoading,
  lookupMessage,
  canSubmit,
  saving,
  ctaLabel,
  remainingText,
  onSave,
}: {
  isEdit: boolean;
  vehicleId?: string;
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  errors: Record<string, string>;
  departments: DesktopSelectOption<string>[];
  vehicleTypeOptions: { value: VehicleType; label: string; description: string }[];
  statusOptions: { value: VehicleStatus; label: string }[];
  dealTypeOptions: DesktopSelectOption<AcquisitionType>[];
  monthOptions: DesktopSelectOption<string>[];
  yearOptions: DesktopSelectOption<string>[];
  drivers: { value: string; label: string }[];
  vehicleDrivers: VehicleDriverWithProfile[];
  onReloadVehicleDrivers: () => void;
  onLookupVehicle: () => void;
  lookupLoading: boolean;
  lookupMessage: string | null;
  canSubmit: boolean;
  saving: boolean;
  ctaLabel: string;
  remainingText: string;
  onSave: () => void;
}) {
  const heroTitle =
    [form.manufacturer, form.model].filter(Boolean).join(' ').trim() ||
    (form.plate_number ? formatPlate(form.plate_number) : 'רכב ללא זיהוי');

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.heroRow}>
        <View style={styles.avatar}>
          <Ionicons name="car-sport-outline" size={24} color={DESKTOP_COLORS.brand} />
        </View>
        <View style={styles.heroText}>
          <DText weight="bold" style={styles.heroName}>{heroTitle}</DText>
          <DText style={styles.heroSub}>
            {vehicleTypeOptions.find((o) => o.value === form.vehicle_type)?.label ?? 'סוג לא נבחר'}
          </DText>
        </View>
      </View>

      <Section title="זיהוי הרכב">
        <DesktopFieldRow label="מספר רישוי" required error={errors.plate_number}>
          <View style={styles.plateRow}>
            <DesktopInput
              value={formatPlate(form.plate_number)}
              onChangeText={(v) => set('plate_number', v.replace(/\D/g, '').slice(0, 8))}
              placeholder="12-345-67"
              ltr
              hasError={!!errors.plate_number}
              style={styles.plateInput}
            />
            <HoverPressable style={styles.lookupButton} onPress={onLookupVehicle} disabled={lookupLoading}>
              {lookupLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="search-outline" size={14} color="#FFFFFF" />
              )}
              <DText weight="semiBold" style={styles.lookupButtonText}>חפש</DText>
            </HoverPressable>
          </View>
          {!!lookupMessage && <DText style={styles.lookupMessage}>{lookupMessage}</DText>}
        </DesktopFieldRow>
        <DesktopFieldRow label="סוג רכב" required error={errors.vehicle_type}>
          <DesktopSelect
            value={form.vehicle_type || null}
            onChange={(v) => set('vehicle_type', (v ?? '') as FormVehicleType)}
            options={vehicleTypeOptions}
            placeholder="בחר סוג רכב"
            hasError={!!errors.vehicle_type}
          />
        </DesktopFieldRow>
        <DesktopFieldRow label="יצרן">
          <DesktopInput value={form.manufacturer} onChangeText={(v) => set('manufacturer', v)} placeholder="אופציונלי" />
        </DesktopFieldRow>
        <DesktopFieldRow label="דגם">
          <DesktopInput value={form.model} onChangeText={(v) => set('model', v)} placeholder="אופציונלי" />
        </DesktopFieldRow>
        <DesktopFieldRow label="צבע">
          <DesktopInput value={form.color} onChangeText={(v) => set('color', v)} placeholder="אופציונלי" />
        </DesktopFieldRow>
        <DesktopFieldRow label="קוד פנימי">
          <DesktopInput value={form.internal_code} onChangeText={(v) => set('internal_code', v)} placeholder="אופציונלי" ltr />
        </DesktopFieldRow>
        <DesktopFieldRow label="שילדה (VIN)" error={errors.vin}>
          <DesktopInput
            value={form.vin}
            onChangeText={(v) => set('vin', v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17))}
            placeholder="אופציונלי"
            ltr
            hasError={!!errors.vin}
          />
        </DesktopFieldRow>
        <DesktopFieldRow label="קילומטראז'">
          <DesktopInput
            value={form.odometer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            onChangeText={(v) => set('odometer', v.replace(/\D/g, ''))}
            placeholder="אופציונלי"
            keyboardType="number-pad"
            ltr
          />
        </DesktopFieldRow>
        <DesktopFieldRow label="שנת ייצור" error={errors.production_year || errors.production_month}>
          <View style={styles.pairRow}>
            <View style={styles.pairHalf}>
              <DesktopSelect value={form.production_month || null} onChange={(v) => set('production_month', v ?? '')} options={monthOptions} placeholder="חודש" allowClear />
            </View>
            <View style={styles.pairHalf}>
              <DesktopSelect value={form.production_year || null} onChange={(v) => set('production_year', v ?? '')} options={yearOptions} placeholder="שנה" allowClear />
            </View>
          </View>
        </DesktopFieldRow>
        <DesktopFieldRow label="עליה לכביש" error={errors.road_registration_date}>
          <DesktopDateField
            value={form.road_registration_date || null}
            onChange={(iso) => set('road_registration_date', iso ?? '')}
            placeholder="לא נבחר תאריך"
            hasError={!!errors.road_registration_date}
          />
        </DesktopFieldRow>
        <DesktopFieldRow label="תוקף רישיון רכב" last>
          <DesktopDateField
            value={form.vehicle_license_expiry || null}
            onChange={(iso) => set('vehicle_license_expiry', iso ?? '')}
            placeholder="לא נבחר תאריך"
          />
        </DesktopFieldRow>
      </Section>

      <Section title="שיוך וסטטוס">
        <DesktopFieldRow label="סטטוס" error={errors.status}>
          <DesktopSelect
            value={form.status}
            onChange={(v) => v && set('status', v)}
            options={statusOptions}
            placeholder="בחר סטטוס"
          />
        </DesktopFieldRow>
        <DesktopFieldRow label="מחלקה">
          <DesktopSelect
            value={form.department_id}
            onChange={(v) => set('department_id', v)}
            options={departments}
            placeholder={departments.length ? 'בחר מחלקה' : 'לא הוגדרו מחלקות'}
            allowClear
          />
        </DesktopFieldRow>
        <DesktopFieldRow label="שימוש הרכב">
          <DesktopInput value={form.usage_type} onChangeText={(v) => set('usage_type', v)} placeholder="אופציונלי" />
        </DesktopFieldRow>
        <DesktopFieldRow label="סוג עסקה" last>
          <DesktopSelect
            value={form.acquisition_type}
            onChange={(v) => set('acquisition_type', v)}
            options={dealTypeOptions}
            placeholder="בחר סוג עסקה"
            allowClear
          />
        </DesktopFieldRow>
      </Section>

      <Section title="נהגים משויכים">
        {isEdit && vehicleId ? (
          <View style={styles.card}>
            <VehicleDriversEditor
              vehicleId={vehicleId}
              assignments={vehicleDrivers}
              driverOptions={drivers}
              onChanged={onReloadVehicleDrivers}
              desktop
            />
          </View>
        ) : (
          <View style={styles.infoCard}>
            <Ionicons name="people-outline" size={18} color={DESKTOP_COLORS.brand} />
            <DText style={styles.infoText}>
              ניתן לשייך נהגים לרכב לאחר יצירתו — שמור את הרכב תחילה, ואז פתח את תיק הרכב כדי להוסיף נהגים.
            </DText>
          </View>
        )}
      </Section>

      <View style={styles.footer}>
        <HoverPressable
          style={[styles.cta, !canSubmit && styles.ctaDisabled]}
          hoverStyle={canSubmit ? { backgroundColor: DESKTOP_COLORS.brandHover } : undefined}
          onPress={onSave}
          disabled={!canSubmit || saving}
        >
          <DText weight="bold" style={[styles.ctaText, !canSubmit && styles.ctaTextDisabled, saving && { opacity: 0 }]}>
            {canSubmit ? ctaLabel : 'השלם את שדות החובה'}
          </DText>
          {saving && <ActivityIndicator size="small" color="#FFFFFF" style={StyleSheet.absoluteFill} />}
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
  ...formDesktopStyles,
  plateRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  plateInput: { flex: 1 },
  lookupButton: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: DESKTOP_COLORS.brand,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  lookupButtonText: { fontSize: 12, color: '#FFFFFF' },
  lookupMessage: { fontSize: 11.5, color: DESKTOP_COLORS.inkMuted, marginTop: 6 },
  pairRow: { flexDirection: 'row-reverse', gap: 8 },
  pairHalf: { flex: 1 },
  infoCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 14 },
  infoText: { flex: 1, fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, lineHeight: 18 },
});
