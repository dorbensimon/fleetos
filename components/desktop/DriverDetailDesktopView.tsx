import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { DriverRow } from '../../lib/adminApi';
import type { DriverCardGroup, DriverCardRow } from '../driverCard/driverCardSections';
import type { LicenseUpdateRequest } from '../../lib/licenseUpdate';
import type { SigningFolder } from '../../lib/signingFolders';
import { formatDate } from '../../lib/theme';
import { SigningFolders } from '../driverCard/SigningFolders';
import { DLtrText, DText, HoverPressable, StatusPill } from './primitives';
import { DESKTOP_AVATAR_COLORS, DESKTOP_COLORS, DESKTOP_TONES, DesktopTone } from './desktopTheme';

/**
 * Desktop body of the driver card ("תיק נהג"): a two-column layout — a wide
 * details column (groups of contact/document/safety rows) on the right and
 * a narrow status/actions column on the left, instead of the phone's
 * centered scrolling card. Purely presentational — DriverDetailScreen owns
 * all data, loading and mutations.
 */
export function DriverDetailDesktopView({
  driverId,
  driver,
  groups,
  onRowPress,
  onOpenSigningFolder,
  isArchived,
  pendingActivation,
  pendingActivationDays,
  onEdit,
  onCall,
  onMessage,
  onExportReport,
  exportingReport,
  pendingLicenseRequest,
  reviewingLicense,
  onReviewLicense,
  archiving,
  restoring,
  onArchive,
  onRestore,
}: {
  driverId: string;
  driver: DriverRow | null;
  groups: DriverCardGroup[];
  onRowPress: (row: DriverCardRow) => void;
  onOpenSigningFolder: (folder: SigningFolder) => void;
  isArchived: boolean;
  pendingActivation: boolean;
  pendingActivationDays: number | null;
  onEdit: () => void;
  onCall: () => void;
  onMessage: () => void;
  onExportReport: () => void;
  exportingReport: boolean;
  pendingLicenseRequest: LicenseUpdateRequest | null;
  reviewingLicense: boolean;
  onReviewLicense: (approve: boolean) => void;
  archiving: boolean;
  restoring: boolean;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const name = driver?.full_name?.trim() || 'ללא שם';
  const initial = name.charAt(0) || '?';
  const statusTone: DesktopTone = isArchived ? 'neutral' : pendingActivation ? 'warn' : 'ok';
  const statusLabel = isArchived ? 'לא פעיל' : pendingActivation ? 'ממתין להפעלה' : 'פעיל';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.columns}>
        {/* Wide details column */}
        <View style={styles.mainColumn}>
          {isArchived && (
            <Banner icon="archive" text="נהג זה נמצא בארכיון ואין לו גישה לאפליקציה. מחיקה לצמיתות מתבצעת ממסך הארכיון." />
          )}
          {pendingActivation && (
            <Banner
              icon="clock"
              text={
                'הנהג עדיין משתמש בסיסמה זמנית ויידרש לקבוע סיסמה קבועה משלו בכניסה הבאה' +
                (pendingActivationDays === null
                  ? '.'
                  : pendingActivationDays === 0
                  ? ' (מהיום).'
                  : ` (לפני ${pendingActivationDays} ${pendingActivationDays === 1 ? 'יום' : 'ימים'}).`)
              }
            />
          )}

          {pendingLicenseRequest && (
            <View style={styles.licenseCard}>
              <DText weight="bold" style={styles.licenseTitle}>בקשת עדכון רישיון ממתינה</DText>
              <DText style={styles.licenseLine}>
                מספר: {pendingLicenseRequest.requested_license_number} · דרגות: {pendingLicenseRequest.requested_license_classes}
              </DText>
              <DText style={styles.licenseLine}>תוקף עד: {formatDate(pendingLicenseRequest.requested_license_expiry)}</DText>
              <View style={styles.licenseActions}>
                <HoverPressable
                  style={[styles.licenseBtn, styles.licenseApprove]}
                  onPress={() => onReviewLicense(true)}
                  disabled={reviewingLicense}
                >
                  <DText weight="bold" style={styles.licenseApproveText}>אשר</DText>
                </HoverPressable>
                <HoverPressable
                  style={[styles.licenseBtn, styles.licenseReject]}
                  onPress={() => onReviewLicense(false)}
                  disabled={reviewingLicense}
                >
                  <DText weight="bold" style={styles.licenseRejectText}>דחה</DText>
                </HoverPressable>
              </View>
            </View>
          )}

          <View style={styles.signingFoldersWrap}>
            <SigningFolders driverId={driverId} onOpen={onOpenSigningFolder} />
          </View>

          {groups.map((group) => (
            <View key={group.title} style={styles.group}>
              <DText weight="bold" style={styles.groupTitle}>{group.title}</DText>
              <View style={styles.groupCard}>
                {group.rows.map((row, index) => {
                  const isLast = index === group.rows.length - 1;
                  const clickable = row.kind === 'nav' || (row.kind === 'value' && row.pressable);
                  const RowWrap = clickable ? HoverPressable : View;
                  return (
                    <RowWrap
                      key={row.label}
                      style={[styles.row, !isLast && styles.rowBorder]}
                      hoverStyle={clickable ? styles.rowHover : undefined}
                      onPress={clickable ? () => onRowPress(row) : undefined}
                    >
                      <DText style={styles.rowLabel}>{row.label}</DText>
                      {row.kind === 'value' ? (
                        row.ltr ? (
                          <DLtrText weight="semiBold" style={styles.rowValue}>{row.value}</DLtrText>
                        ) : (
                          <DText weight="semiBold" style={styles.rowValue}>{row.value}</DText>
                        )
                      ) : row.badge ? (
                        <StatusPill tone={badgeTone(row.tone)} label={row.badge} />
                      ) : (
                        <Feather name="chevron-left" size={15} color={DESKTOP_COLORS.inkFaint} />
                      )}
                    </RowWrap>
                  );
                })}
              </View>
            </View>
          ))}

          {!!driver?.created_at && (
            <DText style={styles.footer}>
              הצטרף לאפליקציה בתאריך {new Date(driver.created_at).toLocaleDateString('he-IL')}
              {driver?.updated_at ? ` · עדכון אחרון: ${new Date(driver.updated_at).toLocaleDateString('he-IL')}` : ''}
            </DText>
          )}
        </View>

        {/* Narrow status/actions column */}
        <View style={styles.sideColumn}>
          <View style={styles.identityCard}>
            <View style={[styles.avatar, { backgroundColor: DESKTOP_AVATAR_COLORS[0] }]}>
              <DText weight="bold" style={styles.avatarText}>{initial}</DText>
            </View>
            <DText weight="bold" style={styles.driverName} numberOfLines={2}>{name}</DText>
            <StatusPill tone={statusTone} label={statusLabel} />
            <HoverPressable style={styles.editButton} hoverStyle={styles.editButtonHover} onPress={onEdit}>
              <Feather name="edit-3" size={13} color={DESKTOP_COLORS.brand} />
              <DText weight="semiBold" style={styles.editButtonText}>עריכת פרטי נהג</DText>
            </HoverPressable>
          </View>

          <View style={styles.actionsCard}>
            <HoverPressable
              style={[styles.actionRow, !driver?.phone && styles.actionRowDisabled]}
              hoverStyle={styles.rowHover}
              onPress={onCall}
              disabled={!driver?.phone}
            >
              <Feather name="phone" size={14} color={DESKTOP_COLORS.brand} />
              <DText weight="semiBold" style={styles.actionText}>התקשרות</DText>
            </HoverPressable>
            <HoverPressable
              style={[styles.actionRow, !driver?.phone && styles.actionRowDisabled]}
              hoverStyle={styles.rowHover}
              onPress={onMessage}
              disabled={!driver?.phone}
            >
              <Feather name="message-circle" size={14} color={DESKTOP_COLORS.brand} />
              <DText weight="semiBold" style={styles.actionText}>הודעה</DText>
            </HoverPressable>
            <HoverPressable style={styles.actionRow} hoverStyle={styles.rowHover} onPress={onExportReport} disabled={exportingReport}>
              <Feather name="download" size={14} color={DESKTOP_COLORS.brand} />
              <DText weight="semiBold" style={styles.actionText}>
                {exportingReport ? 'מייצא…' : 'ייצוא דוח תמונת מצב'}
              </DText>
            </HoverPressable>
          </View>

          <View style={styles.dangerCard}>
            {isArchived ? (
              <HoverPressable style={styles.actionRow} hoverStyle={styles.rowHover} onPress={onRestore} disabled={restoring}>
                <Feather name="rotate-ccw" size={14} color={DESKTOP_COLORS.brand} />
                <DText weight="semiBold" style={[styles.actionText, { color: DESKTOP_COLORS.brand }]}>
                  {restoring ? 'משחזר…' : 'שחזור מהארכיון'}
                </DText>
              </HoverPressable>
            ) : (
              <HoverPressable style={styles.actionRow} hoverStyle={styles.rowHover} onPress={onArchive} disabled={archiving}>
                <Feather name="archive" size={14} color={DESKTOP_TONES.bad.fg} />
                <DText weight="semiBold" style={[styles.actionText, { color: DESKTOP_TONES.bad.fg }]}>
                  {archiving ? 'מעביר…' : 'העברה לארכיון'}
                </DText>
              </HoverPressable>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function badgeTone(tone: string | undefined): DesktopTone {
  if (tone === 'bad') return 'bad';
  if (tone === 'warn') return 'warn';
  if (tone === 'muted') return 'neutral';
  return 'neutral';
}

function Banner({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) {
  return (
    <View style={styles.banner}>
      <Feather name={icon} size={15} color="#9A3412" />
      <DText style={styles.bannerText}>{text}</DText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, paddingBottom: 48, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  columns: { flexDirection: 'row-reverse', gap: 20, alignItems: 'flex-start' },

  mainColumn: { flex: 2.2, gap: 18, minWidth: 0 },
  signingFoldersWrap: { marginHorizontal: -16 },
  sideColumn: { flex: 1, gap: 14, minWidth: 260 },

  banner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 9,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(234,88,12,.1)',
    borderWidth: 1,
    borderColor: 'rgba(234,88,12,.24)',
  },
  bannerText: { flex: 1, fontSize: 12.5, color: '#9A3412', lineHeight: 18 },

  licenseCard: {
    padding: 14,
    borderRadius: 8,
    backgroundColor: DESKTOP_TONES.warn.bg,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.35)',
    gap: 4,
  },
  licenseTitle: { fontSize: 13, color: DESKTOP_TONES.warn.fg },
  licenseLine: { fontSize: 12.5, color: DESKTOP_TONES.warn.fg },
  licenseActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 8 },
  licenseBtn: { flex: 1, paddingVertical: 8, borderRadius: 7, alignItems: 'center' },
  licenseApprove: { backgroundColor: DESKTOP_TONES.ok.fg },
  licenseApproveText: { color: '#fff', fontSize: 12.5 },
  licenseReject: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_TONES.bad.fg },
  licenseRejectText: { color: DESKTOP_TONES.bad.fg, fontSize: 12.5 },

  group: { gap: 8 },
  groupTitle: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint, letterSpacing: 0.2 },
  groupCard: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    height: 42,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  rowLabel: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  rowValue: { fontSize: 12.5 },

  footer: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint, textAlign: 'center', paddingTop: 8 },

  identityCard: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    padding: 18,
    alignItems: 'center',
    gap: 8,
  },
  avatar: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, textAlign: 'center' },
  driverName: { fontSize: 15, textAlign: 'center' },
  editButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
  },
  editButtonHover: { backgroundColor: DESKTOP_COLORS.canvas },
  editButtonText: { fontSize: 12, color: DESKTOP_COLORS.brand },

  actionsCard: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  dangerCard: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 42,
  },
  actionRowDisabled: { opacity: 0.45 },
  actionText: { fontSize: 12.5, color: DESKTOP_COLORS.ink },
});
