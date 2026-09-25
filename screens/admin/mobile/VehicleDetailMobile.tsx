import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ActionRow,
  Banner,
  DK,
  DKText,
  DriverPage,
  EditField,
  ErrorPanel,
  HeroButton,
  InfoLine,
  KitSection,
  ListRow,
  LoadingPanel,
  Plate,
  PrimaryAction,
  Reveal,
  STATUS,
  Segmented,
  Surface,
} from '../../../components/driverKit';
import { ComplianceSection } from '../../../components/ComplianceSection';
import { VehicleDriversEditor } from '../../../components/VehicleDriversEditor';
import type { ComplianceItem, Vehicle, VehicleDriverWithProfile } from '../../../lib/adminApi';
import { ACQUISITION_TYPE_LABELS, VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '../../../lib/compliance';
import { formatPlate } from '../../../lib/plate';
import { formatDate } from '../../../lib/theme';
import { nextServiceKmOf } from '../../../lib/serviceSchedule';
import { vehicleHealth } from './FleetCards';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type VehicleTab = 'general' | 'maintenance' | 'documents' | 'drivers' | 'licensing';
type Maint = { odometer: string; last_service_km: string; service_interval_km: string; next_service_km: string };
type Folder = { category: string; title: string; icon: string; color: string; requiresExpiry: boolean };

type Props = {
  insetTop: number;
  insetBottom: number;
  loading: boolean;
  error: string | null;
  vehicle: Vehicle | null;
  companyId: string;
  department: string | null;
  compliance: ComplianceItem[];
  drivers: VehicleDriverWithProfile[];
  driverOptions: { value: string; label: string }[];
  tab: VehicleTab;
  onTab: (tab: VehicleTab) => void;
  focusItem: string | null;
  folders: Folder[];
  editingMaintenance: boolean;
  maintenance: Maint;
  derivedNextServiceKm: number | null;
  savingMaintenance: boolean;
  lookupLoading: boolean;
  lookupMessage: string | null;
  scrollRef: React.Ref<any>;
  onBack: () => void;
  onRetry: () => void;
  onEdit: () => void;
  onLookup: () => void;
  onEditMaintenance: () => void;
  onCancelMaintenance: () => void;
  onChangeMaintenance: (field: keyof Maint, value: string) => void;
  onSaveMaintenance: () => void;
  onDriversChanged: () => void;
  onOpenDriver: (id: string) => void;
  onOpenFolder: (folder: Folder) => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
};

const km = (n: number | null | undefined) => (n == null ? null : `${n.toLocaleString('he-IL')} ק״מ`);
const formatKm = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('he-IL') : '';
};

/**
 * A vehicle's record on the phone: plate, model and its three vital signs
 * on the night; below, four tabs — the details, who drives it, service and
 * the documents — with archiving and deleting kept apart at the end.
 */
export function VehicleDetailMobile(p: Props) {
  const v = p.vehicle;
  const name = v ? [v.manufacturer, v.model].filter(Boolean).join(' ') || 'ללא דגם' : '';
  const health = v ? vehicleHealth(v, p.compliance) : null;
  const archived = v?.status === 'archived';
  const inactive = v?.status === 'maintenance' || v?.status === 'disabled';

  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      scrollRef={p.scrollRef}
      hero={
        <View>
          <View style={styles.bar}>
            <HeroButton icon="chevron-forward" label="חזרה" onPress={p.onBack} />
            {!!v && <HeroButton icon="create-outline" label="עריכת פרטי הרכב" onPress={p.onEdit} />}
          </View>
          {!!v && (
            <Reveal>
              <DKText variant="micro" color={DK.onNightFaint}>
                {VEHICLE_TYPE_LABELS[v.vehicle_type] ?? v.vehicle_type}
                {v.production_year ? ` · ${v.production_year}` : ''}
                {v.color ? ` · ${v.color}` : ''}
              </DKText>
              <DKText variant="display" color={DK.onNight} numberOfLines={2} accessibilityRole="header">
                {name}
              </DKText>
              <View style={styles.identity}>
                <Plate number={formatPlate(v.plate_number)} />
                <View style={styles.glassChip}>
                  <View style={[styles.dot, { backgroundColor: archived ? DK.onNightFaint : inactive ? STATUS.expired.fill : STATUS.ok.fill }]} />
                  <DKText variant="micro" color={DK.onNight}>
                    {VEHICLE_STATUS_LABELS[v.status] ?? v.status}
                  </DKText>
                </View>
              </View>
              {!!health && !archived && (
                <View style={styles.health}>
                  {health.rows.map((row) => (
                    <View key={row.label} style={styles.healthCell} accessible accessibilityLabel={`${row.label}: ${row.value}, ${row.note}`}>
                      <View style={styles.healthHead}>
                        <View style={[styles.dot, { backgroundColor: STATUS[row.status].fill }]} />
                        <DKText variant="micro" color={DK.onNightMuted}>
                          {row.label}
                        </DKText>
                      </View>
                      <DKText variant="number" color={DK.onNight} numberOfLines={1} adjustsFontSizeToFit>
                        {row.value}
                      </DKText>
                      <DKText variant="micro" color={row.status === 'ok' || row.status === 'missing' ? DK.onNightFaint : STATUS[row.status].fill} numberOfLines={1}>
                        {row.note}
                      </DKText>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.tabs}>
                <Segmented<VehicleTab>
                  onNight
                  value={p.tab === 'licensing' ? 'general' : p.tab}
                  onChange={p.onTab}
                  options={[
                    { value: 'general', label: 'פרטים' },
                    { value: 'drivers', label: 'נהגים' },
                    { value: 'maintenance', label: 'טיפולים' },
                    { value: 'documents', label: 'מסמכים' },
                  ]}
                />
              </View>
            </Reveal>
          )}
        </View>
      }
    >
      {p.loading ? (
        <LoadingPanel />
      ) : p.error ? (
        <ErrorPanel message="טעינת הרכב נכשלה" hint={p.error} onRetry={p.onRetry} />
      ) : !v ? (
        <ErrorPanel message="הרכב לא נמצא" hint="ייתכן שנמחק. חזור לרשימת הרכבים." />
      ) : (
        <Reveal key={p.tab}>
          <View style={styles.body}>{renderTab(p, v)}</View>
        </Reveal>
      )}
    </DriverPage>
  );
}

function renderTab(p: Props, v: Vehicle) {
  const archived = v.status === 'archived';
  if (p.tab === 'drivers') {
    return (
      <>
        <Surface style={styles.pad}>
          <VehicleDriversEditor vehicleId={v.id} assignments={p.drivers} driverOptions={p.driverOptions} onChanged={p.onDriversChanged} onOpenDriver={p.onOpenDriver} />
        </Surface>
        <DKText variant="caption" color={DK.muted} style={styles.note}>
          הנהג הראשי רואה את הרכב במסך הבית שלו. אפשר לשייך עד שני נהגים.
        </DKText>
      </>
    );
  }
  if (p.tab === 'maintenance') {
    if (p.editingMaintenance) {
      return (
        <>
          <KitSection>
            <EditField first label="מד אוץ נוכחי (ק״מ)" value={formatKm(p.maintenance.odometer)} onChangeText={(x) => p.onChangeMaintenance('odometer', x.replace(/\D/g, ''))} keyboardType="number-pad" ltr />
            <EditField label="ק״מ בטיפול האחרון" value={formatKm(p.maintenance.last_service_km)} onChangeText={(x) => p.onChangeMaintenance('last_service_km', x.replace(/\D/g, ''))} keyboardType="number-pad" ltr />
            <EditField label="טווח ק״מ בין טיפולים" value={formatKm(p.maintenance.service_interval_km)} onChangeText={(x) => p.onChangeMaintenance('service_interval_km', x.replace(/\D/g, ''))} keyboardType="number-pad" ltr hint="כשמוגדר טווח, הטיפול הבא מחושב אוטומטית" />
            {p.derivedNextServiceKm != null ? (
              <EditField label="ק״מ לטיפול הבא" value={formatKm(String(p.derivedNextServiceKm))} editable={false} ltr hint="מחושב מהטיפול האחרון ומהטווח" />
            ) : (
              <EditField label="ק״מ לטיפול הבא" value={formatKm(p.maintenance.next_service_km)} onChangeText={(x) => p.onChangeMaintenance('next_service_km', x.replace(/\D/g, ''))} keyboardType="number-pad" ltr />
            )}
          </KitSection>
          <View style={styles.row}>
            <PrimaryAction label="ביטול" tone="ghost" onPress={p.onCancelMaintenance} style={styles.flex} />
            <PrimaryAction label="שמירה" icon="checkmark" onPress={p.onSaveMaintenance} loading={p.savingMaintenance} style={styles.flex2} />
          </View>
        </>
      );
    }
    return (
      <>
        <KitSection>
          <InfoLine first icon="speedometer" label="מד אוץ נוכחי" value={km(v.odometer)} />
          <InfoLine icon="time" label="עודכן לאחרונה" value={v.odometer_updated_at ? formatDate(v.odometer_updated_at) : null} />
          <InfoLine icon="build" label="ק״מ בטיפול האחרון" value={km(v.last_service_km)} />
          <InfoLine icon="repeat" label="טווח בין טיפולים" value={km(v.service_interval_km)} />
          <InfoLine icon="flag" label="הטיפול הבא" value={km(nextServiceKmOf(v))} />
        </KitSection>
        <PrimaryAction label="עדכון נתוני טיפול" icon="create-outline" tone="ghost" onPress={p.onEditMaintenance} />
      </>
    );
  }
  if (p.tab === 'documents') {
    return (
      <>
        <ComplianceSection companyId={p.companyId} ownerType="vehicle" ownerId={v.id} focusItemType={p.focusItem} spacious folderAppearance hiddenItemTypes={['annual_test']} />
        <KitSection title="בדיקות ובטיחות">
          {p.folders.map((folder, index) => (
            <ListRow key={folder.category} first={index === 0} icon={folder.icon as IconName} tint={folder.color} title={folder.title} onPress={() => p.onOpenFolder(folder)} />
          ))}
        </KitSection>
      </>
    );
  }
  return (
    <>
      {archived && (
        <Banner tone="missing" icon="archive" title="הרכב בארכיון">
          הוא מוסתר מרשימת הרכבים, והנתונים שלו נשמרים.
        </Banner>
      )}
      <KitSection>
        <InfoLine first icon="car-sport" label="מספר רישוי" value={formatPlate(v.plate_number)} ltr onPress={p.onEdit} />
        <InfoLine icon="pricetag" label="יצרן ודגם" value={[v.manufacturer, v.model].filter(Boolean).join(' ')} onPress={p.onEdit} />
        <InfoLine icon="color-palette" label="צבע" value={v.color} onPress={p.onEdit} />
        <InfoLine icon="grid" label="סוג רכב" value={VEHICLE_TYPE_LABELS[v.vehicle_type]} onPress={p.onEdit} />
        <InfoLine icon="calendar" label="שנת ייצור" value={v.production_year ? `${v.production_month ? `${v.production_month}/` : ''}${v.production_year}` : null} onPress={p.onEdit} />
        <InfoLine icon="flag" label="עלייה לכביש" value={v.road_registration_date ? formatDate(v.road_registration_date) : null} onPress={p.onEdit} />
        <ActionRow
          first={false}
          icon="cloud-download-outline"
          label={p.lookupLoading ? 'מחפש במאגר…' : 'מילוי לפי מספר הרישוי'}
          hint="יצרן, דגם, צבע ושנה ממאגר משרד התחבורה"
          onPress={p.onLookup}
          disabled={p.lookupLoading}
        />
      </KitSection>
      {!!p.lookupMessage && <Banner tone="info">{p.lookupMessage}</Banner>}
      <KitSection title="זיהוי וארגון">
        <InfoLine first icon="barcode" label="מספר שלדה" value={v.vin} ltr onPress={p.onEdit} />
        <InfoLine icon="code" label="קוד פנימי" value={v.internal_code} ltr onPress={p.onEdit} />
        <InfoLine icon="business" label="מחלקה" value={p.department} onPress={p.onEdit} />
        <InfoLine icon="navigate" label="שימוש ברכב" value={v.usage_type} onPress={p.onEdit} />
        <InfoLine icon="card" label="סוג עסקה" value={v.acquisition_type ? ACQUISITION_TYPE_LABELS[v.acquisition_type] ?? v.acquisition_type : null} onPress={p.onEdit} />
      </KitSection>
      <KitSection title="פעולות">
        {archived ? (
          <ActionRow icon="arrow-undo" label="הוצאה מהארכיון" hint="מחזיר את הרכב לרשימה הפעילה" onPress={p.onRestore} />
        ) : (
          <ActionRow icon="archive-outline" tone="muted" label="העברה לארכיון" hint="מסתיר את הרכב; הנתונים נשמרים" onPress={p.onArchive} />
        )}
        <ActionRow first={false} icon="trash-outline" tone="danger" label="מחיקת הרכב לצמיתות" hint="אי אפשר לבטל" onPress={p.onDelete} />
      </KitSection>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex2: { flex: 2 },
  bar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  identity: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginTop: 14 },
  glassChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: DK.glass,
    borderWidth: 1,
    borderColor: DK.glassBorder,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  health: {
    flexDirection: 'row-reverse',
    marginTop: 20,
    borderRadius: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  healthCell: { flex: 1, paddingHorizontal: 12, gap: 2 },
  healthHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  tabs: { marginTop: 18 },
  body: { gap: 18 },
  pad: { padding: 16 },
  note: { textAlign: 'center' },
  row: { flexDirection: 'row-reverse', gap: 10 },
});
