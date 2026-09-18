import React, { useCallback, useEffect, useState } from 'react';
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
import { expiryState } from '../../lib/theme';
import { formatPlate } from '../../lib/plate';
import { DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, DesktopTone } from './desktopTheme';
import { DesktopModal } from './DesktopModal';
import { DepartmentsDesktopView } from './DepartmentsDesktopView';
import { ReportsDesktopView } from './ReportsDesktopView';

/**
 * Dashboard quick-access widgets shown above the drivers/vehicles list on
 * the desktop admin home ("דשבורד"). Each widget is self-contained — it
 * fetches its own data via useCompany() — so FleetScreen (which already
 * owns the drivers/vehicles table state) doesn't need to thread anything
 * extra through. All four render as the same collapsed quick-action card
 * (icon + title + optional count) and open a centered modal on click —
 * nothing is previewed inline.
 */

type AttentionItem = {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  tone: DesktopTone;
  onPress: () => void;
};

/* ------------------------------------------------------------------ */
/* דרוש טיפול                                                          */
/* ------------------------------------------------------------------ */

export function AttentionQuickAction({
  onOpenDriver,
  onOpenVehicle,
}: {
  onOpenDriver: (driverId: string) => void;
  onOpenVehicle: (vehicleId: string) => void;
}) {
  const { companyId } = useCompany();
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setError(null);
    try {
      const [drivers, allVehicles] = await Promise.all([listDrivers(companyId), listVehicles(companyId, true)]);
      const vehicles = allVehicles.filter((v) => v.status !== 'archived');
      const [compliance, assignments] = await Promise.all([
        listComplianceForOwners('vehicle', vehicles.map((v) => v.id)),
        listActiveVehicleDriversForVehicles(vehicles.map((v) => v.id)),
      ]);

      const rows: AttentionItem[] = [];
      drivers.forEach((d) => {
        const state = expiryState(d.license_expiry);
        if (state === 'expired') {
          rows.push({ id: `dl-${d.id}`, icon: 'card-outline', title: d.full_name || 'נהג ללא שם', subtitle: 'רישיון נהיגה פג תוקף', tone: 'bad', onPress: () => onOpenDriver(d.id) });
        } else if (state === 'soon') {
          rows.push({ id: `dl-${d.id}`, icon: 'card-outline', title: d.full_name || 'נהג ללא שם', subtitle: 'רישיון נהיגה קרוב לפוג', tone: 'warn', onPress: () => onOpenDriver(d.id) });
        }
      });
      vehicles.forEach((v) => {
        const item = compliance.get(v.id)?.find((c) => c.item_type === 'insurance_mandatory');
        const state = expiryState(item?.expiry_date);
        if (state === 'missing' || state === 'expired') {
          rows.push({
            id: `vi-${v.id}`,
            icon: 'shield-outline',
            title: formatPlate(v.plate_number),
            subtitle: state === 'missing' ? 'ללא ביטוח חובה בתוקף' : 'ביטוח חובה פג תוקף',
            tone: 'bad',
            onPress: () => onOpenVehicle(v.id),
          });
        }
      });
      vehicles.forEach((v) => {
        if (!(assignments.get(v.id)?.length)) {
          rows.push({ id: `vu-${v.id}`, icon: 'car-outline', title: formatPlate(v.plate_number), subtitle: 'ללא נהג משויך', tone: 'neutral', onPress: () => onOpenVehicle(v.id) });
        }
      });

      const order: Record<DesktopTone, number> = { bad: 0, warn: 1, neutral: 2, ok: 3 };
      rows.sort((a, b) => order[a.tone] - order[b.tone]);
      setItems(rows);
    } catch (e: any) {
      setError(e?.message ?? 'טעינת הנתונים נכשלה');
    }
  }, [companyId, onOpenDriver, onOpenVehicle]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <QuickActionCard
        icon="warning-outline"
        title="דרוש טיפול"
        subtitle={items === null ? 'טוען…' : items.length === 0 ? 'הכול מטופל' : `${items.length} פריטים דורשים טיפול`}
        badge={items && items.length > 0 ? items.length : undefined}
        onPress={() => setOpen(true)}
      />

      <DesktopModal visible={open} title="דרוש טיפול" onClose={() => setOpen(false)}>
        {items === null ? (
          <View style={styles.state}>{error ? <DText style={styles.stateText}>{error}</DText> : <ActivityIndicator color={DESKTOP_COLORS.brand} />}</View>
        ) : items.length === 0 ? (
          <View style={styles.state}>
            <Ionicons name="checkmark-circle-outline" size={20} color={DESKTOP_COLORS.inkFaint} />
            <DText style={styles.stateText}>הכול מטופל</DText>
          </View>
        ) : (
          <View style={styles.modalList}>
            {items.map((row) => (
              <AttentionRow key={row.id} row={row} onPress={() => { setOpen(false); row.onPress(); }} />
            ))}
          </View>
        )}
      </DesktopModal>
    </>
  );
}

function AttentionRow({ row, onPress }: { row: AttentionItem; onPress?: () => void }) {
  const tone = DESKTOP_TONES[row.tone];
  return (
    <HoverPressable style={styles.row} hoverStyle={styles.rowHover} onPress={onPress ?? row.onPress}>
      <View style={[styles.rowIcon, { backgroundColor: tone.bg }]}>
        <Ionicons name={row.icon} size={13} color={tone.fg} />
      </View>
      <View style={styles.rowBody}>
        <DText weight="semiBold" style={styles.rowTitle} numberOfLines={1}>{row.title}</DText>
        <DText style={styles.rowSubtitle} numberOfLines={1}>{row.subtitle}</DText>
      </View>
    </HoverPressable>
  );
}

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
      <QuickActionCard icon="business-outline" title="ניהול מחלקות" subtitle="הוספה והסרה של מחלקות" onPress={openModal} />
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
      <QuickActionCard icon="document-text-outline" title="הפקת דוחות" subtitle="ייצוא דוחות נהגים ורכבים" onPress={openModal} />
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

function QuickActionCard({
  icon, title, subtitle, badge, onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <HoverPressable style={styles.actionCard} hoverStyle={styles.actionCardHover} onPress={onPress}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={14} color={DESKTOP_COLORS.brand} />
      </View>
      <View style={styles.rowBody}>
        <DText weight="bold" style={styles.cardTitle} numberOfLines={1}>{title}</DText>
        <DText style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</DText>
      </View>
      {!!badge && (
        <View style={styles.countBadge}><DText weight="bold" style={styles.countBadgeText}>{badge}</DText></View>
      )}
      <Ionicons name="chevron-back" size={12} color={DESKTOP_COLORS.inkFaint} />
    </HoverPressable>
  );
}

/** Dashboard widgets row: collapsed quick-action cards. Extra cards can be appended here later — the grid wraps. */
export function DashboardWidgetsRow({
  onOpenDriver,
  onOpenVehicle,
}: {
  onOpenDriver: (driverId: string) => void;
  onOpenVehicle: (vehicleId: string) => void;
}) {
  return (
    <View style={styles.grid}>
      <AttentionQuickAction onOpenDriver={onOpenDriver} onOpenVehicle={onOpenVehicle} />
      <DepartmentsQuickAction />
      <ReportsQuickAction />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },

  state: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 20 },
  stateText: { fontSize: 12, color: DESKTOP_COLORS.inkFaint },

  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9, paddingVertical: 6, borderRadius: 6 },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  rowIcon: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowBody: { flex: 1, gap: 1, minWidth: 0 },
  rowTitle: { fontSize: 12.5 },
  rowSubtitle: { fontSize: 11, color: DESKTOP_COLORS.inkFaint },

  modalList: { paddingHorizontal: 10, paddingVertical: 6, gap: 2 },

  cardTitle: { fontSize: 12 },
  countBadge: { backgroundColor: DESKTOP_COLORS.brandFocusRing, borderRadius: 8, minWidth: 16, height: 16, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { fontSize: 10, color: DESKTOP_COLORS.brand },

  actionCard: {
    flexGrow: 0,
    flexShrink: 0,
    width: 168,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  actionCardHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  actionIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
