// כפתור 'דוחות תעבורה' בכותרת: כל הדוחות של החברה, סינון, ייצוא לאקסל, דוח חדש
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BrandLoader } from '../ui/BrandLoader';
import { DesktopDateField, DesktopSelect, DLtrText, DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, DESKTOP_FONT, DESKTOP_TONES, webOnly } from './desktopTheme';
import { DesktopModal } from './DesktopModal';
import { HeaderAction } from './DashboardWidgets';
import { TrafficReportFields } from './record/TrafficReportFields';
import { useCompany } from '../../lib/CompanyContext';
import { listDrivers } from '../../lib/adminApi/drivers';
import { listVehicles } from '../../lib/adminApi/vehicles';
import { listVehicleDriverHistory } from '../../lib/adminApi/assignments';
import type { DriverRow, Vehicle, VehicleDriverWithProfile } from '../../lib/adminApi/types';
import { replaceDocumentDetails, storedFolderTitle, uploadDocument, type PickedFile } from '../../lib/documents';
import { openDocumentExternally, pickDocumentSource } from '../../lib/documentActions';
import {
  EMPTY_TRAFFIC_REPORT,
  TRAFFIC_REPORTS_CATEGORY,
  driversOnDate,
  trafficReportError,
  trafficReportFromDoc,
  trafficReportStatusLabel,
  trafficReportUpload,
  type TrafficReport,
} from '../../lib/trafficReports';
import {
  TRAFFIC_REPORT_SOON_DAYS,
  filterTrafficReports,
  loadTrafficReports,
  trafficReportTable,
  trafficReportTotals,
  type TrafficReportListRow,
  type TrafficReportView,
} from '../../lib/trafficReportList';
import { formatPlate } from '../../lib/plate';
import { vehicleName } from '../../lib/attention';
import { XLSX_MIME, xlsxBytes } from '../../lib/xlsx';
import { downloadRemoteFileOnWeb } from '../../lib/webDownload';
import { daysUntilExpiry, formatDate } from '../../lib/theme';
import { showAlert } from '../../lib/platformAlert';
import { errorMessage } from '../../lib/requestError';
import { t } from '../../lib/i18n';
import type { RootStackParamList } from '../../navigation/types';

// הכפתור בכותרת הכחולה: פותח את מסך דוחות התעבורה
export function TrafficReportsQuickAction() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return <HeaderAction icon="warning-outline" label={t('folder.trafficReports')} onPress={() => navigation.navigate('TrafficReports')} />;
}

// צבע הסטטוס
const STATUS_TONE: Record<string, { fg: string; bg: string }> = {
  open: DESKTOP_TONES.bad,
  appeal: DESKTOP_TONES.warn,
  paid: DESKTOP_TONES.ok,
  transferred: DESKTOP_TONES.ok,
  cancelled: DESKTOP_TONES.neutral,
};

/**
 * Every traffic report of the company (or of one vehicle, on its card):
 * open / closed / all, offense-date range, search, export what is shown.
 * A row opens the report to edit; "דוח חדש" picks the driver by the vehicle
 * and the offense date.
 */
export function TrafficReportsPanel({ vehicleId }: { vehicleId?: string }) {
  const { companyId } = useCompany();
  const [rows, setRows] = useState<TrafficReportListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<TrafficReportView>('open');
  const [query, setQuery] = useState('');
  const [fromIso, setFromIso] = useState<string | null>(null);
  const [toIso, setToIso] = useState<string | null>(null);
  const [editing, setEditing] = useState<TrafficReportListRow | 'new' | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setError(null);
    try {
      setRows(await loadTrafficReports(companyId, vehicleId));
    } catch (e) {
      setError(errorMessage(e, t('common.tryAgain')));
    }
  }, [companyId, vehicleId]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => (rows ? filterTrafficReports(rows, { view, query, fromIso, toIso }) : []), [rows, view, query, fromIso, toIso]);
  const countFor = (v: TrafficReportView) => (rows ? filterTrafficReports(rows, { view: v, query, fromIso, toIso }).length : 0);
  const totals = useMemo(() => trafficReportTotals(rows ?? []), [rows]);

  const exportXlsx = async () => {
    setExporting(true);
    const bytes = xlsxBytes(trafficReportTable(visible), { sheetName: t('folder.trafficReports') });
    const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
    try {
      await downloadRemoteFileOnWeb(url, `${t('folder.trafficReports')} ${formatDate(new Date().toISOString()).replace(/\//g, '.')}.xlsx`);
    } finally {
      URL.revokeObjectURL(url);
      setExporting(false);
    }
  };

  if (error) {
    return (
      <View style={styles.state}>
        <DText style={styles.muted}>{error}</DText>
        <HoverPressable style={styles.ghost} hoverStyle={styles.ghostHover} onPress={() => void load()}>
          <DText weight="semiBold" style={styles.ghostText}>{t('common.tryAgain')}</DText>
        </HoverPressable>
      </View>
    );
  }
  if (!rows) return <View style={styles.state}><BrandLoader color={DESKTOP_COLORS.brand} /></View>;

  const views: { key: TrafficReportView; label: string }[] = [
    { key: 'open', label: t('trafficReport.viewOpen') },
    { key: 'closed', label: t('trafficReport.viewClosed') },
    { key: 'all', label: t('trafficReport.viewAll') },
  ];

  return (
    <View style={styles.root}>
      {!vehicleId && (
        <View nativeID="tour-totals" style={styles.totals}>
          <Total label={t('trafficReport.totalOpen')} value={String(totals.open)} />
          <Total label={t('trafficReport.totalOpenAmount')} value={`₪${totals.openAmount.toLocaleString('he-IL')}`} />
          <Total label={t('trafficReport.totalSoon', { days: TRAFFIC_REPORT_SOON_DAYS })} value={String(totals.soon)} tone={totals.soon ? DESKTOP_TONES.warn.fg : undefined} />
          <Total label={t('trafficReport.totalOverdue')} value={String(totals.overdue)} tone={totals.overdue ? DESKTOP_TONES.bad.fg : undefined} />
        </View>
      )}

      <View style={styles.toolbar}>
        <View nativeID="tour-views" style={styles.segment} accessibilityRole="tablist">
          {views.map((item) => {
            const active = item.key === view;
            return (
              <HoverPressable
                key={item.key}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
                hoverStyle={active ? undefined : styles.segmentItemHover}
                onPress={() => setView(item.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <DText weight="semiBold" style={[styles.segmentText, active && styles.onBrand]}>{item.label}</DText>
                <DText weight="semiBold" style={[styles.segmentCount, active && styles.onBrand]}>{countFor(item.key)}</DText>
              </HoverPressable>
            );
          })}
        </View>
        <View nativeID="tour-search" style={styles.search}>
          <Ionicons name="search" size={17} color={DESKTOP_COLORS.inkFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('trafficReport.search')}
            placeholderTextColor={DESKTOP_COLORS.inkFaint}
            style={styles.searchInput}
            accessibilityLabel={t('trafficReport.search')}
          />
        </View>
        <HoverPressable
          nativeID="tour-export"
          style={[styles.ghost, (!visible.length || exporting) && styles.disabled]}
          hoverStyle={styles.ghostHover}
          onPress={visible.length && !exporting ? () => void exportXlsx() : undefined}
        >
          <Ionicons name="download-outline" size={17} color={DESKTOP_COLORS.brand} />
          <DText weight="semiBold" style={styles.ghostText}>{t('trafficReport.export')}</DText>
        </HoverPressable>
        <HoverPressable nativeID="tour-new" style={styles.primary} hoverStyle={styles.primaryHover} onPress={() => setEditing('new')}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <DText weight="semiBold" style={styles.onBrandText}>{t('trafficReport.new')}</DText>
        </HoverPressable>
      </View>

      <View nativeID="tour-range" style={styles.range}>
        <DText style={styles.muted}>{t('trafficReport.offenseFrom')}</DText>
        <View style={styles.rangeField}><DesktopDateField value={fromIso} onChange={setFromIso} placeholder={t('date.chooseDateAction')} /></View>
        <DText style={styles.muted}>{t('trafficReport.offenseTo')}</DText>
        <View style={styles.rangeField}><DesktopDateField value={toIso} onChange={setToIso} placeholder={t('date.chooseDateAction')} /></View>
        {(fromIso || toIso) && (
          <HoverPressable style={styles.clear} hoverStyle={styles.ghostHover} onPress={() => { setFromIso(null); setToIso(null); }}>
            <DText weight="semiBold" style={styles.ghostText}>{t('trafficReport.clearDates')}</DText>
          </HoverPressable>
        )}
      </View>

      {visible.length === 0 ? (
        <View nativeID="tour-list" style={styles.state}>
          <Ionicons name="checkmark-circle-outline" size={28} color={DESKTOP_TONES.ok.fg} />
          <DText style={styles.muted}>{t('trafficReport.none')}</DText>
        </View>
      ) : (
        <View nativeID="tour-list" style={styles.list}>
          {visible.map((row, index) => <ReportRow key={row.doc.id} row={row} first={index === 0} onPress={() => setEditing(row)} />)}
        </View>
      )}

      {editing && companyId && (
        <TrafficReportEditor
          companyId={companyId}
          row={editing === 'new' ? null : editing}
          defaultVehicleId={vehicleId ?? null}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </View>
  );
}

function Total({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.total}>
      <DText style={styles.muted}>{label}</DText>
      <DLtrText weight="bold" style={[styles.totalValue, tone ? { color: tone } : null]}>{value}</DLtrText>
    </View>
  );
}

// שורת דוח ברשימה
function ReportRow({ row, first, onPress }: { row: TrafficReportListRow; first: boolean; onPress: () => void }) {
  const d = row.doc.details ?? {};
  const tone = STATUS_TONE[row.status] ?? DESKTOP_TONES.neutral;
  const dueDays = daysUntilExpiry(row.nextDue);
  const dueTone = dueDays == null ? DESKTOP_COLORS.inkMuted : dueDays < 0 ? DESKTOP_TONES.bad.fg : dueDays <= TRAFFIC_REPORT_SOON_DAYS ? DESKTOP_TONES.warn.fg : DESKTOP_COLORS.inkMuted;
  const deadlines = [
    d.pay_by ? t('trafficReport.payByShort', { date: formatDate(d.pay_by) }) : '',
    d.transfer_by && d.responsibility !== 'company' ? t('trafficReport.transferByShort', { date: formatDate(d.transfer_by) }) : '',
  ].filter(Boolean).join(' · ');
  return (
    <HoverPressable
      style={[styles.row, !first && styles.rowBorder]}
      hoverStyle={styles.rowHover}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.driverName}, ${row.typeLabel}`}
    >
      <View style={styles.who}>
        <DText weight="bold" style={styles.name} numberOfLines={1}>{row.driverName}</DText>
        {!!row.plate && <DLtrText style={styles.muted}>{row.plate}</DLtrText>}
      </View>
      <View style={styles.what}>
        <DText weight="semiBold" style={styles.cell} numberOfLines={1}>{row.typeLabel}</DText>
        <DText style={styles.muted} numberOfLines={1}>
          {[row.doc.document_date ? formatDate(row.doc.document_date) : '', d.report_number ? `#${d.report_number}` : ''].filter(Boolean).join(' · ')}
        </DText>
      </View>
      <DLtrText weight="semiBold" style={styles.amount}>{d.amount ? `₪${d.amount}` : '—'}</DLtrText>
      <DText style={[styles.due, { color: row.status === 'open' ? dueTone : DESKTOP_COLORS.inkMuted }]} numberOfLines={2}>{deadlines || '—'}</DText>
      <View style={[styles.tag, { backgroundColor: tone.bg }]}>
        <DText weight="semiBold" style={[styles.tagText, { color: tone.fg }]}>{row.status ? trafficReportStatusLabel(row.status) : '—'}</DText>
      </View>
    </HoverPressable>
  );
}

// חלון דוח: חדש (בוחרים רכב ותאריך והנהג מוצע) או עריכה של דוח קיים
function TrafficReportEditor({
  companyId,
  row,
  defaultVehicleId,
  onClose,
  onSaved,
}: {
  companyId: string;
  row: TrafficReportListRow | null;
  defaultVehicleId: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const isNew = !row;
  const [report, setReport] = useState<TrafficReport>(() => (row ? trafficReportFromDoc(row.doc) : EMPTY_TRAFFIC_REPORT));
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [history, setHistory] = useState<VehicleDriverWithProfile[]>([]);
  const [driverId, setDriverId] = useState<string | null>(row?.driverId ?? null);
  const [driverTouched, setDriverTouched] = useState(false);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listVehicles(companyId).then((list) => {
      setVehicles(list);
      const v = isNew && defaultVehicleId ? list.find((x) => x.id === defaultVehicleId) : null;
      // The vehicle card presets its own vehicle.
      if (v) setReport((r) => ({ ...r, vehicleId: v.id, vehiclePlate: formatPlate(v.plate_number), vehicleName: vehicleName(v) }));
    }).catch(() => undefined);
    if (isNew) listDrivers(companyId).then(setDrivers).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!isNew || !report.vehicleId) { setHistory([]); return; }
    let alive = true;
    listVehicleDriverHistory(report.vehicleId).then((h) => { if (alive) setHistory(h); }).catch(() => undefined);
    return () => { alive = false; };
  }, [isNew, report.vehicleId]);

  const onDate = useMemo(
    () => (report.offenseDateIso ? driversOnDate(history, report.offenseDateIso) : []),
    [history, report.offenseDateIso],
  );
  const suggestedIds = useMemo(() => [...new Set(onDate.map((a) => a.driver_id))], [onDate]);

  // The one driver of that vehicle on that day is picked, until the admin picks someone else.
  useEffect(() => {
    if (isNew && !driverTouched) setDriverId(suggestedIds.length === 1 ? suggestedIds[0] : null);
  }, [isNew, driverTouched, suggestedIds]);

  const driverOptions = useMemo(() => {
    const named = drivers.map((d) => ({ id: d.id, name: d.full_name?.trim() || t('common.unnamed') }));
    // A driver who has since left still shows when they drove that day.
    for (const a of onDate) if (!named.some((n) => n.id === a.driver_id)) named.push({ id: a.driver_id, name: a.full_name?.trim() || t('common.unnamed') });
    const first = named.filter((n) => suggestedIds.includes(n.id));
    const rest = named.filter((n) => !suggestedIds.includes(n.id)).sort((a, b) => a.name.localeCompare(b.name, 'he'));
    return [
      ...first.map((n) => ({ value: n.id, label: `${n.name} · ${t('trafficReport.droveThatDay')}` })),
      ...rest.map((n) => ({ value: n.id, label: n.name })),
    ];
  }, [drivers, onDate, suggestedIds]);

  const driverHint = !report.vehicleId || !report.offenseDateIso
    ? t('trafficReport.driverHintPick')
    : suggestedIds.length === 0 ? t('trafficReport.driverHintNone')
    : suggestedIds.length > 1 ? t('trafficReport.driverHintMany') : null;

  const chooseFile = async () => {
    const picked = await pickDocumentSource('file');
    if (picked) setFile(picked);
  };

  const save = async () => {
    const problem = trafficReportError(report)
      ?? (isNew && !driverId ? t('trafficReport.driverMissing') : null)
      ?? (isNew && !file ? t('documents.chooseFileFirst') : null);
    if (problem) return showAlert(t('folder.trafficReports'), problem);
    setSaving(true);
    try {
      const upload = trafficReportUpload(report);
      if (row) {
        await replaceDocumentDetails(row.doc.id, upload.documentDate, upload.details);
      } else {
        await uploadDocument({
          companyId,
          ownerType: 'driver',
          ownerId: driverId!,
          category: TRAFFIC_REPORTS_CATEGORY,
          title: storedFolderTitle(TRAFFIC_REPORTS_CATEGORY, t('folder.trafficReports')),
          file: file!,
          ...upload,
        });
      }
      await onSaved();
    } catch (err) {
      showAlert(t('common.saveFailed'), errorMessage(err, t('common.tryAgain')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DesktopModal visible title={isNew ? t('trafficReport.new') : t('trafficReport.edit')} onClose={() => !saving && onClose()} maxWidth={720}>
      {/* החלון עד 84% מהגובה: הטופס נגלל, השמירה נשארת למטה */}
      <ScrollView style={{ maxHeight: Math.max(240, windowHeight * 0.84 - 140) }} contentContainerStyle={styles.editorContent}>
        {isNew ? (
          <View style={styles.driverBox}>
            <DText style={styles.label}>{t('trafficReport.driver')}</DText>
            <DesktopSelect
              value={driverId}
              options={driverOptions}
              onChange={(id) => { setDriverTouched(true); setDriverId(id); }}
              large
            />
            {!!driverHint && <DText style={styles.muted}>{driverHint}</DText>}
          </View>
        ) : (
          <View style={styles.driverBox}>
            <DText style={styles.label}>{t('trafficReport.driver')}</DText>
            <DText weight="bold" style={styles.name}>{row.driverName}</DText>
          </View>
        )}

        <TrafficReportFields report={report} onChange={setReport} vehicles={vehicles} />

        {isNew ? (
          <View style={styles.driverBox}>
            <DText style={styles.label}>{t('trafficReport.fileHint')}</DText>
            <HoverPressable style={styles.fileBtn} hoverStyle={styles.ghostHover} onPress={() => void chooseFile()}>
              <Ionicons name={file ? 'document-attach-outline' : 'cloud-upload-outline'} size={18} color={DESKTOP_COLORS.brand} />
              <DText weight="semiBold" style={styles.ghostText} numberOfLines={1}>{file ? file.name : t('documents.chooseDocument')}</DText>
            </HoverPressable>
          </View>
        ) : (
          <HoverPressable style={styles.ghost} hoverStyle={styles.ghostHover} onPress={() => void openDocumentExternally(row.doc)}>
            <Ionicons name="eye-outline" size={17} color={DESKTOP_COLORS.brand} />
            <DText weight="semiBold" style={styles.ghostText}>{t('trafficReport.viewFile')}</DText>
          </HoverPressable>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <HoverPressable style={[styles.primary, saving && styles.disabled]} hoverStyle={styles.primaryHover} onPress={saving ? undefined : () => void save()}>
          {saving ? <BrandLoader color="#FFFFFF" /> : <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
          <DText weight="semiBold" style={styles.onBrandText}>{t('common.save')}</DText>
        </HoverPressable>
        <HoverPressable style={styles.ghost} hoverStyle={styles.ghostHover} onPress={() => !saving && onClose()}>
          <DText weight="semiBold" style={styles.ghostText}>{t('common.cancel')}</DText>
        </HoverPressable>
      </View>
    </DesktopModal>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14 },
  totals: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  total: { flex: 1, minWidth: 150, gap: 4, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: DESKTOP_COLORS.border, backgroundColor: DESKTOP_COLORS.surface },
  totalValue: { fontSize: 20, color: DESKTOP_COLORS.ink, textAlign: 'right', ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  toolbar: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  segment: { flexDirection: 'row-reverse', backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 12, padding: 3, gap: 2 },
  segmentItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 },
  segmentItemActive: { backgroundColor: DESKTOP_COLORS.brand },
  segmentItemHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  segmentText: { fontSize: 13.5, color: DESKTOP_COLORS.ink },
  segmentCount: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  onBrand: { color: '#FFFFFF' },
  onBrandText: { fontSize: 13.5, color: '#FFFFFF' },
  search: { flexGrow: 1, minWidth: 200, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput, borderRadius: 12, paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, fontSize: 14, color: DESKTOP_COLORS.ink, fontFamily: DESKTOP_FONT.regular, textAlign: 'right', ...webOnly({ outlineStyle: 'none' }) },
  ghost: { flexDirection: 'row-reverse', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 12, height: 40, borderRadius: 12, borderWidth: 1, borderColor: DESKTOP_COLORS.border, backgroundColor: DESKTOP_COLORS.surface },
  ghostHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  ghostText: { fontSize: 13.5, color: DESKTOP_COLORS.brand },
  primary: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 12, backgroundColor: DESKTOP_COLORS.brand },
  primaryHover: { opacity: 0.9 },
  disabled: { opacity: 0.5 },
  range: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  rangeField: { width: 170 },
  clear: { paddingHorizontal: 10, height: 36, justifyContent: 'center', borderRadius: 10 },
  list: { backgroundColor: DESKTOP_COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: DESKTOP_COLORS.border, overflow: 'hidden' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  who: { flex: 1.4, minWidth: 130, gap: 2, alignItems: 'flex-end' },
  what: { flex: 1.6, minWidth: 140, gap: 2 },
  name: { fontSize: 14.5, color: DESKTOP_COLORS.ink },
  cell: { fontSize: 13.5, color: DESKTOP_COLORS.ink },
  amount: { width: 80, fontSize: 14, color: DESKTOP_COLORS.ink, textAlign: 'right', ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  due: { flex: 1.6, minWidth: 150, fontSize: 13 },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, minWidth: 64, alignItems: 'center' },
  tagText: { fontSize: 12 },
  muted: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  label: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  state: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 48 },
  editorContent: { gap: 14, paddingHorizontal: 18, paddingVertical: 16 },
  driverBox: { gap: 6 },
  fileBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: DESKTOP_COLORS.borderInput, backgroundColor: DESKTOP_COLORS.surface },
  footer: { flexDirection: 'row-reverse', gap: 10, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.border },
});
