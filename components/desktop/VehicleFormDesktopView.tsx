import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { BrandLoader } from '../ui/BrandLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { formatPlate } from '../../lib/plate';
import { VehicleDriversEditor } from '../VehicleDriversEditor';
import { AcquisitionType, VehicleDriverWithProfile, VehicleStatus, VehicleType } from '../../lib/adminApi';
import { DesktopDateField, DesktopInput, DesktopSelect, DesktopSelectOption, DLtrText, DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, DESKTOP_FONT, DESKTOP_TONES, webOnly } from './desktopTheme';
import {
  ChoiceTiles,
  CreateDock,
  FormCell,
  FormNote,
  FormPanel,
  FormSection,
  GhostBar,
  LiveCard,
  RecordFormPage,
  RecordHero,
  useSectionJump,
  type ChoiceTile,
  type FormStep,
} from './form/RecordFormKit';

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

type StepKey = 'identity' | 'details' | 'assign' | 'drivers';
type MciName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const TYPE_ART: Record<VehicleType, MciName> = {
  car: 'car-side',
  minibus: 'van-utility',
  truck: 'truck',
  bus: 'bus-side',
};

const STATUS_DOT: Partial<Record<VehicleStatus, string>> = {
  active: '#34C759',
  maintenance: '#FF9500',
  disabled: '#8B98A4',
};

/** Common Hebrew color names → a swatch for the card. Anything else shows without one. */
const COLOR_SWATCH: [RegExp, string][] = [
  [/לבן|שנהב/, '#FFFFFF'],
  [/שחור/, '#1B1F24'],
  [/כסו?ף|מטאלי/, '#C4CAD0'],
  [/אפור/, '#7D8791'],
  [/אדום|בורדו/, '#C8342B'],
  [/כחול|תכלת/, '#1F5FAF'],
  [/ירוק/, '#2E8B57'],
  [/צהוב/, '#F2C200'],
  [/כתום/, '#F07A1A'],
  [/חום|בז/, '#8A6A4F'],
];

const swatchFor = (color: string) => COLOR_SWATCH.find(([re]) => re.test(color))?.[1];

/**
 * Desktop body of the vehicle create/edit form — the same record-form design
 * as DriverFormDesktopView (form/RecordFormKit): the vehicle's card, with its
 * yellow plate, builds itself in the hero. Purely presentational;
 * VehicleFormScreen owns state, validation and the registry lookup.
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
  const { scrollRef, track, jump } = useSectionJump<StepKey>();

  const hasPlate = !!form.plate_number.trim();
  const hasType = !!form.vehicle_type;
  const hasStatus = !!form.status;
  const total = 3;
  const filled = [hasPlate, hasType, hasStatus].filter(Boolean).length;

  const steps: FormStep<StepKey>[] = [
    { key: 'identity', label: 'זיהוי הרכב', total: 2, filled: Number(hasPlate) + Number(hasType) },
    { key: 'details', label: 'פרטי הרכב', total: 0, filled: 0 },
    { key: 'assign', label: 'סטטוס', total: 1, filled: Number(hasStatus) },
    { key: 'drivers', label: 'נהגים', total: 0, filled: 0 },
  ];

  const missing = [
    !hasPlate && { label: 'מספר רישוי', onPress: () => jump('identity') },
    !hasType && { label: 'סוג רכב', onPress: () => jump('identity') },
    !hasStatus && { label: 'סטטוס', onPress: () => jump('assign') },
  ].filter(Boolean) as { label: string; onPress: () => void }[];

  const typeTiles: ChoiceTile<VehicleType>[] = vehicleTypeOptions.map((o) => ({
    ...o,
    art: (color) => <MaterialCommunityIcons name={TYPE_ART[o.value] ?? 'car-side'} size={30} color={color} />,
  }));
  const statusTiles: ChoiceTile<VehicleStatus>[] = statusOptions.map((o) => ({ ...o, dot: STATUS_DOT[o.value] }));
  const typeLabel = vehicleTypeOptions.find((o) => o.value === form.vehicle_type)?.label;
  const statusLabel = statusOptions.find((o) => o.value === form.status)?.label;

  return (
    <RecordFormPage
      scrollRef={scrollRef}
      dock={
        <CreateDock
          total={total}
          filled={filled}
          missing={missing}
          canSubmit={canSubmit}
          saving={saving}
          ctaLabel={ctaLabel}
          ctaIcon={isEdit ? 'checkmark-circle' : 'add-circle'}
          readyText={remainingText}
          onSave={onSave}
        />
      }
    >
      <RecordHero
        icon="car-sport"
        eyebrow={isEdit ? 'עריכת רכב' : 'רכב חדש'}
        title={
          isEdit
            ? [form.manufacturer, form.model].filter(Boolean).join(' ').trim() || formatPlate(form.plate_number) || 'פרטי הרכב'
            : 'בואו נוסיף רכב לצי'
        }
        subtitle={
          isEdit
            ? 'כל שינוי כאן נשמר בתיק הרכב.'
            : 'מקלידים מספר רישוי ובוחרים סוג — וזהו. את שאר הפרטים אפשר למלא אוטומטית ממשרד התחבורה.'
        }
        steps={steps}
        onJump={jump}
        card={<VehicleCard form={form} typeLabel={typeLabel} statusLabel={statusLabel} />}
      />

      <FormSection
        index={0}
        title="זיהוי הרכב"
        hint="מספר הרישוי וסוג הרכב — שני הפרטים היחידים שחובה למלא."
        done={hasPlate && hasType}
        onLayout={track('identity')}
      >
        <FormPanel>
          <FormCell label="מספר רישוי" required error={errors.plate_number}>
            <View style={styles.plateRow}>
              <PlateInput
                value={form.plate_number}
                onChange={(v) => set('plate_number', v)}
                hasError={!!errors.plate_number}
              />
              <HoverPressable
                style={[styles.lookup, (!hasPlate || lookupLoading) && styles.lookupIdle]}
                hoverStyle={hasPlate ? styles.lookupHover : undefined}
                pressMotionStyle={styles.lookupPress}
                onPress={onLookupVehicle}
                disabled={lookupLoading}
                accessibilityLabel="מילוי פרטי הרכב ממשרד התחבורה"
              >
                {lookupLoading ? (
                  <BrandLoader size="small" color={DESKTOP_COLORS.brand} />
                ) : (
                  <Ionicons name="sparkles" size={18} color={DESKTOP_COLORS.brand} />
                )}
                <View>
                  <DText weight="bold" style={styles.lookupTitle}>{lookupLoading ? 'מחפש…' : 'מילוי אוטומטי'}</DText>
                  <DText style={styles.lookupSub}>ממשרד התחבורה</DText>
                </View>
              </HoverPressable>
            </View>
            {!!lookupMessage && (
              <View style={styles.lookupMessage}>
                <Ionicons name="information-circle" size={16} color={DESKTOP_COLORS.brand} />
                <DText style={styles.lookupMessageText}>{lookupMessage}</DText>
              </View>
            )}
          </FormCell>
          <FormCell label="סוג רכב" required error={errors.vehicle_type}>
            <ChoiceTiles
              label="סוג רכב"
              value={form.vehicle_type || null}
              options={typeTiles}
              hasError={!!errors.vehicle_type}
              onChange={(v) => set('vehicle_type', v)}
            />
          </FormCell>
        </FormPanel>
      </FormSection>

      <FormSection
        index={1}
        title="פרטי הרכב"
        hint="לא חובה. ״מילוי אוטומטי״ ממלא את רובם בשבילכם."
        done={false}
        onLayout={track('details')}
      >
        <FormPanel>
          <FormCell label="יצרן">
            <DesktopInput large value={form.manufacturer} onChangeText={(v) => set('manufacturer', v)} placeholder="לדוגמה: טויוטה" />
          </FormCell>
          <FormCell label="דגם">
            <DesktopInput large value={form.model} onChangeText={(v) => set('model', v)} placeholder="לדוגמה: קורולה" />
          </FormCell>
          <FormCell label="צבע">
            <View style={styles.colorRow}>
              <View
                style={[styles.colorSwatch, !swatchFor(form.color) && styles.colorSwatchEmpty, { backgroundColor: swatchFor(form.color) ?? 'transparent' }]}
              />
              <DesktopInput large value={form.color} onChangeText={(v) => set('color', v)} placeholder="לדוגמה: לבן" style={styles.flex} />
            </View>
          </FormCell>
          <FormCell label="שנת ייצור" error={errors.production_year || errors.production_month}>
            <View style={styles.pairRow}>
              <View style={styles.flex}>
                <DesktopSelect large value={form.production_year || null} onChange={(v) => set('production_year', v ?? '')} options={yearOptions} placeholder="שנה" allowClear />
              </View>
              <View style={styles.flex}>
                <DesktopSelect large value={form.production_month || null} onChange={(v) => set('production_month', v ?? '')} options={monthOptions} placeholder="חודש" allowClear />
              </View>
            </View>
          </FormCell>
          <FormCell label="קילומטראז׳">
            <DesktopInput
              large
              value={form.odometer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              onChangeText={(v) => set('odometer', v.replace(/\D/g, ''))}
              placeholder="0"
              keyboardType="number-pad"
              ltr
            />
          </FormCell>
          <FormCell label="עלייה לכביש" error={errors.road_registration_date}>
            <DesktopDateField
              large
              value={form.road_registration_date || null}
              onChange={(iso) => set('road_registration_date', iso ?? '')}
              placeholder="בחירת תאריך"
              hasError={!!errors.road_registration_date}
            />
          </FormCell>
          <FormCell label="תוקף רישיון רכב" hint="נזכיר לכם לפני שהרישיון פג">
            <DesktopDateField
              large
              value={form.vehicle_license_expiry || null}
              onChange={(iso) => set('vehicle_license_expiry', iso ?? '')}
              placeholder="בחירת תאריך"
            />
          </FormCell>
          <FormCell label="מספר שלדה" error={errors.vin} hint="17 תווים באנגלית ומספרים (VIN)">
            <DesktopInput
              large
              value={form.vin}
              onChangeText={(v) => set('vin', v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17))}
              placeholder="לא חובה"
              ltr
              hasError={!!errors.vin}
            />
          </FormCell>
          <FormCell label="קוד פנימי">
            <DesktopInput large value={form.internal_code} onChangeText={(v) => set('internal_code', v)} placeholder="לא חובה" ltr />
          </FormCell>
        </FormPanel>
      </FormSection>

      <FormSection
        index={2}
        title="שיוך וסטטוס"
        hint="האם הרכב על הכביש, ולאיזו מחלקה הוא שייך."
        done={hasStatus}
        onLayout={track('assign')}
      >
        <FormPanel>
          <FormCell label="סטטוס" required error={errors.status}>
            <ChoiceTiles label="סטטוס" value={form.status} options={statusTiles} onChange={(v) => set('status', v)} />
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
          <FormCell label="שימוש ברכב">
            <DesktopInput large value={form.usage_type} onChangeText={(v) => set('usage_type', v)} placeholder="לדוגמה: הובלות" />
          </FormCell>
          <FormCell label="סוג עסקה">
            <DesktopSelect
              large
              value={form.acquisition_type}
              onChange={(v) => set('acquisition_type', v)}
              options={dealTypeOptions}
              placeholder="בחירת סוג עסקה"
              allowClear
            />
          </FormCell>
        </FormPanel>
      </FormSection>

      <FormSection
        index={3}
        title="נהגים"
        hint="מי נוהג ברכב הזה."
        done={isEdit && vehicleDrivers.length > 0}
        onLayout={track('drivers')}
      >
        {isEdit && vehicleId ? (
          <View style={styles.driversPanel}>
            <VehicleDriversEditor
              vehicleId={vehicleId}
              assignments={vehicleDrivers}
              driverOptions={drivers}
              onChanged={onReloadVehicleDrivers}
              desktop
            />
          </View>
        ) : (
          <FormNote
            icon="people"
            title="משייכים נהגים אחרי שהרכב נוצר"
            text="לוחצים על ״צור רכב״ למטה, ובתיק הרכב שנפתח אפשר להוסיף נהגים ומסמכים."
          />
        )}
      </FormSection>
    </RecordFormPage>
  );
}

/** The plate field drawn as an Israeli plate: yellow, the blue IL band, big black digits. */
function PlateInput({ value, onChange, hasError }: { value: string; onChange: (v: string) => void; hasError?: boolean }) {
  return (
    <View style={[styles.plate, hasError && styles.plateError]}>
      <View style={styles.plateBand}>
        <DText weight="extraBold" style={styles.plateBandText}>IL</DText>
      </View>
      <TextInput
        value={formatPlate(value)}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 8))}
        placeholder="12-345-67"
        placeholderTextColor="rgba(17,17,17,0.28)"
        keyboardType="number-pad"
        accessibilityLabel="מספר רישוי"
        style={[styles.plateInput, webOnly({ outlineStyle: 'none', fontVariantNumeric: 'tabular-nums' })]}
      />
    </View>
  );
}

/** The vehicle as a card, filling in while the form is typed. */
function VehicleCard({ form, typeLabel, statusLabel }: { form: FormState; typeLabel?: string; statusLabel?: string }) {
  const plate = formatPlate(form.plate_number);
  const name = [form.manufacturer, form.model].filter(Boolean).join(' ').trim();
  const swatch = swatchFor(form.color);
  const meta = [form.production_year, form.color.trim()].filter(Boolean).join(' · ');
  const art = form.vehicle_type ? TYPE_ART[form.vehicle_type] : null;

  return (
    <LiveCard label={plate ? `כרטיס הרכב ${plate}` : 'כרטיס רכב חדש'}>
      <View style={styles.card}>
        <View style={styles.cardPlate}>
          <View style={styles.cardPlateBand}>
            <DText weight="extraBold" style={styles.cardPlateBandText}>IL</DText>
          </View>
          <DLtrText weight="extraBold" style={[styles.cardPlateText, !plate && styles.cardPlateGhost]} numberOfLines={1}>
            {plate || '00-000-00'}
          </DLtrText>
        </View>

        <View style={styles.cardMid}>
          <View style={styles.cardArt}>
            {art ? (
              <MaterialCommunityIcons name={art} size={34} color="#FFFFFF" />
            ) : (
              <Ionicons name="help" size={26} color="rgba(255,255,255,0.9)" />
            )}
          </View>
          <View style={styles.cardLines}>
            {name ? (
              <DText weight="extraBold" style={styles.cardName} numberOfLines={1}>{name}</DText>
            ) : (
              <GhostBar width={140} dark />
            )}
            <View style={styles.cardMetaRow}>
              {!!swatch && <View style={[styles.cardSwatch, { backgroundColor: swatch }]} />}
              {meta ? (
                <DText weight="medium" style={styles.cardMeta} numberOfLines={1}>{meta}</DText>
              ) : (
                <GhostBar width={90} />
              )}
            </View>
          </View>
        </View>

        <View style={styles.cardFoot}>
          <DText weight="semiBold" style={[styles.cardType, !typeLabel && styles.cardTypeEmpty]}>
            {typeLabel ?? 'סוג לא נבחר'}
          </DText>
          {!!statusLabel && (
            <View style={styles.cardStatus}>
              <View style={[styles.cardStatusDot, { backgroundColor: STATUS_DOT[form.status] ?? DESKTOP_TONES.neutral.fg }]} />
              <DText weight="semiBold" style={styles.cardStatusText}>{statusLabel}</DText>
            </View>
          )}
        </View>
      </View>
    </LiveCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pairRow: { flexDirection: 'row-reverse', gap: 10 },
  colorRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  colorSwatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(22,34,46,0.14)',
    ...webOnly({ boxShadow: 'inset 0 -3px 6px rgba(0,0,0,0.12)' }),
  },
  colorSwatchEmpty: { borderStyle: 'dashed', borderColor: DESKTOP_COLORS.borderInput },

  plateRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  plate: {
    flexGrow: 1,
    flexBasis: 240,
    maxWidth: 320,
    height: 60,
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: '#16222E',
    overflow: 'hidden',
    backgroundColor: '#F7C600',
    ...webOnly({
      backgroundImage: 'linear-gradient(180deg, #FFDC45 0%, #F2C200 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 6px rgba(22,34,46,0.12)',
    }),
  },
  plateError: { borderColor: DESKTOP_TONES.bad.fg },
  plateBand: { width: 30, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 7, backgroundColor: '#1A55A6' },
  plateBandText: { fontSize: 11, color: '#FFFFFF' },
  plateInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    fontFamily: DESKTOP_FONT.extraBold,
    fontSize: 30,
    letterSpacing: 1.5,
    color: '#111111',
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  lookup: {
    height: 60,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#E6F4FB',
    borderWidth: 1,
    borderColor: 'rgba(0,136,204,0.22)',
    ...webOnly({ transition: 'background-color 150ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1)' }),
  },
  lookupIdle: { opacity: 0.6 },
  lookupHover: { backgroundColor: '#D6EDF9' },
  lookupPress: { transform: [{ scale: 0.97 }] },
  lookupTitle: { fontSize: 15.5, color: DESKTOP_COLORS.brand },
  lookupSub: { fontSize: 13, color: DESKTOP_COLORS.inkMuted },
  lookupMessage: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
  },
  lookupMessageText: { fontSize: 14, color: DESKTOP_COLORS.ink },

  driversPanel: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 18,
    overflow: 'hidden',
    paddingHorizontal: 16,
    ...webOnly({ boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 6px 20px rgba(16,24,40,0.05)' }),
  },

  // Vehicle card
  card: { flex: 1, padding: 18, justifyContent: 'space-between' },
  cardPlate: {
    alignSelf: 'center',
    width: 236,
    height: 50,
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#16222E',
    overflow: 'hidden',
    backgroundColor: '#F7C600',
    ...webOnly({
      backgroundImage: 'linear-gradient(180deg, #FFDC45 0%, #F2C200 100%)',
      boxShadow: '0 3px 8px -2px rgba(22,34,46,0.3)',
    }),
  },
  cardPlateBand: { width: 24, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 5, backgroundColor: '#1A55A6' },
  cardPlateBandText: { fontSize: 9, color: '#FFFFFF' },
  cardPlateText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 27,
    lineHeight: 46,
    letterSpacing: 1.5,
    color: '#111111',
    ...webOnly({ fontVariantNumeric: 'tabular-nums' }),
  },
  cardPlateGhost: { color: 'rgba(17,17,17,0.22)' },
  cardMid: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  cardArt: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DESKTOP_COLORS.brand,
    ...webOnly({
      backgroundImage: 'linear-gradient(160deg, #5FC1F0 0%, #0088CC 60%, #0070A8 100%)',
      boxShadow: '0 6px 14px -6px rgba(0,136,204,0.6)',
    }),
  },
  cardLines: { flex: 1, minWidth: 0, gap: 8 },
  cardName: { fontSize: 20, lineHeight: 24, letterSpacing: -0.4, color: DESKTOP_COLORS.ink },
  cardMetaRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  cardSwatch: { width: 13, height: 13, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(22,34,46,0.18)' },
  cardMeta: { fontSize: 14, color: DESKTOP_COLORS.inkMuted, flexShrink: 1 },
  cardFoot: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(22,34,46,0.08)',
  },
  cardType: { fontSize: 14, color: DESKTOP_COLORS.ink },
  cardTypeEmpty: { color: DESKTOP_COLORS.inkFaint },
  cardStatus: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: 'rgba(22,34,46,0.06)',
  },
  cardStatusDot: { width: 8, height: 8, borderRadius: 4 },
  cardStatusText: { fontSize: 13, color: DESKTOP_COLORS.ink },
});
