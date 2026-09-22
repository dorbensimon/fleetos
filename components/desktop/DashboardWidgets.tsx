import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../../lib/platformAlert';
import { useCompany } from '../../lib/CompanyContext';
import {
  listDrivers,
  listVehicles,
  listComplianceForOwners,
  listActiveVehicleDriversForVehicles,
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  countDepartmentUsage,
  Department,
} from '../../lib/adminApi';
import { REPORT_CATEGORIES, exportDriversReport, type ReportCategory } from '../../lib/driverReport';
import { VEHICLE_REPORT_CATEGORIES, exportVehiclesReport, type VehicleReportCategory } from '../../lib/vehicleReport';
import { DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, webOnly } from './desktopTheme';
import { DesktopModal } from './DesktopModal';
import { DepartmentsDesktopView } from './DepartmentsDesktopView';
import { ReportsDesktopView } from './ReportsDesktopView';

/**
 * Dashboard header actions ("דוחות", "מחלקות") shown next to the greeting on
 * the desktop admin home. Each is self-contained — it fetches its own data
 * via useCompany() when opened — and opens a centered modal on click.
 */

/* ------------------------------------------------------------------ */
/* מחלקות                                                              */
/* ------------------------------------------------------------------ */

export function DepartmentsQuickAction() {
  const { companyId } = useCompany();
  const [open, setOpen] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setDepartments(await listDepartments(companyId));
    } catch {
      // A failed load just leaves the previous list showing.
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const openModal = () => {
    setOpen(true);
    void load();
  };

  const addDepartment = async () => {
    if (!companyId || !newName.trim()) return;
    setAdding(true);
    try {
      await createDepartment(companyId, newName.trim());
      setNewName('');
      await load();
    } catch (err: any) {
      showAlert('הוספת מחלקה נכשלה', String(err?.message ?? 'נסה שוב'));
    } finally {
      setAdding(false);
    }
  };

  const saveRename = async (id: string) => {
    if (!editingName.trim()) { setEditingId(null); return; }
    try {
      await updateDepartment(id, editingName.trim());
      setEditingId(null);
      await load();
    } catch (err: any) {
      showAlert('שינוי השם נכשל', String(err?.message ?? 'נסה שוב'));
    }
  };

  const confirmDelete = async (dept: Department) => {
    if (!companyId) return;
    let usage = { vehicles: 0, drivers: 0 };
    try { usage = await countDepartmentUsage(dept.id); } catch { /* keep the warning generic */ }
    const parts = [
      usage.vehicles === 1 ? 'רכב אחד' : usage.vehicles > 0 ? `${usage.vehicles} רכבים` : '',
      usage.drivers === 1 ? 'נהג אחד' : usage.drivers > 0 ? `${usage.drivers} נהגים` : '',
    ].filter(Boolean);
    const isSingular = usage.vehicles + usage.drivers === 1;
    const message = parts.length
      ? `למחוק את "${dept.name}"? ${parts.join(' ו')} ${isSingular ? 'משויך' : 'משויכים'} אליה כרגע, ו${isSingular ? 'יישאר' : 'יישארו'} ללא מחלקה.`
      : `למחוק את "${dept.name}"?`;
    showAlert('מחיקת מחלקה', message, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive', onPress: async () => {
          try { await deleteDepartment(companyId, dept.id); await load(); } catch (err: any) { showAlert('מחיקה נכשלה', String(err?.message ?? 'נסה שוב')); }
        },
      },
    ]);
  };

  return (
    <>
      <HeaderAction icon="business-outline" label="מחלקות" onPress={openModal} />
      <DesktopModal visible={open} title="מחלקות" onClose={() => setOpen(false)}>
        {loading && departments.length === 0 ? (
          <View style={styles.state}><ActivityIndicator color={DESKTOP_COLORS.brand} /></View>
        ) : (
          <DepartmentsDesktopView
            departments={departments}
            newName={newName}
            onChangeNewName={setNewName}
            onAdd={() => void addDepartment()}
            adding={adding}
            editingId={editingId}
            editingName={editingName}
            onChangeEditingName={setEditingName}
            onStartEdit={(dept) => { setEditingId(dept.id); setEditingName(dept.name); }}
            onSaveEdit={(id) => void saveRename(id)}
            onDelete={(dept) => void confirmDelete(dept)}
          />
        )}
      </DesktopModal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* דוחות                                                               */
/* ------------------------------------------------------------------ */

export function ReportsQuickAction() {
  const { companyId, company } = useCompany();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [drivers, setDrivers] = useState<Awaited<ReturnType<typeof listDrivers>>>([]);
  const [vehicles, setVehicles] = useState<Awaited<ReturnType<typeof listVehicles>>>([]);
  const [compliance, setCompliance] = useState<Awaited<ReturnType<typeof listComplianceForOwners>>>(new Map());
  const [assignments, setAssignments] = useState<Awaited<ReturnType<typeof listActiveVehicleDriversForVehicles>>>(new Map());
  const [kind, setKind] = useState<'drivers' | 'vehicles' | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [d, v] = await Promise.all([listDrivers(companyId), listVehicles(companyId, true)]);
      const [c, a] = await Promise.all([
        listComplianceForOwners('vehicle', v.map((x) => x.id)),
        listActiveVehicleDriversForVehicles(v.map((x) => x.id)),
      ]);
      setDrivers(d); setVehicles(v); setCompliance(c); setAssignments(a); setLoaded(true);
    } catch (err: any) {
      showAlert('טעינת נתוני הדוחות נכשלה', String(err?.message ?? 'נסה שוב'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const openModal = () => {
    setOpen(true);
    if (!loaded) void load();
  };

  const exportDrivers = async (category: ReportCategory) => {
    if (!company) return;
    setExporting(category);
    try { await exportDriversReport(company, drivers, category); setKind(null); }
    catch (err: any) { showAlert('ייצוא הדוח נכשל', String(err?.message ?? 'נסה שוב')); }
    finally { setExporting(null); }
  };

  const exportVehicles = async (category: VehicleReportCategory) => {
    if (!company) return;
    setExporting(category);
    try { await exportVehiclesReport(company, vehicles, compliance, assignments, category); setKind(null); }
    catch (err: any) { showAlert('ייצוא הדוח נכשל', String(err?.message ?? 'נסה שוב')); }
    finally { setExporting(null); }
  };

  return (
    <>
      <HeaderAction icon="document-text-outline" label="דוחות" onPress={openModal} />
      <DesktopModal visible={open} title="ייצוא דוחות" onClose={() => setOpen(false)}>
        {loading && !loaded ? (
          <View style={styles.state}><ActivityIndicator color={DESKTOP_COLORS.brand} /></View>
        ) : (
          <ReportsDesktopView
            open={kind}
            onToggle={(next) => setKind((current) => (current === next ? null : next))}
            driverCategories={REPORT_CATEGORIES}
            vehicleCategories={VEHICLE_REPORT_CATEGORIES}
            exportingCategory={exporting}
            onSelectDriverCategory={(value) => void exportDrivers(value as ReportCategory)}
            onSelectVehicleCategory={(value) => void exportVehicles(value as VehicleReportCategory)}
          />
        )}
      </DesktopModal>
    </>
  );
}

/* ------------------------------------------------------------------ */

function HeaderAction({
  icon, label, onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <HoverPressable style={styles.headerAction} hoverStyle={styles.headerActionHover} pressStyle={styles.pressDown} onPress={onPress}>
      <Ionicons name={icon} size={14} color={DESKTOP_COLORS.inkMuted} />
      <DText weight="semiBold" style={styles.headerActionText}>{label}</DText>
    </HoverPressable>
  );
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 20 },

  headerAction: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({ transition: 'background-color 140ms ease, border-color 140ms ease, transform 100ms ease-out' }),
  },
  headerActionHover: { backgroundColor: DESKTOP_COLORS.rowHover, borderColor: DESKTOP_COLORS.borderInput },
  headerActionText: { fontSize: 12.5, color: DESKTOP_COLORS.ink },
  pressDown: { transform: [{ scale: 0.97 }] },
});
