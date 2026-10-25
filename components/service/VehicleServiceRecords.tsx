// תיקיית מסמכי טיפולים ברכב: רשימה, סינון לפי תאריכים, סה"כ הוצאות, והוספה עם סריקת החשבונית
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DesktopModal } from '../desktop/DesktopModal';
import { DesktopDateField, DesktopInput, DLtrText, DText, HoverPressable, SortHeader } from '../desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../desktop/desktopTheme';
import { BrandLoader } from '../ui/BrandLoader';
import { KitSheet, ListRow } from '../driverKit';
import type { RootStackParamList } from '../../navigation/types';
import type { PickedFile } from '../../lib/documents';
import { chooseDocumentSource, documentDisplayName, documentViewerMode, getDocumentViewUrl, pickDocumentSource } from '../../lib/documentActions';
import { scanInvoice } from '../../lib/documentDateScan';
import {
  createServiceRecord,
  deleteServiceRecord,
  formatShekels,
  inDateRange,
  listServiceRecords,
  totalBeforeVat,
  updateServiceRecord,
  type ServiceRecord,
  type ServiceRecordInput,
} from '../../lib/serviceRecords';
import { showAlert } from '../../lib/platformAlert';
import { errorMessage } from '../../lib/requestError';
import { formatDate } from '../../lib/theme';
import { t, dirIcon } from '../../lib/i18n';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// טוען את הטיפולים של הרכב
function useServiceRecords(vehicleId: string) {
  const [records, setRecords] = useState<ServiceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setRecords(await listServiceRecords(vehicleId));
      setError(null);
    } catch (err: any) {
      setError(errorMessage(err, t('common.tryAgain')));
      setRecords((current) => current ?? []);
    }
  }, [vehicleId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { records, error, reload };
}

// השורה הקטנה מתחת לשם התיקייה
function folderMeta(records: ServiceRecord[] | null): string {
  if (records === null) return t('common.loadingEllipsis');
  if (!records.length) return t('service.none');
  const count = records.length === 1 ? t('service.countOne') : t('service.count', { count: records.length });
  return `${count} · ${formatShekels(totalBeforeVat(records))}`;
}

// שורת התיקייה בתיק הרכב (מחשב)
/** One folder row among the vehicle's documents; opens the treatments window. */
export function VehicleServiceFolderRow({ companyId, vehicleId, first }: { companyId: string; vehicleId: string; first?: boolean }) {
  const { records, error, reload } = useServiceRecords(vehicleId);
  const [open, setOpen] = useState(false);
  const filled = !!records?.length;
  return (
    <>
      <HoverPressable style={[styles.folderRow, !first && styles.divider]} hoverStyle={styles.rowHover} onPress={() => setOpen(true)} accessibilityLabel={`${t('service.folder')}, ${folderMeta(records)}`}>
        <View style={[styles.folderIcon, filled && styles.folderIconFilled]}>
          <Ionicons name="construct-outline" size={16} color={filled ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkMuted} />
        </View>
        <View style={styles.flex}>
          <DText weight="semiBold" style={styles.folderTitle} numberOfLines={1}>{t('service.folder')}</DText>
          <DText style={styles.meta} numberOfLines={1}>{folderMeta(records)}</DText>
        </View>
        <Ionicons name={dirIcon('chevron-back')} size={15} color={DESKTOP_COLORS.inkFaint} />
      </HoverPressable>
      <DesktopModal visible={open} title={t('service.folder')} onClose={() => setOpen(false)} maxWidth={820}>
        {open && <ServiceRecordsPanel companyId={companyId} vehicleId={vehicleId} records={records} error={error} reload={reload} onLeave={() => setOpen(false)} />}
      </DesktopModal>
    </>
  );
}

// שורת התיקייה בתיק הרכב (טלפון)
export function VehicleServiceFolderMobileRow({ companyId, vehicleId, first }: { companyId: string; vehicleId: string; first?: boolean }) {
  const { records, error, reload } = useServiceRecords(vehicleId);
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow first={first} icon="construct-outline" title={t('service.folder')} subtitle={folderMeta(records)} onPress={() => setOpen(true)} />
      <KitSheet visible={open} onClose={() => setOpen(false)} title={t('service.folder')} icon="construct-outline">
        {open && <ServiceRecordsPanel compact companyId={companyId} vehicleId={vehicleId} records={records} error={error} reload={reload} onLeave={() => setOpen(false)} />}
      </KitSheet>
    </>
  );
}

// תוכן התיקייה: הרשימה, או טופס של טיפול
function ServiceRecordsPanel({
  companyId,
  vehicleId,
  records,
  error,
  reload,
  onLeave,
  compact,
}: {
  companyId: string;
  vehicleId: string;
  records: ServiceRecord[] | null;
  error: string | null;
  reload: () => Promise<void>;
  /** Closes the window before leaving for the file viewer. */
  onLeave: () => void;
  compact?: boolean;
}) {
  const navigation = useNavigation<Nav>();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [oldestFirst, setOldestFirst] = useState(false);
  // null: the list; 'new': a new treatment; a record: editing it.
  const [editing, setEditing] = useState<ServiceRecord | 'new' | null>(null);

  const openFile = async (record: ServiceRecord) => {
    if (!record.document) return;
    const src = await getDocumentViewUrl(record.document);
    if (!src) return;
    onLeave();
    navigation.navigate('DocusealWebView', { mode: documentViewerMode(record.document), title: documentDisplayName(record.document), src });
  };

  if (editing) {
    return (
      <ServiceRecordForm
        companyId={companyId}
        vehicleId={vehicleId}
        record={editing === 'new' ? null : editing}
        compact={compact}
        onOpenFile={openFile}
        onDone={async (changed) => {
          setEditing(null);
          if (changed) await reload();
        }}
      />
    );
  }

  const shown = inDateRange(records ?? [], from, to);
  const sorted = oldestFirst ? [...shown].reverse() : shown;
  const total = totalBeforeVat(shown);

  return (
    <View style={[styles.body, compact && styles.bodyCompact]}>
      <View style={styles.toolbar}>
        <HoverPressable style={styles.primaryBtn} hoverStyle={styles.primaryBtnHover} onPress={() => setEditing('new')}>
          <Ionicons name="add" size={17} color="#FFFFFF" />
          <DText weight="semiBold" style={styles.primaryBtnText}>{t('service.add')}</DText>
        </HoverPressable>
        <View style={styles.range}>
          <View style={styles.rangeField}>
            <DText style={styles.label}>{t('service.from')}</DText>
            <DesktopDateField value={from} onChange={setFrom} placeholder={t('date.chooseDateAction')} />
          </View>
          <View style={styles.rangeField}>
            <DText style={styles.label}>{t('service.to')}</DText>
            <DesktopDateField value={to} onChange={setTo} placeholder={t('date.chooseDateAction')} />
          </View>
        </View>
      </View>

      <View style={styles.totalBar}>
        <DText style={styles.totalLabel}>{t('service.total')}</DText>
        <DLtrText weight="bold" style={styles.totalValue}>{formatShekels(total)}</DLtrText>
        <DText style={styles.meta}>· {shown.length === 1 ? t('service.countOne') : t('service.count', { count: shown.length })}</DText>
      </View>

      {!!error && <DText style={styles.error}>{error}</DText>}

      <View style={styles.list}>
        {!compact && (
          <View style={[styles.tr, styles.thead]}>
            <View style={styles.colDate}>
              <SortHeader
                label={t('service.col.date')}
                dir={oldestFirst ? 'asc' : 'desc'}
                onPress={() => setOldestFirst((v) => !v)}
                textStyle={styles.th}
                hints={{ asc: t('service.oldestFirst'), desc: t('service.newestFirst') }}
              />
            </View>
            <DText weight="bold" style={[styles.th, styles.colType]}>{t('service.col.type')}</DText>
            <DText weight="bold" style={[styles.th, styles.colSupplier]}>{t('service.col.supplier')}</DText>
            <DText weight="bold" style={[styles.th, styles.colInvoice]}>{t('service.col.invoice')}</DText>
            <DText weight="bold" style={[styles.th, styles.colAmount]}>{t('service.col.amount')}</DText>
            <View style={styles.colFile} />
          </View>
        )}
        {compact && shown.length > 1 && (
          <View style={styles.compactSort}>
            <SortHeader label={t('service.col.date')} dir={oldestFirst ? 'asc' : 'desc'} onPress={() => setOldestFirst((v) => !v)} textStyle={styles.th} hints={{ asc: t('service.oldestFirst'), desc: t('service.newestFirst') }} />
          </View>
        )}
        {records === null ? (
          <DText style={[styles.meta, styles.empty]}>{t('common.loadingEllipsis')}</DText>
        ) : sorted.length === 0 ? (
          <DText style={[styles.meta, styles.empty]}>{records.length ? t('service.noneInRange') : t('service.none')}</DText>
        ) : (
          sorted.map((r, i) =>
            compact ? (
              <HoverPressable key={r.id} style={[styles.card, i > 0 && styles.divider]} hoverStyle={styles.rowHover} onPress={() => setEditing(r)}>
                <View style={styles.cardTop}>
                  <DText weight="semiBold" style={[styles.cell, styles.flex]} numberOfLines={1}>{r.service_type || t('service.noType')}</DText>
                  <DLtrText weight="bold" style={styles.cell}>{r.amount_before_vat != null ? formatShekels(r.amount_before_vat) : '—'}</DLtrText>
                </View>
                <DText style={styles.meta} numberOfLines={1}>
                  {[formatDate(r.service_date), r.supplier, r.invoice_number && `${t('service.invoiceShort')} ${r.invoice_number}`].filter(Boolean).join(' · ')}
                </DText>
              </HoverPressable>
            ) : (
              <HoverPressable key={r.id} style={[styles.tr, i > 0 && styles.divider]} hoverStyle={styles.rowHover} onPress={() => setEditing(r)} accessibilityLabel={`${formatDate(r.service_date)} ${r.service_type ?? ''}`}>
                <DLtrText style={[styles.cell, styles.colDate]}>{formatDate(r.service_date)}</DLtrText>
                <DText weight="semiBold" style={[styles.cell, styles.colType]} numberOfLines={2}>{r.service_type || '—'}</DText>
                <DText style={[styles.cell, styles.colSupplier]} numberOfLines={1}>{r.supplier || '—'}</DText>
                <DLtrText style={[styles.cell, styles.colInvoice]} numberOfLines={1}>{r.invoice_number || '—'}</DLtrText>
                <DLtrText weight="semiBold" style={[styles.cell, styles.colAmount]}>{r.amount_before_vat != null ? formatShekels(r.amount_before_vat) : '—'}</DLtrText>
                <View style={styles.colFile}>
                  {r.document ? (
                    <HoverPressable style={styles.iconBtn} hoverStyle={styles.rowHover} onPress={() => void openFile(r)} accessibilityLabel={t('service.openFile')} {...webOnly({ title: t('service.openFile') })}>
                      <Ionicons name="document-attach-outline" size={17} color={DESKTOP_COLORS.brand} />
                    </HoverPressable>
                  ) : null}
                </View>
              </HoverPressable>
            ),
          )
        )}
      </View>
    </View>
  );
}

// מספר מהשדה ("1,250.50")
function parseAmount(text: string): number | null | 'invalid' {
  const clean = text.replace(/[,\s₪]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 'invalid';
}

type Draft = { invoice_number: string; supplier: string; service_date: string | null; service_type: string; details: string; amount: string };

const draftOf = (r: ServiceRecord | null): Draft => ({
  invoice_number: r?.invoice_number ?? '',
  supplier: r?.supplier ?? '',
  service_date: r?.service_date ?? null,
  service_type: r?.service_type ?? '',
  details: r?.details ?? '',
  amount: r?.amount_before_vat != null ? String(r.amount_before_vat) : '',
});

// טופס של טיפול: קובץ (נסרק), פרטים, שמירה
/**
 * A new treatment starts from its file: once chosen it is read in the
 * browser and every field it finds is filled in; all stay editable. Editing
 * an existing one changes its details; the file stays as it was.
 */
function ServiceRecordForm({
  companyId,
  vehicleId,
  record,
  compact,
  onOpenFile,
  onDone,
}: {
  companyId: string;
  vehicleId: string;
  record: ServiceRecord | null;
  compact?: boolean;
  onOpenFile: (record: ServiceRecord) => void;
  onDone: (changed: boolean) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(record));
  const [file, setFile] = useState<PickedFile | null>(null);
  const [scan, setScan] = useState<'scanning' | 'found' | 'none' | null>(null);
  const [errors, setErrors] = useState<{ date?: string; amount?: string }>({});
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const scanFor = useRef<PickedFile | null>(null);
  const zoneRef = useRef<View>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const choose = (picked: PickedFile) => {
    setFile(picked);
    scanFor.current = picked;
    setScan('scanning');
    void scanInvoice(picked).then((read) => {
      if (scanFor.current !== picked) return;
      const found = {
        ...(read?.invoiceNumber ? { invoice_number: read.invoiceNumber } : {}),
        ...(read?.supplier ? { supplier: read.supplier } : {}),
        ...(read?.date ? { service_date: read.date } : {}),
        ...(read?.amountBeforeVat != null ? { amount: String(read.amountBeforeVat) } : {}),
      };
      set(found);
      if (found.service_date) setErrors((e) => ({ ...e, date: undefined }));
      setScan(Object.keys(found).length ? 'found' : 'none');
    });
  };
  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  // Drag and drop straight from the computer's folders (web only).
  useEffect(() => {
    if (record || Platform.OS !== 'web') return;
    const node = zoneRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const over = (e: DragEvent) => { e.preventDefault(); setDragOver(true); };
    const leave = (e: DragEvent) => { if (!node.contains(e.relatedTarget as Node | null)) setDragOver(false); };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) chooseRef.current({ uri: URL.createObjectURL(f), name: f.name, mimeType: f.type || 'application/octet-stream' });
    };
    node.addEventListener('dragover', over);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    return () => {
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, [record]);

  const browse = () =>
    chooseDocumentSource(t('service.field.file'), async (source) => {
      const picked = await pickDocumentSource(source);
      if (picked) choose(picked);
    });

  const save = async () => {
    const amount = parseAmount(draft.amount);
    const next = { date: draft.service_date ? undefined : t('service.dateRequired'), amount: amount === 'invalid' ? t('service.amountInvalid') : undefined };
    setErrors(next);
    if (next.date || next.amount || !draft.service_date) return;
    const input: ServiceRecordInput = {
      service_date: draft.service_date,
      service_type: draft.service_type.trim() || null,
      supplier: draft.supplier.trim() || null,
      invoice_number: draft.invoice_number.trim() || null,
      amount_before_vat: amount === 'invalid' ? null : amount,
      details: draft.details.trim() || null,
    };
    setSaving(true);
    try {
      if (record) await updateServiceRecord(record.id, input);
      else await createServiceRecord({ companyId, vehicleId, input, file });
      await onDone(true);
    } catch (err: any) {
      showAlert(t('common.saveFailed'), errorMessage(err, t('common.tryAgain')));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!record) return;
    showAlert(t('service.deleteTitle'), t('service.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.deleteAction'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await deleteServiceRecord(record);
            await onDone(true);
          } catch (err: any) {
            showAlert(t('common.saveFailed'), errorMessage(err, t('common.tryAgain')));
            setSaving(false);
          }
        },
      },
    ]);
  };

  const scanning = scan === 'scanning';
  const field = (label: string, control: React.ReactNode, error?: string, wide?: boolean) => (
    <View style={[styles.field, (wide || compact) && styles.fieldWide]}>
      <DText weight="semiBold" style={styles.label}>{label}</DText>
      {control}
      {!!error && <DText style={styles.error}>{error}</DText>}
    </View>
  );

  return (
    <View style={[styles.body, compact && styles.bodyCompact]}>
      <DText weight="bold" style={styles.formTitle}>{record ? t('service.edit') : t('service.add')}</DText>

      {record ? (
        record.document ? (
          <HoverPressable style={styles.fileLink} hoverStyle={styles.rowHover} onPress={() => onOpenFile(record)}>
            <Ionicons name="document-attach-outline" size={18} color={DESKTOP_COLORS.brand} />
            <DText weight="semiBold" style={styles.fileLinkText} numberOfLines={1}>{t('service.openFile')}</DText>
          </HoverPressable>
        ) : (
          <DText style={styles.meta}>{t('service.noFile')}</DText>
        )
      ) : (
        <View ref={zoneRef}>
          <HoverPressable style={[styles.drop, !!file && styles.dropChosen, dragOver && styles.dropActive]} hoverStyle={styles.dropHover} onPress={browse} disabled={saving}>
            {file ? (
              <View style={styles.chosen}>
                <Ionicons name="document-attach-outline" size={20} color={DESKTOP_COLORS.brand} />
                <DText weight="semiBold" style={styles.chosenName} numberOfLines={1}>{file.name}</DText>
                <DText weight="semiBold" style={styles.link}>{t('common.replace')}</DText>
              </View>
            ) : compact ? (
              // בטלפון אין גרירה ואין "מחשב"
              <DText weight="semiBold" style={[styles.dropText, styles.link]}>{t('documents.chooseFile')}</DText>
            ) : (
              <DText style={styles.dropText}>
                {dragOver ? t('documents.dropHere') : t('documents.dragOr')}
                {!dragOver && <DText weight="semiBold" style={styles.link}>{t('documents.chooseFromComputerLink')}</DText>}
              </DText>
            )}
          </HoverPressable>
        </View>
      )}

      {!!scan && (
        <View style={styles.scanNote}>
          {scanning ? <BrandLoader size="small" /> : <Ionicons name={scan === 'found' ? 'scan-outline' : 'information-circle-outline'} size={15} color={scan === 'found' ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkMuted} />}
          <DText style={[styles.meta, styles.flex]}>{scanning ? t('service.scanning') : scan === 'found' ? t('service.scanFound') : t('service.scanNone')}</DText>
        </View>
      )}

      <View style={styles.fields}>
        {field(t('service.field.invoice'), <DesktopInput large ltr value={draft.invoice_number} onChangeText={(v) => set({ invoice_number: v })} maxLength={60} />)}
        {field(t('service.field.supplier'), <DesktopInput large value={draft.supplier} onChangeText={(v) => set({ supplier: v })} maxLength={120} />)}
        {field(t('service.field.date'), <DesktopDateField large value={draft.service_date} onChange={(v) => { set({ service_date: v }); setErrors((e) => ({ ...e, date: undefined })); }} placeholder={t('date.chooseDateAction')} hasError={!!errors.date} />, errors.date)}
        {field(t('service.field.amount'), <DesktopInput large ltr keyboardType="numeric" value={draft.amount} onChangeText={(v) => { set({ amount: v }); setErrors((e) => ({ ...e, amount: undefined })); }} placeholder="0.00" hasError={!!errors.amount} />, errors.amount)}
        {field(t('service.field.type'), <DesktopInput large value={draft.service_type} onChangeText={(v) => set({ service_type: v })} placeholder={t('service.field.typePlaceholder')} maxLength={120} />, undefined, true)}
        {field(t('service.field.details'), <DesktopInput multiline value={draft.details} onChangeText={(v) => set({ details: v })} maxLength={1000} />, undefined, true)}
      </View>

      <View style={styles.actions}>
        <HoverPressable style={[styles.primaryBtn, (saving || scanning) && styles.disabled]} hoverStyle={styles.primaryBtnHover} onPress={() => void save()} disabled={saving || scanning}>
          {saving ? <BrandLoader size="small" color="#FFFFFF" /> : <Ionicons name="checkmark" size={17} color="#FFFFFF" />}
          <DText weight="semiBold" style={styles.primaryBtnText}>{saving ? t('common.saving') : t('common.save')}</DText>
        </HoverPressable>
        <HoverPressable style={styles.softBtn} hoverStyle={styles.rowHover} onPress={() => void onDone(false)} disabled={saving}>
          <DText weight="semiBold" style={styles.softBtnText}>{t('common.cancel')}</DText>
        </HoverPressable>
        <View style={styles.flex} />
        {!!record && (
          <HoverPressable style={styles.softBtn} hoverStyle={styles.dangerHover} onPress={remove} disabled={saving}>
            <Ionicons name="trash-outline" size={16} color={DESKTOP_TONES.bad.fg} />
            <DText weight="semiBold" style={[styles.softBtnText, { color: DESKTOP_TONES.bad.fg }]}>{t('common.deleteAction')}</DText>
          </HoverPressable>
        )}
      </View>
    </View>
  );
}

// עיצוב
// Row measures match the folder rows beside it (components/desktop/record/FolderDocuments.tsx).
const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  folderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 16, paddingVertical: 8, ...webOnly({ transition: 'background-color 150ms ease' }) },
  divider: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  dangerHover: { backgroundColor: DESKTOP_TONES.bad.bg },
  folderIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: DESKTOP_COLORS.canvas, alignItems: 'center', justifyContent: 'center' },
  folderIconFilled: { backgroundColor: 'rgba(47,91,255,0.10)' },
  folderTitle: { fontSize: 14.5 },
  meta: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  body: { padding: 18, gap: 14 },
  bodyCompact: { padding: 0 },
  toolbar: { flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  range: { flexDirection: 'row-reverse', gap: 10, flexWrap: 'wrap' },
  rangeField: { width: 160, gap: 4 },
  label: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  totalBar: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: DESKTOP_COLORS.surfaceMuted },
  totalLabel: { fontSize: 14, color: DESKTOP_COLORS.ink },
  totalValue: { fontSize: 18, color: DESKTOP_COLORS.ink },
  error: { fontSize: 12.5, color: DESKTOP_TONES.bad.fg },
  list: { borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 10, overflow: 'hidden', backgroundColor: DESKTOP_COLORS.surface },
  tr: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 14, paddingVertical: 8 },
  thead: { minHeight: 38, backgroundColor: DESKTOP_COLORS.surfaceMuted, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  th: { fontSize: 12.5, color: '#4F5B67' },
  cell: { fontSize: 13.5, color: DESKTOP_COLORS.ink },
  colDate: { width: 92 },
  colType: { flex: 1.4, minWidth: 0 },
  colSupplier: { flex: 1, minWidth: 0 },
  colInvoice: { width: 100 },
  colAmount: { width: 96 },
  colFile: { width: 32, alignItems: 'center' },
  iconBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  compactSort: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: DESKTOP_COLORS.surfaceMuted, alignItems: 'flex-end' },
  card: { paddingHorizontal: 14, paddingVertical: 10, gap: 3 },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  empty: { padding: 18, textAlign: 'center' },
  primaryBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 10, backgroundColor: DESKTOP_COLORS.brand, ...webOnly({ cursor: 'pointer' }) },
  primaryBtnHover: { backgroundColor: DESKTOP_COLORS.brandHover },
  primaryBtnText: { fontSize: 14, color: '#FFFFFF' },
  softBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput },
  softBtnText: { fontSize: 14, color: DESKTOP_COLORS.ink },
  disabled: { opacity: 0.6 },
  formTitle: { fontSize: 16, color: DESKTOP_COLORS.ink },
  fileLink: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, alignSelf: 'flex-end', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  fileLinkText: { fontSize: 14, color: DESKTOP_COLORS.brand },
  drop: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: DESKTOP_COLORS.borderInput, borderRadius: 12, paddingVertical: 18, paddingHorizontal: 16, alignItems: 'center', ...webOnly({ cursor: 'pointer' }) },
  dropHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  dropChosen: { borderStyle: 'solid', borderColor: DESKTOP_COLORS.brand },
  dropActive: { borderColor: DESKTOP_COLORS.brand, backgroundColor: 'rgba(47,91,255,0.06)' },
  dropText: { fontSize: 14, color: DESKTOP_COLORS.inkMuted, textAlign: 'center' },
  link: { color: DESKTOP_COLORS.brand },
  chosen: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, maxWidth: '100%' },
  chosenName: { fontSize: 14, color: DESKTOP_COLORS.ink, flexShrink: 1 },
  scanNote: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  fields: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14 },
  field: { width: '47%', flexGrow: 1, gap: 5 },
  fieldWide: { width: '100%' },
  actions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
});
