import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BrandLoader } from '../ui/BrandLoader';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../../lib/platformAlert';
import { departmentDeleteMessage } from '../../lib/driverFields';
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
import { exportFormReport, type FormReportCategory } from '../../lib/meetingReport';
import { useFormReports } from '../reports/useFormReports';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { INSPECTION_REPORT_CATEGORIES, exportInspectionsReport, type InspectionReportCategory } from '../../lib/inspectionReport';
import { DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, webOnly } from './desktopTheme';
import { DesktopModal } from './DesktopModal';
import { DepartmentsDesktopView } from './DepartmentsDesktopView';
import { ReportsDesktopView } from './ReportsDesktopView';
import { t } from '../../lib/i18n';
import { errorMessage } from '../../lib/requestError';

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
      showAlert(t('departments.addFailed'), String(errorMessage(err, t('common.tryAgain'))));
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
      showAlert(t('departments.renameFailed'), String(errorMessage(err, t('common.tryAgain'))));
    }
  };

  const confirmDelete = async (dept: Department) => {
    if (!companyId) return;
    let usage = { vehicles: 0, drivers: 0 };
    try { usage = await countDepartmentUsage(dept.id); } catch { /* keep the warning generic */ }
    const message = departmentDeleteMessage(dept.name, usage);
    showAlert(t('departments.deleteTitle'), message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.deleteAction'), style: 'destructive', onPress: async () => {
          try { await deleteDepartment(companyId, dept.id); await load(); } catch (err: any) { showAlert(t('common.deleteFailed'), String(errorMessage(err, t('common.tryAgain')))); }
        },
      },
    ]);
  };

  return (
    <>
      <HeaderAction icon="business-outline" label={t('departments.title')} onPress={openModal} />
      <DesktopModal visible={open} title={t('departments.title')} onClose={() => setOpen(false)}>
        {loading && departments.length === 0 ? (
          <View style={styles.state}><BrandLoader color={DESKTOP_COLORS.brand} /></View>
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
            onCancelEdit={() => { setEditingId(null); setEditingName(''); }}
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
  const [kind, setKind] = useState<'drivers' | 'vehicles' | 'meetings' | 'inspections' | null>(null);
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
      showAlert(t('reports.loadFailed'), String(errorMessage(err, t('common.tryAgain'))));
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
    catch (err: any) { showAlert(t('reports.exportFailed'), String(errorMessage(err, t('common.tryAgain')))); }
    finally { setExporting(null); }
  };

  const exportVehicles = async (category: VehicleReportCategory) => {
    if (!company) return;
    setExporting(category);
    try { await exportVehiclesReport(company, vehicles, compliance, assignments, category); setKind(null); }
    catch (err: any) { showAlert(t('reports.exportFailed'), String(errorMessage(err, t('common.tryAgain')))); }
    finally { setExporting(null); }
  };

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const forms = useFormReports(companyId, drivers);

  const exportForm = async (category: FormReportCategory) => {
    if (!company || !forms.form || !forms.data) return;
    setExporting(category);
    try { await exportFormReport(company, drivers, forms.form, forms.data, category); setKind(null); }
    catch (err: any) { showAlert(t('reports.exportFailed'), String(errorMessage(err, t('common.tryAgain')))); }
    finally { setExporting(null); }
  };

  const exportInspections = async (category: InspectionReportCategory) => {
    if (!company) return;
    setExporting(category);
    try { await exportInspectionsReport(company, category); setKind(null); }
    catch (err: any) { showAlert(t('reports.exportFailed'), String(errorMessage(err, t('common.tryAgain')))); }
    finally { setExporting(null); }
  };

  return (
    <>
      <HeaderAction icon="document-text-outline" label={t('reports.title')} onPress={openModal} />
      <DesktopModal visible={open} title={t('reports.export')} onClose={() => setOpen(false)}>
        {loading && !loaded ? (
          <View style={styles.state}><BrandLoader color={DESKTOP_COLORS.brand} /></View>
        ) : (
          <ReportsDesktopView
            open={kind}
            onToggle={(next) => { const value = kind === next ? null : next; setKind(value); if (value === 'meetings') void forms.open(); }}
            driverCategories={REPORT_CATEGORIES}
            vehicleCategories={VEHICLE_REPORT_CATEGORIES}
            forms={forms}
            inspectionCategories={INSPECTION_REPORT_CATEGORIES}
            exportingCategory={exporting}
            onSelectDriverCategory={(value) => void exportDrivers(value as ReportCategory)}
            onSelectVehicleCategory={(value) => void exportVehicles(value as VehicleReportCategory)}
            onSelectFormCategory={(value) => void exportForm(value as FormReportCategory)}
            onGoToForms={() => { setOpen(false); navigation.navigate('SignedDocuments', undefined); }}
            onSelectInspectionCategory={(value) => void exportInspections(value as InspectionReportCategory)}
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
      <Ionicons name={icon} size={17} color="rgba(255,255,255,0.8)" />
      <DText weight="semiBold" style={styles.headerActionText}>{label}</DText>
    </HoverPressable>
  );
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 20 },

  headerAction: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    // Sits on the dashboard's night header.
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    ...webOnly({
      transition: 'background-color 160ms ease, border-color 160ms ease, transform 120ms ease-out',
    }),
  },
  headerActionHover: { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.28)' },
  headerActionText: { fontSize: 14, color: '#FFFFFF' },
  pressDown: { transform: [{ scale: 0.97 }] },
});
