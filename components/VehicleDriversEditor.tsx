// עריכת הנהגים של רכב: הוספה, הסרה ונהג ראשי
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { showAlert } from '../lib/platformAlert';
import { Ionicons } from '@expo/vector-icons';
import { AppText, useToast } from './ui';
import { Select } from './ui/Select';
import { DesktopSelect, DLtrText, DText, HoverPressable } from './desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from './desktop/desktopTheme';
import { COLORS, RADIUS, SPACING } from '../lib/theme';
import { Avatar, DK, DK_FONT, STATUS } from './driverKit';
import { formatPhone } from '../lib/phone';
import {
  VehicleDriverWithProfile,
  assignDriverToVehicle,
  unassignVehicleDriver,
  setPrimaryVehicleDriver,
  isPendingAssignmentSyncError,
} from '../lib/adminApi';
import { t } from '../lib/i18n';
import { errorMessage } from '../lib/requestError';

// רשימת הנהגים של הרכב עם פעולות
/**
 * Active driver assignments for one vehicle, with add/remove/promote actions
 * — the one place this UI is built, reused
 * by both VehicleFormScreen (editing an existing vehicle) and
 * VehicleDetailScreen's "נהגים" tab, per the product decision that these
 * must be the same experience, not two separate implementations.
 *
 * Only usable once the vehicle actually exists (has an id): `vehicle_drivers`
 * rows require a real `vehicle_id` foreign key, so this has no role in the
 * "create a new vehicle" flow — see VehicleFormScreen for how that's handled.
 */
export function VehicleDriversEditor({
  vehicleId,
  assignments,
  driverOptions,
  onChanged,
  onOpenDriver,
  desktop = false,
}: {
  vehicleId: string;
  /** Active assignments for this vehicle, primary first. */
  assignments: VehicleDriverWithProfile[];
  /** Every driver in the company, for the "add" picker. */
  driverOptions: { value: string; label: string }[];
  onChanged: () => void | Promise<void>;
  onOpenDriver?: (driverId: string) => void;
  /** Use a compact desktop dropdown rather than the mobile bottom sheet. */
  desktop?: boolean;
}) {
  const { showToast } = useToast();
  const [addingDriverId, setAddingDriverId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const assignedIds = new Set(assignments.map((a) => a.driver_id));
  const availableOptions = driverOptions.filter((d) => !assignedIds.has(d.value));

  const addDriver = async () => {
    if (!addingDriverId) return;
    setBusyId('__new__');
    try {
      // If the vehicle has no active drivers yet, the first one becomes
      // primary automatically; only additional drivers start as secondary.
      await assignDriverToVehicle(vehicleId, addingDriverId, assignments.length === 0);
      setAddingDriverId(null);
      await onChanged();
      showToast(t('vehicle.driverAssigned'));
    } catch (err: any) {
      if (isPendingAssignmentSyncError(err)) { showToast(err.message); return; }
      showAlert(t('vehicle.assignDriverFailed'), String(errorMessage(err, t('common.tryAgain'))));
    } finally {
      setBusyId(null);
    }
  };

  const makePrimary = async (a: VehicleDriverWithProfile) => {
    setBusyId(a.id);
    try {
      await setPrimaryVehicleDriver(vehicleId, a.id);
      await onChanged();
      showToast(t('vehicle.setAsPrimary'));
    } catch (err: any) {
      if (isPendingAssignmentSyncError(err)) { showToast(err.message); return; }
      showAlert(t('common.actionFailed'), String(errorMessage(err, t('common.tryAgain'))));
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = (a: VehicleDriverWithProfile) => {
    showAlert(t('vehicle.removeDriverTitle'), t('vehicle.removeDriverConfirm', { v1: a.full_name ?? t('common.theDriver') }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('driver.removeAssignmentAction'),
        style: 'destructive',
        onPress: async () => {
          setBusyId(a.id);
          try {
            await unassignVehicleDriver(a.id);
            await onChanged();
            showToast(t('vehicle.assignmentRemoved'));
          } catch (err: any) {
            if (isPendingAssignmentSyncError(err)) { showToast(err.message); return; }
            showAlert(t('vehicle.removeAssignmentFailed'), String(errorMessage(err, t('common.tryAgain'))));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  // מחשב: רשימה בכרטיס עם תמונה, תגית ופעולות ברורות
  if (desktop) {
    return (
      <View style={dk.wrap}>
        <View style={dk.list}>
          {assignments.length === 0 ? (
            <DText style={dk.empty}>{t('vehicle.noDriversAssigned')}</DText>
          ) : (
            assignments.map((a, index) => {
              const name = a.full_name ?? t('common.unnamed');
              const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
              return (
                <View key={a.id} style={[dk.row, index > 0 && dk.rowDivider]}>
                  <HoverPressable
                    style={dk.rowMain}
                    hoverStyle={dk.rowMainHover}
                    disabled={!onOpenDriver}
                    onPress={() => onOpenDriver?.(a.driver_id)}
                    accessibilityLabel={t('driver.openDetails', { v1: name })}
                  >
                    <View style={[dk.avatar, a.is_primary && dk.avatarPrimary]}>
                      <DText weight="bold" style={[dk.avatarText, a.is_primary && dk.avatarTextPrimary]}>{initials}</DText>
                    </View>
                    <View style={dk.text}>
                      <View style={dk.nameRow}>
                        <DText weight="semiBold" style={dk.name} numberOfLines={1}>{name}</DText>
                        <View style={[dk.badge, a.is_primary && dk.badgePrimary]}>
                          <DText weight="semiBold" style={[dk.badgeText, a.is_primary && dk.badgeTextPrimary]}>
                            {a.is_primary ? t('common.primary') : t('common.secondary')}
                          </DText>
                        </View>
                      </View>
                      {!!a.phone && <DLtrText style={dk.meta}>{formatPhone(a.phone)}</DLtrText>}
                    </View>
                  </HoverPressable>
                  <View style={dk.actions}>
                    {!a.is_primary && (
                      <HoverPressable style={dk.ghostBtn} hoverStyle={dk.ghostBtnHover} onPress={() => void makePrimary(a)} disabled={busyId === a.id} accessibilityLabel={t('vehicle.makePrimary')}>
                        <Ionicons name="star-outline" size={14} color={DESKTOP_COLORS.brand} />
                        <DText weight="semiBold" style={dk.ghostBtnText}>{t('vehicle.makePrimary')}</DText>
                      </HoverPressable>
                    )}
                    <HoverPressable style={dk.iconBtn} hoverStyle={dk.iconBtnHover} onPress={() => confirmRemove(a)} disabled={busyId === a.id} accessibilityLabel={t('vehicle.removeDriverAssignment')} {...webOnly({ title: t('vehicle.removeDriverAssignment') })}>
                      <Ionicons name="trash-outline" size={16} color={DESKTOP_TONES.bad.fg} />
                    </HoverPressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={dk.addRow}>
          <View style={dk.addSelect}>
            <DesktopSelect
              value={addingDriverId}
              onChange={setAddingDriverId}
              options={availableOptions}
              placeholder={availableOptions.length ? t('vehicle.addDriver') : t('vehicle.noDriversAvailable')}
              allowClear
            />
          </View>
          <HoverPressable
            style={[dk.addBtn, (!addingDriverId || busyId === '__new__') && dk.addBtnOff]}
            hoverStyle={dk.addBtnHover}
            onPress={() => void addDriver()}
            disabled={!addingDriverId || busyId === '__new__'}
            accessibilityLabel={t('vehicle.confirmAddDriver')}
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <DText weight="semiBold" style={dk.addBtnText}>{t('common.add')}</DText>
          </HoverPressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, desktop && styles.desktopWrap]}>
      {assignments.length === 0 ? (
        <AppText style={[styles.empty, !desktop && kit.empty]}>{t('vehicle.noDriversAssigned')}</AppText>
      ) : (
        assignments.map((a) => (
          <View key={a.id} style={[styles.row, !desktop && kit.row]}>
            <TouchableOpacity
              style={styles.rowMain}
              activeOpacity={onOpenDriver ? 0.7 : 1}
              disabled={!onOpenDriver}
              onPress={() => onOpenDriver?.(a.driver_id)}
              accessibilityLabel={t('driver.openDetails', { v1: a.full_name ?? '' })}
            >
              <View style={!desktop && kit.rowMain}>
              {!desktop && <Avatar name={a.full_name} size={42} tone={a.is_primary ? 'soft' : 'muted'} />}
              <View style={styles.rowText}>
                <View style={styles.nameRow}>
                  <AppText weight="bold" style={[styles.name, !desktop && kit.name]} numberOfLines={1}>
                    {a.full_name ?? t('common.unnamed')}
                  </AppText>
                  <View style={[styles.badge, a.is_primary ? styles.badgePrimary : styles.badgeSecondary]}>
                    <AppText weight="bold" style={[styles.badgeText, a.is_primary && styles.badgeTextPrimary]}>
                      {a.is_primary ? t('common.primary') : t('common.secondary')}
                    </AppText>
                  </View>
                </View>
                <AppText style={[styles.meta, !desktop && kit.meta]}>{a.phone ? formatPhone(a.phone) : '—'}</AppText>
              </View>
              </View>
            </TouchableOpacity>

            <View style={styles.rowActions}>
              {!a.is_primary && (
                <TouchableOpacity
                  onPress={() => makePrimary(a)}
                  disabled={busyId === a.id}
                  hitSlop={8}
                  style={[styles.actionBtn, !desktop && kit.actionBtn]}
                  accessibilityRole="button"
                  accessibilityLabel={t('vehicle.makePrimary')}
                >
                  <Ionicons name="star-outline" size={18} color={desktop ? COLORS.accent : DK.accent} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => confirmRemove(a)}
                disabled={busyId === a.id}
                hitSlop={8}
                style={[styles.actionBtn, !desktop && kit.actionBtn, !desktop && kit.actionDanger]}
                accessibilityRole="button"
                accessibilityLabel={t('vehicle.removeDriverAssignment')}
              >
                <Ionicons name="trash-outline" size={18} color={desktop ? COLORS.dangerText : STATUS.expired.fg} />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <View style={[styles.addRow, desktop && styles.desktopAddRow]}>
        <View style={[styles.addSelect, desktop && styles.desktopAddSelect]}>
          {desktop ? (
            <DesktopSelect
              value={addingDriverId}
              onChange={setAddingDriverId}
              options={availableOptions}
              placeholder={availableOptions.length ? t('vehicle.addDriver') : t('vehicle.noDriversAvailable')}
              allowClear
            />
          ) : (
            <Select
              value={addingDriverId}
              onChange={setAddingDriverId}
              options={availableOptions}
              placeholder={availableOptions.length ? t('vehicle.addDriver') : t('vehicle.noDriversAvailable')}
              allowClear
            />
          )}
        </View>
        {!!addingDriverId && (
          <TouchableOpacity
            style={[styles.addBtn, !desktop && kit.addBtn]}
            onPress={addDriver}
            disabled={busyId === '__new__'}
            accessibilityLabel={t('vehicle.confirmAddDriver')}
          >
            <Ionicons name="checkmark" size={19} color={COLORS.textInverse} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// עיצוב רשימת הנהגים (טלפון)
const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm },
  desktopWrap: { maxWidth: 390, alignSelf: 'flex-end', width: '100%' },
  empty: { fontSize: 13, color: COLORS.textFaint, paddingVertical: SPACING.sm },

  // שורת נהג
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  rowMain: { flex: 1 },
  rowText: { flex: 1, gap: 3, alignItems: 'flex-end', paddingEnd: 12 },
  nameRow: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', gap: 8 },
  name: { fontSize: 14.5, flexShrink: 1 },
  meta: { fontSize: 12.5, color: COLORS.textMuted },

  // תגית ראשי/משני
  badge: { borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgePrimary: { backgroundColor: COLORS.accentSoft },
  badgeSecondary: { backgroundColor: COLORS.field },
  badgeText: { fontSize: 10.5, color: COLORS.textMuted },
  badgeTextPrimary: { color: COLORS.accent },

  // כפתורי הפעולה בשורה
  rowActions: { flexDirection: 'row-reverse', gap: SPACING.sm },
  actionBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },

  // שורת הוספת נהג
  addRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.sm, paddingTop: SPACING.xs },
  addSelect: { flex: 1 },
  desktopAddRow: { justifyContent: 'flex-start' },
  desktopAddSelect: { flexGrow: 0, flexBasis: 255 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// עיצוב רשימת הנהגים (מחשב)
const kit = StyleSheet.create({
  // שורת נהג
  row: { minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DK.hairline },
  rowMain: { flexDirection: 'row-reverse', alignItems: 'center' },
  name: { fontFamily: DK_FONT.semibold, fontSize: 15.5, color: DK.ink },
  meta: { fontFamily: DK_FONT.medium, fontSize: 13.5, color: DK.muted },
  // כפתור פעולה
  actionBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: DK.accentSoft },
  actionDanger: { backgroundColor: STATUS.expired.soft },
  // כפתור הוספה
  addBtn: { width: 52, height: 52, borderRadius: 16, backgroundColor: DK.accent },
  empty: { fontFamily: DK_FONT.medium, fontSize: 14.5, color: DK.muted },
});

// עיצוב רשימת הנהגים (מחשב, בחלון)
const dk = StyleSheet.create({
  wrap: { gap: 12 },
  list: { borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 12, overflow: 'hidden', backgroundColor: DESKTOP_COLORS.surface },
  empty: { padding: 16, fontSize: 14, color: DESKTOP_COLORS.inkMuted, textAlign: 'right' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingEnd: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, ...webOnly({ transition: 'background-color 150ms ease' }) },
  rowMainHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: DESKTOP_COLORS.surfaceMuted },
  avatarPrimary: { backgroundColor: 'rgba(47,91,255,0.10)' },
  avatarText: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  avatarTextPrimary: { color: DESKTOP_COLORS.brand },
  text: { flex: 1, minWidth: 0, gap: 2, alignItems: 'flex-end' },
  nameRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, maxWidth: '100%' },
  name: { fontSize: 15, color: DESKTOP_COLORS.ink, flexShrink: 1 },
  meta: { fontSize: 13, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  badge: { paddingHorizontal: 8, height: 20, borderRadius: 10, justifyContent: 'center', backgroundColor: DESKTOP_COLORS.surfaceMuted },
  badgePrimary: { backgroundColor: 'rgba(47,91,255,0.10)' },
  badgeText: { fontSize: 11.5, color: DESKTOP_COLORS.inkMuted },
  badgeTextPrimary: { color: DESKTOP_COLORS.brand },
  actions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  ghostBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: 8, ...webOnly({ cursor: 'pointer', transition: 'background-color 150ms ease' }) },
  ghostBtnHover: { backgroundColor: 'rgba(47,91,255,0.08)' },
  ghostBtnText: { fontSize: 13, color: DESKTOP_COLORS.brand },
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', ...webOnly({ cursor: 'pointer', transition: 'background-color 150ms ease' }) },
  iconBtnHover: { backgroundColor: DESKTOP_TONES.bad.bg },
  addRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  addSelect: { flex: 1, minWidth: 0 },
  addBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, height: 38, paddingHorizontal: 14, borderRadius: 10, backgroundColor: DESKTOP_COLORS.brand, ...webOnly({ cursor: 'pointer', transition: 'background-color 150ms ease, opacity 150ms ease' }) },
  addBtnHover: { backgroundColor: DESKTOP_COLORS.brandHover },
  addBtnOff: { opacity: 0.45, ...webOnly({ cursor: 'default' }) },
  addBtnText: { fontSize: 13.5, color: '#FFFFFF' },
});
