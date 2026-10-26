// הפרטים שממלאים בהעלאת מסמך לתיקיית נוהל 6 (במחשב)
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DesktopDateField, DesktopInput, DText } from '../primitives';
import { DESKTOP_COLORS } from '../desktopTheme';
import { formatPhone, isValidIsraeliPhone } from '../../../lib/phone';
import { procedure6Details } from '../../../lib/procedure6Report';
import { t } from '../../../lib/i18n';

/**
 * The same event fields as the phone's procedure 6 form, filled above the
 * upload button; the chosen file is stored with them (documents.details).
 * The phone turns its form into a PDF, which the website cannot do.
 */
export interface Procedure6Event {
  eventDateIso: string | null;
  eventTime: string;
  details: string;
  vehicleNumber: string;
  complainantName: string;
  complainantPhone: string;
}

export const EMPTY_PROCEDURE_6: Procedure6Event = { eventDateIso: null, eventTime: '', details: '', vehicleNumber: '', complainantName: '', complainantPhone: '' };

// בודק שכל השדות מולאו, כמו בטופס בטלפון
/** Every field is required, as on the phone; the time is HH:MM. */
export function procedure6Error(event: Procedure6Event): string | null {
  const missing = [
    !event.eventDateIso && t('procedure6.eventDate'),
    !/^([01]?\d|2[0-3]):[0-5]\d$/.test(event.eventTime.trim()) && t('procedure6.eventTime'),
    !event.details.trim() && t('procedure6.eventDetails'),
    !event.vehicleNumber.trim() && t('vehicle.numberShort'),
    !event.complainantName.trim() && t('procedure6.complainantName'),
  ].filter((x): x is string => !!x);
  if (missing.length) return `${t('validation.required')}: ${missing.join(', ')}`;
  if (!isValidIsraeliPhone(event.complainantPhone)) return `${t('procedure6.complainantPhone')}: ${t('validation.invalidPhone')}`;
  return null;
}

/** What the upload stores: the event date as the document's date, the rest as details. */
export function procedure6Upload(event: Procedure6Event) {
  return {
    documentDate: event.eventDateIso,
    details: procedure6Details({ ...event, complainantPhone: formatPhone(event.complainantPhone) }),
  };
}

export function Procedure6Fields({
  event,
  onChange,
  expiryDate,
  onExpiryChange,
}: {
  event: Procedure6Event;
  onChange: (event: Procedure6Event) => void;
  expiryDate: string | null;
  onExpiryChange: (iso: string | null) => void;
}) {
  const set = (patch: Partial<Procedure6Event>) => onChange({ ...event, ...patch });
  return (
    <View style={styles.root}>
      <View style={styles.pair}>
        <View style={styles.cell}>
          <DText style={styles.label}>{t('procedure6.eventDate')}</DText>
          <DesktopDateField value={event.eventDateIso} onChange={(eventDateIso) => set({ eventDateIso })} placeholder={t('date.chooseDateAction')} large />
        </View>
        <View style={styles.cell}>
          <DText style={styles.label}>{t('procedure6.eventTime')}</DText>
          <DesktopInput value={event.eventTime} onChangeText={(v) => set({ eventTime: v.replace(/[^\d:]/g, '').slice(0, 5) })} placeholder="HH:MM" ltr large />
        </View>
      </View>
      <View style={styles.cell}>
        <DText style={styles.label}>{t('procedure6.eventDetails')}</DText>
        <DesktopInput value={event.details} onChangeText={(details) => set({ details })} placeholder={t('procedure6.eventDescription')} multiline large />
      </View>
      <View style={styles.cell}>
        <DText style={styles.label}>{t('vehicle.numberShort')}</DText>
        <DesktopInput value={event.vehicleNumber} onChangeText={(v) => set({ vehicleNumber: v.replace(/[^\d-]/g, '') })} ltr keyboardType="number-pad" large />
      </View>
      <View style={styles.pair}>
        <View style={styles.cell}>
          <DText style={styles.label}>{t('procedure6.complainantName')}</DText>
          <DesktopInput value={event.complainantName} onChangeText={(complainantName) => set({ complainantName })} large />
        </View>
        <View style={styles.cell}>
          <DText style={styles.label}>{t('procedure6.complainantPhone')}</DText>
          <DesktopInput value={event.complainantPhone} onChangeText={(v) => set({ complainantPhone: v.replace(/[^\d-]/g, '') })} placeholder="050-0000000" ltr keyboardType="phone-pad" large />
        </View>
      </View>
      <View style={styles.cell}>
        <DText style={styles.label}>{t('documents.validUntilOptional')}</DText>
        <DesktopDateField value={expiryDate} onChange={onExpiryChange} placeholder={t('date.chooseDateAction')} large />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  pair: { flexDirection: 'row-reverse', gap: 10 },
  cell: { flex: 1, gap: 6 },
  label: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
});
