import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState, LoadingState } from '../components/ui';
import { BrandLoader } from '../components/ui/BrandLoader';
import { DK } from '../components/driverKit';
import { DriverHomeMobile } from './driver/DriverHomeMobile';
import { useDriverOverview } from '../lib/useDriverOverview';
import { VEHICLE_TYPE_LABELS } from '../lib/compliance';
import { expiryState, formatDate } from '../lib/theme';
import type { RootStackParamList } from '../navigation/types';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { DesktopShell } from '../components/desktop/DesktopShell';
import { DText, HoverPressable, StatusPill } from '../components/desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_TONES } from '../components/desktop/desktopTheme';
type Props = NativeStackScreenProps<RootStackParamList, 'DriverHome'>;

export default function DriverHomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const { company, profile, driver, vehicle, items: allItems, pendingRequests, unreadNotifications, loading, error, reload } = useDriverOverview();
  const pendingSignatures = pendingRequests.length;
  const fullName = driver?.full_name?.trim() || profile?.full_name?.trim() || ''; const firstName = fullName.split(/\s+/)[0] || ''; const managerName = company?.safety_officer_name?.trim() || ''; const managerPhone = company?.safety_officer_phone || ''; const licenseState = expiryState(driver?.license_expiry);
  const timelineItems = allItems.slice(0, 3);
  const openManager = (kind: 'tel' | 'sms') => { if (managerPhone) Linking.openURL(`${kind}:${managerPhone}`).catch(() => undefined); };
  if (isDesktop) {
    return (
      <DesktopShell active="DriverHome" breadcrumbs={['הבית שלי']}>
        {loading ? (
          <LoadingState />
        ) : error && !driver ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <View style={ds.wrap}>
            <View style={ds.columns}>
              <View style={ds.mainCol}>
                <View style={ds.card}>
                  <DText weight="bold" style={ds.cardTitle}>תוקף ותחזוקה</DText>
                  {vehicle ? (
                    timelineItems.length === 0 ? (
                      <DText style={ds.allGood}>הכול תקין כרגע</DText>
                    ) : (
                      timelineItems.map((item, index) => (
                        <HoverPressable
                          key={`${item.title}-${index}`}
                          style={[ds.timelineRow, index === timelineItems.length - 1 && ds.rowLast]}
                          hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                          onPress={() => navigation.navigate('DriverVehicle')}
                        >
                          <StatusPill tone={item.severity === 'danger' ? 'bad' : item.severity === 'warning' ? 'warn' : 'ok'} label={item.detail} />
                          <DText weight="semiBold" style={ds.timelineTitle}>{item.title}</DText>
                        </HoverPressable>
                      ))
                    )
                  ) : (
                    <HoverPressable style={ds.noVehicleLine} onPress={() => navigation.navigate('Menu')}>
                      <DText style={ds.noVehicleText}>פנה למנהל הצי לשיוך רכב</DText>
                    </HoverPressable>
                  )}
                </View>

                <View style={ds.tilesRow}>
                  <HoverPressable style={ds.tile} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => navigation.navigate('DriverSigningDocuments')}>
                    <DText weight="bold" style={ds.tileNumber}>{pendingSignatures}</DText>
                    <DText weight="semiBold" style={ds.tileTitle}>טפסים ומסמכים</DText>
                    <DText style={ds.tileDetail}>{pendingSignatures ? 'ממתינים לפעולה' : 'אין מסמכים ממתינים'}</DText>
                  </HoverPressable>
                  <HoverPressable style={ds.tile} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => navigation.navigate('DriverProfile')}>
                    <DText weight="bold" style={[ds.tileNumber, licenseState === 'ok' && { color: DESKTOP_TONES.ok.fg }, licenseState === 'expired' && { color: DESKTOP_TONES.bad.fg }]}>
                      {driver?.license_expiry ? formatDate(driver.license_expiry) : '—'}
                    </DText>
                    <DText weight="semiBold" style={ds.tileTitle}>רישיון נהיגה</DText>
                    <DText style={[ds.tileDetail, licenseState === 'expired' && { color: DESKTOP_TONES.bad.fg }]}>
                      {driver?.license_classes ? `דרגה ${driver.license_classes} · ${licenseState === 'expired' ? 'לא בתוקף' : 'מאומת'}` : 'פרטים חסרים'}
                    </DText>
                  </HoverPressable>
                </View>
              </View>

              <View style={ds.sideCol}>
                <View style={ds.card}>
                  <DText style={ds.sideLabel}>הרכב המשויך אליי</DText>
                  <DText weight="bold" style={ds.vehicleName}>
                    {vehicle ? [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || VEHICLE_TYPE_LABELS[vehicle.vehicle_type] : 'לא שויך רכב'}
                  </DText>
                  {vehicle && (
                    <View style={ds.plateRow}>
                      <DText weight="bold" style={ds.plateText}>{vehicle.plate_number}</DText>
                      <StatusPill tone="neutral" label={VEHICLE_TYPE_LABELS[vehicle.vehicle_type] || 'פרטי'} />
                    </View>
                  )}
                </View>

                <View style={ds.card}>
                  <DText style={ds.sideLabel}>מנהל הצי</DText>
                  <DText weight="semiBold" style={ds.managerName}>{managerName || 'לא הוגדר'}</DText>
                  <View style={ds.managerActions}>
                    <HoverPressable style={ds.managerButton} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} disabled={!managerPhone} onPress={() => openManager('tel')}>
                      <Ionicons name="call-outline" size={13} color={managerPhone ? DESKTOP_TONES.ok.fg : DESKTOP_COLORS.inkFaint} />
                      <DText weight="semiBold" style={[ds.managerButtonText, { color: managerPhone ? DESKTOP_TONES.ok.fg : DESKTOP_COLORS.inkFaint }]}>התקשר</DText>
                    </HoverPressable>
                    <HoverPressable style={ds.managerButton} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} disabled={!managerPhone} onPress={() => openManager('sms')}>
                      <Ionicons name="chatbubble-outline" size={13} color={managerPhone ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint} />
                      <DText weight="semiBold" style={[ds.managerButtonText, { color: managerPhone ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint }]}>הודעה</DText>
                    </HoverPressable>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}
      </DesktopShell>
    );
  }

  // Night from the first frame, so the top of the screen (and Safari's bar)
  // doesn't flash pale before the hero arrives.
  if (loading) return <View style={[styles.screen, styles.night]}><BrandLoader size={64} color="#FFFFFF" /></View>;
  if (error && !driver) return <View style={styles.screen}><ErrorState message={error} onRetry={reload} /></View>;
  return (
    <DriverHomeMobile
      insetTop={insets.top}
      insetBottom={insets.bottom}
      firstName={firstName}
      vehicle={vehicle}
      items={allItems}
      licenseExpiry={driver?.license_expiry ?? null}
      licenseClasses={driver?.license_classes ?? null}
      pendingSignatures={pendingSignatures}
      unreadNotifications={unreadNotifications}
      managerName={managerName}
      managerPhone={managerPhone}
      onMenu={() => navigation.navigate('Menu')}
      onNotifications={() => navigation.navigate('Notifications')}
      onVehicle={() => navigation.navigate('DriverVehicle')}
      onSigning={() => navigation.navigate('DriverSigningDocuments')}
      onAttention={() => navigation.navigate('DriverAttention')}
      onLicense={() => navigation.navigate('DriverProfile')}
      onDocuments={() => navigation.navigate('DriverDocuments')}
      onOdometer={() => vehicle && navigation.navigate('DriverOdometer', { vehicleId: vehicle.id, currentOdometer: vehicle.odometer })}
      onManager={openManager}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DK.canvas },
  night: { backgroundColor: DK.night[0], alignItems: 'center', justifyContent: 'center' },
});

const ds = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 820, alignSelf: 'center', width: '100%' },
  columns: { flexDirection: 'row-reverse', gap: 16, alignItems: 'flex-start' },
  mainCol: { flex: 2, gap: 16 },
  sideCol: { flex: 1, gap: 16, minWidth: 220 },
  card: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    padding: 16,
  },
  cardTitle: { fontSize: 13, marginBottom: 10 },
  allGood: { fontSize: 13, color: DESKTOP_TONES.ok.fg, paddingVertical: 12, textAlign: 'center' },
  timelineRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 42, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft, borderRadius: 6, paddingHorizontal: 4 },
  rowLast: { borderBottomWidth: 0 },
  timelineTitle: { fontSize: 13, flex: 1, textAlign: 'right' },
  noVehicleLine: { paddingVertical: 24, alignItems: 'center' },
  noVehicleText: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
  tilesRow: { flexDirection: 'row-reverse', gap: 16 },
  tile: {
    flex: 1,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    padding: 16,
    gap: 4,
  },
  tileNumber: { fontSize: 17 },
  tileTitle: { fontSize: 12.5 },
  tileDetail: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },
  sideLabel: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint, marginBottom: 6 },
  vehicleName: { fontSize: 15 },
  plateRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 10 },
  plateText: { fontSize: 13, writingDirection: 'ltr' },
  managerName: { fontSize: 13, marginBottom: 10 },
  managerActions: { flexDirection: 'row-reverse', gap: 8 },
  managerButton: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5, height: 32, borderRadius: 6, borderWidth: 1, borderColor: DESKTOP_COLORS.border },
  managerButtonText: { fontSize: 12 },
});
