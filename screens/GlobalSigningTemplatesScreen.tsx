import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, TextInput, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { showAlert } from '../lib/platformAlert';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminGradientBackground } from '../components/admin/AdminGradientBackground';
import { useCompany } from '../lib/CompanyContext';
import { deleteSigningRecord, downloadSigningTemplate, getSigningTemplatePreviewSession, listGlobalSigningTemplates, renameSigningTemplate, syncGlobalSigningTemplates, type SigningTemplate } from '../lib/docuseal';
import type { RootStackParamList } from '../navigation/types';
import { AppText, BackButton } from '../components/ui';
import { CONTENT_MAX_WIDTH, COLORS, FONT_SIZE, BRAND as BRAND_TOKENS } from '../lib/theme';
import { FLEET_COLORS } from '../lib/colors';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { DesktopShell } from '../components/desktop/DesktopShell';
import { DText, HoverPressable } from '../components/desktop/primitives';
import { DESKTOP_COLORS } from '../components/desktop/desktopTheme';

type Props = NativeStackScreenProps<RootStackParamList, 'GlobalSigningTemplates'>;
type Tab = 'ready' | 'archive';
const BRAND = COLORS.accent; const TEXT = BRAND_TOKENS.ink; const MUTED = BRAND_TOKENS.inkSecondary;

/**
 * Owner-only. Templates are built directly in DocuSeal, inside the
 * "FleetOS-Global" folder — this screen only syncs them in, previews them,
 * and archives/deletes them. Every company reads the same rows; no company
 * may create, edit or delete one (see AdminDocumentSigningScreen).
 */
export default function GlobalSigningTemplatesScreen({ navigation }: Props) {
  const { profile, loading: profileLoading } = useCompany();
  const insets = useSafeAreaInsets();
  const isOwner = profile?.role === 'owner';
  const isDesktop = useIsDesktop();
  const [tab, setTab] = useState<Tab>('ready');
  const [templates, setTemplates] = useState<SigningTemplate[]>([]);
  const [archivedTemplates, setArchivedTemplates] = useState<SigningTemplate[]>([]);
  const [renaming, setRenaming] = useState<SigningTemplate | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const loadRequest = useRef(0);

  useEffect(() => { if (!profileLoading && !isOwner) navigation.replace('OwnerHome'); }, [isOwner, navigation, profileLoading]);

  const load = useCallback(async (sync = false) => {
    if (!isOwner) return;
    const requestId = ++loadRequest.current;
    if (sync) setSyncing(true);
    try {
      if (sync) {
        // Every document created in DocuSeal belongs there because you put it
        // there — no confirmation needed, it just syncs in silently.
        await syncGlobalSigningTemplates();
        if (requestId !== loadRequest.current) return;
      }
      const [readyRows, archivedRows] = await Promise.all([
        listGlobalSigningTemplates(false),
        listGlobalSigningTemplates(true),
      ]);
      if (requestId !== loadRequest.current) return;
      setTemplates(readyRows);
      setArchivedTemplates(archivedRows);
      setError('');
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(err?.message || 'טעינת התבניות נכשלה');
    } finally {
      if (sync && requestId === loadRequest.current) setSyncing(false);
    }
  }, [isOwner]);

  useFocusEffect(useCallback(() => { load(); return () => { loadRequest.current += 1; }; }, [load]));

  const sortedTemplates = useMemo(() => [...templates].sort((a, b) => a.title.localeCompare(b.title, 'he')), [templates]);
  if (profileLoading || !isOwner) return null;

  const previewTemplate = async (item: SigningTemplate) => {
    setPreviewingId(item.id); setError('');
    try {
      const session = await getSigningTemplatePreviewSession(item.id);
      navigation.navigate('DocusealWebView', { ...session, title: item.title });
    } catch (err: any) {
      setError(err?.message || 'פתיחת התבנית נכשלה');
    } finally {
      setPreviewingId(null);
    }
  };
  const archive = (id: string) => showAlert('העברה לארכיון', 'התבנית תוסר מכל החברות ותישמר בארכיון. להמשיך?', [{ text: 'ביטול', style: 'cancel' }, { text: 'העבר לארכיון', style: 'destructive', onPress: async () => { try { await deleteSigningRecord(null, 'template', id); await load(); } catch (err: any) { setError(err?.message || 'העברה לארכיון נכשלה'); } } }]);
  const restore = async (id: string) => { try { await deleteSigningRecord(null, 'template', id, 'restore'); await load(); } catch (err: any) { setError(err?.message || 'שחזור התבנית נכשל'); } };
  const permanentlyDelete = (id: string) => showAlert('מחיקה לצמיתות', 'התבנית וקובץ המקור שלה יימחקו לצמיתות מ-FleetOS, עבור כל החברות. מסמכים חתומים שנוצרו ממנה יישמרו. להמשיך?', [{ text: 'ביטול', style: 'cancel' }, { text: 'מחק לצמיתות', style: 'destructive', onPress: async () => {
    try {
      const result = await deleteSigningRecord(null, 'template', id, 'permanent-delete');
      await load();
      // Best-effort cleanup (the DocuSeal template/submissions, the storage
      // file) can fail even though the database is already consistent —
      // surface that instead of silently leaving an orphaned file/template.
      if (result.cleanupPending) showAlert('ניקוי חלקי', 'התבנית נמחקה מהאתר, אך ניקוי קובץ או רשומה בדוקושל נכשל. ייתכן שנשאר קובץ יתום — אפשר להתעלם, זה לא משפיע על שימוש באפליקציה.');
    } catch (err: any) { setError(err?.message || 'מחיקת התבנית נכשלה'); }
  } }]);

  const renamingModal = (
    <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => !savingName && setRenaming(null)}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.35)' }}><View style={[s.listCard, { padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' }]}>
        <AppText style={s.rowTitle}>שינוי שם התבנית</AppText>
        <TextInput accessibilityLabel="שם התבנית" value={newTitle} onChangeText={setNewTitle} maxLength={200} style={{ textAlign: 'right', padding: 12, marginTop: 12, borderWidth: 1, borderColor: BRAND, borderRadius: 10 }} />
        <TouchableOpacity disabled={savingName || !newTitle.trim()} style={s.syncButton} onPress={async () => {
          if (!renaming || savingName) return;
          setSavingName(true);
          try { await renameSigningTemplate(renaming.id, newTitle); setRenaming(null); await load(); }
          catch (err: any) { setError(err?.message || 'שינוי השם נכשל'); setRenaming(null); }
          finally { setSavingName(false); }
        }}><AppText style={[s.syncButtonText, savingName && { opacity: 0 }]}>שמירת השם באתר וב-DocuSeal</AppText>{savingName && <ActivityIndicator size="small" color={BRAND} style={StyleSheet.absoluteFill} />}</TouchableOpacity>
        <TouchableOpacity disabled={savingName} style={s.syncButton} onPress={() => setRenaming(null)}><AppText>ביטול</AppText></TouchableOpacity>
      </View></View>
    </Modal>
  );

  if (isDesktop) {
    return (
      <>
        <DesktopShell active="GlobalSigningTemplates" breadcrumbs={['תבניות גלובליות']}>
          <View style={ds.wrap}>
            <View style={ds.headRow}>
              <DText weight="bold" style={ds.heading}>תבניות משותפות לכל החברות</DText>
              <HoverPressable style={ds.syncButton} onPress={() => load(true)} disabled={syncing}>
                {syncing ? <ActivityIndicator size="small" color={DESKTOP_COLORS.brand} /> : <Ionicons name="sync-outline" size={14} color={DESKTOP_COLORS.brand} />}
                <DText weight="semiBold" style={ds.syncButtonText}>{syncing ? 'מסנכרן…' : 'סנכרן מדוקושל'}</DText>
              </HoverPressable>
            </View>
            <View style={ds.tabRow}>
              <DesktopTab label="מוכנות" active={tab === 'ready'} onPress={() => setTab('ready')} />
              <DesktopTab label="ארכיון" active={tab === 'archive'} onPress={() => setTab('archive')} />
            </View>
            {!!error && <DText style={ds.error}>{error}</DText>}
            {tab === 'ready' ? (
              sortedTemplates.length > 0 ? (
                <View style={ds.table}>
                  {sortedTemplates.map((item, index) => (
                    <View key={item.id} style={[ds.row, index === sortedTemplates.length - 1 && ds.rowLast]}>
                      <HoverPressable style={ds.rowMain} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => previewTemplate(item)} disabled={previewingId === item.id}>
                        <Ionicons name={previewingId === item.id ? 'hourglass-outline' : 'document-text-outline'} size={15} color={DESKTOP_COLORS.brand} />
                        <DText weight="semiBold" style={ds.rowTitle} numberOfLines={1}>{item.title}</DText>
                      </HoverPressable>
                      <View style={ds.rowActions}>
                        <HoverPressable style={ds.iconButton} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => downloadSigningTemplate(item).catch((err: any) => setError(err?.message || 'הורדת התבנית נכשלה'))}>
                          <Ionicons name="download-outline" size={14} color={DESKTOP_COLORS.inkMuted} />
                        </HoverPressable>
                        <HoverPressable style={ds.iconButton} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => { setRenaming(item); setNewTitle(item.title); }}>
                          <Ionicons name="pencil-outline" size={14} color={DESKTOP_COLORS.brand} />
                        </HoverPressable>
                        <HoverPressable style={ds.iconButton} hoverStyle={{ backgroundColor: 'rgba(255,69,58,0.1)' }} onPress={() => archive(item.id)}>
                          <Ionicons name="trash-outline" size={14} color={DESKTOP_COLORS.danger} />
                        </HoverPressable>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <DText style={ds.empty}>אין עדיין תבניות. הוסף תבנית לתיקיית "FleetOS-Global" בדוקושל ולחץ סנכרן.</DText>
              )
            ) : archivedTemplates.length > 0 ? (
              <View style={ds.table}>
                {archivedTemplates.map((item, index) => (
                  <View key={item.id} style={[ds.row, index === archivedTemplates.length - 1 && ds.rowLast]}>
                    <View style={ds.rowMain}>
                      <Ionicons name="archive-outline" size={15} color={DESKTOP_COLORS.inkFaint} />
                      <DText weight="semiBold" style={ds.rowTitle} numberOfLines={1}>{item.title}</DText>
                    </View>
                    <View style={ds.rowActions}>
                      <HoverPressable style={ds.iconButton} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => restore(item.id)}>
                        <Ionicons name="refresh-outline" size={14} color={DESKTOP_COLORS.brand} />
                      </HoverPressable>
                      <HoverPressable style={ds.iconButton} hoverStyle={{ backgroundColor: 'rgba(255,69,58,0.1)' }} onPress={() => permanentlyDelete(item.id)}>
                        <Ionicons name="trash-outline" size={14} color={DESKTOP_COLORS.danger} />
                      </HoverPressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <DText style={ds.empty}>הארכיון ריק.</DText>
            )}
          </View>
        </DesktopShell>
        {renamingModal}
      </>
    );
  }

  return <View style={s.screen}><AdminGradientBackground /><ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <View style={[s.navRow, { paddingTop: Math.max(insets.top, 20) + 12 }]}><BackButton style={s.backAction} onPress={() => navigation.goBack()} /></View>
    <View style={s.hero}><AppText style={s.heroTitle}>תבניות גלובליות</AppText><AppText style={s.heroSubtitle}>משותפות לכל החברות · נוצרות ישירות ב-DocuSeal</AppText>
      <TouchableOpacity disabled={syncing} style={[s.syncButton, syncing && s.disabled]} onPress={() => load(true)}>
        {syncing ? <ActivityIndicator size="small" color={BRAND} /> : <Ionicons name="sync-outline" size={16} color={BRAND} />}
        <AppText style={s.syncButtonText}>{syncing ? 'מסנכרן...' : 'סנכרן מדוקושל'}</AppText>
      </TouchableOpacity>
    </View>
    <View style={s.segmentTrack}><Segment label="מוכנות" active={tab === 'ready'} onPress={() => setTab('ready')} /><Segment label="ארכיון" active={tab === 'archive'} onPress={() => setTab('archive')} /></View>
    {!!error && <AppText style={s.error}>{error}</AppText>}
    {tab === 'ready' && <View style={s.section}><View style={s.listCaptionRow}><AppText style={s.caption}>תבניות מוכנות</AppText><AppText style={s.caption}>{templates.length}</AppText></View>{sortedTemplates.length > 0 ? <View style={s.listCard}>{sortedTemplates.map((item, index) => <TemplateRow key={item.id} item={item} last={index === sortedTemplates.length - 1} loading={previewingId === item.id} onOpen={() => previewTemplate(item)} onDownload={() => downloadSigningTemplate(item).catch((err: any) => setError(err?.message || 'הורדת התבנית נכשלה'))} onRename={() => { setRenaming(item); setNewTitle(item.title); }} onArchive={() => archive(item.id)} />)}</View> : <AppText style={s.emptyText}>אין עדיין תבניות. הוסף תבנית לתיקיית "FleetOS-Global" בדוקושל ולחץ סנכרן.</AppText>}</View>}
    {tab === 'archive' && <View style={s.section}><View style={s.listCaptionRow}><AppText style={s.caption}>תבניות בארכיון</AppText><AppText style={s.caption}>{archivedTemplates.length}</AppText></View>{archivedTemplates.length > 0 ? <View style={s.listCard}>{archivedTemplates.map((item, index) => <ArchiveRow key={item.id} title={item.title} last={index === archivedTemplates.length - 1} onRestore={() => restore(item.id)} onDelete={() => permanentlyDelete(item.id)} />)}</View> : <AppText style={s.emptyText}>הארכיון ריק.</AppText>}</View>}
  </ScrollView>{renamingModal}</View>;
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <TouchableOpacity activeOpacity={.75} onPress={onPress} style={[s.segment, active && s.segmentActive]}><AppText style={[s.segmentText, active && s.segmentTextActive]}>{label}</AppText></TouchableOpacity>; }
function Metric({ value, label, tone }: { value: number; label: string; tone: 'pending' | 'completed' | 'attention' }) { return <View style={[s.metric, tone === 'completed' ? s.metricCompleted : tone === 'attention' ? s.metricAttention : s.metricPending]}><AppText style={s.metricValue}>{value}</AppText><AppText style={s.metricLabel}>{label}</AppText></View>; }
function TemplateRow({ item, last, loading, onOpen, onDownload, onArchive, onRename }: { item: SigningTemplate; last: boolean; loading: boolean; onOpen: () => void; onDownload: () => void; onArchive: () => void; onRename: () => void }) { return <TouchableOpacity activeOpacity={.75} disabled={loading} onPress={onOpen} onLongPress={onDownload} style={[s.listRow, !last && s.listDivider]}><View style={s.documentIcon}><Ionicons name={loading ? 'hourglass-outline' : 'document-text-outline'} size={18} color="#FFF" /></View><View style={s.rowCopy}><AppText numberOfLines={1} style={s.rowTitle}>{item.title}</AppText><AppText numberOfLines={1} style={s.rowSubtitle}>משותפת לכל החברות</AppText></View><TouchableOpacity accessibilityLabel="הורדת תבנית" hitSlop={8} style={s.smallAction} onPress={onDownload}><Ionicons name="download-outline" size={16} color={MUTED} /></TouchableOpacity><TouchableOpacity accessibilityLabel="שינוי שם תבנית" hitSlop={8} style={s.smallAction} onPress={onRename}><Ionicons name="pencil-outline" size={16} color={BRAND} /></TouchableOpacity><TouchableOpacity accessibilityLabel="העברת תבנית לארכיון" hitSlop={6} style={s.deleteAction} onPress={onArchive}><Ionicons name="trash-outline" size={16} color={FLEET_COLORS.danger.text} /></TouchableOpacity></TouchableOpacity>; }
function ArchiveRow({ title, last, onRestore, onDelete }: { title: string; last: boolean; onRestore: () => void; onDelete: () => void }) { return <View style={[s.listRow, !last && s.listDivider]}><View style={[s.documentIcon, { backgroundColor: 'rgba(14,30,43,0.24)' }]}><Ionicons name="archive-outline" size={18} color="#FFF" /></View><View style={s.rowCopy}><AppText numberOfLines={1} style={s.rowTitle}>{title}</AppText></View><TouchableOpacity onPress={onRestore} style={s.restorePill}><Ionicons name="refresh-outline" size={15} color={BRAND} /><AppText style={s.restorePillText}>שחזר</AppText></TouchableOpacity><TouchableOpacity onPress={onDelete} style={s.deleteAction}><Ionicons name="trash-outline" size={16} color={FLEET_COLORS.danger.text} /></TouchableOpacity></View>; }

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND_TOKENS.screenBg }, scroll: { flex: 1, backgroundColor: 'transparent' }, content: { paddingBottom: 48, position: 'relative', width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  navRow: { paddingHorizontal: 20 }, backAction: { alignSelf: 'flex-end' },
  hero: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 16 }, heroTitle: { fontFamily: 'Assistant_700Bold', fontSize: 27, letterSpacing: -.6, color: TEXT }, heroSubtitle: { marginTop: 5, fontFamily: 'Assistant_400Regular', fontSize: FONT_SIZE.md, color: MUTED, textAlign: 'center' },
  overview: { marginHorizontal: 20, marginTop: 20, padding: 14, borderRadius: 18, backgroundColor: '#FFF', shadowColor: BRAND_TOKENS.shadowInk, shadowOpacity: .1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, overviewTitle: { fontFamily: 'Assistant_700Bold', fontSize: FONT_SIZE.xl, color: TEXT, textAlign: 'right' }, metricRow: { marginTop: 11, flexDirection: 'row-reverse', gap: 7 }, metric: { flex: 1, minHeight: 63, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, metricPending: { backgroundColor: 'rgba(0,136,204,0.1)' }, metricCompleted: { backgroundColor: 'rgba(46,139,87,0.1)' }, metricAttention: { backgroundColor: 'rgba(192,57,43,0.1)' }, metricValue: { fontFamily: 'Assistant_700Bold', fontSize: FONT_SIZE.title, color: TEXT }, metricLabel: { marginTop: -2, fontFamily: 'Assistant_600SemiBold', fontSize: FONT_SIZE.sm, color: MUTED }, requestRow: { minHeight: 52, marginTop: 8, paddingHorizontal: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 9, borderRadius: 12, backgroundColor: 'rgba(14,30,43,0.035)' }, requestIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND }, requestTitle: { fontFamily: 'Assistant_700Bold', fontSize: FONT_SIZE.lg, color: TEXT, textAlign: 'right' }, requestSubtitle: { marginTop: 1, fontFamily: 'Assistant_400Regular', fontSize: FONT_SIZE.sm, color: MUTED, textAlign: 'right' }, overviewHint: { marginTop: 10, fontFamily: 'Assistant_400Regular', fontSize: FONT_SIZE.sm, color: MUTED, textAlign: 'right' },
  syncButton: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 7, backgroundColor: 'rgba(0,136,204,0.1)' }, syncButtonText: { fontFamily: 'Assistant_700Bold', fontSize: FONT_SIZE.md, color: BRAND },
  segmentTrack: { flexDirection: 'row-reverse', marginHorizontal: 20, marginTop: 20, padding: 3, borderRadius: 11, backgroundColor: 'rgba(120,120,128,0.12)' }, segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 }, segmentActive: { backgroundColor: '#FFF', shadowColor: BRAND_TOKENS.shadowInk, shadowOpacity: .14, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, segmentText: { fontFamily: 'Assistant_700Bold', fontSize: FONT_SIZE.md, color: 'rgba(14,30,43,0.6)' }, segmentTextActive: { color: BRAND },
  error: { marginHorizontal: 20, marginTop: 12, textAlign: 'center', fontFamily: 'Assistant_600SemiBold', color: FLEET_COLORS.danger.text }, section: { paddingHorizontal: 20, paddingTop: 20 }, caption: { fontFamily: 'Assistant_600SemiBold', fontSize: FONT_SIZE.md, color: BRAND_TOKENS.inkSecondary },
  listCaptionRow: { marginTop: 4, marginHorizontal: 4, marginBottom: 7, flexDirection: 'row-reverse', justifyContent: 'space-between' }, listCard: { overflow: 'hidden', borderRadius: 18, backgroundColor: '#FFF', shadowColor: BRAND_TOKENS.shadowInk, shadowOpacity: .16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 }, listRow: { minHeight: 62, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row-reverse', alignItems: 'center', gap: 9 }, listDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(14,30,43,0.07)' }, documentIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }, rowCopy: { flex: 1, minWidth: 0 }, rowTitle: { fontFamily: 'Assistant_700Bold', fontSize: FONT_SIZE.xl, letterSpacing: -.2, color: TEXT, textAlign: 'right' }, rowSubtitle: { marginTop: 1, fontFamily: 'Assistant_400Regular', fontSize: FONT_SIZE.md, color: MUTED, textAlign: 'right' },
  smallAction: { width: 28, height: 34, alignItems: 'center', justifyContent: 'center' }, deleteAction: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(192,57,43,0.1)', alignItems: 'center', justifyContent: 'center' }, emptyText: { paddingVertical: 24, paddingHorizontal: 8, fontFamily: 'Assistant_400Regular', fontSize: FONT_SIZE.md, color: MUTED, textAlign: 'center' },
  restorePill: { paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderRadius: 10, backgroundColor: 'rgba(0,136,204,0.1)' }, restorePillText: { fontFamily: 'Assistant_700Bold', fontSize: FONT_SIZE.md, color: BRAND },
  disabled: { opacity: .5 },
});

function DesktopTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <HoverPressable style={[ds.tab, active && ds.tabActive]} onPress={onPress}>
      <DText weight={active ? 'semiBold' : 'regular'} style={[ds.tabText, active && ds.tabTextActive]}>{label}</DText>
    </HoverPressable>
  );
}

const ds = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 640, alignSelf: 'center', width: '100%' },
  headRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  heading: { fontSize: 15 },
  syncButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 6, backgroundColor: DESKTOP_COLORS.brandFocusRing },
  syncButtonText: { fontSize: 12, color: DESKTOP_COLORS.brand },
  tabRow: { flexDirection: 'row-reverse', gap: 4, marginBottom: 14 },
  tab: { height: 30, paddingHorizontal: 14, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border },
  tabText: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
  tabTextActive: { color: DESKTOP_COLORS.ink },
  error: { fontSize: 12.5, color: DESKTOP_COLORS.danger, marginBottom: 10 },
  table: {
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
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.borderSoft,
  },
  rowLast: { borderBottomWidth: 0 },
  rowMain: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 13 },
  rowActions: { flexDirection: 'row-reverse', gap: 4 },
  iconButton: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, textAlign: 'center', paddingVertical: 32 },
});
