// הפרטים שממלאים בהוספת דוח תעבורה לתיק הנהג (במחשב)
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DesktopDateField, DesktopInput, DesktopSelect, DText } from '../primitives';
import { DESKTOP_COLORS } from '../desktopTheme';
import type { Vehicle } from '../../../lib/adminApi/types';
import { vehicleName } from '../../../lib/attention';
import { formatPlate } from '../../../lib/plate';
import {
  TRAFFIC_REPORT_RESPONSIBILITIES,
  TRAFFIC_REPORT_STATUSES,
  TRAFFIC_REPORT_TYPES,
  trafficReportResponsibilityLabel,
  trafficReportStatusLabel,
  trafficReportTypeLabel,
  withReceivedDate,
  type TrafficReport,
} from '../../../lib/trafficReports';
import { t } from '../../../lib/i18n';

/** The report fields above the upload box, in the four groups of the agreed form. */
export function TrafficReportFields({
  report,
  onChange,
  vehicles,
}: {
  report: TrafficReport;
  onChange: (report: TrafficReport) => void;
  vehicles: Vehicle[];
}) {
  const set = (patch: Partial<TrafficReport>) => onChange({ ...report, ...patch });
  const pickVehicle = (id: string | null) => {
    const v = vehicles.find((x) => x.id === id);
    set({ vehicleId: v?.id ?? null, vehiclePlate: v ? formatPlate(v.plate_number) : '', vehicleName: v ? vehicleName(v) : '' });
  };

  return (
    <View style={styles.root}>
      <DText weight="semiBold" style={styles.section}>{t('trafficReport.sectionTypeDates')}</DText>
      <Field label={t('trafficReport.typeLabel')}>
        <DesktopSelect
          value={report.type}
          options={TRAFFIC_REPORT_TYPES.map((value) => ({ value, label: trafficReportTypeLabel(value) }))}
          onChange={(type) => set({ type })}
          large
        />
      </Field>
      <View style={styles.pair}>
        <Field label={t('trafficReport.offenseDate')}>
          <DesktopDateField value={report.offenseDateIso} onChange={(offenseDateIso) => set({ offenseDateIso })} placeholder={t('date.chooseDateAction')} large />
        </Field>
        <Field label={t('trafficReport.payBy')}>
          <DesktopDateField value={report.payByIso} onChange={(payByIso) => set({ payByIso })} placeholder={t('date.chooseDateAction')} large />
        </Field>
      </View>
      <View style={styles.pair}>
        <Field label={t('trafficReport.receivedAt')}>
          <DesktopDateField value={report.receivedIso} onChange={(iso) => onChange(withReceivedDate(report, iso))} placeholder={t('date.chooseDateAction')} large />
        </Field>
        <Field label={t('trafficReport.transferBy')}>
          <DesktopDateField value={report.transferByIso} onChange={(transferByIso) => set({ transferByIso })} placeholder={t('date.chooseDateAction')} large />
        </Field>
      </View>

      <DText weight="semiBold" style={styles.section}>{t('trafficReport.sectionAmounts')}</DText>
      <View style={styles.pair}>
        <Field label={t('trafficReport.amount')}>
          <DesktopInput value={report.amount} onChangeText={(v) => set({ amount: v.replace(/[^\d.]/g, '') })} ltr keyboardType="numeric" large />
        </Field>
        <Field label={t('trafficReport.statusLabel')}>
          <DesktopSelect
            value={report.status}
            options={TRAFFIC_REPORT_STATUSES.map((value) => ({ value, label: trafficReportStatusLabel(value) }))}
            onChange={(status) => set({ status: status ?? 'open' })}
            large
          />
        </Field>
        <Field label={t('trafficReport.responsibilityLabel')}>
          <DesktopSelect
            value={report.responsibility}
            options={TRAFFIC_REPORT_RESPONSIBILITIES.map((value) => ({ value, label: trafficReportResponsibilityLabel(value) }))}
            onChange={(responsibility) => set({ responsibility })}
            allowClear
            large
          />
        </Field>
      </View>

      <DText weight="semiBold" style={styles.section}>{t('trafficReport.sectionVehicle')}</DText>
      <Field label={t('trafficReport.vehicle')}>
        <DesktopSelect
          value={report.vehicleId}
          options={vehicles.map((v) => ({ value: v.id, label: `${formatPlate(v.plate_number)} · ${vehicleName(v)}` }))}
          onChange={pickVehicle}
          allowClear
          large
        />
      </Field>
      <View style={styles.pair}>
        <Field label={t('trafficReport.issuer')}>
          <DesktopInput value={report.issuer} onChangeText={(issuer) => set({ issuer })} placeholder={t('trafficReport.issuerPlaceholder')} large />
        </Field>
        <Field label={t('trafficReport.reportNumber')}>
          <DesktopInput value={report.reportNumber} onChangeText={(reportNumber) => set({ reportNumber })} ltr large />
        </Field>
      </View>

      <DText weight="semiBold" style={styles.section}>{t('trafficReport.sectionMore')}</DText>
      <Field label={t('trafficReport.description')}>
        <DesktopInput value={report.description} onChangeText={(description) => set({ description })} multiline large />
      </Field>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.cell}>
      <DText style={styles.label}>{label}</DText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  section: { fontSize: 14.5, color: DESKTOP_COLORS.ink, marginTop: 4 },
  pair: { flexDirection: 'row-reverse', gap: 10 },
  cell: { flex: 1, gap: 6 },
  label: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
});
