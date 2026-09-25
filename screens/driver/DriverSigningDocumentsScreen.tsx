import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, EmptyState, ErrorState, LoadingState, Screen } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { DriverDossierHero } from '../../components/driverCard/DriverDossierHero';
import { SigningFolders } from '../../components/driverCard/SigningFolders';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { assignSigningTemplate, getSigningSession, listDriverSigningRequests, listSigningTemplates, syncSigningRequest, type SignatureRequest } from '../../lib/docuseal';
import { buildSigningFolders, type SigningFolder } from '../../lib/signingFolders';
import { getDriver, type DriverRow } from '../../lib/adminApi';
import { COLORS, SPACING, CONTENT_MAX_WIDTH } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import type { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DText, HoverPressable } from '../../components/desktop/primitives';
import { DESKTOP_COLORS } from '../../components/desktop/desktopTheme';
import { DriverSigningMobile } from './DriverSigningMobile';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverSigningDocuments'>;
const time = (date: string) => new Date(date).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

export default function DriverSigningDocumentsScreen({ navigation, route }: Props) {
  const { profile } = useCompany();
  const driverId = profile?.role === 'driver' ? profile.id : route.params?.driverId;
  const folderId = route.params?.folderId;
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [folder, setFolder] = useState<SigningFolder | null>(null);
  const [folders, setFolders] = useState<SigningFolder[]>([]);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState('');
  const [sending, setSending] = useState(false);
  const sendingLock = useRef(false);
  const [loading, setLoading] = useState(true);
  const loadRequest = useRef(0);
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const canSend = !!driver && (profile?.role === 'owner' || (profile?.role === 'admin' && profile.company_id === driver.company_id));
  const load = useCallback(async () => {
    const generation = ++loadRequest.current;
    if (!driverId) { setError('יש לפתוח את המסמך מתוך פרופיל נהג'); setLoading(false); return; }
    try {
      const target = await getDriver(driverId);
      if (!target?.company_id) throw new Error('הנהג לא נמצא');
      const [templates, initial] = await Promise.all([listSigningTemplates(target.company_id), listDriverSigningRequests(driverId)]);
      const toSync = initial.filter(item => (item.status === 'pending' && item.docuseal_submitter_slug) || (item.status === 'completed' && !item.signed_file_path));
      const results = await Promise.allSettled(toSync.map(item => syncSigningRequest(item.id)));
      const requests = toSync.length ? await listDriverSigningRequests(driverId) : initial;
      if (generation !== loadRequest.current) return;
      setDriver(target);
      const built = buildSigningFolders(templates, requests);
      setFolder(built.find(item => item.id === folderId) || null);
      // The driver's own list shows only folders with something sent to them.
      setFolders(built.filter(item => item.requests.length > 0));
      setError(results.some(result => result.status === 'rejected') ? 'לא ניתן לעדכן כרגע את כל מצבי החתימה. מוצג המידע האחרון שנשמר.' : '');
    } catch (err: any) { if (generation === loadRequest.current) setError(err?.message || 'טעינת המסמכים נכשלה'); }
    finally { if (generation === loadRequest.current) setLoading(false); }
  }, [driverId, folderId]);
  useFocusEffect(useCallback(() => {
    setLoading(true); load();
    const interval = setInterval(load, 60_000);
    return () => { loadRequest.current += 1; clearInterval(interval); };
  }, [load]));
  const open = async (item: SignatureRequest) => {
    setOpening(item.id);
    try {
      const session = await getSigningSession(item.id);
      navigation.navigate('DocusealWebView', {
        ...session,
        title: item.template_title || folder?.title || 'מסמך',
        requestId: item.id,
        returnToDriverDocuments: profile?.role === 'driver',
        allowDownload: profile?.role === 'driver' && item.status === 'completed',
      });
    } catch (err: any) { setError(err?.message || 'פתיחת המסמך נכשלה'); }
    finally { setOpening(''); }
  };
  const send = async () => {
    if (!canSend || !driver?.company_id || !folder?.template || sendingLock.current) return;
    sendingLock.current = true; setSending(true); setError('');
    try {
      const result = await assignSigningTemplate(driver.company_id, folder.template.id, [driver.id]);
      await load();
      if (!result.success || result.created !== 1) setError(result.message || 'השליחה לא אושרה. נסה שוב.');
    } catch (err: any) { setError(err?.message || 'השליחה נכשלה. נסה שוב.'); }
    finally { sendingLock.current = false; setSending(false); }
  };
  const pending = folder?.requests.find(item => item.status === 'pending' && !!item.docuseal_submitter_slug);
  const completed = folder?.requests.find(item => item.status === 'completed');

  if (isDesktop) {
    return (
      <DesktopShell active="DriverSigningDocuments" breadcrumbs={['מסמכים לחתימה', ...(folder ? [folder.title] : [])]}>
        {loading ? (
          <LoadingState />
        ) : !driver ? (
          <ErrorState message={error || 'הנהג לא נמצא'} onRetry={load} />
        ) : (
          <View style={ds.wrap}>
            {!!error && <DText style={ds.error}>{error}</DText>}
            {!folderId ? (
              <SigningFolders driverId={driver.id} onOpen={item => navigation.push('DriverSigningDocuments', { driverId: driver.id, folderId: item.id })} />
            ) : !folder ? (
              <EmptyState title="התיקייה אינה זמינה" />
            ) : (
              <>
                {canSend && folder.template && (
                  <HoverPressable
                    style={[ds.sendButton, sending && ds.disabled]}
                    hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                    disabled={sending}
                    onPress={() => (completed && !pending ? open(completed) : send())}
                  >
                    <Ionicons name={completed && !pending ? 'document-text-outline' : 'send-outline'} size={14} color={DESKTOP_COLORS.brand} />
                    <DText weight="semiBold" style={ds.sendText}>
                      {sending ? 'שולח…' : pending ? `שלח מחדש את ${folder.title}` : completed ? 'צפייה במסמך' : `שלח ${folder.title} לחתימה`}
                    </DText>
                  </HoverPressable>
                )}
                {folder.requests.length === 0 ? (
                  <EmptyState icon="folder-outline" title="התיקייה ריקה" />
                ) : (
                  <View style={ds.table}>
                    {folder.requests.map((item, index) => {
                      const ready = item.status === 'pending' && !!item.docuseal_submitter_slug;
                      const openable = item.status === 'completed' || (ready && profile?.role === 'driver');
                      return (
                        <HoverPressable
                          key={item.id}
                          style={[ds.row, index === folder.requests.length - 1 && ds.rowLast]}
                          hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                          disabled={opening === item.id || !openable}
                          onPress={() => open(item)}
                        >
                          <Ionicons
                            name={item.status === 'completed' ? 'checkmark-circle' : ready ? 'time-outline' : 'alert-circle-outline'}
                            size={16}
                            color={item.status === 'completed' ? DESKTOP_COLORS.brand : ready ? DESKTOP_COLORS.brand : DESKTOP_COLORS.danger}
                          />
                          <View style={{ flex: 1 }}>
                            <DText weight="semiBold" style={ds.rowTitle}>{item.template_title || folder.title}</DText>
                            <DText style={ds.rowMeta}>
                              {item.status === 'completed' ? `נחתם ${time(item.completed_at || item.created_at)}` : ready ? `נשלח ${time(item.sent_at || item.created_at)}` : item.status === 'declined' ? 'החתימה נדחתה' : 'השליחה לא אושרה — ניתן לנסות שוב'}
                            </DText>
                          </View>
                          {openable && <Ionicons name="chevron-back" size={14} color={DESKTOP_COLORS.inkFaint} />}
                        </HoverPressable>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </View>
        )}
      </DesktopShell>
    );
  }

  if (profile?.role === 'driver') {
    return (
      <DriverSigningMobile
        insetTop={insets.top}
        insetBottom={insets.bottom}
        loading={loading}
        error={error}
        fatal={!driver}
        folder={folder}
        folderMode={!!folderId}
        folders={folders}
        opening={opening}
        onBack={() => navigation.goBack()}
        onRetry={() => { setLoading(true); load(); }}
        onOpenFolder={item => navigation.push('DriverSigningDocuments', { driverId: driver?.id, folderId: item.id })}
        onOpenRequest={item => void open(item)}
      />
    );
  }

  return <Screen style={styles.screen}>
    <AdminGradientBackground />
    <DriverDossierHero title={folder?.title || 'טפסים ומסמכים'} subtitle={driver?.full_name || ''} icon="folder-outline" insetTop={insets.top} onBack={() => navigation.goBack()} />
    {loading ? <LoadingState /> : !driver ? <ErrorState message={error || 'הנהג לא נמצא'} onRetry={load} /> : <ScrollView contentContainerStyle={styles.content}>
      {!!error && <AppText style={styles.error}>{error}</AppText>}
      {!folderId ? <SigningFolders driverId={driver.id} onOpen={item => navigation.push('DriverSigningDocuments', { driverId: driver.id, folderId: item.id })} /> : !folder ? <EmptyState title="התיקייה אינה זמינה" /> : <>
        {canSend && folder.template && <TouchableOpacity accessibilityRole="button" disabled={sending} onPress={() => completed && !pending ? open(completed) : send()} style={[styles.send, sending && styles.disabled]}>
          <Ionicons name={completed && !pending ? 'document-text-outline' : 'send-outline'} size={18} color={COLORS.accent} />
          <AppText weight="bold" style={styles.sendText}>{sending ? 'שולח…' : pending ? `שלח מחדש את ${folder.title}` : completed ? 'צפייה במסמך' : `שלח ${folder.title} לחתימה`}</AppText>
        </TouchableOpacity>}
        {folder.requests.map(item => {
          const ready = item.status === 'pending' && !!item.docuseal_submitter_slug;
          const openable = item.status === 'completed' || (ready && profile?.role === 'driver');
          return <TouchableOpacity key={item.id} accessibilityRole="button" disabled={opening === item.id || !openable} onPress={() => open(item)}>
            <Card style={styles.card}>
              <Ionicons name={item.status === 'completed' ? 'checkmark-circle' : ready ? 'time-outline' : 'alert-circle-outline'} size={24} color={item.status === 'completed' ? COLORS.okText : ready ? COLORS.accent : COLORS.dangerText} />
              <View style={styles.text}>
                <AppText weight="bold">{item.template_title || folder.title}</AppText>
                <AppText style={styles.meta}>{item.status === 'completed' ? `נחתם ${time(item.completed_at || item.created_at)}` : ready ? `נשלח ${time(item.sent_at || item.created_at)}` : item.status === 'declined' ? 'החתימה נדחתה' : 'השליחה לא אושרה — ניתן לנסות שוב'}</AppText>
                {openable && <AppText style={styles.link}>{item.status === 'completed' ? 'צפייה במסמך' : 'חתימה על המסמך'}</AppText>}
              </View>
              {openable && <Ionicons name="chevron-back" size={18} color={COLORS.textFaint} />}
            </Card>
          </TouchableOpacity>;
        })}
        {!folder.requests.length && <EmptyState icon="folder-outline" title="התיקייה ריקה" />}
      </>}
    </ScrollView>}
  </Screen>;
}
const styles = StyleSheet.create({
  screen: { backgroundColor: COLORS.screen },
  content: { padding: SPACING.lg, gap: SPACING.md, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  card: { flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md, padding: SPACING.md },
  text: { flex: 1, alignItems: 'flex-end' },
  meta: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 3, textAlign: 'right' },
  link: { color: COLORS.accent, marginTop: 8 }, error: { color: COLORS.dangerText, textAlign: 'center' },
  send: { padding: SPACING.md, backgroundColor: COLORS.accentSoft, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendText: { color: COLORS.accent }, disabled: { opacity: 0.55 },
});

const ds = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 520, alignSelf: 'center', width: '100%', gap: 12 },
  error: { fontSize: 12.5, color: DESKTOP_COLORS.danger, textAlign: 'center' },
  sendButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 36,
    borderRadius: 7,
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
  },
  sendText: { fontSize: 12.5, color: DESKTOP_COLORS.brand },
  disabled: { opacity: 0.55 },
  table: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 54, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  rowLast: { borderBottomWidth: 0 },
  rowTitle: { fontSize: 13 },
  rowMeta: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint, marginTop: 2 },
});
