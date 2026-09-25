import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { showAlert } from '../../lib/platformAlert';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState } from '../../components/ui';
import { BrandLoader } from '../../components/ui/BrandLoader';
import { DK, DKText, DriverPage, ErrorPanel, HeroTitle, ListRow, LoadingPanel, Reveal, STATUS, Segmented, Surface } from '../../components/driverKit';
import { useCompany } from '../../lib/CompanyContext';
import { listDrivers, listVehicles, listComplianceForOwners, listActiveVehicleDriversForVehicles, type DriverRow, type Vehicle, type ComplianceItem, type VehicleDriverWithProfile } from '../../lib/adminApi';
import { REPORT_CATEGORIES, exportDriversReport, type ReportCategory } from '../../lib/driverReport';
import { VEHICLE_REPORT_CATEGORIES, exportVehiclesReport, type VehicleReportCategory } from '../../lib/vehicleReport';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { ReportsDesktopView } from '../../components/desktop/ReportsDesktopView';

type Props = NativeStackScreenProps<RootStackParamList, 'Reports'>;
export default function ReportsScreen({ navigation }: Props) {
  const { companyId, company } = useCompany(); const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [drivers, setDrivers] = useState<DriverRow[]>([]); const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [compliance, setCompliance] = useState<Map<string, ComplianceItem[]>>(new Map()); const [assignments, setAssignments] = useState<Map<string, VehicleDriverWithProfile[]>>(new Map());
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [kind, setKind] = useState<'drivers' | 'vehicles' | null>(null); const [exporting, setExporting] = useState<string | null>(null);
  const load = useCallback(async () => { if (!companyId) { setError('לא נמצאה חברה משויכת'); setLoading(false); return; } setLoading(true); setError(null); try { const [d, v] = await Promise.all([listDrivers(companyId), listVehicles(companyId, true)]); const [c, a] = await Promise.all([listComplianceForOwners('vehicle', v.map((x) => x.id)), listActiveVehicleDriversForVehicles(v.map((x) => x.id))]); setDrivers(d); setVehicles(v); setCompliance(c); setAssignments(a); } catch (e: any) { setError(e?.message ?? 'טעינת נתוני הדוחות נכשלה'); } finally { setLoading(false); } }, [companyId]);
  useEffect(() => { load(); }, [load]);
  const exportDrivers = async (category: ReportCategory) => { if (!company) return; setExporting(category); try { await exportDriversReport(company, drivers, category); if (isDesktop) setKind(null); } catch (e: any) { showAlert('ייצוא הדוח נכשל', String(e?.message ?? 'נסה שוב')); } finally { setExporting(null); } };
  const exportVehicles = async (category: VehicleReportCategory) => { if (!company) return; setExporting(category); try { await exportVehiclesReport(company, vehicles, compliance, assignments, category); if (isDesktop) setKind(null); } catch (e: any) { showAlert('ייצוא הדוח נכשל', String(e?.message ?? 'נסה שוב')); } finally { setExporting(null); } };

  if (isDesktop) {
    return (
      <DesktopShell active="Reports" breadcrumbs={['ניהול', 'דוחות']}>
        {loading ? null : error ? (
          <ErrorState message={error} onRetry={load} />
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
      </DesktopShell>
    );
  }

  const mode = kind ?? 'drivers';
  const categories = mode === 'drivers' ? REPORT_CATEGORIES : VEHICLE_REPORT_CATEGORIES;
  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={
        <View>
          <HeroTitle title="ייצוא דוחות" subtitle="קובץ אקסל מוכן לשליחה או להדפסה" onBack={() => navigation.goBack()} />
          <View style={s.segment}>
            <Segmented<'drivers' | 'vehicles'>
              onNight
              value={mode}
              onChange={setKind}
              options={[
                { value: 'drivers', label: 'נהגים', icon: 'people', count: loading ? undefined : drivers.length },
                { value: 'vehicles', label: 'רכבים', icon: 'car-sport', count: loading ? undefined : vehicles.filter((v) => v.status !== 'archived').length },
              ]}
            />
          </View>
        </View>
      }
    >
      {loading ? (
        <LoadingPanel />
      ) : error ? (
        <ErrorPanel message="טעינת נתוני הדוחות נכשלה" hint={error} onRetry={load} />
      ) : (
        <Reveal key={mode}>
          <Surface>
            {categories.map((category, index) => {
              const busy = exporting === category.value;
              return (
                <ListRow
                  key={category.value}
                  first={index === 0}
                  icon={category.icon as React.ComponentProps<typeof Ionicons>['name']}
                  tint={category.value === 'expired' || category.value === 'issues' ? STATUS.expired.fg : DK.accent}
                  title={category.label}
                  subtitle={busy ? 'מכין את הקובץ…' : 'ייצוא לאקסל'}
                  trailing={
                    busy ? (
                      <BrandLoader size={22} />
                    ) : (
                      <View style={s.download}>
                        <Ionicons name="download-outline" size={18} color={DK.accent} />
                      </View>
                    )
                  }
                  onPress={exporting ? undefined : () => void (mode === 'drivers' ? exportDrivers(category.value as ReportCategory) : exportVehicles(category.value as VehicleReportCategory))}
                />
              );
            })}
          </Surface>
          <DKText variant="caption" color={DK.muted} style={s.note}>
            הדוח כולל את כל הנתונים העדכניים ברגע הייצוא.
          </DKText>
        </Reveal>
      )}
    </DriverPage>
  );
}
const s = StyleSheet.create({
  segment: { marginTop: 18 },
  download: { width: 36, height: 36, borderRadius: 12, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  note: { textAlign: 'center', marginTop: 12 },
});
