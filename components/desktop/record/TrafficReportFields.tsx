// הפרטים שממלאים בהוספת דוח תעבורה לתיק הנהג (במחשב)
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DesktopDateField, DesktopInput, DesktopSelect, DText, prefersReducedMotion } from '../primitives';
import { DESKTOP_COLORS } from '../desktopTheme';
import { HelpTip } from '../HelpTip';
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
      <Field label={t('trafficReport.typeLabel')} help={t('trafficReport.help.typeLabel')}>
        <DesktopSelect
          value={report.type}
          options={TRAFFIC_REPORT_TYPES.map((value) => ({ value, label: trafficReportTypeLabel(value) }))}
          onChange={(type) => set({ type })}
          large
        />
      </Field>
      <View style={styles.pair}>
        <Field label={t('trafficReport.offenseDate')} help={t('trafficReport.help.offenseDate')}>
          <DesktopDateField value={report.offenseDateIso} onChange={(offenseDateIso) => set({ offenseDateIso })} placeholder={t('date.chooseDateAction')} large />
        </Field>
        <Field label={t('trafficReport.payBy')} help={t('trafficReport.help.payBy')}>
          <DesktopDateField value={report.payByIso} onChange={(payByIso) => set({ payByIso })} placeholder={t('date.chooseDateAction')} large />
        </Field>
      </View>
      <View style={styles.pair}>
        <Field label={t('trafficReport.receivedAt')} help={t('trafficReport.help.receivedAt')}>
          <DesktopDateField value={report.receivedIso} onChange={(iso) => onChange(withReceivedDate(report, iso))} placeholder={t('date.chooseDateAction')} large />
        </Field>
        <Field label={t('trafficReport.transferBy')} help={t('trafficReport.help.transferBy')}>
          <DesktopDateField value={report.transferByIso} onChange={(transferByIso) => set({ transferByIso })} placeholder={t('date.chooseDateAction')} large />
        </Field>
      </View>

      <DText weight="semiBold" style={styles.section}>{t('trafficReport.sectionAmounts')}</DText>
      <View style={styles.pair}>
        <Field label={t('trafficReport.amount')} help={t('trafficReport.help.amount')}>
          <DesktopInput value={report.amount} onChangeText={(v) => set({ amount: v.replace(/[^\d.]/g, '') })} ltr keyboardType="numeric" large />
        </Field>
        <Field label={t('trafficReport.statusLabel')} help={t('trafficReport.help.statusLabel')}>
          <DesktopSelect
            value={report.status}
            options={TRAFFIC_REPORT_STATUSES.map((value) => ({ value, label: trafficReportStatusLabel(value) }))}
            onChange={(status) => set({ status: status ?? 'open' })}
            large
          />
        </Field>
        <Field label={t('trafficReport.responsibilityLabel')} help={t('trafficReport.help.responsibilityLabel')}>
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
      <Field label={t('trafficReport.vehicle')} help={t('trafficReport.help.vehicle')}>
        <DesktopSelect
          value={report.vehicleId}
          options={vehicles.map((v) => ({ value: v.id, label: `${formatPlate(v.plate_number)} · ${vehicleName(v)}` }))}
          onChange={pickVehicle}
          allowClear
          large
        />
      </Field>
      <View style={styles.pair}>
        <Field label={t('trafficReport.issuer')} help={t('trafficReport.help.issuer')}>
          <DesktopInput value={report.issuer} onChangeText={(issuer) => set({ issuer })} placeholder={t('trafficReport.issuerPlaceholder')} large />
        </Field>
        <Field label={t('trafficReport.reportNumber')} help={t('trafficReport.help.reportNumber')}>
          <DesktopInput value={report.reportNumber} onChangeText={(reportNumber) => set({ reportNumber })} ltr large />
        </Field>
      </View>

      <DText weight="semiBold" style={styles.section}>{t('trafficReport.sectionMore')}</DText>
      <Field label={t('trafficReport.description')} help={t('trafficReport.help.description')}>
        <DesktopInput value={report.description} onChangeText={(description) => set({ description })} multiline large />
      </Field>
    </View>
  );
}

/** A label with its "?" explanation above the control. The open one sits above the fields under it. */
export function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.cell, open && styles.cellOpen]}>
      <View style={styles.labelRow}>
        <DText style={styles.label}>{label}</DText>
        {!!help && <HelpTip text={help} label={label} open={open} onOpenChange={setOpen} reduceMotion={prefersReducedMotion()} />}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  section: { fontSize: 14.5, color: DESKTOP_COLORS.ink, marginTop: 4 },
  pair: { flexDirection: 'row-reverse', gap: 10 },
  cell: { flex: 1, gap: 6 },
  cellOpen: { zIndex: 10 },
  // Above the control under it, so the "?" bubble isn't covered.
  labelRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, zIndex: 1 },
  label: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
});
