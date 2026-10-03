import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { showAlert } from '../../lib/platformAlert';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState } from '../../components/ui';
import { BrandLoader } from '../../components/ui/BrandLoader';
import { DK, DKText, DriverPage, ErrorPanel, HeroTitle, ListRow, LoadingPanel, Pressy, PrimaryAction, Reveal, STATUS, Segmented, Surface } from '../../components/driverKit';
import { useCompany } from '../../lib/CompanyContext';
import { listDrivers, listVehicles, listComplianceForOwners, listActiveVehicleDriversForVehicles, type DriverRow, type Vehicle, type ComplianceItem, type VehicleDriverWithProfile } from '../../lib/adminApi';
import { REPORT_CATEGORIES, exportDriversReport, type ReportCategory } from '../../lib/driverReport';
import { VEHICLE_REPORT_CATEGORIES, exportVehiclesReport, type VehicleReportCategory } from '../../lib/vehicleReport';
import { exportFormReport, type FormReportCategory } from '../../lib/meetingReport';
import { useFormReports } from '../../components/reports/useFormReports';
import { INSPECTION_REPORT_CATEGORIES, exportInspectionsReport, type InspectionReportCategory } from '../../lib/inspectionReport';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { ReportsDesktopView } from '../../components/desktop/ReportsDesktopView';
import { t } from '../../lib/i18n';
import { errorMessage } from '../../lib/requestError';

type Props = NativeStackScreenProps<RootStackParamList, 'Reports'>;
export default function ReportsScreen({ navigation }: Props) {
  const { companyId, company } = useCompany(); const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [drivers, setDrivers] = useState<DriverRow[]>([]); const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [compliance, setCompliance] = useState<Map<string, ComplianceItem[]>>(new Map()); const [assignments, setAssignments] = useState<Map<string, VehicleDriverWithProfile[]>>(new Map());
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [kind, setKind] = useState<'drivers' | 'vehicles' | 'meetings' | 'inspections' | null>(null); const [exporting, setExporting] = useState<string | null>(null);
  const load = useCallback(async () => { if (!companyId) { setError(t('company.noLinkedCompany')); setLoading(false); return; } setLoading(true); setError(null); try { const [d, v] = await Promise.all([listDrivers(companyId), listVehicles(companyId, true)]); const [c, a] = await Promise.all([listComplianceForOwners('vehicle', v.map((x) => x.id)), listActiveVehicleDriversForVehicles(v.map((x) => x.id))]); setDrivers(d); setVehicles(v); setCompliance(c); setAssignments(a); } catch (e: any) { setError(errorMessage(e, t('reports.loadFailed'))); } finally { setLoading(false); } }, [companyId]);
  useEffect(() => { load(); }, [load]);
  const exportDrivers = async (category: ReportCategory) => { if (!company) return; setExporting(category); try { await exportDriversReport(company, drivers, category); if (isDesktop) setKind(null); } catch (e: any) { showAlert(t('reports.exportFailed'), String(errorMessage(e, t('common.tryAgain')))); } finally { setExporting(null); } };
  const forms = useFormReports(companyId, drivers);
  const pickKind = (next: typeof kind) => { setKind(next); if (next === 'meetings') void forms.open(isDesktop); };
  const exportForm = async (category: FormReportCategory) => { if (!company || !forms.form || !forms.data) return; setExporting(category); try { await exportFormReport(company, drivers, forms.form, forms.data, category); if (isDesktop) setKind(null); } catch (e: any) { showAlert(t('reports.exportFailed'), String(errorMessage(e, t('common.tryAgain')))); } finally { setExporting(null); } };
  const exportInspections = async (category: InspectionReportCategory) => { if (!company) return; setExporting(category); try { await exportInspectionsReport(company, category); if (isDesktop) setKind(null); } catch (e: any) { showAlert(t('reports.exportFailed'), String(errorMessage(e, t('common.tryAgain')))); } finally { setExporting(null); } };
  const exportVehicles = async (category: VehicleReportCategory) => { if (!company) return; setExporting(category); try { await exportVehiclesReport(company, vehicles, compliance, assignments, category); if (isDesktop) setKind(null); } catch (e: any) { showAlert(t('reports.exportFailed'), String(errorMessage(e, t('common.tryAgain')))); } finally { setExporting(null); } };

  if (isDesktop) {
    return (
      <DesktopShell active="Reports" breadcrumbs={[t('nav.management'), t('reports.title')]}>
        {loading ? null : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <ReportsDesktopView
            open={kind}
            onToggle={(next) => pickKind(kind === next ? null : next)}
            driverCategories={REPORT_CATEGORIES}
            vehicleCategories={VEHICLE_REPORT_CATEGORIES}
            forms={forms}
            inspectionCategories={INSPECTION_REPORT_CATEGORIES}
            exportingCategory={exporting}
            onSelectDriverCategory={(value) => void exportDrivers(value as ReportCategory)}
            onSelectVehicleCategory={(value) => void exportVehicles(value as VehicleReportCategory)}
            onSelectFormCategory={(value) => void exportForm(value as FormReportCategory)}
            onGoToForms={() => navigation.navigate('SignedDocuments', undefined)}
            onSelectInspectionCategory={(value) => void exportInspections(value as InspectionReportCategory)}
          />
        )}
      </DesktopShell>
    );
  }

  const mode = kind ?? 'drivers';
  const categories = mode === 'drivers' ? REPORT_CATEGORIES : mode === 'meetings' ? forms.categories : mode === 'inspections' ? INSPECTION_REPORT_CATEGORIES : VEHICLE_REPORT_CATEGORIES;
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
              onChange={pickKind}
              options={[
                // Four tabs share a phone's width: words and icons, no counts.
                { value: 'drivers', label: t('common.drivers'), icon: 'people' },
                { value: 'vehicles', label: t('common.vehicles'), icon: 'car-sport' },
                { value: 'meetings', label: t('reports.meetingsShort'), icon: 'clipboard' },
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
      ) : mode === 'meetings' && !forms.form ? (
        <Reveal key="forms">
          {forms.formsError ? (
            <ErrorPanel message={t('reports.loadFailed')} hint={forms.formsError} onRetry={() => void forms.retry()} />
          ) : !forms.forms ? (
            <LoadingPanel />
          ) : forms.forms.length === 0 ? (
            <Surface style={s.empty}>
              <DKText variant="body" color={DK.inkSoft} style={s.emptyText}>{t('reports.formsEmpty')}</DKText>
              <PrimaryAction label={t('reports.formsEmptyAction')} icon="document-text-outline" onPress={() => navigation.navigate('SignedDocuments', undefined)} />
            </Surface>
          ) : (
            <Surface>
              {forms.forms.map((item, index) => (
                <ListRow
                  key={item.id}
                  first={index === 0}
                  icon="clipboard-outline"
                  tint={DK.accent}
                  title={item.title}
                  subtitle={forms.formSubtitle(item)}
                  onPress={() => void forms.pick(item)}
                />
              ))}
            </Surface>
          )}
        </Reveal>
      ) : mode === 'meetings' && forms.dataError ? (
        <ErrorPanel message={t('reports.loadFailed')} hint={forms.dataError} onRetry={() => void forms.retry()} />
      ) : (
        <Reveal key={mode === 'meetings' ? `form-${forms.form?.id}` : mode}>
          <Surface>
            {mode === 'meetings' && forms.form && (
              <View style={s.formHead}>
                <View style={s.formTitle}>
                  <DKText variant="heading" numberOfLines={2}>{forms.form.title}</DKText>
                  <DKText variant="caption" color={DK.muted}>{forms.formSubtitle(forms.form)}</DKText>
                </View>
                {forms.canGoBack && (
                  <Pressy onPress={forms.back} accessibilityLabel={t('reports.allForms')} style={s.back} pressScale={0.96}>
                    <Ionicons name="chevron-forward" size={16} color={DK.accent} />
                    <DKText variant="label" color={DK.accent}>{t('reports.allForms')}</DKText>
                  </Pressy>
                )}
              </View>
            )}
            {categories.map((category, index) => {
              const busy = exporting === category.value;
              return (
                <ListRow
                  key={category.value}
                  first={index === 0}
                  icon={category.icon as React.ComponentProps<typeof Ionicons>['name']}
                  tint={category.value === 'expired' || category.value === 'issues' || category.value === 'due' || category.value === 'unfinished' || category.value === 'insp_due' || category.value === 'insp_defects' ? STATUS.expired.fg : DK.accent}
                  title={category.label}
                  subtitle={busy ? t('reports.preparingFile') : 'count' in category ? [category.count === null ? t('common.loading') : t('reports.rowsInReport', { count: category.count }), category.hint].filter(Boolean).join(' · ') : t('reports.exportExcel')}
                  trailing={
                    busy ? (
                      <BrandLoader size={22} />
                    ) : (
                      <View style={s.download}>
                        <Ionicons name="download-outline" size={18} color={DK.accent} />
                      </View>
                    )
                  }
                  onPress={exporting || ('count' in category && category.count === null) ? undefined : () => void (mode === 'drivers' ? exportDrivers(category.value as ReportCategory) : mode === 'meetings' ? exportForm(category.value as FormReportCategory) : mode === 'inspections' ? exportInspections(category.value as InspectionReportCategory) : exportVehicles(category.value as VehicleReportCategory))}
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
  empty: { padding: 20, gap: 16 },
  emptyText: { textAlign: 'center' },
  formHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DK.hairline },
  formTitle: { flex: 1, alignItems: 'flex-end', gap: 2 },
  back: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 12, minHeight: 36, borderRadius: 999, backgroundColor: DK.accentSoft },
});
