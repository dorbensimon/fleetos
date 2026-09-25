import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ActionRow,
  Avatar,
  Banner,
  DK,
  DKText,
  DriverPage,
  ErrorPanel,
  HeroButton,
  KitSection,
  ListRow,
  LoadingPanel,
  PrimaryAction,
  Pressy,
  Reveal,
  STATUS,
  StatusChip,
  statusOfDate,
} from '../../../components/driverKit';
import { SigningFolders } from '../../../components/driverCard/SigningFolders';
import type { DriverCardGroup, DriverCardIconKey, DriverCardRow } from '../../../components/driverCard/driverCardSections';
import type { DriverRow } from '../../../lib/adminApi';
import type { LicenseUpdateRequest } from '../../../lib/licenseUpdate';
import type { SigningFolder } from '../../../lib/signingFolders';
import { formatDate } from '../../../lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<DriverCardIconKey, IconName> = {
  phone: 'call',
  email: 'mail',
  message: 'mail',
  car: 'car-sport',
  id: 'id-card',
  sign: 'create',
  doc: 'document-text',
  info: 'information-circle',
  folder: 'folder-open',
  chat: 'chatbubbles',
  alert: 'warning',
  users: 'people',
  shield: 'shield-checkmark',
  award: 'ribbon',
  hazard: 'flame',
  cap: 'school',
  edit: 'create',
  key: 'key',
};

type Props = {
  insetTop: number;
  insetBottom: number;
  loading: boolean;
  error: string | null;
  driverId: string;
  driver: DriverRow | null;
  groups: DriverCardGroup[];
  archived: boolean;
  pendingActivation: boolean;
  pendingActivationDays: number | null;
  licenseRequest: LicenseUpdateRequest | null;
  reviewingLicense: boolean;
  archiving: boolean;
  restoring: boolean;
  exportingReport: boolean;
  modals: React.ReactNode;
  onBack: () => void;
  onRetry: () => void;
  onEdit: () => void;
  onCall: () => void;
  onMessage: () => void;
  onVehicle: () => void;
  onRow: (row: DriverCardRow) => void;
  onOpenSigning: (folder: SigningFolder) => void;
  onReviewLicense: (approve: boolean) => void;
  onArchive: () => void;
  onRestore: () => void;
};

/**
 * A driver's record on the phone: who they are and how to reach them on
 * the night, then everything on file in short groups — each row says what
 * it holds and where it leads. Archiving sits apart at the end.
 */
export function DriverDetailMobile(p: Props) {
  const d = p.driver;
  const license = statusOfDate(d?.license_expiry);
  const hasBanner = p.archived || p.pendingActivation || !!p.licenseRequest;
  const state = p.archived ? 'בארכיון' : p.pendingActivation ? 'ממתין להפעלה' : 'פעיל';
  const quick: { key: string; icon: IconName; label: string; disabled: boolean; onPress: () => void }[] = [
    { key: 'call', icon: 'call', label: 'התקשר', disabled: !d?.phone, onPress: p.onCall },
    { key: 'message', icon: 'chatbubble', label: 'הודעה', disabled: !d?.phone, onPress: p.onMessage },
    { key: 'vehicle', icon: 'car-sport', label: 'רכב', disabled: !d?.vehicle_id, onPress: p.onVehicle },
  ];

  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      overlay={p.modals}
      hero={
        <View>
          <View style={styles.bar}>
            <HeroButton icon="chevron-forward" label="חזרה" onPress={p.onBack} />
            {!p.loading && !p.error && <HeroButton icon="create-outline" label="עריכת פרטי הנהג" onPress={p.onEdit} />}
          </View>
          <View style={styles.identity}>
            <Avatar name={d?.full_name} size={68} tone="night" />
            <View style={styles.flex}>
              <DKText variant="title" color={DK.onNight} numberOfLines={2} accessibilityRole="header">
                {p.loading ? ' ' : d?.full_name ?? 'ללא שם'}
              </DKText>
              <View style={styles.chips}>
                <View style={styles.stateChip}>
                  <View style={[styles.dot, { backgroundColor: p.archived ? DK.onNightFaint : p.pendingActivation ? STATUS.soon.fill : STATUS.ok.fill }]} />
                  <DKText variant="micro" color={DK.onNight}>
                    {state}
                  </DKText>
                </View>
                {!!d && (
                  <StatusChip
                    onNight
                    status={license}
                    label={d.license_expiry ? `רישיון ${license === 'expired' ? 'פג' : 'עד'} ${formatDate(d.license_expiry)}` : 'אין תוקף רישיון'}
                  />
                )}
              </View>
            </View>
          </View>
          <View style={styles.quick}>
            {quick.map((q) => (
              <Pressy key={q.key} onPress={q.onPress} disabled={q.disabled || p.loading} haptic accessibilityLabel={q.label} style={styles.quickItem} pressScale={0.94}>
                <View style={styles.quickIcon}>
                  <Ionicons name={q.icon} size={20} color={DK.onNight} />
                </View>
                <DKText variant="micro" color={DK.onNightMuted}>
                  {q.label}
                </DKText>
              </Pressy>
            ))}
          </View>
        </View>
      }
    >
      {p.loading ? (
        <LoadingPanel />
      ) : p.error ? (
        <ErrorPanel message="טעינת תיק הנהג נכשלה" hint={p.error} onRetry={p.onRetry} />
      ) : (
        <>
          {p.archived && (
            <Reveal index={0}>
              <Banner tone="missing" icon="archive" title="הנהג בארכיון">
                אין לו גישה לאפליקציה. מחיקה לצמיתות נעשית ממסך הארכיון.
              </Banner>
            </Reveal>
          )}
          {p.pendingActivation && (
            <Reveal index={0}>
              <Banner tone="soon" icon="hourglass" title="ממתין להפעלת החשבון">
                {`הנהג עדיין משתמש בסיסמה הזמנית${
                  p.pendingActivationDays == null
                    ? ''
                    : p.pendingActivationDays === 0
                      ? ' (מהיום)'
                      : ` (${p.pendingActivationDays} ${p.pendingActivationDays === 1 ? 'יום' : 'ימים'})`
                }, ויקבע סיסמה קבועה בכניסה הבאה.`}
              </Banner>
            </Reveal>
          )}
          {!!p.licenseRequest && (
            <Reveal index={0}>
              <Banner tone="soon" icon="id-card" title="בקשה לעדכון רישיון">
                <DKText variant="caption" color={STATUS.soon.fg}>
                  {`מספר ${p.licenseRequest.requested_license_number} · דרגות ${p.licenseRequest.requested_license_classes} · תוקף עד ${formatDate(p.licenseRequest.requested_license_expiry)}`}
                </DKText>
                <View style={styles.review}>
                  <PrimaryAction label="אישור" icon="checkmark" onPress={() => p.onReviewLicense(true)} loading={p.reviewingLicense} style={styles.flex} />
                  <PrimaryAction label="דחייה" tone="danger" onPress={() => p.onReviewLicense(false)} disabled={p.reviewingLicense} style={styles.flex} />
                </View>
              </Banner>
            </Reveal>
          )}

          {p.groups.map((group, gi) => (
            <Reveal key={group.title} index={gi + 1}>
              {/* With nothing above it, the first group rises over the hero's edge, where a heading can't sit. */}
              <KitSection title={gi === 0 && !hasBanner ? undefined : group.title}>
                {group.rows.map((row, i) => (
                  <GroupRow key={row.key} row={row} first={i === 0} busy={row.key === 'export-driver-report' && p.exportingReport} onPress={() => p.onRow(row)} />
                ))}
              </KitSection>
              {gi === 0 && (
                <View style={styles.signing}>
                  <SigningFolders driverId={p.driverId} onOpen={p.onOpenSigning} />
                </View>
              )}
            </Reveal>
          ))}

          <Reveal index={p.groups.length + 1}>
            <KitSection title="מצב החשבון">
              {p.archived ? (
                <ActionRow icon="arrow-undo" label={p.restoring ? 'משחזר…' : 'שחזור מהארכיון'} hint="מחזיר לנהג את הגישה לאפליקציה" onPress={p.onRestore} disabled={p.restoring} />
              ) : (
                <ActionRow icon="archive-outline" tone="danger" label="העברה לארכיון" hint="חוסם את הגישה לאפליקציה; אפשר לשחזר תמיד" onPress={p.onArchive} disabled={p.archiving} />
              )}
            </KitSection>
          </Reveal>

          {!!d?.created_at && (
            <DKText variant="caption" color={DK.faint} style={styles.footer}>
              {`הצטרף לאפליקציה ב־${formatDate(d.created_at)}${d.updated_at ? ` · עודכן ${formatDate(d.updated_at)}` : ''}`}
            </DKText>
          )}
        </>
      )}
    </DriverPage>
  );
}

function GroupRow({ row, first, busy, onPress }: { row: DriverCardRow; first: boolean; busy: boolean; onPress: () => void }) {
  if (row.kind === 'value') {
    return (
      <ListRow
        first={first}
        icon={ICONS[row.icon]}
        title={row.label}
        value={row.value}
        ltrValue={row.ltr}
        onPress={row.pressable ? onPress : undefined}
      />
    );
  }
  const tone = row.tone === 'bad' ? STATUS.expired : row.tone === 'warn' ? STATUS.soon : null;
  return (
    <ListRow
      first={first}
      icon={ICONS[row.icon]}
      tint={tone ? tone.fg : DK.accent}
      title={row.label}
      subtitle={busy ? 'מכין את הדוח…' : undefined}
      trailing={
        row.badge ? (
          <View style={[styles.badge, { backgroundColor: tone ? tone.soft : DK.surfaceSunk }]}>
            <DKText variant="micro" color={tone ? tone.fg : DK.muted} numberOfLines={1}>
              {row.badge}
            </DKText>
          </View>
        ) : undefined
      }
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  identity: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  stateChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  quick: { flexDirection: 'row-reverse', gap: 10, marginTop: 20 },
  quickItem: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },
  quickIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  review: { flexDirection: 'row-reverse', gap: 10, marginTop: 12 },
  signing: { marginTop: 18 },
  badge: { maxWidth: 130, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  footer: { textAlign: 'center', marginTop: 4 },
});
