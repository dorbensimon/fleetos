import React, { useMemo } from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DK,
  DK_RADIUS,
  DK_SPACE,
  DKText,
  Gauge,
  HeroButton,
  NightHero,
  NightUnderlay,
  StatusBand,
  Plate,
  Pressy,
  Reveal,
  STATUS,
  SectionHeader,
  StatusChip,
  Surface,
  Tile,
  relativeDays,
  statusOfDate,
  validityProgress,
  type Status,
} from '../../components/driverKit';
import { VEHICLE_TYPE_LABELS } from '../../lib/compliance';
import { daysUntilExpiry, formatDate, timeGreeting } from '../../lib/theme';
import type { ComplianceItem, Vehicle } from '../../lib/adminApi';

type Item = { title: string; detail: string; severity: 'danger' | 'warning' | 'success'; item: ComplianceItem; target: string | null };

type Props = {
  insetTop: number;
  insetBottom: number;
  firstName: string;
  vehicle: Vehicle | null;
  items: Item[];
  licenseExpiry: string | null;
  licenseClasses: string | null;
  pendingSignatures: number;
  unreadNotifications: number;
  managerName: string;
  managerPhone: string;
  onMenu: () => void;
  onNotifications: () => void;
  onVehicle: () => void;
  onSigning: () => void;
  onAttention: () => void;
  onLicense: () => void;
  onDocuments: () => void;
  onOdometer: () => void;
  onManager: (kind: 'tel' | 'sms') => void;
};

type Summary =
  | { kind: 'attention'; expired: number; first: string | null; signatures: number }
  | { kind: 'next'; days: number; label: string; status: Status }
  | { kind: 'clear' }
  | { kind: 'none' };

/** The one line that matters most: what expires next, or what already has. */
function summarize(items: { label: string; date: string | null }[], signatures: number): Summary {
  const dated = items.filter((i) => !!i.date).map((i) => ({ ...i, days: daysUntilExpiry(i.date) as number }));
  const expired = dated.filter((i) => i.days < 0).sort((a, b) => a.days - b.days);
  // Anything waiting on the driver — an expired item or a form to sign —
  // outranks what is merely coming up.
  if (expired.length || signatures) return { kind: 'attention', expired: expired.length, first: expired[0]?.label ?? null, signatures };
  if (dated.length === 0) return items.length ? { kind: 'clear' } : { kind: 'none' };
  const next = dated.sort((a, b) => a.days - b.days)[0];
  return { kind: 'next', days: next.days, label: next.label, status: statusOfDate(next.date) };
}

/**
 * The driver's home: the car and what's due on it, up top on the night;
 * the full validity picture, quick actions and the fleet manager below.
 */
export function DriverHomeMobile(p: Props) {
  const vehicleName = p.vehicle
    ? [p.vehicle.manufacturer, p.vehicle.model].filter(Boolean).join(' ') || VEHICLE_TYPE_LABELS[p.vehicle.vehicle_type]
    : '';
  const summary = useMemo(
    () =>
      summarize([
        ...p.items.map((i) => ({ label: i.title, date: i.target })),
        { label: 'רישיון נהיגה', date: p.licenseExpiry },
      ], p.pendingSignatures),
    [p.items, p.licenseExpiry, p.pendingSignatures]
  );
  const licenseStatus = statusOfDate(p.licenseExpiry);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <NightUnderlay />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: p.insetBottom + 36 }]}
        showsVerticalScrollIndicator={false}
      >
        <NightHero insetTop={p.insetTop}>
          <View style={styles.topBar}>
            <HeroButton icon="menu" label="תפריט" onPress={p.onMenu} />
            <View style={styles.greeting}>
              <DKText variant="caption" color={DK.onNightMuted} style={styles.center}>
                {timeGreeting()}
              </DKText>
              <DKText variant="heading" color={DK.onNight} style={styles.center} numberOfLines={1}>
                {p.firstName || 'נהג'}
              </DKText>
            </View>
            <HeroButton
              icon="notifications-outline"
              label={p.unreadNotifications ? `התראות, ${p.unreadNotifications} חדשות` : 'התראות'}
              onPress={p.onNotifications}
              badge={p.unreadNotifications > 0}
            />
          </View>

          <Reveal index={0}>
            {p.vehicle ? (
              <Pressy onPress={p.onVehicle} accessibilityLabel={`הרכב שלי, ${vehicleName}, ${p.vehicle.plate_number}`} pressScale={0.98}>
                <DKText variant="micro" color={DK.onNightFaint}>
                  הרכב שלי
                </DKText>
                <DKText variant="display" color={DK.onNight} numberOfLines={1} style={styles.vehicleName}>
                  {vehicleName}
                </DKText>
                <View style={styles.vehicleMeta}>
                  <Plate number={p.vehicle.plate_number} />
                  <View style={styles.glassChip}>
                    <DKText variant="micro" color={DK.onNight}>
                      {VEHICLE_TYPE_LABELS[p.vehicle.vehicle_type] || 'פרטי'}
                    </DKText>
                  </View>
                </View>
              </Pressy>
            ) : (
              <View>
                <DKText variant="display" color={DK.onNight}>
                  עוד אין רכב
                </DKText>
                <DKText variant="body" color={DK.onNightMuted} style={styles.noVehicleHint}>
                  מנהל הצי ישייך אליך רכב, והוא יופיע כאן.
                </DKText>
              </View>
            )}
          </Reveal>

          <Reveal index={1}>
            <SummaryPanel
              summary={summary}
              onPress={summary.kind === 'attention' || summary.kind === 'next' ? p.onAttention : undefined}
            />
          </Reveal>
        </NightHero>

        <View style={styles.body}>
          {p.vehicle && (
            <Reveal index={2}>
              <Surface>
                <View style={styles.cardHead}>
                  <DKText variant="heading" accessibilityRole="header">
                    תוקף ותחזוקה
                  </DKText>
                  <Pressy onPress={p.onVehicle} accessibilityRole="link" accessibilityLabel="לכל פרטי הרכב" style={styles.link}>
                    <DKText variant="caption" color={DK.accent}>
                      לכל הפרטים
                    </DKText>
                  </Pressy>
                </View>
                {p.items.length === 0 ? (
                  <View style={styles.emptyBlock}>
                    <Ionicons name="shield-checkmark" size={28} color={STATUS.ok.fill} />
                    <DKText variant="label" style={styles.center}>
                      אין פריטי תוקף לרכב הזה
                    </DKText>
                    <DKText variant="caption" color={DK.muted} style={styles.center}>
                      כשמנהל הצי יוסיף ביטוח, טסט או טיפול — הם יופיעו כאן.
                    </DKText>
                  </View>
                ) : (
                  p.items.map((item, index) => (
                    <Gauge
                      key={`${item.title}-${index}`}
                      label={item.title}
                      value={item.target ? formatDate(item.target) : 'תאריך חסר'}
                      detail={relativeDays(item.target)}
                      status={statusOfDate(item.target)}
                      progress={validityProgress(item.target)}
                      index={index}
                      last={index === p.items.length - 1}
                      onPress={p.onVehicle}
                    />
                  ))
                )}
              </Surface>
            </Reveal>
          )}

          <Reveal index={3} style={styles.tiles}>
            <Tile
              icon="create-outline"
              tint={p.pendingSignatures ? '#E07A00' : DK.accent}
              value={String(p.pendingSignatures)}
              title="מסמכים לחתימה"
              caption={p.pendingSignatures ? 'מחכים לחתימה שלך' : 'אין מה לחתום'}
              highlight={p.pendingSignatures > 0}
              onPress={p.onSigning}
            />
            <Tile
              icon="id-card-outline"
              tint={STATUS[licenseStatus].fg}
              value={p.licenseExpiry ? formatDate(p.licenseExpiry) : '—'}
              title="רישיון נהיגה"
              caption={p.licenseClasses ? `דרגה ${p.licenseClasses}` : 'חסרים פרטים'}
              chip={<StatusChip status={licenseStatus} />}
              onPress={p.onLicense}
            />
            <Tile icon="folder-open-outline" tint={DK.accent} title="המסמכים שלי" caption="רישיון, תיק נהג והדרכות" onPress={p.onDocuments} />
            {p.vehicle ? (
              <Tile
                icon="speedometer-outline"
                tint={DK.accent}
                value={`${p.vehicle.odometer.toLocaleString('he-IL')}`}
                title="עדכון קילומטרים"
                caption="ק״מ נוכחי ברכב"
                onPress={p.onOdometer}
              />
            ) : (
              <Tile icon="person-circle-outline" tint={DK.accent} title="הפרטים שלי" caption="טלפון, כתובת ורישיון" onPress={p.onLicense} />
            )}
          </Reveal>

          <Reveal index={4}>
            <SectionHeader title="מנהל הצי" />
            <Surface style={styles.manager}>
              <View style={styles.managerHead}>
                <View style={styles.avatar}>
                  <DKText variant="title" color={DK.accent} style={styles.center}>
                    {p.managerName.trim().charAt(0) || '?'}
                  </DKText>
                </View>
                <View style={styles.managerText}>
                  <DKText variant="label" numberOfLines={1}>
                    {p.managerName || 'עוד לא הוגדר'}
                  </DKText>
                  <DKText variant="caption" color={DK.muted}>
                    {p.managerPhone ? 'זמין לשאלות על הרכב והמסמכים' : 'פרטי הקשר יופיעו כאן כשיוגדרו'}
                  </DKText>
                </View>
              </View>
              {!!p.managerPhone && (
                <View style={styles.managerActions}>
                  <Pressy onPress={() => p.onManager('tel')} haptic accessibilityLabel={`התקשרות אל ${p.managerName || 'מנהל הצי'}`} style={[styles.managerBtn, styles.callBtn]}>
                    <Ionicons name="call" size={18} color="#FFFFFF" />
                    <DKText variant="label" color="#FFFFFF">
                      התקשר
                    </DKText>
                  </Pressy>
                  <Pressy onPress={() => p.onManager('sms')} haptic accessibilityLabel={`הודעה אל ${p.managerName || 'מנהל הצי'}`} style={[styles.managerBtn, styles.smsBtn]}>
                    <Ionicons name="chatbubble" size={17} color={DK.accent} />
                    <DKText variant="label" color={DK.accent}>
                      הודעה
                    </DKText>
                  </Pressy>
                </View>
              )}
            </Surface>
          </Reveal>
        </View>
      </ScrollView>
      <StatusBand insetTop={p.insetTop} />
    </View>
  );
}

function attentionLine(expired: number, first: string | null, signatures: number) {
  const docs = signatures === 1 ? 'מסמך אחד מחכה לחתימה שלך' : `${signatures} מסמכים מחכים לחתימה שלך`;
  if (!expired) return docs;
  const lapsed = expired === 1 ? `${first} פג תוקף` : `${expired} פריטים פגי תוקף`;
  if (!signatures) return expired === 1 ? `${lapsed} — כדאי לטפל עכשיו` : `${lapsed}, החל מ${first}`;
  return `${lapsed}, ו${signatures === 1 ? 'מסמך אחד לחתימה' : `־${signatures} מסמכים לחתימה`}`;
}

function SummaryPanel({ summary, onPress }: { summary: Summary; onPress?: () => void }) {
  if (summary.kind === 'none') return null;
  const tone: Status = summary.kind === 'attention' ? (summary.expired ? 'expired' : 'soon') : summary.kind === 'clear' ? 'ok' : summary.status;
  const s = STATUS[tone];
  let big = '';
  let unit = '';
  let line = '';
  if (summary.kind === 'attention') {
    const total = summary.expired + summary.signatures;
    big = String(total);
    unit = summary.expired ? (total === 1 ? 'פריט' : 'פריטים') : total === 1 ? 'מסמך' : 'מסמכים';
    line = attentionLine(summary.expired, summary.first, summary.signatures);
  } else if (summary.kind === 'next') {
    big = summary.days === 0 ? 'היום' : summary.days.toLocaleString('he-IL');
    unit = summary.days === 0 ? '' : summary.days === 1 ? 'יום' : 'ימים';
    line = `עד ${summary.label}`;
  } else {
    line = 'הכול בתוקף';
  }
  const label = summary.kind === 'clear' ? 'הכול בתוקף' : `${summary.kind === 'attention' ? 'דורש טיפול, ' : ''}${big} ${unit}, ${line}`;
  const body = (
    <View style={styles.summary}>
      <View style={[styles.summaryDot, { backgroundColor: s.fill }]} />
      {summary.kind === 'clear' ? (
        <View style={styles.summaryText}>
          <DKText variant="title" color={DK.onNight}>
            הכול בתוקף
          </DKText>
          <DKText variant="caption" color={DK.onNightMuted}>
            אין כרגע שום דבר שמחכה לך
          </DKText>
        </View>
      ) : (
        <View style={styles.summaryRow}>
          <View style={styles.summaryText}>
            <DKText variant="micro" color={s.fill}>
              {summary.kind === 'attention' ? 'דורש טיפול' : tone === 'soon' ? 'מתקרב' : 'התוקף הבא'}
            </DKText>
            <DKText variant="label" color={DK.onNight} numberOfLines={2}>
              {line}
            </DKText>
          </View>
          <View style={styles.bigNumber}>
            <DKText style={styles.bigValue} color={DK.onNight} ltr={false}>
              {big}
            </DKText>
            {!!unit && (
              <DKText variant="caption" color={DK.onNightMuted}>
                {unit}
              </DKText>
            )}
          </View>
          {!!onPress && <Ionicons name="chevron-back" size={18} color={DK.onNightFaint} />}
        </View>
      )}
    </View>
  );
  if (!onPress || summary.kind === 'clear') {
    return (
      <View accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <Pressy onPress={onPress} accessibilityLabel={label} pressScale={0.98}>
      {body}
    </Pressy>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DK.canvas },
  scroll: { flex: 1 },
  content: { flexGrow: 1, backgroundColor: DK.canvas },
  center: { textAlign: 'center' },

  topBar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  greeting: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },

  vehicleName: { marginTop: 2 },
  vehicleMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginTop: 14 },
  glassChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: DK.glass,
    borderWidth: 1,
    borderColor: DK.glassBorder,
  },
  noVehicleHint: { marginTop: 6 },

  summary: {
    marginTop: 24,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
  },
  summaryDot: { width: 10, height: 10, borderRadius: 5 },
  summaryRow: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  summaryText: { flex: 1, gap: 2 },
  bigNumber: { alignItems: 'center', minWidth: 64 },
  bigValue: { fontFamily: 'Heebo_800ExtraBold', fontSize: 40, lineHeight: 44, letterSpacing: -1, textAlign: 'center', fontVariant: ['tabular-nums'] },

  body: { marginTop: -22, paddingHorizontal: DK_SPACE.md, gap: 22, width: '100%', maxWidth: 560, alignSelf: 'center' },
  link: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  cardHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: DK_SPACE.lg, paddingTop: 16, paddingBottom: 2 },
  emptyBlock: { alignItems: 'center', gap: 6, paddingVertical: 26, paddingHorizontal: 24 },

  tiles: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },

  manager: { padding: 16, gap: 14 },
  managerHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  managerText: { flex: 1, gap: 2 },
  managerActions: { flexDirection: 'row-reverse', gap: 10 },
  managerBtn: { flex: 1, minHeight: 50, borderRadius: DK_RADIUS.inner, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  callBtn: { backgroundColor: '#12A36B' },
  smsBtn: { backgroundColor: DK.accentSoft },
});
