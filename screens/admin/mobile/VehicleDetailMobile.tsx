// תיק רכב בטלפון
import React, { useState } from 'react';
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
  HomeLogo,
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
  DK_RADIUS,
} from '../../../components/driverKit';
import { ComplianceSection } from '../../../components/ComplianceSection';
import { FocusTarget } from '../../../components/ui/FocusTarget';
import { VehicleDriversEditor } from '../../../components/VehicleDriversEditor';
import type { ComplianceItem, Vehicle, VehicleDriverWithProfile } from '../../../lib/adminApi';
import { ACQUISITION_TYPE_LABELS, VEHICLE_ACCESSORY_LABELS, VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '../../../lib/compliance';
import { ChoiceSheet } from '../../../components/ui/Select';
import { formatPlate } from '../../../lib/plate';
import { formatDate } from '../../../lib/theme';
import { nextServiceKmOf } from '../../../lib/serviceSchedule';
import { vehicleHealth } from './FleetCards';
import { cleanRegistryDetails, REGISTRY_DETAIL_FIELDS } from '../../../lib/vehicleRegistryFields';
import { SAFETY_FOLDER, VehicleInspectionsFolder } from '../../../components/inspection/VehicleInspectionsCard';
import { VehicleServiceFolderMobileRow } from '../../../components/service/VehicleServiceRecords';
import { t, dirIcon, getLocale } from '../../../lib/i18n';

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
  scrollRef: React.Ref<any>;
  onBack: () => void;
  onRetry: () => void;
  onEdit: () => void;
  onSaveField: (patch: Partial<Vehicle>) => Promise<string | null>;
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

// ק"מ מעוצב
const km = (n: number | null | undefined) => (n == null ? null : t('unit.kmValue', { v1: n.toLocaleString(getLocale()) }));
// ק"מ בהקלדה
const formatKm = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString(getLocale()) : '';
};

// הכותרת עם הרכב ולשוניות
/**
 * A vehicle's record on the phone: plate, model and its three vital signs
 * on the night; below, four tabs — the details, who drives it, service and
 * the documents — with archiving and deleting kept apart at the end.
 */
export function VehicleDetailMobile(p: Props) {
  const v = p.vehicle;
  const name = v ? [v.manufacturer, v.model].filter(Boolean).join(' ') || t('vehicle.noModelShort') : '';
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
            <HomeLogo />
            <HeroButton icon={dirIcon('chevron-forward')} label={t('common.goBack')} onPress={p.onBack} />
            {!!v && <HeroButton icon="create-outline" label={t('vehicle.editDetails')} onPress={p.onEdit} />}
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
                    { value: 'general', label: t('vehicle.tab.details') },
                    { value: 'documents', label: t('common.documents') },
                    { value: 'maintenance', label: t('vehicle.tab.services') },
                    { value: 'drivers', label: t('common.drivers') },
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
        <ErrorPanel message={t('vehicle.loadFailed')} hint={p.error} onRetry={p.onRetry} />
      ) : !v ? (
        <ErrorPanel message={t('vehicle.notFound')} hint={t('vehicle.maybeDeleted')} />
      ) : (
        <Reveal key={p.tab}>
          <View style={styles.body}>{renderTab(p, v)}</View>
        </Reveal>
      )}
    </DriverPage>
  );
}

// תוכן הלשונית
function renderTab(p: Props, v: Vehicle) {
  const archived = v.status === 'archived';
  if (p.tab === 'drivers') {
    return (
      <>
        <FocusTarget id="drivers" radius={DK_RADIUS.card} tint={DK.accent}>
          <Surface style={styles.pad}>
            <VehicleDriversEditor vehicleId={v.id} assignments={p.drivers} driverOptions={p.driverOptions} onChanged={p.onDriversChanged} onOpenDriver={p.onOpenDriver} />
          </Surface>
        </FocusTarget>
        <DKText variant="caption" color={DK.muted} style={styles.note}>
          {t('vehicle.primarySeesHome')}
        </DKText>
      </>
    );
  }
  if (p.tab === 'maintenance') {
    if (p.editingMaintenance) {
      return (
        <>
          <KitSection>
            <EditField first label={t('vehicle.currentOdometerKm')} value={formatKm(p.maintenance.odometer)} onChangeText={(x) => p.onChangeMaintenance('odometer', x.replace(/\D/g, ''))} keyboardType="number-pad" ltr />
            <EditField label={t('vehicle.kmAtLastService')} value={formatKm(p.maintenance.last_service_km)} onChangeText={(x) => p.onChangeMaintenance('last_service_km', x.replace(/\D/g, ''))} keyboardType="number-pad" ltr />
            <EditField label={t('vehicle.serviceInterval')} value={formatKm(p.maintenance.service_interval_km)} onChangeText={(x) => p.onChangeMaintenance('service_interval_km', x.replace(/\D/g, ''))} keyboardType="number-pad" ltr hint={t('vehicle.intervalAutoNext')} />
            {p.derivedNextServiceKm != null ? (
              <EditField label={t('vehicle.kmToNextService')} value={formatKm(String(p.derivedNextServiceKm))} editable={false} ltr hint={t('vehicle.calcFromLast')} />
            ) : (
              <EditField label={t('vehicle.kmToNextService')} value={formatKm(p.maintenance.next_service_km)} onChangeText={(x) => p.onChangeMaintenance('next_service_km', x.replace(/\D/g, ''))} keyboardType="number-pad" ltr />
            )}
          </KitSection>
          <View style={styles.row}>
            <PrimaryAction label={t('common.cancel')} tone="ghost" onPress={p.onCancelMaintenance} style={styles.flex} />
            <PrimaryAction label={t('common.save')} icon="checkmark" onPress={p.onSaveMaintenance} loading={p.savingMaintenance} style={styles.flex2} />
          </View>
        </>
      );
    }
    return (
      <>
        <KitSection>
          <InfoLine first icon="speedometer" label={t('vehicle.currentOdometer')} focusId="odometer" value={km(v.odometer)} />
          <InfoLine icon="time" label={t('common.lastUpdated')} value={v.odometer_updated_at ? formatDate(v.odometer_updated_at) : null} />
          <InfoLine icon="build" label={t('vehicle.kmAtLastService')} value={km(v.last_service_km || null)} />
          <InfoLine icon="repeat" label={t('vehicle.serviceIntervalShort')} value={km(v.service_interval_km)} />
          <InfoLine icon="flag" label={t('vehicle.nextServiceTitle')} focusId="service" value={km(nextServiceKmOf(v))} />
        </KitSection>
        <PrimaryAction label={t('vehicle.updateServiceData')} icon="create-outline" tone="ghost" onPress={p.onEditMaintenance} />
      </>
    );
  }
  if (p.tab === 'documents') {
    // בדיקות קצין בטיחות: הבדיקות והמסמכים שלהן בתיקייה אחת
    const safetyFolder = p.folders.find((f) => f.category === SAFETY_FOLDER);
    const otherFolders = p.folders.filter((f) => f.category !== SAFETY_FOLDER);
    return (
      <>
        <ComplianceSection companyId={p.companyId} ownerType="vehicle" ownerId={v.id} focusItemType={p.focusItem} spacious folderAppearance hiddenItemTypes={['annual_test']} />
        <KitSection title={t('compliance.cat.inspection')}>
          <VehicleInspectionsFolder
            first
            companyId={p.companyId}
            vehicleId={v.id}
            archived={archived}
            title={safetyFolder?.title ?? t('folder.safetyOfficerApproval')}
          />
          {otherFolders.map((folder) => (
            <ListRow key={folder.category} icon={folder.icon as IconName} tint={folder.color} title={folder.title} onPress={() => p.onOpenFolder(folder)} />
          ))}
          <VehicleServiceFolderMobileRow companyId={p.companyId} vehicleId={v.id} />
        </KitSection>
      </>
    );
  }
  const registry = cleanRegistryDetails(v.registry_details);
  return (
    <>
      {archived && (
        <Banner tone="missing" icon="archive" title={t('vehicle.archivedTitle')}>
          {t('vehicle.archivedHiddenKept')}
        </Banner>
      )}
      <KitSection>
        <InfoLine first icon="car-sport" label={t('vehicle.plateNumber')} value={formatPlate(v.plate_number)} ltr onPress={p.onEdit} />
        <InfoLine icon="pricetag" label={t('vehicle.makeAndModel')} value={[v.manufacturer, v.model].filter(Boolean).join(' ')} onPress={p.onEdit} />
        <InfoLine icon="color-palette" label={t('vehicle.color')} value={v.color} onPress={p.onEdit} />
        <InfoLine icon="grid" label={t('vehicle.typeLabel')} value={VEHICLE_TYPE_LABELS[v.vehicle_type]} onPress={p.onEdit} />
        <InfoLine icon="calendar" label={t('vehicle.productionYear')} value={v.production_year ? `${v.production_month ? `${v.production_month}/` : ''}${v.production_year}` : null} onPress={p.onEdit} />
        <InfoLine icon="flag" label={t('vehicle.onRoadDate')} value={v.road_registration_date ? formatDate(v.road_registration_date) : null} onPress={p.onEdit} />
      </KitSection>
      <KitSection title={t('vehicle.idAndOrganization')}>
        <InfoLine first icon="barcode" label={t('vehicle.vin')} value={v.vin} ltr onPress={p.onEdit} />
        <InfoLine icon="code" label={t('vehicle.internalCode')} value={v.internal_code} ltr onPress={p.onEdit} />
        <InfoLine icon="business" label={t('common.department')} value={p.department} onPress={p.onEdit} />
        <InfoLine icon="navigate" label={t('vehicle.usage')} value={v.usage_type} onPress={p.onEdit} />
        <InfoLine icon="card" label={t('vehicle.dealType')} value={v.acquisition_type ? ACQUISITION_TYPE_LABELS[v.acquisition_type] ?? v.acquisition_type : null} onPress={p.onEdit} />
        <AccessoriesLine selected={v.accessories ?? []} onSave={(accessories) => p.onSaveField({ accessories })} />
      </KitSection>
      {/* Transport Ministry values; editing (and pulling again) happens in the edit form. */}
      {REGISTRY_DETAIL_FIELDS.some((f) => f.key in registry) && (
        <KitSection title={t('registry.title')}>
          {REGISTRY_DETAIL_FIELDS.filter((f) => f.key in registry).map((f, i) => (
            <InfoLine
              key={f.key}
              first={i === 0}
              icon="document-text"
              label={f.label}
              value={f.kind === 'date' ? formatDate(registry[f.key]) : f.kind === 'number' ? Number(registry[f.key]).toLocaleString('he-IL') : registry[f.key]}
              ltr={f.ltr || f.kind === 'number'}
              onPress={p.onEdit}
            />
          ))}
        </KitSection>
      )}
      <KitSection title={t('common.actions')}>
        {archived ? (
          <ActionRow icon="arrow-undo" label={t('vehicle.takeOutOfArchive')} hint={t('vehicle.returnsToActive')} onPress={p.onRestore} />
        ) : (
          <ActionRow icon="archive-outline" tone="muted" label={t('common.moveToArchive')} hint={t('vehicle.hidesKeepsData')} onPress={p.onArchive} />
        )}
        <ActionRow first={false} icon="trash-outline" tone="danger" label={t('vehicle.deletePermanently')} hint={t('common.cannotUndo')} onPress={p.onDelete} />
      </KitSection>
    </>
  );
}

// הציוד הנלווה: שורה שפותחת חלונית סימון, כל סימון נשמר מיד
function AccessoriesLine({ selected, onSave }: { selected: string[]; onSave: (accessories: string[]) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  // Local copy so quick taps build on each other instead of on the last saved value.
  const [picked, setPicked] = useState(selected);
  const toggle = (key: string | null) => {
    if (!key) return;
    const next = picked.includes(key) ? picked.filter((k) => k !== key) : Object.keys(VEHICLE_ACCESSORY_LABELS).filter((k) => k === key || picked.includes(k));
    setPicked(next);
    // A failed save (the screen shows the error) drops the check again.
    void onSave(next).then((error) => error && setPicked(picked));
  };
  const labels = picked.map((k) => VEHICLE_ACCESSORY_LABELS[k] ?? k);
  const value = labels.length > 2 ? `${labels.slice(0, 2).join(', ')} ${t('common.andMoreV1', { v1: labels.length - 2 })}` : labels.join(', ');
  return (
    <>
      <InfoLine icon="construct" label={t('vehicle.accessories')} value={value || null} onPress={() => { setPicked(selected); setOpen(true); }} />
      <ChoiceSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('vehicle.accessories')}
        options={Object.entries(VEHICLE_ACCESSORY_LABELS).map(([key, label]) => ({ value: key, label }))}
        checked={picked}
        onPick={toggle}
      />
    </>
  );
}

// עיצוב המסך
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
