import React, { useState } from 'react';
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
import { ChoiceSheet } from '../../../components/ui/Select';
import { SigningFolders } from '../../../components/driverCard/SigningFolders';
import type { DriverCardGroup, DriverCardIconKey, DriverCardRow } from '../../../components/driverCard/driverCardSections';
import type { DriverRow } from '../../../lib/adminApi';
import type { LicenseUpdateRequest } from '../../../lib/licenseUpdate';
import type { SigningFolder } from '../../../lib/signingFolders';
import { formatDate } from '../../../lib/theme';
import { formatPlate } from '../../../lib/plate';
import { t, dirIcon } from '../../../lib/i18n';

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
  /** Opens one vehicle; with more than one, the driver's page asks which first. */
  onOpenVehicle: (vehicleId: string) => void;
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
  const vehicles = d?.vehicles.length ? d.vehicles : d?.vehicle_id ? [{ id: d.vehicle_id, plate_number: d.vehicle_plate ?? '', is_primary: true }] : [];
  const [pickingVehicle, setPickingVehicle] = useState(false);
  const openVehicle = () => {
    if (vehicles.length > 1) setPickingVehicle(true);
    else if (vehicles[0]) p.onOpenVehicle(vehicles[0].id);
  };
  const state = p.archived ? t('common.archived') : p.pendingActivation ? t('driver.awaitingActivation') : t('vehicle.status.active');
  const quick: { key: string; icon: IconName; label: string; disabled: boolean; onPress: () => void }[] = [
    { key: 'call', icon: 'call', label: t('common.call'), disabled: !d?.phone, onPress: p.onCall },
    { key: 'message', icon: 'chatbubble', label: t('common.message'), disabled: !d?.phone, onPress: p.onMessage },
    { key: 'vehicle', icon: 'car-sport', label: t('vehicle.vehicle'), disabled: !vehicles.length, onPress: openVehicle },
  ];

  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      overlay={
        <>
          {p.modals}
          <ChoiceSheet
            open={pickingVehicle}
            onClose={() => setPickingVehicle(false)}
            title={t('driver.whichVehicleEnter')}
            options={[...vehicles]
              .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
              .map((v) => ({ value: v.id, label: formatPlate(v.plate_number) || t('vehicle.noNumber'), hint: v.is_primary ? t('driver.primaryVehicle') : t('vehicle.additional'), icon: 'car-sport' as const }))}
            onPick={(id) => id && p.onOpenVehicle(id)}
          />
        </>
      }
      hero={
        <View>
          <View style={styles.bar}>
            <HeroButton icon={dirIcon('chevron-forward')} label={t('common.goBack')} onPress={p.onBack} />
            {!p.loading && !p.error && <HeroButton icon="create-outline" label={t('driver.editDetails')} onPress={p.onEdit} />}
          </View>
          <View style={styles.identity}>
            <Avatar name={d?.full_name} size={68} tone="night" />
            <View style={styles.flex}>
              <DKText variant="title" color={DK.onNight} numberOfLines={2} accessibilityRole="header">
                {p.loading ? ' ' : d?.full_name ?? t('common.unnamed')}
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
                    label={d.license_expiry ? t('driver.licenseV1V2', { v1: license === 'expired' ? t('status.expired') : t('common.until'), v2: formatDate(d.license_expiry) }) : t('driver.noLicenseExpiry')}
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
        <ErrorPanel message={t('driver.fileLoadFailed')} hint={p.error} onRetry={p.onRetry} />
      ) : (
        <>
          {p.archived && (
            <Reveal index={0}>
              <Banner tone="missing" icon="archive" title={t('driver.archivedTitle')}>
                {t('driver.archivedNoAccess')}
              </Banner>
            </Reveal>
          )}
          {p.pendingActivation && (
            <Reveal index={0}>
              <Banner tone="soon" icon="hourglass" title={t('driver.awaitingAccountActivation')}>
                {t('driver.stillTempPassword', { v1: p.pendingActivationDays == null
                    ? ''
                    : p.pendingActivationDays === 0
                      ? t('driver.fromToday')
                      : ` (${p.pendingActivationDays} ${p.pendingActivationDays === 1 ? t('common.dayWord') : t('common.days')})` })}
              </Banner>
            </Reveal>
          )}
          {!!p.licenseRequest && (
            <Reveal index={0}>
              <Banner tone="soon" icon="id-card" title={t('prefs.type.licenseUpdateRequest')}>
                <DKText variant="caption" color={STATUS.soon.fg}>
                  {t('driver.requestedLicense', { requested_license_number: p.licenseRequest.requested_license_number, requested_license_classes: p.licenseRequest.requested_license_classes, v1: formatDate(p.licenseRequest.requested_license_expiry) })}
                </DKText>
                <View style={styles.review}>
                  <PrimaryAction label={t('common.ok')} icon="checkmark" onPress={() => p.onReviewLicense(true)} loading={p.reviewingLicense} style={styles.flex} />
                  <PrimaryAction label={t('common.reject')} tone="danger" onPress={() => p.onReviewLicense(false)} disabled={p.reviewingLicense} style={styles.flex} />
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
            <KitSection title={t('driver.accountState')}>
              {p.archived ? (
                <ActionRow icon="arrow-undo" label={p.restoring ? t('common.restoring') : t('common.restoreFromArchiveShort')} hint={t('driver.restoresAccess')} onPress={p.onRestore} disabled={p.restoring} />
              ) : (
                <ActionRow icon="archive-outline" tone="danger" label={t('common.moveToArchive')} hint={t('driver.blocksAccess')} onPress={p.onArchive} disabled={p.archiving} />
              )}
            </KitSection>
          </Reveal>

          {!!d?.created_at && (
            <DKText variant="caption" color={DK.faint} style={styles.footer}>
              {t('driver.joinedAppOnV', { v1: formatDate(d.created_at), v2: d.updated_at ? t('driver.updatedSuffix', { v1: formatDate(d.updated_at) }) : '' })}
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
      subtitle={busy ? t('driver.preparingReport') : undefined}
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
