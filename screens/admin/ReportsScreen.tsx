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
import { MEETING_REPORT_CATEGORIES, exportMeetingsReport, type MeetingReportCategory } from '../../lib/meetingReport';
import { INSPECTION_REPORT_CATEGORIES, exportInspectionsReport, type InspectionReportCategory } from '../../lib/inspectionReport';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { ReportsDesktopView } from '../../components/desktop/ReportsDesktopView';
import { t } from '../../lib/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Reports'>;
export default function ReportsScreen({ navigation }: Props) {
  const { companyId, company } = useCompany(); const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [drivers, setDrivers] = useState<DriverRow[]>([]); const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [compliance, setCompliance] = useState<Map<string, ComplianceItem[]>>(new Map()); const [assignments, setAssignments] = useState<Map<string, VehicleDriverWithProfile[]>>(new Map());
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [kind, setKind] = useState<'drivers' | 'vehicles' | 'meetings' | 'inspections' | null>(null); const [exporting, setExporting] = useState<string | null>(null);
  const load = useCallback(async () => { if (!companyId) { setError(t('company.noLinkedCompany')); setLoading(false); return; } setLoading(true); setError(null); try { const [d, v] = await Promise.all([listDrivers(companyId), listVehicles(companyId, true)]); const [c, a] = await Promise.all([listComplianceForOwners('vehicle', v.map((x) => x.id)), listActiveVehicleDriversForVehicles(v.map((x) => x.id))]); setDrivers(d); setVehicles(v); setCompliance(c); setAssignments(a); } catch (e: any) { setError(e?.message ?? t('reports.loadFailed')); } finally { setLoading(false); } }, [companyId]);
  useEffect(() => { load(); }, [load]);
  const exportDrivers = async (category: ReportCategory) => { if (!company) return; setExporting(category); try { await exportDriversReport(company, drivers, category); if (isDesktop) setKind(null); } catch (e: any) { showAlert(t('reports.exportFailed'), String(e?.message ?? t('common.tryAgain'))); } finally { setExporting(null); } };
  const exportMeetings = async (category: MeetingReportCategory) => { if (!company) return; setExporting(category); try { await exportMeetingsReport(company, drivers, category); if (isDesktop) setKind(null); } catch (e: any) { showAlert(t('reports.exportFailed'), String(e?.message ?? t('common.tryAgain'))); } finally { setExporting(null); } };
  const exportInspections = async (category: InspectionReportCategory) => { if (!company) return; setExporting(category); try { await exportInspectionsReport(company, category); if (isDesktop) setKind(null); } catch (e: any) { showAlert(t('reports.exportFailed'), String(e?.message ?? t('common.tryAgain'))); } finally { setExporting(null); } };
  const exportVehicles = async (category: VehicleReportCategory) => { if (!company) return; setExporting(category); try { await exportVehiclesReport(company, vehicles, compliance, assignments, category); if (isDesktop) setKind(null); } catch (e: any) { showAlert(t('reports.exportFailed'), String(e?.message ?? t('common.tryAgain'))); } finally { setExporting(null); } };

  if (isDesktop) {
    return (
      <DesktopShell active="Reports" breadcrumbs={[t('nav.management'), t('reports.title')]}>
        {loading ? null : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <ReportsDesktopView
            open={kind}
            onToggle={(next) => setKind((current) => (current === next ? null : next))}
            driverCategories={REPORT_CATEGORIES}
            vehicleCategories={VEHICLE_REPORT_CATEGORIES}
            meetingCategories={MEETING_REPORT_CATEGORIES}
            inspectionCategories={INSPECTION_REPORT_CATEGORIES}
            exportingCategory={exporting}
            onSelectDriverCategory={(value) => void exportDrivers(value as ReportCategory)}
            onSelectVehicleCategory={(value) => void exportVehicles(value as VehicleReportCategory)}
            onSelectMeetingCategory={(value) => void exportMeetings(value as MeetingReportCategory)}
            onSelectInspectionCategory={(value) => void exportInspections(value as InspectionReportCategory)}
          />
        )}
      </DesktopShell>
    );
  }

  const mode = kind ?? 'drivers';
  const categories = mode === 'drivers' ? REPORT_CATEGORIES : mode === 'meetings' ? MEETING_REPORT_CATEGORIES : mode === 'inspections' ? INSPECTION_REPORT_CATEGORIES : VEHICLE_REPORT_CATEGORIES;
  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={
        <View>
          <HeroTitle title={t('reports.export')} subtitle={t('reports.excelReady')} onBack={() => navigation.goBack()} />
          <View style={s.segment}>
            <Segmented<'drivers' | 'vehicles' | 'meetings' | 'inspections'>
              onNight
              value={mode}
              onChange={setKind}
              options={[
                // Four tabs share a phone's width: words and icons, no counts.
                { value: 'drivers', label: t('common.drivers'), icon: 'people' },
                { value: 'vehicles', label: t('common.vehicles'), icon: 'car-sport' },
                { value: 'meetings', label: t('reports.meetingsShort'), icon: 'chatbubbles' },
                { value: 'inspections', label: t('reports.inspectionsShort'), icon: 'shield-checkmark' },
              ]}
            />
          </View>
        </View>
      }
    >
      {loading ? (
        <LoadingPanel />
      ) : error ? (
        <ErrorPanel message={t('reports.loadFailed')} hint={error} onRetry={load} />
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
                  tint={category.value === 'expired' || category.value === 'issues' || category.value === 'due' || category.value === 'insp_due' || category.value === 'insp_defects' ? STATUS.expired.fg : DK.accent}
                  title={category.label}
                  subtitle={busy ? t('reports.preparingFile') : t('reports.exportExcel')}
                  trailing={
                    busy ? (
                      <BrandLoader size={22} />
                    ) : (
                      <View style={s.download}>
                        <Ionicons name="download-outline" size={18} color={DK.accent} />
                      </View>
                    )
                  }
                  onPress={exporting ? undefined : () => void (mode === 'drivers' ? exportDrivers(category.value as ReportCategory) : mode === 'meetings' ? exportMeetings(category.value as MeetingReportCategory) : mode === 'inspections' ? exportInspections(category.value as InspectionReportCategory) : exportVehicles(category.value as VehicleReportCategory))}
                />
              );
            })}
          </Surface>
          <DKText variant="caption" color={DK.muted} style={s.note}>
            {t('reports.includesLatest')}
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
