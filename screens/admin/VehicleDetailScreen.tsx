import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { showAlert } from '../../lib/platformAlert';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, BackButton, Card, ErrorState, Field, InfoRow, InputLtr, LoadingState, PrimaryButton, Screen, SecondaryButton, useToast } from '../../components/ui';
import { ComplianceSection } from '../../components/ComplianceSection';
import { VehicleDriversEditor } from '../../components/VehicleDriversEditor';
import { COLORS, EXPIRY_STYLE, ExpiryState, SPACING, expiryState, formatDate, BRAND } from '../../lib/theme';
import { FLEET_COLORS } from '../../lib/colors';
import { DOSSIER_BLUE, DOSSIER_BLUE_LIGHT, DOSSIER_INK } from '../../lib/dossierColors';
import { useCompany } from '../../lib/CompanyContext';
import { AcquisitionType, ComplianceItem, Department, Vehicle, VehicleDriverWithProfile, VehicleType, archiveVehicle, deleteVehicle, getVehicle, listActiveVehicleDrivers, listCompliance, listDepartments, listDrivers, listVehicles, restoreVehicle, updateVehicle } from '../../lib/adminApi';
import { DC_FONT, DC_SPACING } from '../../components/driverCard/driverCardTheme';
import { ACQUISITION_TYPE_LABELS, VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '../../lib/compliance';
import { formatPlate } from '../../lib/plate';
import { RootStackParamList } from '../../navigation/types';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { supabase } from '../../lib/supabase';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { VehicleDetailDesktopView } from '../../components/desktop/VehicleDetailDesktopView';
import { isStaleDepartmentError } from '../../lib/driverFields';
import { lookupVehicleRegistry } from '../../lib/vehicleRegistry';

// 'licensing' only exists on the desktop tab bar (registration/insurance/test
// status cards) — the phone tiles never set it, but the type has to allow it
// since the shared `tab` state is handed to the desktop view as-is.
type Tab = 'general' | 'maintenance' | 'documents' | 'drivers' | 'licensing';
type Props = NativeStackScreenProps<RootStackParamList, 'VehicleDetail'>;
type MaintForm = { odometer: string; last_service_km: string; service_interval_km: string; next_service_km: string };
const VEHICLE_DOCUMENT_FOLDERS = [
  { category: 'safety_officer_approval', title: 'אישור קצין בטיחות', icon: 'shield-checkmark-outline', color: '#34C759', requiresExpiry: true },
  { category: 'tachograph_calibration', title: 'כיול טכנוגרף', icon: 'speedometer-outline', color: '#5E5CE6', requiresExpiry: true },
  { category: 'brakes_semiannual', title: 'בלמים חצי-שנתי', icon: 'disc-outline', color: '#FF9500', requiresExpiry: true },
  { category: 'brakes_annual', title: 'בלמים שנתי', icon: 'disc-outline', color: '#0A7FD0', requiresExpiry: true },
  { category: 'winter_inspection', title: 'בדיקת חורף', icon: 'snow-outline', color: '#14B8A6', requiresExpiry: true },
  { category: 'child_detection', title: 'שכחת ילדים', icon: 'eye-outline', color: '#AF52DE', requiresExpiry: true },
  { category: 'general', title: 'מסמכים כלליים', icon: 'folder-open-outline', color: '#8E8E93', requiresExpiry: false },
] as const;
const isVehicleTab = (value: unknown): value is Tab => value === 'general' || value === 'maintenance' || value === 'documents' || value === 'drivers' || value === 'licensing';
const numberOrNull = (value: string) => { const n = Number(value.replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : null; };
const formatKm = (value: string) => { const digits = value.replace(/\D/g, ''); return digits ? Number(digits).toLocaleString() : ''; };

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
    const [loadedVehicle, loadedDrivers, loadedCompliance] = await Promise.all([getVehicle(vehicleId), listActiveVehicleDrivers(vehicleId), listCompliance('vehicle', vehicleId)]);
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

  const openTab = (next: Tab, item?: string) => {
    setTab(next);
    navigation.setParams({ tab: next });
    if (item) setFocusItem(item);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 340, animated: true }));
  };
  const archive = () => showAlert('העברה לארכיון', `להעביר את ${formatPlate(vehicle?.plate_number)} לארכיון? הרכב יוסתר מהרשימה אך הנתונים יישמרו.`, [{ text: 'ביטול', style: 'cancel' }, { text: 'העבר לארכיון', style: 'destructive', onPress: async () => { await archiveVehicle(vehicleId); navigation.goBack(); } }]);
  const restore = () => showAlert('הסרה מהארכיון', `להחזיר את ${formatPlate(vehicle?.plate_number)} לרשימת הרכבים הפעילה?`, [{ text: 'ביטול', style: 'cancel' }, { text: 'הסר מהארכיון', onPress: async () => { await restoreVehicle(vehicleId); await load(); showToast('הרכב הוסר מהארכיון'); } }]);
  const editMaintenance = () => { if (!vehicle) return; setMaintenance({ odometer: String(vehicle.odometer ?? ''), last_service_km: String(vehicle.last_service_km ?? ''), service_interval_km: vehicle.service_interval_km ? String(vehicle.service_interval_km) : '', next_service_km: vehicle.next_service_km ? String(vehicle.next_service_km) : '' }); setEditingMaintenance(true); };
  const saveMaintenance = async () => { setSavingMaintenance(true); try { await updateVehicle(vehicleId, { odometer: numberOrNull(maintenance.odometer) ?? 0, last_service_km: numberOrNull(maintenance.last_service_km) ?? 0, service_interval_km: numberOrNull(maintenance.service_interval_km), next_service_km: numberOrNull(maintenance.next_service_km) }); setEditingMaintenance(false); await load(); showToast('נשמר בהצלחה'); } catch (e: any) { showAlert('שמירה נכשלה', String(e?.message ?? 'נסה שוב')); } finally { setSavingMaintenance(false); } };
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

  if (loading || !companyId) {
    if (isDesktop) return <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'רכבים']}><LoadingState /></DesktopShell>;
    return <Shell top={insets.top} onBack={() => navigation.goBack()}><LoadingState /></Shell>;
  }
  if (error) {
    if (isDesktop) return <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'רכבים']}><ErrorState message={error} onRetry={load} /></DesktopShell>;
    return <Shell top={insets.top} onBack={() => navigation.goBack()}><ErrorState message={error} onRetry={load} /></Shell>;
  }
  if (!vehicle) {
    if (isDesktop) return <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'רכבים']}><View style={s.empty}><AppText>הרכב לא נמצא</AppText></View></DesktopShell>;
    return <Shell top={insets.top} onBack={() => navigation.goBack()}><View style={s.empty}><AppText>הרכב לא נמצא</AppText></View></Shell>;
  }

  const department = departments.find((d) => d.id === vehicle.department_id)?.name ?? null;
  const serviceRemaining = vehicle.next_service_km == null ? null : vehicle.next_service_km - vehicle.odometer;
  const serviceState: ExpiryState = serviceRemaining == null ? 'missing' : serviceRemaining <= 0 ? 'expired' : serviceRemaining <= 1000 ? 'soon' : 'ok';
  const serviceLabel = serviceRemaining == null ? 'חסר' : serviceRemaining <= 0 ? `חריגה ${Math.abs(serviceRemaining).toLocaleString()} קמ` : `${serviceRemaining.toLocaleString()} קמ`;
  const insurance = compliance.find((c) => c.item_type === 'insurance_mandatory')?.expiry_date ?? null;
  const name = [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || formatPlate(vehicle.plate_number);
  const toForm = () => navigation.navigate('VehicleForm', { vehicleId });
  const openDocumentFolder = (folder: { category: string; title: string; requiresExpiry: boolean }) => navigation.navigate('DocumentCategory', {
    ownerType: 'vehicle', ownerId: vehicleId, category: folder.category, title: folder.title, requiresExpiry: folder.requiresExpiry,
  });

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
          documentFolders={VEHICLE_DOCUMENT_FOLDERS}
          focusItem={focusItem}
          onDriversChanged={async () => setDrivers(await listActiveVehicleDrivers(vehicleId))}
          onOpenDriver={(driverId) => navigation.navigate('DriverDetail', { driverId })}
          onOpenDocumentFolder={openDocumentFolder}
          onArchive={archive}
          onRestore={restore}
          onDelete={removePermanently}
          departmentOptions={departments.map((d) => ({ value: d.id, label: d.name }))}
          lookupLoading={lookupLoading}
          lookupMessage={lookupMessage}
          onSaveField={saveField}
          onLookupPlate={() => void lookupPlate()}
        />
      </DesktopShell>
    );
  }

  return <Screen style={s.screen}><AdminGradientBackground />
    <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <TouchableOpacity
      onPress={toForm}
      style={s.editVehicleButton}
      accessibilityRole="button"
      accessibilityLabel="עריכת פרטי רכב"
    >
      <Ionicons name="create-outline" size={20} color={COLORS.accent} />
    </TouchableOpacity>
    <View style={s.hero}><LinearGradient colors={[DOSSIER_BLUE_LIGHT, DOSSIER_BLUE]} style={s.avatar}><Ionicons name="car-outline" size={46} color="#FFF" /></LinearGradient><AppText weight="bold" style={s.title}>{name}</AppText><View style={s.identity}><AppText weight="bold" style={s.identityText}>{formatPlate(vehicle.plate_number)}</AppText><View style={s.divider} /><AppText weight="bold" style={s.identityText}>{VEHICLE_TYPE_LABELS[vehicle.vehicle_type] ?? vehicle.vehicle_type}</AppText><View style={[s.statusDot, vehicle.status !== 'active' && s.statusOff]} /><AppText weight="bold" style={[s.statusText, vehicle.status !== 'active' && s.statusTextOff]}>{VEHICLE_STATUS_LABELS[vehicle.status] ?? vehicle.status}</AppText></View></View>
    <View style={s.tiles}><Tile label="כללי" icon="car-outline" color="#32ADE6" onPress={() => openTab('general')} /><Tile label="נהג משויך" icon="person-outline" color="#5E5CE6" onPress={() => openTab('drivers')} /><Tile label="תחזוקה" icon="construct-outline" color="#E08600" onPress={() => openTab('maintenance')} /><Tile label="מסמכים" icon="document-text-outline" color="#0088CC" onPress={() => openTab('documents')} /></View>
    {tab === 'general' && <>
      <Caption label="תוקף ותחזוקה" /><Group><Row label="ביטוח" value={insurance ? formatDate(insurance) : 'חסר'} icon="shield-checkmark-outline" color="#34C759" valueColor={EXPIRY_STYLE[expiryState(insurance)].fg} /><Row label="טיפול הבא" value={serviceLabel} icon="construct-outline" color="#FF9500" valueColor={EXPIRY_STYLE[serviceState].fg} onPress={() => openTab('maintenance')} /><Row label="מד אוץ" value={`${vehicle.odometer.toLocaleString()} קמ`} icon="speedometer-outline" color="#5E5CE6" onPress={() => openTab('maintenance')} last /></Group>
      <Caption label="פרטי רכב ורישוי" /><Group><Row label="מספר רישוי" value={formatPlate(vehicle.plate_number)} icon="car-outline" color="#0088CC" onPress={toForm} /><Row label="יצרן ודגם" value={name} icon="car-outline" color="#32ADE6" onPress={toForm} /><Row label="צבע" value={vehicle.color || '-'} icon="color-palette-outline" color="#AF52DE" onPress={toForm} /><Row label="סוג" value={VEHICLE_TYPE_LABELS[vehicle.vehicle_type]} icon="pricetag-outline" color="#8E8E93" onPress={toForm} /><Row label="שנת ייצור" value={vehicle.production_year ? `${vehicle.production_month ? `${vehicle.production_month}/` : ''}${vehicle.production_year}` : '-'} icon="calendar-outline" color="#8E8E93" onPress={toForm} /><Row label="עליה לכביש" value={vehicle.road_registration_date ? formatDate(vehicle.road_registration_date) : '-'} icon="calendar-outline" color="#8E8E93" onPress={toForm} last /></Group>
      <Caption label="זיהוי וארגון" /><Group><Row label="מספר שילדה" value={vehicle.vin || '-'} icon="barcode-outline" color="#8E8E93" onPress={toForm} /><Row label="קוד פנימי" value={vehicle.internal_code || '-'} icon="code-outline" color="#8E8E93" onPress={toForm} /><Row label="מחלקה" value={department || '-'} icon="business-outline" color="#5E5CE6" onPress={toForm} /><Row label="שימוש הרכב" value={vehicle.usage_type || '-'} icon="remove-outline" color="#C7CBD1" onPress={toForm} /><Row label="סוג עסקה" value={vehicle.acquisition_type ? ACQUISITION_TYPE_LABELS[vehicle.acquisition_type] ?? vehicle.acquisition_type : '-'} icon="pricetag-outline" color="#8E8E93" onPress={toForm} last /></Group>
    </>}
    {tab === 'maintenance' && <><Caption label="תחזוקה" /><Card style={s.tabCard}>{!editingMaintenance ? <><TouchableOpacity onPress={editMaintenance} style={s.editMaint}><Ionicons name="create-outline" size={17} color={COLORS.accent} /><AppText weight="bold" style={s.editMaintText}>עריכת נתוני טיפול</AppText></TouchableOpacity><InfoRow label="מד אוץ נוכחי" value={`${vehicle.odometer.toLocaleString()} קמ`} /><InfoRow label="עודכן לאחרונה" value={vehicle.odometer_updated_at ? formatDate(vehicle.odometer_updated_at) : null} /><InfoRow label="קמ בטיפול האחרון" value={`${vehicle.last_service_km.toLocaleString()} קמ`} /><InfoRow label="טווח קמ בין טיפולים" value={vehicle.service_interval_km ? `${vehicle.service_interval_km.toLocaleString()} קמ` : null} /><InfoRow label="קמ לטיפול הבא" value={vehicle.next_service_km ? `${vehicle.next_service_km.toLocaleString()} קמ` : null} /></> : <><Field label="מד אוץ נוכחי (קמ)"><InputLtr value={formatKm(maintenance.odometer)} onChangeText={(v) => setMaintenance((x) => ({ ...x, odometer: v.replace(/\D/g, '') }))} keyboardType="number-pad" /></Field><Field label="קמ בטיפול האחרון"><InputLtr value={formatKm(maintenance.last_service_km)} onChangeText={(v) => setMaintenance((x) => ({ ...x, last_service_km: v.replace(/\D/g, '') }))} keyboardType="number-pad" /></Field><Field label="טווח קמ בין טיפולים"><InputLtr value={formatKm(maintenance.service_interval_km)} onChangeText={(v) => setMaintenance((x) => ({ ...x, service_interval_km: v.replace(/\D/g, '') }))} keyboardType="number-pad" /></Field><Field label="קמ לטיפול הבא"><InputLtr value={formatKm(maintenance.next_service_km)} onChangeText={(v) => setMaintenance((x) => ({ ...x, next_service_km: v.replace(/\D/g, '') }))} keyboardType="number-pad" /></Field><View style={s.saveRow}><SecondaryButton label="ביטול" style={s.flex} onPress={() => setEditingMaintenance(false)} /><PrimaryButton label="שמור" style={s.flex} loading={savingMaintenance} onPress={saveMaintenance} /></View></>}</Card></>}
    {tab === 'documents' && <>
      <Caption label="מסמכי רכב" />
      <ComplianceSection companyId={companyId} ownerType="vehicle" ownerId={vehicleId} focusItemType={focusItem} spacious folderAppearance hiddenItemTypes={['insurance_mandatory', 'insurance_comprehensive', 'annual_test']} />
      <Card style={s.documentFoldersCard}>{VEHICLE_DOCUMENT_FOLDERS.map((folder, index) => <Row key={folder.category} label={folder.title} icon={folder.icon} color={folder.color} onPress={() => openDocumentFolder(folder)} last={index === VEHICLE_DOCUMENT_FOLDERS.length - 1} />)}</Card>
    </>}
    {tab === 'drivers' && <><Caption label="נהגים משויכים" /><Card style={s.tabCard}><VehicleDriversEditor vehicleId={vehicleId} assignments={drivers} driverOptions={driverOptions} onChanged={async () => setDrivers(await listActiveVehicleDrivers(vehicleId))} onOpenDriver={(driverId) => navigation.navigate('DriverDetail', { driverId })} /></Card></>}
    {tab === 'general' && <><Caption label="פעולות" /><View style={s.actions}><TouchableOpacity onPress={removePermanently} style={s.delete}><Ionicons name="trash-outline" size={17} color={FLEET_COLORS.danger.text} /><AppText weight="bold" style={s.deleteText}>מחיקת רכב</AppText></TouchableOpacity><TouchableOpacity onPress={vehicle.status === 'archived' ? restore : archive} style={s.archive}><Ionicons name={vehicle.status === 'archived' ? 'arrow-undo-outline' : 'archive-outline'} size={17} color={FLEET_COLORS.danger.text} /><AppText weight="bold" style={s.archiveText}>{vehicle.status === 'archived' ? 'הסר מהארכיון' : 'לארכיון'}</AppText></TouchableOpacity></View></>}
  </ScrollView>
    <View style={[s.floatingNavigation, { top: insets.top + 12 }]}><BackButton onPress={() => navigation.goBack()} /></View>
  </Screen>;
}

function Tile({ label, icon, color, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; onPress: () => void }) { return <TouchableOpacity onPress={onPress} activeOpacity={.68} style={s.tile}><View style={[s.tileIcon, { backgroundColor: `${color}1F` }]}><Ionicons name={icon} size={19} color={color} /></View><AppText weight="bold" style={s.tileText}>{label}</AppText></TouchableOpacity>; }
function Caption({ label }: { label: string }) { return <AppText weight="bold" style={s.caption}>{label}</AppText>; }
function Group({ children }: { children: React.ReactNode }) { return <View style={s.group}>{children}</View>; }
function Row({ label, value, icon, color, valueColor, onPress, last }: { label: string; value?: string; icon: keyof typeof Ionicons.glyphMap; color: string; valueColor?: string; onPress?: () => void; last?: boolean }) { return <TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={.66} style={[s.row, last && s.last]}><View style={[s.rowIcon, { backgroundColor: color }]}><Ionicons name={icon} size={18} color="#FFF" /></View><AppText weight="bold" style={s.rowLabel}>{label}</AppText>{value !== undefined && <AppText weight="bold" style={[s.value, valueColor && { color: valueColor }]} numberOfLines={1}>{value}</AppText>}{onPress && <Ionicons name="chevron-back" size={18} color="rgba(60,60,67,.28)" />}</TouchableOpacity>; }
function Shell({ top, onBack, children }: { top: number; onBack: () => void; children: React.ReactNode }) { return <Screen style={s.screen}><AdminGradientBackground /><View style={s.shell}><View style={[s.nav, { paddingTop: top + 12 }]}><BackButton onPress={onBack} accessibilityLabel="חזור" /></View>{children}</View></Screen>; }

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:BRAND.screenBg},scroll:{flex:1,backgroundColor:'transparent'},content:{paddingBottom:34},shell:{flex:1},empty:{padding:SPACING.xl,alignItems:'center'},nav:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20},menu:{width:36,height:36,borderRadius:18,backgroundColor:'rgba(255,255,255,.75)',alignItems:'center',justifyContent:'center',gap:3},dot:{width:4,height:4,borderRadius:2,backgroundColor:COLORS.accent},
  floatingNavigation:{position:'absolute',right:20,zIndex:100,elevation:100},editVehicleButton:{position:'absolute',top:18,left:DC_SPACING.screenPaddingH,zIndex:2,width:42,height:42,borderRadius:21,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'rgba(10,127,208,0.20)',alignItems:'center',justifyContent:'center',shadowColor:DOSSIER_BLUE,shadowOpacity:.14,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:3},hero:{alignItems:'center',paddingTop:16,paddingHorizontal:20},avatar:{width:104,height:104,borderRadius:52,alignItems:'center',justifyContent:'center',borderWidth:10,borderColor:'rgba(63,169,232,.14)',shadowColor:DOSSIER_BLUE,shadowOpacity:.32,shadowRadius:17,shadowOffset:{width:0,height:12},elevation:8},title:{fontFamily:DC_FONT.bold,fontSize:29,letterSpacing:-.6,marginTop:14,color:DOSSIER_INK},identity:{flexDirection:'row-reverse',alignItems:'center',gap:7,marginTop:3},identityText:{fontFamily:DC_FONT.medium,fontSize:15,color:'rgba(14,30,43,.5)'},divider:{width:3,height:3,borderRadius:2,backgroundColor:'rgba(14,30,43,.35)'},statusDot:{width:7,height:7,borderRadius:4,backgroundColor:'#34C759'},statusOff:{backgroundColor:'#FF9500'},statusText:{fontFamily:DC_FONT.medium,fontSize:15,color:'#2E8B57'},statusTextOff:{color:'#B87000'},
  tiles:{flexDirection:'row-reverse',gap:10,paddingHorizontal:20,paddingTop:20},tile:{flex:1,alignItems:'center',gap:9,paddingVertical:13,paddingHorizontal:6,borderRadius:18,backgroundColor:'#FFF',shadowColor:'#143C5A',shadowOpacity:.18,shadowRadius:11,shadowOffset:{width:0,height:6},elevation:3},tileIcon:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center'},tileText:{fontSize:14.5,color:DOSSIER_INK,textAlign:'center'},
  caption:{fontFamily:DC_FONT.semiBold,fontSize:13.5,color:'rgba(14,30,43,.42)',paddingHorizontal:24,paddingTop:22,paddingBottom:7},group:{marginHorizontal:20,borderRadius:18,overflow:'hidden',backgroundColor:'#FFF',shadowColor:'#143C5A',shadowOpacity:.18,shadowRadius:11,shadowOffset:{width:0,height:6},elevation:3},row:{minHeight:57,flexDirection:'row-reverse',alignItems:'center',gap:12,paddingHorizontal:14,paddingVertical:11,borderBottomWidth:1,borderBottomColor:'rgba(14,30,43,.07)'},last:{borderBottomWidth:0},rowIcon:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center'},rowLabel:{flex:1,fontFamily:DC_FONT.regular,fontSize:16.5,color:DOSSIER_INK},value:{maxWidth:'42%',fontFamily:DC_FONT.medium,fontSize:15.5,color:'rgba(14,30,43,.45)',textAlign:'left'},
  tabCard:{marginHorizontal:20,backgroundColor:'#FFF',gap:SPACING.md},documentFoldersCard:{marginHorizontal:20,marginBottom:SPACING.sm,padding:0,overflow:'hidden'},editMaint:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:7,paddingBottom:4},editMaintText:{fontSize:14,color:COLORS.accent},saveRow:{flexDirection:'row-reverse',gap:SPACING.md},flex:{flex:1},actions:{flexDirection:'row-reverse',gap:10,paddingHorizontal:20,paddingBottom:8},delete:{flex:1,height:52,borderRadius:16,backgroundColor:'#FFF',borderWidth:1,borderColor:'rgba(192,57,67,.28)',flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8,shadowColor:'#143C5A',shadowOpacity:.12,shadowRadius:11,shadowOffset:{width:0,height:6},elevation:3},deleteText:{fontSize:16.5,color:FLEET_COLORS.danger.text},archive:{flex:1,height:52,borderRadius:16,backgroundColor:'#FFF',flexDirection:'row-reverse',alignItems:'center',justifyContent:'center',gap:8,shadowColor:'#143C5A',shadowOpacity:.16,shadowRadius:11,shadowOffset:{width:0,height:6},elevation:3},archiveText:{fontSize:16.5,color:FLEET_COLORS.danger.text},
});
