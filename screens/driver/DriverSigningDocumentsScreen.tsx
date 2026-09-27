import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { Banner, DK, DKText, DriverPage, EmptyPanel, ErrorPanel, HeroTitle, KitSheet, LoadingPanel, PrimaryAction, Pressy, Reveal, STATUS, SheetActions, Surface } from '../../components/driverKit';
import { SigningFolders } from '../../components/driverCard/SigningFolders';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { assignSigningTemplate, downloadSignedRequest, getSigningSession, getSigningTemplatePreviewSession, listDriverSigningRequests, listSigningTemplates, syncSigningRequest, type SignatureRequest } from '../../lib/docuseal';
import { cancelSigningRequest } from '../../lib/signingSend';
import { buildSigningFolders, type SigningFolder } from '../../lib/signingFolders';
import { getDriver, type DriverRow } from '../../lib/adminApi';
import { useCompany } from '../../lib/CompanyContext';
import type { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DText, HoverPressable } from '../../components/desktop/primitives';
import { DESKTOP_COLORS } from '../../components/desktop/desktopTheme';
import { DriverSigningMobile } from './DriverSigningMobile';
import { checklistPreviewTarget, useFolderMeetings } from '../../components/checklist/useFolderMeetings';
import { cancelMeeting, formatIsoDay, type MeetingRow } from '../../lib/checklistForms';
import { useNextMeeting } from '../../components/checklist/useNextMeeting';
import { NextMeetingCard } from '../../components/checklist/NextMeetingCard';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverSigningDocuments'>;
const time = (date: string) => new Date(date).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

export default function DriverSigningDocumentsScreen({ navigation, route }: Props) {
  const { profile, loading: profileLoading } = useCompany();
  const driverId = profile?.role === 'driver' ? profile.id : route.params?.driverId;
  const folderId = route.params?.folderId;
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [folder, setFolder] = useState<SigningFolder | null>(null);
  const [folders, setFolders] = useState<SigningFolder[]>([]);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState('');
  const [sending, setSending] = useState(false);
  const sendingLock = useRef(false);
  // A request the manager is withdrawing; kept while the sheet closes so its text stays.
  const [cancelTarget, setCancelTarget] = useState<SignatureRequest | null>(null);
  // A meeting ("רשימת סעיפים") being cancelled: a draft, or one already signed.
  const [cancelMeetingTarget, setCancelMeetingTarget] = useState<MeetingRow | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadRequest = useRef(0);
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const canSend = !!driver && (profile?.role === 'owner' || (profile?.role === 'admin' && profile.company_id === driver.company_id));
  const meetings = useFolderMeetings(profile?.role === 'driver' ? null : driver?.id, folder?.template, folder?.requests);
  const reloadMeetings = meetings.reload;
  const next = useNextMeeting(profile?.role === 'driver' ? null : driver?.company_id, folder?.template, driver?.id);
  const reloadNext = next.reload;
  useFocusEffect(useCallback(() => { void reloadMeetings(); void reloadNext(); }, [reloadMeetings, reloadNext]));
  const nextCard = folderId && next.row ? (
    <NextMeetingCard row={next.row} repeatMonths={next.repeatMonths} canEdit={canSend} onMove={next.move} />
  ) : null;
  const startMeeting = (meetingId?: string) => {
    if (!driver || !folder?.template) return;
    navigation.navigate('ChecklistMeeting', meetingId ? { driverId: driver.id, meetingId } : { driverId: driver.id, templateId: folder.template.id });
  };
  const load = useCallback(async () => {
    const generation = ++loadRequest.current;
    // Right after a refresh the profile is still on its way: keep loading.
    if (!driverId && profileLoading) return;
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
  }, [driverId, folderId, profileLoading]);
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
        allowDownload: item.status === 'completed',
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
  // The blank form as the driver will get it, so the manager can check it before sending.
  const preview = async () => {
    if (!folder?.template || opening) return;
    setOpening('preview'); setError('');
    try {
      const session = meetings.checklist
        ? await checklistPreviewTarget(folder.template, folder.title)
        : await getSigningTemplatePreviewSession(folder.template.id);
      navigation.navigate('DocusealWebView', { ...session, title: folder.title });
    } catch (err: any) { setError(err?.message || 'פתיחת המסמך נכשלה. נסה שוב.'); }
    finally { setOpening(''); }
  };
  const download = async (item: SignatureRequest) => {
    setOpening(`download:${item.id}`); setError('');
    try { await downloadSignedRequest(item); }
    catch (err: any) { setError(err?.message || 'הורדת המסמך נכשלה'); }
    finally { setOpening(''); }
  };
  const cancel = async () => {
    if ((!cancelTarget && !cancelMeetingTarget) || !driver?.company_id) return;
    setCancelling(true); setError('');
    try {
      if (cancelMeetingTarget) await cancelMeeting(driver.company_id, cancelMeetingTarget.id);
      else await cancelSigningRequest(driver.company_id, cancelTarget!.id);
      await Promise.all([reloadMeetings(), reloadNext()]);
      setCancelOpen(false);
      await load();
    } catch (err: any) { setCancelOpen(false); setError(err?.message || 'ביטול הבקשה נכשל. נסה שוב.'); }
    finally { setCancelling(false); }
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
              <SigningFolders desktop driverId={driver.id} onOpen={item => navigation.push('DriverSigningDocuments', { driverId: driver.id, folderId: item.id })} />
            ) : !folder ? (
              <EmptyState title="התיקייה אינה זמינה" />
            ) : (
              <>
                {nextCard && <View style={ds.next}>{nextCard}</View>}
                {canSend && folder.template && meetings.checklist && (
                  <HoverPressable style={ds.sendButton} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => startMeeting()}>
                    <Ionicons name="add-circle-outline" size={15} color={DESKTOP_COLORS.brand} />
                    <DText weight="semiBold" style={ds.sendText}>מפגש חדש</DText>
                  </HoverPressable>
                )}
                {meetings.drafts.length > 0 && (
                  <View style={ds.table}>
                    {meetings.drafts.map((draft, index) => (
                      <HoverPressable
                        key={draft.id}
                        style={[ds.row, index === meetings.drafts.length - 1 && ds.rowLast]}
                        hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                        onPress={() => startMeeting(draft.id)}
                        accessibilityLabel={`${draft.title}, טיוטה. המשך מילוי`}
                      >
                        <Ionicons name="create-outline" size={16} color={DESKTOP_COLORS.brand} />
                        <View style={{ flex: 1 }}>
                          <DText weight="semiBold" style={ds.rowTitle}>{draft.title}</DText>
                          <DText style={ds.rowMeta}>טיוטה, עוד לא נחתם · {formatIsoDay(draft.updated_at.slice(0, 10))}</DText>
                        </View>
                        <DText weight="semiBold" style={ds.sendText}>המשך</DText>
                      </HoverPressable>
                    ))}
                  </View>
                )}
                {canSend && folder.template && !meetings.checklist && (
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
                  meetings.drafts.length ? null : <EmptyState icon="folder-outline" title={meetings.checklist ? 'עוד לא התקיים מפגש' : 'התיקייה ריקה'} />
                ) : (
                  <View style={ds.table}>
                    {folder.requests.map((item, index) => {
                      const meeting = meetings.byRequest.get(item.id);
                      const cancelled = meeting?.status === 'cancelled';
                      const ready = !cancelled && item.status === 'pending' && !!item.docuseal_submitter_slug;
                      const signNow = ready && !!meeting && canSend;
                      const openable = item.status === 'completed' || (ready && profile?.role === 'driver') || signNow;
                      return (
                        <HoverPressable
                          key={item.id}
                          style={[ds.row, index === folder.requests.length - 1 && ds.rowLast]}
                          hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                          disabled={opening === item.id || !openable}
                          onPress={() => (signNow ? startMeeting(meeting!.id) : open(item))}
                        >
                          <Ionicons
                            name={item.status === 'completed' ? 'checkmark-circle' : ready ? 'time-outline' : 'alert-circle-outline'}
                            size={16}
                            color={item.status === 'completed' ? DESKTOP_COLORS.brand : ready ? DESKTOP_COLORS.brand : DESKTOP_COLORS.danger}
                          />
                          <View style={{ flex: 1 }}>
                            <DText weight="semiBold" style={ds.rowTitle}>{item.template_title || folder.title}</DText>
                            <DText style={ds.rowMeta}>
                              {cancelled ? 'בוטל' : item.status === 'completed' ? `נחתם ${time(item.completed_at || item.created_at)}` : signNow ? 'ממתין לחתימת הנהג · לחצו כדי שיחתום עכשיו' : ready ? `נשלח ${time(item.sent_at || item.created_at)}` : item.status === 'declined' ? 'החתימה נדחתה' : 'השליחה לא אושרה — ניתן לנסות שוב'}
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

  // The manager's view: every folder (empty ones are where sending starts),
  // and inside one, what was sent and its state, with send / resend on top.
  const sendLabel = sending ? 'שולח…' : pending ? 'שליחה מחדש לחתימה' : completed ? 'צפייה במסמך החתום' : 'שליחה לחתימה';
  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={<HeroTitle title={folder?.title || 'טפסים ומסמכים'} subtitle={driver?.full_name || ' '} onBack={() => navigation.goBack()} />}
      footer={
        folderId && folder && canSend && folder.template && meetings.checklist ? (
          <View style={styles.footer}>
            <PrimaryAction label="צפייה בטופס" icon="eye-outline" tone="ghost" loading={opening === 'preview'} onPress={() => void preview()} style={styles.grow} />
            <PrimaryAction label="מפגש חדש" icon="add-circle-outline" onPress={() => startMeeting()} disabled={opening === 'preview'} style={styles.flex2} />
          </View>
        ) : folderId && folder && canSend && folder.template ? (
          <View style={styles.footer}>
            {!(completed && !pending) && (
              <PrimaryAction label="צפייה" icon="eye-outline" tone="ghost" loading={opening === 'preview'} disabled={sending} onPress={() => void preview()} style={styles.grow} />
            )}
            <PrimaryAction
              label={sendLabel}
              icon={completed && !pending ? 'eye-outline' : 'send'}
              tone={completed && !pending ? 'ghost' : 'accent'}
              loading={sending || (!!completed && !pending && opening === completed.id)}
              disabled={opening === 'preview'}
              onPress={() => (completed && !pending ? void open(completed) : void send())}
              style={styles.flex2}
            />
          </View>
        ) : undefined
      }
      overlay={
        <KitSheet
          visible={cancelOpen}
          onClose={() => setCancelOpen(false)}
          dismissable={!cancelling}
          icon={cancelMeetingTarget ? 'trash' : 'close-circle'}
          tone="danger"
          title={cancelMeetingTarget ? (cancelMeetingTarget.status === 'draft' ? 'למחוק את הטיוטה?' : 'למחוק את המפגש?') : 'לבטל את הבקשה?'}
          subtitle={
            cancelMeetingTarget
              ? cancelMeetingTarget.status === 'draft'
                ? 'מה שסומן בטיוטה יימחק. אפשר להתחיל מפגש חדש בכל רגע.'
                : 'המפגש והמסמך שלו יימחקו לגמרי, גם אצל הנהג. אי אפשר לשחזר אותם.'
              : `${driver?.full_name || 'הנהג'} לא יוכל לחתום על ${cancelTarget?.template_title || folder?.title || 'המסמך'}. אפשר לשלוח אותו שוב בכל רגע.`
          }
          footer={
            <SheetActions>
              <PrimaryAction label="השארה" tone="ghost" onPress={() => setCancelOpen(false)} disabled={cancelling} style={styles.grow} />
              <PrimaryAction
                label={cancelMeetingTarget ? (cancelMeetingTarget.status === 'draft' ? 'מחיקת הטיוטה' : 'מחיקת המפגש') : 'ביטול הבקשה'}
                tone="destructive"
                onPress={() => void cancel()}
                loading={cancelling}
                style={styles.grow}
              />
            </SheetActions>
          }
        />
      }
    >
      {loading ? (
        <LoadingPanel />
      ) : !driver ? (
        <ErrorPanel message={error || 'הנהג לא נמצא'} onRetry={load} />
      ) : (
        <>
          {!!error && <Banner tone="soon">{error}</Banner>}
          {!folderId ? (
            <SigningFolders title={null} driverId={driver.id} onOpen={(item) => navigation.push('DriverSigningDocuments', { driverId: driver.id, folderId: item.id })} />
          ) : !folder ? (
            <EmptyPanel icon="folder-outline" tone="muted" title="התיקייה אינה זמינה" body="ייתכן שהתבנית הוסרה." />
          ) : !folder.requests.length && !meetings.drafts.length ? (
            <Reveal>
              {nextCard}
              {meetings.checklist ? (
                <EmptyPanel icon="list-outline" title="עוד לא התקיים מפגש" body={`לחצו ״מפגש חדש״ כדי למלא את ${folder.title} יחד עם ${driver.full_name ?? 'הנהג'}.`} />
              ) : (
                <EmptyPanel icon="paper-plane-outline" title="עוד לא נשלח לנהג" body={`שלח את ${folder.title} ל${driver.full_name ?? 'נהג'} — הוא יקבל התראה ויוכל לחתום מהטלפון.`} />
              )}
            </Reveal>
          ) : (
            <>
            {nextCard && <Reveal>{nextCard}</Reveal>}
            {meetings.drafts.map((draft, index) => (
              <Reveal key={draft.id} index={index}>
                <Surface style={styles.request}>
                  <View style={[styles.requestIcon, { backgroundColor: DK.accentSoft }]}>
                    <Ionicons name="create" size={22} color={DK.accent} />
                  </View>
                  <View style={styles.flex}>
                    <DKText variant="label" numberOfLines={2}>{draft.title}</DKText>
                    <DKText variant="caption" color={DK.accent}>טיוטה, עוד לא נחתם · {formatIsoDay(draft.updated_at.slice(0, 10))}</DKText>
                  </View>
                  <Pressy onPress={() => startMeeting(draft.id)} accessibilityLabel="המשך מילוי הטיוטה" style={styles.resume} pressScale={0.94}>
                    <DKText variant="label" color="#FFFFFF">המשך</DKText>
                  </Pressy>
                  {canSend && (
                    <Pressy
                      onPress={() => { setCancelTarget(null); setCancelMeetingTarget(draft); setCancelOpen(true); }}
                      disabled={cancelling}
                      accessibilityLabel="מחיקת הטיוטה"
                      style={[styles.view, styles.cancel]}
                      pressScale={0.92}
                    >
                      <Ionicons name="trash-outline" size={19} color={STATUS.expired.fg} />
                    </Pressy>
                  )}
                </Surface>
              </Reveal>
            ))}
            {folder.requests.map((item, index) => {
              const meeting = meetings.byRequest.get(item.id);
              const cancelled = meeting?.status === 'cancelled';
              const ready = !cancelled && item.status === 'pending' && !!item.docuseal_submitter_slug;
              const done = !cancelled && item.status === 'completed';
              const tone = cancelled ? STATUS.missing : done ? STATUS.ok : ready ? STATUS.soon : STATUS.expired;
              return (
                <Reveal key={item.id} index={index}>
                  <Surface style={styles.request}>
                    <View style={[styles.requestIcon, { backgroundColor: tone.soft }]}>
                      <Ionicons name={cancelled ? 'close' : done ? 'checkmark-done' : ready ? 'time' : 'alert'} size={22} color={tone.fg} />
                    </View>
                    <View style={styles.flex}>
                      <DKText variant="label" numberOfLines={2}>{item.template_title || folder.title}</DKText>
                      <DKText variant="caption" color={done ? DK.muted : tone.fg}>
                        {cancelled
                          ? `בוטל${meeting?.cancelled_at ? ` ${time(meeting.cancelled_at)}` : ''}`
                          : done
                            ? `נחתם ${time(item.completed_at || item.created_at)}${meeting?.officer_name ? ` · ${meeting.officer_name}` : ''}`
                            : ready
                              ? meeting ? `הקצין חתם · ממתין לחתימת הנהג` : `ממתין לחתימה · נשלח ${time(item.sent_at || item.created_at)}`
                              : item.status === 'declined' ? 'הנהג דחה את החתימה' : 'השליחה לא הושלמה — אפשר לשלוח שוב'}
                      </DKText>
                    </View>
                    {ready && meeting && canSend && (
                      <Pressy onPress={() => startMeeting(meeting.id)} accessibilityLabel="הנהג חותם עכשיו, על המכשיר הזה" style={styles.resume} pressScale={0.94}>
                        <DKText variant="label" color="#FFFFFF">חתימה עכשיו</DKText>
                      </Pressy>
                    )}
                    {(done || (cancelled && item.status === 'completed')) && (
                      <>
                        <Pressy onPress={() => void download(item)} disabled={!!opening} accessibilityLabel="הורדת המסמך החתום" style={styles.view} pressScale={0.92}>
                          <Ionicons name={opening === `download:${item.id}` ? 'hourglass-outline' : 'download-outline'} size={19} color={DK.accent} />
                        </Pressy>
                        <Pressy onPress={() => void open(item)} disabled={!!opening} accessibilityLabel="צפייה במסמך החתום" style={styles.view} pressScale={0.92}>
                          <Ionicons name="eye-outline" size={19} color={DK.accent} />
                        </Pressy>
                      </>
                    )}
                    {((item.status === 'pending' && !cancelled) || (done && meeting) || (cancelled && meeting)) && canSend && (
                      <Pressy
                        onPress={() => { setCancelTarget(item); setCancelMeetingTarget(meeting ?? null); setCancelOpen(true); }}
                        disabled={sending || cancelling}
                        accessibilityLabel={meeting ? 'מחיקת המפגש' : 'ביטול הבקשה'}
                        accessibilityHint={meeting ? 'המפגש והמסמך שלו יימחקו' : 'הנהג לא יוכל לחתום עליה'}
                        style={[styles.view, styles.cancel]}
                        pressScale={0.92}
                      >
                        <Ionicons name={meeting ? "trash-outline" : "close"} size={20} color={STATUS.expired.fg} />
                      </Pressy>
                    )}
                  </Surface>
                </Reveal>
              );
            })}
            </>
          )}
        </>
      )}
    </DriverPage>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  grow: { flex: 1 },
  flex2: { flex: 2 },
  footer: { flexDirection: 'row-reverse', gap: 10 },
  cancel: { backgroundColor: STATUS.expired.soft },
  request: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 14 },
  requestIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  view: { width: 44, height: 44, borderRadius: 14, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  resume: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: DK.accent, alignItems: 'center', justifyContent: 'center' },
});

const ds = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 520, alignSelf: 'center', width: '100%', gap: 12 },
  next: { marginBottom: -12 },
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
