// טופס הוספת דוח תעבורה בטלפון
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Card, Field, Input, InputLtr } from '../ui';
import { Select } from '../ui/Select';
import { DateField } from '../ui/DateField';
import { COLORS, RADIUS, SPACING, CONTENT_MAX_WIDTH } from '../../lib/theme';
import { showAlert } from '../../lib/platformAlert';
import type { PickedFile } from '../../lib/documents';
import { chooseDocumentSource, pickDocumentSource } from '../../lib/documentActions';
import { listVehicles } from '../../lib/adminApi/vehicles';
import type { Vehicle } from '../../lib/adminApi/types';
import { vehicleName } from '../../lib/attention';
import { formatPlate } from '../../lib/plate';
import {
  EMPTY_TRAFFIC_REPORT,
  TRAFFIC_REPORT_RESPONSIBILITIES,
  TRAFFIC_REPORT_STATUSES,
  TRAFFIC_REPORT_TYPES,
  trafficReportError,
  trafficReportResponsibilityLabel,
  trafficReportStatusLabel,
  trafficReportTypeLabel,
  withReceivedDate,
  type TrafficReport,
} from '../../lib/trafficReports';
import { DK, NightBar, PrimaryAction } from '../driverKit';
import { t } from '../../lib/i18n';
import { errorMessage } from '../../lib/requestError';

/** The same fields as the desktop folder window; the report's file is required. */
export function TrafficReportFormModal({
  visible,
  companyId,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  companyId: string;
  onClose: () => void;
  onSubmit: (report: TrafficReport, file: PickedFile) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState<TrafficReport>(EMPTY_TRAFFIC_REPORT);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<TrafficReport>) => setReport((r) => ({ ...r, ...patch }));

  useEffect(() => {
    if (visible) listVehicles(companyId).then(setVehicles).catch(() => undefined);
  }, [visible, companyId]);

  const close = () => {
    if (saving) return;
    setReport(EMPTY_TRAFFIC_REPORT);
    setFile(null);
    onClose();
  };

  const chooseFile = () =>
    chooseDocumentSource(t('trafficReport.fileHint'), async (source) => {
      const picked = await pickDocumentSource(source);
      if (picked) setFile(picked);
    });

  const submit = async () => {
    const error = trafficReportError(report) ?? (file ? null : t('documents.chooseFileFirst'));
    if (error) return showAlert(t('folder.trafficReports'), error);
    setSaving(true);
    try {
      await onSubmit(report, file!);
      setReport(EMPTY_TRAFFIC_REPORT);
      setFile(null);
    } catch (err) {
      showAlert(t('common.saveFailed'), errorMessage(err, t('common.tryAgain')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.container}>
        <NightBar insetTop={insets.top} title={t('folder.trafficReports')} onBack={close} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.formCard}>
            <AppText weight="bold" style={styles.section}>{t('trafficReport.sectionTypeDates')}</AppText>
            <Field label={t('trafficReport.typeLabel')}>
              <Select value={report.type} options={TRAFFIC_REPORT_TYPES.map((value) => ({ value, label: trafficReportTypeLabel(value) }))} onChange={(type) => set({ type })} />
            </Field>
            <Field label={t('trafficReport.offenseDate')}>
              <DateField value={report.offenseDateIso} onChange={(offenseDateIso) => set({ offenseDateIso })} disabled={saving} />
            </Field>
            <Field label={t('trafficReport.payBy')} optional>
              <DateField value={report.payByIso} onChange={(payByIso) => set({ payByIso })} disabled={saving} />
            </Field>
            <Field label={t('trafficReport.receivedAt')} optional>
              <DateField value={report.receivedIso} onChange={(iso) => setReport((r) => withReceivedDate(r, iso))} disabled={saving} />
            </Field>
            <Field label={t('trafficReport.transferBy')} optional>
              <DateField value={report.transferByIso} onChange={(transferByIso) => set({ transferByIso })} disabled={saving} />
            </Field>

            <AppText weight="bold" style={styles.section}>{t('trafficReport.sectionAmounts')}</AppText>
            <Field label={t('trafficReport.amount')} optional>
              <InputLtr value={report.amount} onChangeText={(v) => set({ amount: v.replace(/[^\d.]/g, '') })} keyboardType="numeric" editable={!saving} />
            </Field>
            <Field label={t('trafficReport.statusLabel')}>
              <Select value={report.status} options={TRAFFIC_REPORT_STATUSES.map((value) => ({ value, label: trafficReportStatusLabel(value) }))} onChange={(status) => set({ status: status ?? 'open' })} />
            </Field>
            <Field label={t('trafficReport.responsibilityLabel')} optional>
              <Select value={report.responsibility} options={TRAFFIC_REPORT_RESPONSIBILITIES.map((value) => ({ value, label: trafficReportResponsibilityLabel(value) }))} onChange={(responsibility) => set({ responsibility })} allowClear />
            </Field>

            <AppText weight="bold" style={styles.section}>{t('trafficReport.sectionVehicle')}</AppText>
            <Field label={t('trafficReport.vehicle')} optional>
              <Select
                value={report.vehicleId}
                options={vehicles.map((v) => ({ value: v.id, label: `${formatPlate(v.plate_number)} · ${vehicleName(v)}` }))}
                onChange={(id) => {
                  const v = vehicles.find((x) => x.id === id);
                  set({ vehicleId: v?.id ?? null, vehiclePlate: v ? formatPlate(v.plate_number) : '', vehicleName: v ? vehicleName(v) : '' });
                }}
                allowClear
              />
            </Field>
            <Field label={t('trafficReport.issuer')} optional>
              <Input value={report.issuer} onChangeText={(issuer) => set({ issuer })} placeholder={t('trafficReport.issuerPlaceholder')} editable={!saving} />
            </Field>
            <Field label={t('trafficReport.reportNumber')} optional>
              <InputLtr value={report.reportNumber} onChangeText={(reportNumber) => set({ reportNumber })} editable={!saving} />
            </Field>

            <AppText weight="bold" style={styles.section}>{t('trafficReport.sectionMore')}</AppText>
            <Field label={t('trafficReport.description')} optional>
              <Input value={report.description} onChangeText={(description) => set({ description })} multiline numberOfLines={4} style={styles.multiline} editable={!saving} />
            </Field>
            <Field label={t('trafficReport.fileHint')}>
              <TouchableOpacity style={styles.fileBtn} onPress={chooseFile} disabled={saving} activeOpacity={0.7}>
                <Ionicons name={file ? 'document-attach-outline' : 'camera-outline'} size={20} color={COLORS.accent} />
                <AppText weight="bold" style={styles.fileText} numberOfLines={1}>{file ? file.name : t('documents.chooseDocument')}</AppText>
              </TouchableOpacity>
            </Field>
          </Card>
          <PrimaryAction label={t('common.save')} icon="checkmark" onPress={() => void submit()} loading={saving} style={styles.save} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DK.canvas },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  formCard: { gap: SPACING.md },
  section: { fontSize: 15, marginTop: SPACING.xs },
  multiline: { height: 96, paddingTop: 12, textAlignVertical: 'top' },
  fileBtn: {
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.field,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
    borderStyle: 'dashed',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  fileText: { fontSize: 14, color: COLORS.accent, flexShrink: 1 },
  save: { marginTop: SPACING.lg },
});
