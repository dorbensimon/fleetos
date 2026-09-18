import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, ErrorState, LoadingState } from '../components/ui';
import { useCompany } from '../lib/CompanyContext';
import { countUnreadNotifications, getDriver, listActiveDriverVehicles, listCompliance, type ComplianceItem, type DriverRow, type Vehicle } from '../lib/adminApi';
import { VEHICLE_TYPE_LABELS, complianceTargetDate, findComplianceDef, isRetiredVehicleComplianceItem } from '../lib/compliance';
import { listSignatureRequests } from '../lib/docuseal';
import { CONTENT_MAX_WIDTH, expiryState, formatDate, timeGreeting, type ExpiryState } from '../lib/theme';
import { FLEET_COLORS } from '../lib/colors';
import type { RootStackParamList } from '../navigation/types';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { DesktopShell } from '../components/desktop/DesktopShell';
import { DText, HoverPressable, StatusPill } from '../components/desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_TONES } from '../components/desktop/desktopTheme';
type Props = NativeStackScreenProps<RootStackParamList, 'DriverHome'>;
type Severity = 'danger' | 'warning' | 'success';
// Reuses FLEET_COLORS' severity fill/text instead of re-declaring the same
// hex values locally — this screen already matched them by hand, so it was
// a silent duplicate, not a deliberate second palette. `halo` stays its own
// value: it's a glow-behind-the-dot opacity, not the badge-tint FLEET_COLORS exposes.
const severityMeta: Record<Severity, { dot: string; tint: string; halo: string }> = {
  danger: { dot: FLEET_COLORS.danger.fill, tint: FLEET_COLORS.danger.text, halo: 'rgba(255,59,48,.18)' },
  warning: { dot: FLEET_COLORS.warning.fill, tint: FLEET_COLORS.warning.text, halo: 'rgba(255,159,10,.18)' },
  success: { dot: FLEET_COLORS.success.fill, tint: FLEET_COLORS.success.text, halo: 'rgba(52,199,89,.18)' },
};

function GlassCard({ children, style, innerStyle, intensity = 45 }: { children: React.ReactNode; style?: any; innerStyle?: any; intensity?: number }) { return <View style={[styles.glassOuter, style]}><BlurView intensity={intensity} tint="light" style={StyleSheet.absoluteFill} /><View style={[styles.glassInner, innerStyle]}>{children}</View></View>; }
function Avatar({ initial, size = 44, dark = false }: { initial: string; size?: number; dark?: boolean }) { return <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, dark && styles.avatarDark]}><AppText weight="bold" style={[styles.avatarText, { fontSize: size * .36 }, dark && styles.avatarTextDark]}>{initial || '?'}</AppText></View>; }
function LicensePlate({ value }: { value: string }) { return <View style={styles.plate}><View style={styles.plateNumber}><AppText weight="bold" style={styles.plateNumberText}>{value}</AppText></View><View style={styles.plateIl}><AppText weight="bold" style={styles.plateIlText}>IL</AppText></View></View>; }
function DocumentSketch() { return <View pointerEvents="none" style={styles.documentSketch}><View style={styles.sketchPage} /><View style={styles.sketchFold} /><View style={[styles.sketchLine, { top: 39, width: 52 }]} /><View style={[styles.sketchLine, { top: 51, width: 52 }]} /><View style={[styles.sketchLine, { top: 63, width: 34 }]} /><View style={styles.sketchSignature}><View style={styles.sketchCurve} /><View style={[styles.sketchCurve, styles.sketchCurveSecond]} /></View></View>; }
function severityFor(state: ExpiryState): Severity { return state === 'expired' ? 'danger' : state === 'soon' ? 'warning' : 'success'; }
function Timeline({ items, onPress }: { items: Array<{ title: string; detail: string; severity: Severity; item?: ComplianceItem }>; onPress: (item?: ComplianceItem) => void }) { if (!items.length) return <View><AppText weight="bold" style={styles.allGood}>הכול תקין כרגע</AppText><AppText style={styles.emptyLine}>אין משימות תוקף או תחזוקה שממתינות לך</AppText></View>; const urgent = items.filter((item) => item.severity === 'danger').length; const soon = items.filter((item) => item.severity === 'warning').length; return <View><AppText weight="bold" style={[styles.priorityTitle, urgent > 0 && styles.dangerText]}>{urgent ? `${urgent} דברים דחופים לטיפול` : soon ? `${soon} דברים שכדאי לטפל בהם בקרוב` : 'הכול תקין כרגע'}</AppText>{items.map((item, index) => <TouchableOpacity key={`${item.title}-${index}`} style={styles.timelineRow} activeOpacity={.75} onPress={() => onPress(item.item)}><View style={styles.timelineRail}><View style={[styles.timelineHalo, { backgroundColor: severityMeta[item.severity].halo }]}><View style={[styles.timelineDot, { backgroundColor: severityMeta[item.severity].dot }]} /></View>{index < items.length - 1 && <View style={styles.timelineLine} />}</View><View style={styles.timelineText}><AppText weight="bold" style={[styles.timelineTitle, { color: severityMeta[item.severity].tint }]}>{item.title}</AppText><AppText style={styles.timelineDetail}>{item.detail} · לחץ לפרטים ולטיפול</AppText></View><Ionicons name="chevron-back" size={17} color="rgba(11,12,16,.35)" /></TouchableOpacity>)}</View>; }

export default function DriverHomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets(); const { company, profile } = useCompany();
  const isDesktop = useIsDesktop();
  const [driver, setDriver] = useState<DriverRow | null>(null); const [vehicle, setVehicle] = useState<Vehicle | null>(null); const [compliance, setCompliance] = useState<ComplianceItem[]>([]); const [pendingSignatures, setPendingSignatures] = useState(0); const [unreadNotifications, setUnreadNotifications] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const loadRequest = useRef(0);
  const load = useCallback(async () => {
    if (!profile) {
      setError('פרופיל הנהג אינו זמין');
      setLoading(false);
      return;
    }
    const requestId = ++loadRequest.current;
    try { setError(''); const [loadedDriver, assignments, signatures, unread] = await Promise.all([getDriver(profile.id), listActiveDriverVehicles(profile.id), listSignatureRequests(), company?.id ? countUnreadNotifications(company.id) : Promise.resolve(0)]); if (requestId !== loadRequest.current) return; const primary = assignments.find((a) => a.is_primary) ?? assignments[0] ?? null; const loadedCompliance = primary ? await listCompliance('vehicle', primary.vehicle.id) : []; if (requestId !== loadRequest.current) return; setDriver(loadedDriver); setVehicle(primary?.vehicle ?? null); setCompliance(loadedCompliance); setPendingSignatures(signatures.filter((item) => item.status === 'pending' && !!item.docuseal_submitter_slug).length); setUnreadNotifications(unread); } catch (err: any) { if (requestId === loadRequest.current) setError(err?.message || 'טעינת נתוני המסך נכשלה'); } finally { if (requestId === loadRequest.current) setLoading(false); }
  }, [company, profile]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); return () => { loadRequest.current += 1; }; }, [load]));
  const fullName = driver?.full_name?.trim() || profile?.full_name?.trim() || ''; const firstName = fullName.split(/\s+/)[0] || ''; const managerName = company?.safety_officer_name?.trim() || ''; const managerPhone = company?.safety_officer_phone || ''; const licenseState = expiryState(driver?.license_expiry);
  const timelineItems = useMemo(() => { if (!vehicle) return []; return compliance.filter((item) => !isRetiredVehicleComplianceItem(item.item_type)).map((item) => { const def = findComplianceDef('vehicle', item.item_type); const target = def ? complianceTargetDate(def, item) : item.expiry_date; if (!def && !target) return null; const severity = severityFor(expiryState(target)); return { title: def?.label || item.item_type, detail: target ? formatDate(target) : 'תאריך חסר', severity, item }; }).filter(Boolean).sort((a: any, b: any) => ({ danger: 0, warning: 1, success: 2 } as Record<string, number>)[a.severity] - ({ danger: 0, warning: 1, success: 2 } as Record<string, number>)[b.severity]).slice(0, 3) as Array<{ title: string; detail: string; severity: Severity; item: ComplianceItem }>; }, [compliance, vehicle]);
  const openManager = (kind: 'tel' | 'sms') => { if (managerPhone) Linking.openURL(`${kind}:${managerPhone}`).catch(() => undefined); };
  if (isDesktop) {
    return (
      <DesktopShell active="DriverHome" breadcrumbs={['הבית שלי']}>
        {loading ? (
          <LoadingState />
        ) : error && !driver ? (
          <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />
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

  if (loading) return <View style={styles.screen}><LoadingState /></View>; if (error && !driver) return <View style={styles.screen}><ErrorState message={error} onRetry={() => { setLoading(true); load(); }} /></View>;
  return <View style={styles.screen}><StatusBar barStyle="light-content" /><LinearGradient colors={[FLEET_COLORS.primary, FLEET_COLORS.primaryDeep, FLEET_COLORS.primaryInk]} locations={[0, .6, 1]} pointerEvents="box-none" style={[styles.hero, { paddingTop: insets.top + 52 }]}><View style={styles.glowCyan} /><View style={styles.glowWhite} /><View style={styles.vehicleBlock}><AppText style={styles.heroLabel}>הרכב המשויך אליי</AppText><AppText weight="bold" style={styles.vehicleName}>{vehicle ? [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || VEHICLE_TYPE_LABELS[vehicle.vehicle_type] : 'לא שויך רכב'}</AppText>{vehicle && <View style={styles.vehicleMeta}><LicensePlate value={vehicle.plate_number} /><View style={styles.privateChip}><AppText weight="bold" style={styles.privateText}>{VEHICLE_TYPE_LABELS[vehicle.vehicle_type] || 'פרטי'}</AppText></View></View>}</View></LinearGradient><View style={[styles.topBar, { top: insets.top + 52 }]}><View style={styles.topBarInner}><TouchableOpacity onPress={() => navigation.navigate('Menu')} style={styles.heroButton} accessibilityLabel="תפריט"><View style={styles.menuLine} /><View style={styles.menuLine} /><View style={[styles.menuLine, { width: 11 }]} /></TouchableOpacity><View style={styles.heroGreeting}><AppText style={styles.greeting}>{timeGreeting()}</AppText><AppText weight="bold" style={styles.name}>{firstName || 'נהג'}</AppText></View><TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.heroButton} accessibilityLabel="התראות"><Ionicons name="notifications-outline" size={21} color="#fff" />{unreadNotifications > 0 && <View style={styles.notificationDot} />}</TouchableOpacity></View></View><ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 130 }]} showsVerticalScrollIndicator={false}><GlassCard style={[styles.complianceCard, pendingSignatures > 0 && styles.pendingBorder]} intensity={45}><AppText weight="bold" style={styles.cardTitle}>תוקף ותחזוקה</AppText>{vehicle ? <Timeline items={timelineItems} onPress={() => navigation.navigate('DriverVehicle')} /> : <TouchableOpacity style={styles.noVehicleLine} onPress={() => navigation.navigate('Menu')}><AppText weight="bold" style={styles.noVehicleText}>פנה למנהל הצי לשיוך רכב</AppText></TouchableOpacity>}</GlassCard><View style={styles.tilesRow}><TouchableOpacity style={styles.tileWrap} activeOpacity={.8} onPress={() => navigation.navigate('DriverSigningDocuments')}><GlassCard style={styles.tile} innerStyle={styles.tileInner}><DocumentSketch /><View style={styles.tileContent}><AppText weight="bold" style={styles.tileNumber}>{pendingSignatures}</AppText><AppText weight="bold" style={styles.tileTitle}>טפסים ומסמכים</AppText><AppText style={styles.tileDetail}>{pendingSignatures ? 'ממתינים לפעולה' : 'אין מסמכים ממתינים'}</AppText></View></GlassCard></TouchableOpacity><TouchableOpacity style={styles.tileWrap} activeOpacity={.8} onPress={() => navigation.navigate('DriverProfile')}><GlassCard style={styles.tile} innerStyle={styles.tileInner}><View style={styles.tileContent}><AppText weight="bold" style={[styles.tileNumber, licenseState === 'ok' && styles.successText, licenseState === 'expired' && styles.dangerText]}>{driver?.license_expiry ? formatDate(driver.license_expiry) : '—'}</AppText><AppText weight="bold" style={styles.tileTitle}>רישיון נהיגה</AppText><AppText style={[styles.tileDetail, licenseState === 'expired' && styles.dangerText]}>{driver?.license_classes ? `דרגה ${driver.license_classes} · ${licenseState === 'expired' ? 'לא בתוקף' : 'מאומת'}` : 'פרטים חסרים'}</AppText></View></GlassCard></TouchableOpacity></View></ScrollView><GlassCard style={[styles.dock, { bottom: insets.bottom + 22 }]} innerStyle={styles.dockInner} intensity={48}><Avatar initial={managerName.slice(0, 1)} size={40} /><View style={styles.managerText}><AppText weight="bold" numberOfLines={1} style={styles.managerName}>{managerName || 'מנהל הצי'}</AppText><AppText style={styles.managerRole}>{managerName ? 'מנהל הצי' : 'פרטי מנהל הצי לא הוגדרו'}</AppText></View><TouchableOpacity disabled={!managerPhone} onPress={() => openManager('tel')} style={[styles.callButton, !managerPhone && styles.disabledButton]}><Ionicons name="call-outline" size={16} color="#1e8e3e" /><AppText weight="bold" style={styles.callText}>התקשר</AppText></TouchableOpacity><TouchableOpacity disabled={!managerPhone} onPress={() => openManager('sms')} style={[styles.messageButton, !managerPhone && styles.disabledMessage]}><Ionicons name="chatbubble-outline" size={16} color="#fff" /><AppText weight="bold" style={styles.messageText}>הודעה</AppText></TouchableOpacity></GlassCard></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#e9eef5' },
  hero: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 400,
    maxWidth: CONTENT_MAX_WIDTH,
    marginHorizontal: 'auto',
    overflow: 'hidden',
    borderBottomRightRadius: 40,
    borderBottomLeftRadius: 40,
    zIndex: 1,
  },
  glowCyan: {
    position: 'absolute',
    top: -90,
    left: -95,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(50,215,225,0.22)',
  },
  glowWhite: {
    position: 'absolute',
    top: -105,
    right: -100,
    width: 290,
    height: 290,
    borderRadius: 145,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  topBar: { position: 'absolute', right: 20, left: 20, maxWidth: CONTENT_MAX_WIDTH - 40, marginHorizontal: 'auto', zIndex: 4 },
  topBarInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.40)',
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  menuLine: { width: 17, height: 2, borderRadius: 2, backgroundColor: '#fff' },
  heroGreeting: { flex: 1, alignItems: 'center' },
  greeting: { color: 'rgba(255,255,255,0.72)', fontSize: 13, textAlign: 'center' },
  name: { color: '#fff', fontSize: 22, letterSpacing: -0.7, textAlign: 'center', marginTop: 1 },
  notificationDot: {
    position: 'absolute',
    top: 8,
    left: 9,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: '#ff3b30',
  },
  vehicleBlock: { alignItems: 'flex-end', paddingHorizontal: 20, marginTop: 88 },
  heroLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12 },
  vehicleName: { color: '#fff', fontSize: 30, letterSpacing: -1.1, marginTop: 4 },
  vehicleMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginTop: 16 },
  plate: {
    flexDirection: 'row-reverse',
    overflow: 'hidden',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  plateNumber: { backgroundColor: '#f7d117', paddingVertical: 12, paddingHorizontal: 16 },
  plateNumberText: { color: '#111', fontSize: 23, letterSpacing: 0.5 },
  plateIl: { minWidth: 38, backgroundColor: '#1a4fd6', alignItems: 'center', justifyContent: 'center' },
  plateIlText: { color: '#fff', fontSize: 12 },
  privateChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.40)',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  privateText: { color: '#fff', fontSize: 12 },
  scroll: { flex: 1, zIndex: 3 },
  scrollContent: { paddingTop: 374, paddingHorizontal: 16, gap: 12, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  glassOuter: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.88)',
    backgroundColor: 'rgba(255,255,255,0.58)',
    shadowColor: FLEET_COLORS.primaryInk,
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },
  glassInner: { flex: 1 },
  complianceCard: { minHeight: 244, borderRadius: 38 },
  pendingBorder: { borderColor: 'rgba(255,159,10,0.30)' },
  cardTitle: { color: FLEET_COLORS.textPrimary, fontSize: 16, paddingHorizontal: 20, paddingTop: 20, marginBottom: 12 },
  timelineRow: {
    minHeight: 59,
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
  },
  timelineRail: { width: 20, minHeight: 59, alignItems: 'center', paddingTop: 3 },
  timelineHalo: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: 6 },
  timelineLine: { flex: 1, width: 2, marginTop: 4, backgroundColor: 'rgba(11,12,16,0.10)' },
  timelineText: { flex: 1, paddingBottom: 15, alignItems: 'flex-end' },
  timelineTitle: { fontSize: 15, textAlign: 'right' },
  timelineDetail: { marginTop: 3, fontSize: 12, color: 'rgba(11,12,16,0.50)', textAlign: 'right' },
  emptyLine: { padding: 20, fontSize: 13, color: 'rgba(11,12,16,0.60)', textAlign: 'center' },
  priorityTitle: { paddingHorizontal: 20, paddingBottom: 12, fontSize: 14, color: '#b26200', textAlign: 'right' },
  allGood: { paddingHorizontal: 20, paddingTop: 10, fontSize: 15, color: '#1e8e3e', textAlign: 'center' },
  noVehicleLine: { minHeight: 120, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  noVehicleText: { fontSize: 15, color: 'rgba(11,12,16,0.60)', textAlign: 'center' },
  tilesRow: { flexDirection: 'row-reverse', gap: 10 },
  tileWrap: { flex: 1 },
  tile: { minHeight: 174, borderRadius: 28 },
  tileInner: { overflow: 'hidden', padding: 18 },
  tileContent: { zIndex: 2, alignItems: 'flex-end' },
  tileNumber: { color: FLEET_COLORS.textPrimary, fontSize: 19, letterSpacing: -0.4 },
  tileTitle: { color: FLEET_COLORS.textPrimary, fontSize: 13, marginTop: 8, textAlign: 'right' },
  tileDetail: { color: 'rgba(11,12,16,0.50)', fontSize: 11, marginTop: 2, textAlign: 'right' },
  successText: { color: '#1e8e3e' },
  dangerText: { color: '#d70015' },
  documentSketch: {
    position: 'absolute',
    bottom: -22,
    left: -14,
    width: 96,
    height: 118,
    opacity: 0.16,
  },
  sketchPage: {
    position: 'absolute',
    top: 8,
    left: 14,
    width: 68,
    height: 102,
    borderWidth: 2,
    borderColor: FLEET_COLORS.textPrimary,
  },
  sketchFold: {
    position: 'absolute',
    top: 8,
    right: 14,
    width: 24,
    height: 24,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: FLEET_COLORS.textPrimary,
  },
  sketchLine: { position: 'absolute', left: 27, height: 2, borderRadius: 1, backgroundColor: FLEET_COLORS.textPrimary },
  sketchSignature: { position: 'absolute', left: 27, top: 89, width: 40, height: 16 },
  sketchCurve: { width: 22, height: 10, borderTopWidth: 2, borderColor: FLEET_COLORS.textPrimary, transform: [{ rotate: '-12deg' }] },
  sketchCurveSecond: { position: 'absolute', right: 0, top: 3, transform: [{ rotate: '10deg' }] },
  dock: {
    position: 'absolute',
    right: 16,
    left: 16,
    maxWidth: CONTENT_MAX_WIDTH - 32,
    marginHorizontal: 'auto',
    minHeight: 64,
    borderRadius: 30,
    zIndex: 6,
  },
  dockInner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 6 },
  avatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#d5e6ff' },
  avatarDark: { backgroundColor: FLEET_COLORS.textPrimary },
  avatarText: { color: '#0a4ea8' },
  avatarTextDark: { color: '#fff' },
  managerText: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  managerName: { color: FLEET_COLORS.textPrimary, fontSize: 13, textAlign: 'right' },
  managerRole: { color: 'rgba(11,12,16,0.50)', fontSize: 11, textAlign: 'right' },
  callButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.32)',
    backgroundColor: 'rgba(52,199,89,0.18)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  callText: { color: '#1e8e3e', fontSize: 13 },
  messageButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: FLEET_COLORS.textPrimary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  messageText: { color: '#fff', fontSize: 13 },
  disabledButton: { opacity: 0.45 },
  disabledMessage: { opacity: 0.35 },
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
