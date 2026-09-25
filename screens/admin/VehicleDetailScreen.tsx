import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { showAlert } from '../../lib/platformAlert';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, ErrorState, LoadingState, useToast } from '../../components/ui';
import { SPACING } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { ComplianceItem, Department, Vehicle, VehicleDriverWithProfile, archiveVehicle, deleteVehicle, getVehicle, listActiveVehicleDriversForVehicles, listCompliance, listDepartments, listDrivers, listVehicles, restoreVehicle, updateVehicle } from '../../lib/adminApi';
import { formatPlate } from '../../lib/plate';
import { deriveNextServiceKm } from '../../lib/serviceSchedule';
import { vehicleFolderByKey } from '../../lib/vehicleFolderAlerts';
import { RootStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { VehicleDetailDesktopView } from '../../components/desktop/VehicleDetailDesktopView';
import { isStaleDepartmentError } from '../../lib/driverFields';
import { lookupVehicleRegistry } from '../../lib/vehicleRegistry';
import { requiresTachograph } from '../../lib/tachograph';
import { VehicleDetailMobile } from './mobile/VehicleDetailMobile';

// 'licensing' only exists on the desktop tab bar (registration/insurance/test
// status cards) — the phone tiles never set it, but the type has to allow it
// since the shared `tab` state is handed to the desktop view as-is.
type Tab = 'general' | 'maintenance' | 'documents' | 'drivers' | 'licensing';
type Props = NativeStackScreenProps<RootStackParamList, 'VehicleDetail'>;
type MaintForm = { odometer: string; last_service_km: string; service_interval_km: string; next_service_km: string };
const VEHICLE_DOCUMENT_FOLDERS = [
  { category: 'safety_officer_approval', title: 'אישור קצין בטיחות', icon: 'shield-checkmark-outline', color: '#34C759', requiresExpiry: true },
  { category: 'tachograph_calibration', title: 'תוקף טכוגרף', icon: 'speedometer-outline', color: '#5E5CE6', requiresExpiry: true },
  { category: 'brakes_semiannual', title: 'בלמים חצי-שנתי', icon: 'disc-outline', color: '#FF9500', requiresExpiry: true },
  { category: 'brakes_annual', title: 'בלמים שנתי', icon: 'disc-outline', color: '#0A7FD0', requiresExpiry: true },
  { category: 'winter_inspection', title: 'בדיקת חורף', icon: 'snow-outline', color: '#14B8A6', requiresExpiry: true },
  { category: 'child_detection', title: 'שכחת ילדים', icon: 'eye-outline', color: '#AF52DE', requiresExpiry: true },
  { category: 'general', title: 'מסמכים כלליים', icon: 'folder-open-outline', color: '#8E8E93', requiresExpiry: true },
] as const;
const isVehicleTab = (value: unknown): value is Tab => value === 'general' || value === 'maintenance' || value === 'documents' || value === 'drivers' || value === 'licensing';
const numberOrNull = (value: string) => { const n = Number(value.replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : null; };
// The batched variant also carries each driver's license expiry, shown next to the driver on the desktop card.
const loadVehicleDrivers = async (vehicleId: string) => (await listActiveVehicleDriversForVehicles([vehicleId])).get(vehicleId) ?? [];

export default function VehicleDetailScreen({ route, navigation }: Props) {
  const { vehicleId } = route.params;
  const { companyId } = useCompany();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const scrollRef = useRef<ScrollView>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [drivers, setDrivers] = useState<VehicleDriverWithProfile[]>([]);
  const [driverOptions, setDriverOptions] = useState<{ value: string; label: string }[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(() => isVehicleTab(route.params.tab) ? route.params.tab : 'general');
  const [focusItem, setFocusItem] = useState<string | null>(null);
  const [editingMaintenance, setEditingMaintenance] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintForm>({ odometer: '', last_service_km: '', service_interval_km: '', next_service_km: '' });
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [loadedVehicle, loadedDrivers, loadedCompliance] = await Promise.all([getVehicle(vehicleId), loadVehicleDrivers(vehicleId), listCompliance('vehicle', vehicleId)]);
    setVehicle(loadedVehicle); setDrivers(loadedDrivers); setCompliance(loadedCompliance);
    if (companyId) { const [deps, companyDrivers] = await Promise.all([listDepartments(companyId), listDrivers(companyId)]); setDepartments(deps); setDriverOptions(companyDrivers.map((d) => ({ value: d.id, label: d.full_name ?? 'ללא שם' }))); }
  }, [companyId, vehicleId]);
  useFocusEffect(useCallback(() => { let active = true; setLoading(true); setError(null); load().catch((e: any) => active && setError(e?.message ?? 'טעינת הרכב נכשלה')).finally(() => active && setLoading(false)); return () => { active = false; }; }, [load]));
  useFocusEffect(useCallback(() => {
    const channel = supabase.channel(`vehicle-driver-assignments:${vehicleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_drivers', filter: `vehicle_id=eq.${vehicleId}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, vehicleId]));

  useEffect(() => {
    if (isVehicleTab(route.params.tab)) setTab(route.params.tab);
  }, [route.params.tab]);

  // Arriving from an expiry notification: open the folder it is about. The
  // desktop view does this itself (see onFolderOpened below); on the phone,
  // compliance folders expand inside the documents tab and document folders
  // have their own screen.
  const openFolderParam = route.params.openFolder;
  useEffect(() => {
    if (isDesktop || !vehicle || !openFolderParam) return;
    navigation.setParams({ openFolder: undefined });
    const folder = vehicleFolderByKey(openFolderParam);
    if (!folder) return;
    if (folder.folderKey === 'tachograph_calibration' && !requiresTachograph(vehicle.vehicle_type)) return;
    if (folder.source === 'compliance') {
      setTab('documents');
      setFocusItem(folder.folderKey);
      return;
    }
    const documentFolder = VEHICLE_DOCUMENT_FOLDERS.find((f) => f.category === folder.folderKey);
    if (documentFolder) {
      navigation.navigate('DocumentCategory', {
        ownerType: 'vehicle', ownerId: vehicleId, category: documentFolder.category, title: documentFolder.title, requiresExpiry: documentFolder.requiresExpiry,
      });
    }
  }, [isDesktop, vehicle, openFolderParam, navigation, vehicleId]);

  const openTab = (next: Tab, item?: string) => {
    setTab(next);
    navigation.setParams({ tab: next });
    if (item) setFocusItem(item);
  };
  const visibleDocumentFolders = VEHICLE_DOCUMENT_FOLDERS.filter(
    (folder) => folder.category !== 'tachograph_calibration' || requiresTachograph(vehicle?.vehicle_type ?? 'car'),
  );
  const archive = () => showAlert('העברה לארכיון', `להעביר את ${formatPlate(vehicle?.plate_number)} לארכיון? הרכב יוסתר מהרשימה אך הנתונים יישמרו.`, [{ text: 'ביטול', style: 'cancel' }, { text: 'העבר לארכיון', style: 'destructive', onPress: async () => { await archiveVehicle(vehicleId); navigation.goBack(); } }]);
  const restore = () => showAlert('הסרה מהארכיון', `להחזיר את ${formatPlate(vehicle?.plate_number)} לרשימת הרכבים הפעילה?`, [{ text: 'ביטול', style: 'cancel' }, { text: 'הסר מהארכיון', onPress: async () => { await restoreVehicle(vehicleId); await load(); showToast('הרכב הוסר מהארכיון'); } }]);
  const editMaintenance = () => { if (!vehicle) return; setMaintenance({ odometer: String(vehicle.odometer ?? ''), last_service_km: String(vehicle.last_service_km ?? ''), service_interval_km: vehicle.service_interval_km ? String(vehicle.service_interval_km) : '', next_service_km: vehicle.next_service_km ? String(vehicle.next_service_km) : '' }); setEditingMaintenance(true); };
  const saveMaintenance = async () => { setSavingMaintenance(true); try { await updateVehicle(vehicleId, { odometer: numberOrNull(maintenance.odometer) ?? 0, last_service_km: numberOrNull(maintenance.last_service_km) ?? 0, service_interval_km: numberOrNull(maintenance.service_interval_km), next_service_km: deriveNextServiceKm(numberOrNull(maintenance.last_service_km) ?? 0, numberOrNull(maintenance.service_interval_km)) ?? numberOrNull(maintenance.next_service_km) }); setEditingMaintenance(false); await load(); showToast('נשמר בהצלחה'); } catch (e: any) { showAlert('שמירה נכשלה', String(e?.message ?? 'נסה שוב')); } finally { setSavingMaintenance(false); } };
  const removePermanently = () => showAlert('מחיקת רכב', `למחוק לצמיתות את ${formatPlate(vehicle?.plate_number)}? פעולה זו אינה ניתנת לביטול.`, [{ text: 'ביטול', style: 'cancel' }, { text: 'מחק לצמיתות', style: 'destructive', onPress: async () => { try { if (!companyId) throw new Error('לא נמצאה חברה משויכת'); await deleteVehicle(vehicleId, companyId); navigation.goBack(); } catch (e: any) { showAlert('מחיקה נכשלה', String(e?.message ?? 'לא ניתן למחוק את הרכב. ייתכן שיש נתונים משויכים')); } } }]);

  const saveField = async (patch: Partial<Vehicle>): Promise<string | null> => {
    if (!companyId || !vehicle) return 'לא נמצאה חברה משויכת';
    if (patch.plate_number !== undefined) {
      const plateDigits = patch.plate_number.replace(/\D/g, '');
      if (!/^\d{7,8}$/.test(plateDigits)) return 'מספר רישוי חייב להכיל 7-8 ספרות';
      const existingVehicles = await listVehicles(companyId, true);
      const duplicate = existingVehicles.find((v) => v.plate_number === plateDigits && v.id !== vehicleId);
      if (duplicate) return 'קיים כבר רכב עם מספר הרישוי הזה בחברה';
      patch = { ...patch, plate_number: plateDigits };
    }
    if (patch.vin !== undefined && patch.vin) {
      const vin = patch.vin.trim().toUpperCase();
      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return 'VIN חייב להכיל 17 תווים ללא I/O/Q';
      patch = { ...patch, vin };
    }
    try {
      await updateVehicle(vehicleId, patch);
      await load();
      showToast('השינויים נשמרו');
      return null;
    } catch (e: any) {
      const message = String(e?.message ?? '');
      if (isStaleDepartmentError(message)) return 'המחלקה שנבחרה נמחקה בינתיים. בחר מחלקה אחרת ונסה שוב.';
      return message.includes('duplicate') || message.includes('unique') ? 'קיים כבר רכב עם מספר הרישוי הזה בחברה' : message || 'נסה שוב';
    }
  };

  const lookupPlate = async () => {
    if (!vehicle) return;
    const plate = vehicle.plate_number.replace(/\D/g, '');
    if (!/^\d{7,8}$/.test(plate)) { setLookupMessage('מספר הרישוי חייב להכיל 7-8 ספרות'); return; }
    setLookupLoading(true);
    setLookupMessage(null);
    try {
      const details = await lookupVehicleRegistry(plate);
      if (!details) { setLookupMessage('לא נמצא רכב עם מספר הרישוי הזה. אפשר למלא את הפרטים ידנית.'); return; }
      const patch: Partial<Vehicle> = {
        manufacturer: details.manufacturer ?? vehicle.manufacturer,
        model: details.model ?? vehicle.model,
        color: details.color ?? vehicle.color,
        production_year: details.productionYear ?? vehicle.production_year,
      };
      await updateVehicle(vehicleId, patch);
      await load();
      setLookupMessage('פרטי הרכב מולאו לפי מאגר משרד התחבורה.');
    } catch (e: any) {
      setLookupMessage(e?.message || 'לא ניתן לחפש את פרטי הרכב כרגע. אפשר לנסות שוב או למלא ידנית.');
    } finally {
      setLookupLoading(false);
    }
  };

  const mobileBase = {
    insetTop: insets.top,
    insetBottom: insets.bottom,
    companyId: companyId ?? '',
    compliance,
    drivers,
    driverOptions,
    tab,
    onTab: (next: Tab) => openTab(next),
    focusItem,
    folders: visibleDocumentFolders as unknown as { category: string; title: string; icon: string; color: string; requiresExpiry: boolean }[],
    editingMaintenance,
    maintenance,
    derivedNextServiceKm: deriveNextServiceKm(numberOrNull(maintenance.last_service_km) ?? 0, numberOrNull(maintenance.service_interval_km)),
    savingMaintenance,
    lookupLoading,
    lookupMessage,
    scrollRef,
    onBack: () => navigation.goBack(),
    onRetry: () => { setLoading(true); setError(null); load().catch((e: any) => setError(e?.message ?? 'טעינת הרכב נכשלה')).finally(() => setLoading(false)); },
    onEdit: () => navigation.navigate('VehicleForm', { vehicleId }),
    onLookup: () => void lookupPlate(),
    onEditMaintenance: editMaintenance,
    onCancelMaintenance: () => setEditingMaintenance(false),
    onChangeMaintenance: (field: keyof MaintForm, value: string) => setMaintenance((x) => ({ ...x, [field]: value })),
    onSaveMaintenance: () => void saveMaintenance(),
    onDriversChanged: async () => setDrivers(await loadVehicleDrivers(vehicleId)),
    onOpenDriver: (driverId: string) => navigation.navigate('DriverDetail', { driverId, fromVehicleId: vehicleId }),
    onOpenFolder: (folder: { category: string; title: string; requiresExpiry: boolean }) => openDocumentFolder(folder),
    onArchive: archive,
    onRestore: restore,
    onDelete: removePermanently,
  };
  const openDocumentFolder = (folder: { category: string; title: string; requiresExpiry: boolean }) => navigation.navigate('DocumentCategory', {
    ownerType: 'vehicle', ownerId: vehicleId, category: folder.category, title: folder.title, requiresExpiry: folder.requiresExpiry,
  });

  if (!isDesktop && (loading || !companyId || error || !vehicle)) {
    return (
      <VehicleDetailMobile
        {...mobileBase}
        loading={loading || !companyId}
        error={error}
        vehicle={vehicle}
        department={null}
      />
    );
  }
  if (loading || !companyId) return <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'רכבים']}><LoadingState /></DesktopShell>;
  if (error) return <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'רכבים']}><ErrorState message={error} onRetry={load} /></DesktopShell>;
  if (!vehicle) return <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'רכבים']}><View style={s.empty}><AppText>הרכב לא נמצא</AppText></View></DesktopShell>;

  const department = departments.find((d) => d.id === vehicle.department_id)?.name ?? null;

  if (isDesktop) {
    return (
      <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'רכבים', formatPlate(vehicle.plate_number)]}>
        <VehicleDetailDesktopView
          vehicle={vehicle}
          department={department}
          compliance={compliance}
          companyId={companyId}
          vehicleId={vehicleId}
          drivers={drivers}
          driverOptions={driverOptions}
          documentFolders={visibleDocumentFolders}
          focusItem={focusItem}
          onDriversChanged={async () => setDrivers(await loadVehicleDrivers(vehicleId))}
          onOpenDriver={(driverId) => navigation.navigate('DriverDetail', { driverId, fromVehicleId: vehicleId })}
          onOpenDocumentFolder={openDocumentFolder}
          onArchive={archive}
          onRestore={restore}
          onDelete={removePermanently}
          departmentOptions={departments.map((d) => ({ value: d.id, label: d.name }))}
          lookupLoading={lookupLoading}
          lookupMessage={lookupMessage}
          onSaveField={saveField}
          onLookupPlate={() => void lookupPlate()}
          openFolder={route.params.openFolder ?? null}
          onFolderOpened={() => navigation.setParams({ openFolder: undefined })}
        />
      </DesktopShell>
    );
  }

  return <VehicleDetailMobile {...mobileBase} loading={false} error={null} vehicle={vehicle} department={department} />;
}

const s = StyleSheet.create({ empty: { padding: SPACING.xl, alignItems: 'center' } });
