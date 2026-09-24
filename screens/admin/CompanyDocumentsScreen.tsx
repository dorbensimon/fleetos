import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, BackButton, EmptyState, ErrorState, LoadingState, useToast } from '../../components/ui';
import { DateField } from '../../components/ui/DateField';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { useCompany } from '../../lib/CompanyContext';
import type { DocumentRow } from '../../lib/adminApi';
import { getDocumentUrl, listDocuments, uploadDocument, type PickedFile } from '../../lib/documents';
import { chooseDocumentSource, confirmDeleteDocument, documentViewerMode, downloadDocumentWithAlert, getDocumentViewUrl, pickDocumentSource, type DocumentSource } from '../../lib/documentActions';
import { formatDate } from '../../lib/theme';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { CompanyDocumentsDesktopView, type CompanyDocumentDraft } from '../../components/desktop/CompanyDocumentsDesktopView';
import { DText, HoverPressable } from '../../components/desktop/primitives';
import { DESKTOP_COLORS, webOnly } from '../../components/desktop/desktopTheme';
import { showAlert } from '../../lib/platformAlert';

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyDocuments'>;
type Draft = { title: string; date: string | null; description: string; file: PickedFile | null };
type DocumentPreview = { doc: DocumentRow; src: string };
const CATEGORY = 'general';
const emptyDraft = (): Draft => ({ title: '', date: null, description: '', file: null });
const titleOf = (doc: DocumentRow) => doc.title?.trim() || doc.file_name || 'מסמך ללא שם';
const isImage = (doc: DocumentRow) => Boolean(doc.mime_type?.startsWith('image/'));

export default function CompanyDocumentsScreen({ navigation }: Props) {
  const { companyId } = useCompany();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const { showToast } = useToast();
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({ title: false, date: false, file: false });
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const previewProgress = useRef(new Animated.Value(0)).current;
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true); setError(null);
    if (!companyId) { setError('לא נמצאה חברה משויכת'); setLoading(false); return; }
    try { const rows = await listDocuments('company', companyId, CATEGORY); if (request === loadRequest.current) setDocs(rows); }
    catch (err: any) { if (request === loadRequest.current) setError(err?.message ?? 'טעינת המסמכים נכשלה'); }
    finally { if (request === loadRequest.current) setLoading(false); }
  }, [companyId]);
  useFocusEffect(useCallback(() => { void load(); return () => { loadRequest.current += 1; }; }, [load]));

  useEffect(() => {
    let active = true;
    void Promise.all(docs.filter(isImage).map(async (doc) => [doc.id, await getDocumentUrl(doc)] as const)).then((pairs) => {
      if (active) setPreviews(Object.fromEntries(pairs.filter((pair): pair is [string, string] => Boolean(pair[1]))));
    });
    return () => { active = false; };
  }, [docs]);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReduceMotion(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!documentPreview) return;
    previewProgress.setValue(0);
    Animated.timing(previewProgress, { toValue: 1, duration: reduceMotion ? 0 : 220, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true }).start();
  }, [documentPreview, previewProgress, reduceMotion]);

  const openComposer = () => { setDraft(emptyDraft()); setErrors({ title: false, date: false, file: false }); setVisible(true); };
  const closeComposer = () => { if (!saving) setVisible(false); };
  const chooseFile = () => chooseDocumentSource('בחרו את קובץ המסמך', async (source: DocumentSource) => {
    try { const file = await pickDocumentSource(source); if (file) { setDraft((current) => ({ ...current, file })); setErrors((current) => ({ ...current, file: false })); } }
    catch (err: any) { showAlert('בחירת הקובץ נכשלה', err?.message ?? 'נסה שוב'); }
  });
  const save = async () => {
    const next = { title: !draft.title.trim(), date: !draft.date, file: !draft.file };
    setErrors(next);
    if (next.title || next.date || next.file || !companyId || !draft.file) return;
    setSaving(true);
    try {
      await uploadDocument({ companyId, ownerType: 'company', ownerId: companyId, category: CATEGORY, title: draft.title.trim(), documentDate: draft.date, description: draft.description, file: draft.file });
      setVisible(false); await load();
    } catch (err: any) { showAlert('העלאה נכשלה', err?.message ?? 'נסה שוב'); }
    finally { setSaving(false); }
  };
  const open = async (doc: DocumentRow) => {
    const src = await getDocumentViewUrl(doc); if (!src) return;
    if (isDesktop) { setDocumentPreview({ doc, src }); return; }
    navigation.navigate('DocusealWebView', { mode: documentViewerMode(doc), title: titleOf(doc), src });
  };
  const body = loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : <DocumentShelf docs={docs} previews={previews} desktop={isDesktop} onAdd={openComposer} onOpen={open} onDownload={downloadDocumentWithAlert} onDelete={(doc) => confirmDeleteDocument(doc, load)} />;
  const composer = <Composer visible={visible} draft={draft} errors={errors} saving={saving} onClose={closeComposer} onChange={(update) => setDraft((current) => ({ ...current, ...update }))} onChooseFile={chooseFile} onSave={() => void save()} />;
  const closePreview = () => Animated.timing(previewProgress, { toValue: 0, duration: reduceMotion ? 0 : 180, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true }).start(() => setDocumentPreview(null));
  const documentOverlay = isDesktop ? <DesktopDocumentPreview preview={documentPreview} progress={previewProgress} onClose={closePreview} /> : null;
  const uploadFromDesktop = async (d: CompanyDocumentDraft) => {
    if (!companyId) return false;
    try {
      await uploadDocument({ companyId, ownerType: 'company', ownerId: companyId, category: CATEGORY, title: d.title, documentDate: d.date, description: d.description, file: d.file });
      await load();
      showToast('המסמך נשמר');
      return true;
    } catch (err: any) { showAlert('העלאה נכשלה', err?.message ?? 'נסה שוב'); return false; }
  };
  if (isDesktop) return <><DesktopShell active="CompanyDocuments" breadcrumbs={['ניהול', 'מסמכי חברה']}><CompanyDocumentsDesktopView docs={docs} loading={loading && docs.length === 0} error={error} onRetry={load} onOpen={(doc) => void open(doc)} onDownload={downloadDocumentWithAlert} onDelete={(doc) => confirmDeleteDocument(doc, load)} onUpload={uploadFromDesktop} /></DesktopShell>{documentOverlay}</>;
  return <View style={styles.screen}><AdminGradientBackground /><View style={[styles.topBar, { paddingTop: insets.top + 14, flexDirection: 'row' }]}><View style={{ width: 42 }} /><View style={styles.topTitleGroup}><View style={styles.titleGlyph}><Ionicons name="folder-open-outline" size={18} color="#007AFF" /></View><AppText weight="bold" style={styles.topTitle}>מסמכי חברה</AppText></View><BackButton onPress={() => navigation.goBack()} /></View><View style={styles.mobileContent}>{body}</View>{composer}</View>;
}

function DocumentShelf({ docs, previews, desktop: desktopMode, onAdd, onOpen, onDownload, onDelete }: { docs: DocumentRow[]; previews: Record<string, string>; desktop: boolean; onAdd: () => void; onOpen: (doc: DocumentRow) => void; onDownload: (doc: DocumentRow) => void; onDelete: (doc: DocumentRow) => void }) {
  const count = `${docs.length} ${docs.length === 1 ? 'מסמך' : 'מסמכים'}`;
  return <ScrollView contentContainerStyle={desktopMode ? desktop.content : styles.content} showsVerticalScrollIndicator={false}>
    <View style={desktopMode ? desktop.hero : styles.hero}><View><AppText weight="bold" style={desktopMode ? desktop.heroTitle : styles.heroTitle}>כל המסמכים, במקום אחד</AppText><AppText style={desktopMode ? desktop.heroSub : styles.heroSub}>שם, תאריך ותיאור ברורים לכל מסמך חשוב.</AppText></View><View style={desktopMode ? desktop.heroActions : styles.heroActions}><View style={styles.count}><Ionicons name="documents-outline" size={15} color="#087A57" /><AppText weight="bold" style={styles.countText}>{count}</AppText></View><AddButton desktop={desktopMode} onPress={onAdd} /></View></View>
    {docs.length === 0 ? <View style={styles.empty}><EmptyState icon="folder-open-outline" title="אין עדיין מסמכי חברה" hint="הוסיפו את המסמך הראשון כדי לשמור הכול מסודר ונגיש." /></View> : <View style={desktopMode ? desktop.shelf : styles.shelf}>{desktopMode && <View style={desktop.header}><DText weight="semiBold" style={desktop.headerText}>מסמך</DText><DText weight="semiBold" style={desktop.headerText}>תאריך</DText><DText weight="semiBold" style={desktop.headerText}>תיאור</DText><View style={desktop.actionsSpacer} /></View>}{docs.map((doc) => <DocumentRowView key={doc.id} doc={doc} preview={previews[doc.id]} desktop={desktopMode} onOpen={onOpen} onDownload={onDownload} onDelete={onDelete} />)}</View>}
  </ScrollView>;
}

function AddButton({ desktop: desktopMode, onPress }: { desktop: boolean; onPress: () => void }) {
  if (desktopMode) return <HoverPressable style={desktop.add} hoverStyle={desktop.addHover} onPress={onPress}><Ionicons name="add" size={18} color="#fff" /><DText weight="semiBold" style={styles.addText}>הוספת מסמך</DText></HoverPressable>;
  return <TouchableOpacity style={styles.add} onPress={onPress} activeOpacity={.82}><Ionicons name="add" size={18} color="#fff" /><AppText weight="bold" style={styles.addText}>הוספת מסמך</AppText></TouchableOpacity>;
}

function DocumentRowView({ doc, preview, desktop: isDesktop, onOpen, onDownload, onDelete }: { doc: DocumentRow; preview?: string; desktop: boolean; onOpen: (doc: DocumentRow) => void; onDownload: (doc: DocumentRow) => void; onDelete: (doc: DocumentRow) => void }) {
  const thumbnail = isDesktop ? desktop.thumb : styles.thumb;
  const thumbnailNode = isImage(doc) && preview ? <View style={thumbnail}><Image source={{ uri: preview }} style={styles.image} resizeMode="cover" /></View> : <View style={[thumbnail, styles.fileCover]}><Ionicons name={doc.mime_type?.includes('pdf') ? 'document-text' : 'document'} size={24} color="#D13438" /><AppText weight="bold" style={styles.fileCoverLabel}>{doc.mime_type?.includes('pdf') ? 'PDF' : 'FILE'}</AppText></View>;
  const actions = <View style={isDesktop ? desktop.actions : styles.actions}><TouchableOpacity onPress={(event) => { event.stopPropagation(); onDownload(doc); }} style={styles.icon} hitSlop={6}><Ionicons name="download-outline" size={18} color="#007AFF" /></TouchableOpacity><TouchableOpacity onPress={(event) => { event.stopPropagation(); onDelete(doc); }} style={[styles.icon, styles.delete]} hitSlop={6}><Ionicons name="trash-outline" size={18} color="#FF3B30" /></TouchableOpacity></View>;
  const date = formatDate(doc.document_date ?? doc.created_at);
  if (isDesktop) return <HoverPressable style={desktop.row} hoverStyle={desktop.rowHover} onPress={() => onOpen(doc)}>{thumbnailNode}<View style={desktop.name}><DText weight="semiBold" style={desktop.fileTitle} numberOfLines={1}>{titleOf(doc)}</DText></View><DText style={desktop.date}>{date}</DText><DText style={desktop.description} numberOfLines={1}>{doc.description?.trim() || '—'}</DText>{actions}</HoverPressable>;
  return <TouchableOpacity style={styles.row} onPress={() => onOpen(doc)} activeOpacity={.84}>{thumbnailNode}<View style={styles.copy}><AppText weight="bold" style={styles.fileTitle} numberOfLines={1}>{titleOf(doc)}</AppText></View><AppText style={styles.date}>{date}</AppText>{actions}{doc.description?.trim() ? <AppText style={styles.description}>{doc.description}</AppText> : null}</TouchableOpacity>;
}

function Composer({ visible, draft, errors, saving, onClose, onChange, onChooseFile, onSave }: { visible: boolean; draft: Draft; errors: { title: boolean; date: boolean; file: boolean }; saving: boolean; onClose: () => void; onChange: (update: Partial<Draft>) => void; onChooseFile: () => void; onSave: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><KeyboardAvoidingView style={styles.modalLayer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Pressable style={styles.backdrop} onPress={onClose}><Pressable style={styles.modal} onPress={(event) => event.stopPropagation()}><View style={styles.modalHead}><View><AppText weight="bold" style={styles.modalTitle}>הוספת מסמך</AppText><AppText style={styles.modalSub}>הפרטים נשמרים לצד הקובץ כדי שקל למצוא אותו.</AppText></View><TouchableOpacity onPress={onClose} disabled={saving} style={styles.close}><Ionicons name="close" size={19} color="#3C3C43" /></TouchableOpacity></View><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled"><Label label="שם המסמך" required error={errors.title} /><TextInput value={draft.title} onChangeText={(title) => onChange({ title })} placeholder="למשל: אישור ניהול חשבון" placeholderTextColor="#8E8E93" editable={!saving} textAlign="right" style={[styles.input, errors.title && styles.inputError]} />{errors.title && <ErrorText text="יש להזין שם למסמך" />}<Label label="תאריך המסמך" required error={errors.date} /><DateField value={draft.date} onChange={(date) => onChange({ date })} placeholder="בחרו תאריך" hasError={errors.date} disabled={saving} />{errors.date && <ErrorText text="יש לבחור תאריך" />}<Label label="תיאור" /><TextInput value={draft.description} onChangeText={(description) => onChange({ description })} placeholder="מה כולל המסמך? (לא חובה)" placeholderTextColor="#8E8E93" editable={!saving} multiline textAlign="right" textAlignVertical="top" style={[styles.input, styles.textarea]} /><Label label="קובץ מצורף" required error={errors.file} /><TouchableOpacity style={[styles.upload, errors.file && styles.uploadError]} onPress={onChooseFile} disabled={saving} activeOpacity={.78}><View style={styles.uploadMark}><Ionicons name={draft.file ? 'checkmark' : 'cloud-upload-outline'} size={22} color={draft.file ? '#087A57' : '#007AFF'} /></View><View style={styles.uploadCopy}><AppText weight="bold" style={styles.uploadTitle}>{draft.file?.name || 'בחירת קובץ'}</AppText><AppText style={styles.uploadHint}>{draft.file ? 'הקובץ מוכן להעלאה' : 'PDF או תמונה · עד 20MB'}</AppText></View><Ionicons name="chevron-back" size={17} color="#8E8E93" /></TouchableOpacity>{errors.file && <ErrorText text="יש לבחור קובץ להעלאה" />}</ScrollView><View style={styles.footer}><TouchableOpacity onPress={onClose} disabled={saving} style={styles.cancel}><AppText weight="semiBold" style={styles.cancelText}>ביטול</AppText></TouchableOpacity><TouchableOpacity onPress={onSave} disabled={saving} style={[styles.save, saving && styles.saveDisabled]} activeOpacity={.84}>{saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="arrow-up-circle-outline" size={18} color="#fff" /><AppText weight="bold" style={styles.saveText}>שמור מסמך</AppText></>}</TouchableOpacity></View></Pressable></Pressable></KeyboardAvoidingView></Modal>;
}

function DesktopDocumentPreview({ preview, progress, onClose }: { preview: DocumentPreview | null; progress: Animated.Value; onClose: () => void }) {
  if (!preview) return null;
  const opacity = progress;
  const transform = [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }];
  const frame = isImage(preview.doc)
    ? <DesktopImageViewer src={preview.src} alt={titleOf(preview.doc)} />
    : React.createElement('iframe' as any, { src: preview.src, title: titleOf(preview.doc), style: previewStyles.frame });

  return <Modal visible transparent animationType="none" onRequestClose={onClose}>
    <Animated.View style={[previewStyles.backdrop, { opacity }]}>
      <View style={previewStyles.dismissArea}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[previewStyles.panel, { opacity, transform }]}>
          <View style={previewStyles.header}>
            <View style={previewStyles.titleWrap}><View style={previewStyles.icon}><Ionicons name={isImage(preview.doc) ? 'image-outline' : 'document-text-outline'} size={18} color="#0B77B4" /></View><View><DText weight="bold" style={previewStyles.title} numberOfLines={1}>{titleOf(preview.doc)}</DText><DText style={previewStyles.subTitle}>{formatDate(preview.doc.document_date ?? preview.doc.created_at)}</DText></View></View>
            <View style={previewStyles.tools}><TouchableOpacity onPress={() => void downloadDocumentWithAlert(preview.doc)} style={previewStyles.toolButton} accessibilityLabel="הורדת מסמך"><Ionicons name="download-outline" size={18} color="#0B77B4" /></TouchableOpacity><TouchableOpacity onPress={onClose} style={previewStyles.closeButton} accessibilityLabel="סגירת תצוגת מסמך"><Ionicons name="close" size={20} color="#273A49" /></TouchableOpacity></View>
          </View>
          <View style={previewStyles.viewer}>{frame}</View>
        </Animated.View>
      </View>
    </Animated.View>
  </Modal>;
}

function DesktopImageViewer({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState(1.6);
  const zoomIn = () => setZoom((value) => Math.min(2.2, Number((value + .2).toFixed(1))));
  const zoomOut = () => setZoom((value) => Math.max(1, Number((value - .2).toFixed(1))));
  const image = React.createElement('img' as any, {
    src,
    alt,
    draggable: false,
    style: { display: 'block', width: 'auto', height: `${zoom * 100}%`, maxWidth: 'none', userSelect: 'none' },
  });

  return <View style={previewStyles.imageViewer}>
    <View style={previewStyles.zoomBar}>
      <TouchableOpacity onPress={zoomOut} disabled={zoom <= 1} style={[previewStyles.zoomButton, zoom <= 1 && previewStyles.zoomButtonDisabled]} accessibilityLabel="הקטנת תצוגת המסמך"><Ionicons name="remove" size={18} color="#27445A" /></TouchableOpacity>
      <DText style={previewStyles.zoomLabel}>{Math.round(zoom * 100)}%</DText>
      <TouchableOpacity onPress={zoomIn} disabled={zoom >= 2.2} style={[previewStyles.zoomButton, zoom >= 2.2 && previewStyles.zoomButtonDisabled]} accessibilityLabel="הגדלת תצוגת המסמך"><Ionicons name="add" size={18} color="#27445A" /></TouchableOpacity>
    </View>
    {React.createElement('div' as any, { style: { flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 18, backgroundColor: '#DCE5EA' } }, image)}
  </View>;
}
function Label({ label, required, error }: { label: string; required?: boolean; error?: boolean }) { return <AppText weight="semiBold" style={[styles.label, error && styles.labelError]}>{label}{required ? <AppText style={styles.required}> *</AppText> : null}</AppText>; }
function ErrorText({ text }: { text: string }) { return <AppText style={styles.errorText}>{text}</AppText>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F2F4F7' }, mobileContent: { flex: 1 }, topBar: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14 }, topTitleGroup: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9 }, titleGlyph: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#E8F3FF', alignItems: 'center', justifyContent: 'center' }, topTitle: { color: '#1C1C1E', fontSize: 22 }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 18, paddingBottom: 48, gap: 20 }, hero: { padding: 18, gap: 18, backgroundColor: 'rgba(255,255,255,.94)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(60,60,67,.08)' }, heroTitle: { fontSize: 19, color: '#1C1C1E' }, heroSub: { fontSize: 14, color: '#6C6C70', marginTop: 4 }, heroActions: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, count: { height: 32, borderRadius: 16, paddingHorizontal: 11, gap: 6, flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#E8F7F1' }, countText: { fontSize: 13, color: '#087A57' }, add: { height: 42, paddingHorizontal: 15, borderRadius: 13, backgroundColor: '#007AFF', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6 }, addText: { color: '#fff', fontSize: 14 }, empty: { paddingTop: 34 }, shelf: { gap: 10 }, row: { minHeight: 88, padding: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.96)', borderWidth: 1, borderColor: 'rgba(60,60,67,.08)', flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 11 }, thumb: { width: 52, height: 60, borderRadius: 10, overflow: 'hidden', backgroundColor: '#F2F2F7', alignItems: 'center', justifyContent: 'center' }, image: { width: '100%', height: '100%' }, fileCover: { gap: 2, backgroundColor: '#FFF1F1' }, fileCoverLabel: { color: '#D13438', fontSize: 9, letterSpacing: .4 }, copy: { flex: 1, minWidth: 104, gap: 2 }, fileTitle: { color: '#1C1C1E', fontSize: 15 }, fileName: { color: '#8E8E93', fontSize: 12 }, date: { color: '#6C6C70', fontSize: 12.5, writingDirection: 'ltr' }, description: { width: '100%', color: '#6C6C70', fontSize: 13, lineHeight: 18, paddingHorizontal: 3 }, actions: { flexDirection: 'row-reverse', gap: 2 }, icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F7FF' }, delete: { backgroundColor: '#FFF1F0' }, modalLayer: { flex: 1, justifyContent: 'center', alignItems: 'center' }, backdrop: { flex: 1, width: '100%', padding: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,.38)' }, modal: { width: '100%', maxWidth: 560, maxHeight: '90%', overflow: 'hidden', borderRadius: 24, backgroundColor: '#fff', shadowColor: '#182433', shadowOpacity: .2, shadowRadius: 32, shadowOffset: { width: 0, height: 16 }, elevation: 12 }, modalHead: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 22, paddingBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA' }, modalTitle: { color: '#1C1C1E', fontSize: 20 }, modalSub: { color: '#6C6C70', fontSize: 13, marginTop: 4, lineHeight: 18 }, close: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F2F2F7', alignItems: 'center', justifyContent: 'center' }, form: { padding: 22, gap: 8 }, label: { color: '#3C3C43', fontSize: 14, marginTop: 6 }, labelError: { color: '#D70015' }, required: { color: '#FF3B30' }, input: { minHeight: 48, paddingHorizontal: 14, borderWidth: 1, borderColor: '#D1D1D6', borderRadius: 12, fontFamily: 'Heebo_400Regular', color: '#1C1C1E', fontSize: 16, backgroundColor: '#fff' }, inputError: { borderColor: '#FF3B30' }, textarea: { minHeight: 90, paddingTop: 12 }, errorText: { color: '#D70015', fontSize: 12, marginTop: -3 }, upload: { minHeight: 72, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: '#BBD8F6', backgroundColor: '#F6FAFF', flexDirection: 'row-reverse', alignItems: 'center', gap: 11 }, uploadError: { borderColor: '#FF3B30' }, uploadMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#E8F3FF', alignItems: 'center', justifyContent: 'center' }, uploadCopy: { flex: 1, gap: 2 }, uploadTitle: { color: '#1C1C1E', fontSize: 14 }, uploadHint: { color: '#6C6C70', fontSize: 12 }, footer: { padding: 16, gap: 10, flexDirection: 'row-reverse', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E5EA' }, cancel: { minWidth: 78, height: 46, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, cancelText: { color: '#007AFF', fontSize: 15 }, save: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#007AFF', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7 }, saveDisabled: { opacity: .58 }, saveText: { color: '#fff', fontSize: 15 },
});
const desktop = StyleSheet.create({
  content: { width: '100%', maxWidth: 1140, alignSelf: 'center', padding: 32, paddingBottom: 54, gap: 20 },
  hero: { padding: 24, borderRadius: 18, backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: '#DCE5EC', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 24, shadowColor: '#0D2238', shadowOpacity: .045, shadowRadius: 18, shadowOffset: { width: 0, height: 7 } },
  heroTitle: { fontSize: 22, color: '#172B3A' },
  heroSub: { fontSize: 14, color: '#667889', marginTop: 4 },
  heroActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  add: { height: 40, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#0B77B4', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, shadowColor: '#0B77B4', shadowOpacity: .18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, ...webOnly({ transitionDuration: '140ms' }) },
  addHover: { backgroundColor: '#075D91', transform: [{ scale: .98 }] },
  shelf: { overflow: 'hidden', borderRadius: 18, backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: '#DCE5EC', shadowColor: '#0D2238', shadowOpacity: .055, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  header: { minHeight: 50, paddingHorizontal: 22, gap: 18, backgroundColor: '#1A2B3A', borderBottomWidth: 1, borderBottomColor: '#263B4E', flexDirection: 'row-reverse', alignItems: 'center' },
  headerText: { flex: 1, color: '#D8E6EF', fontSize: 12, textAlign: 'center' },
  actionsSpacer: { width: 86 },
  row: { minHeight: 90, paddingHorizontal: 22, gap: 18, flexDirection: 'row-reverse', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E8EEF3', backgroundColor: '#FFFFFF', ...webOnly({ transitionDuration: '140ms' }) },
  rowHover: { backgroundColor: '#F6FAFD' },
  thumb: { width: 52, height: 62, borderRadius: 11, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F6F9', borderWidth: 1, borderColor: '#E1EAF0' },
  name: { flex: 1, minWidth: 180, alignItems: 'center', justifyContent: 'center' },
  fileTitle: { fontSize: 14, color: '#172B3A', textAlign: 'center' },
  fileName: { fontSize: 11.5, color: '#7C8C99', textAlign: 'center' },
  date: { flex: 1, fontSize: 13, color: '#3D5263', writingDirection: 'ltr', textAlign: 'center', fontVariant: ['tabular-nums'] },
  description: { flex: 1, fontSize: 13, color: '#627483', textAlign: 'center', lineHeight: 19 },
  actions: { width: 86, flexDirection: 'row-reverse', justifyContent: 'center', gap: 5 },
});

const previewStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(13,26,38,.56)', padding: 32, alignItems: 'center', justifyContent: 'center' },
  dismissArea: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 1080, height: '88%', minHeight: 560, borderRadius: 18, overflow: 'hidden', backgroundColor: '#F4F7F9', shadowColor: '#07131E', shadowOpacity: .28, shadowRadius: 36, shadowOffset: { width: 0, height: 18 } },
  header: { height: 66, paddingHorizontal: 18, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#DDE7ED', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  titleWrap: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F3FA', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#172B3A', fontSize: 15, textAlign: 'right' },
  subTitle: { color: '#71808C', fontSize: 11.5, marginTop: 1, writingDirection: 'ltr', textAlign: 'right' },
  tools: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, marginRight: 16 },
  toolButton: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF7FC', alignItems: 'center', justifyContent: 'center' },
  closeButton: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F0F3F5', alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, padding: 14, backgroundColor: '#E8EEF2' },
  imageViewer: { flex: 1, overflow: 'hidden', backgroundColor: '#DCE5EA' },
  zoomBar: { height: 46, paddingHorizontal: 12, backgroundColor: '#F8FAFB', borderBottomWidth: 1, borderBottomColor: '#D1DDE5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  zoomButton: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#C9D8E2' },
  zoomButtonDisabled: { opacity: .4 },
  zoomLabel: { width: 46, color: '#536B7C', fontSize: 12, textAlign: 'center', writingDirection: 'ltr' },
  frame: { width: '100%', height: '100%', borderWidth: 0, backgroundColor: '#FFFFFF' },
});

