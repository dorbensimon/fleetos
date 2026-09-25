import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../../components/ui';
import { DateField } from '../../components/ui/DateField';
import { DK, DKText, DriverPage, EditField, EmptyPanel, ErrorPanel, HeroTitle, KitInput, KitSheet, LoadingPanel, PrimaryAction, Pressy, Reveal, STATUS, SheetActions, Surface } from '../../components/driverKit';
import { useCompany } from '../../lib/CompanyContext';
import type { DocumentRow } from '../../lib/adminApi';
import { getDocumentUrl, listDocuments, uploadDocument, type PickedFile } from '../../lib/documents';
import { chooseDocumentSource, confirmDeleteDocument, documentViewerMode, downloadDocumentWithAlert, getDocumentViewUrl, pickDocumentSource, type DocumentSource } from '../../lib/documentActions';
import { formatDate } from '../../lib/theme';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { CompanyDocumentsDesktopView, type CompanyDocumentDraft } from '../../components/desktop/CompanyDocumentsDesktopView';
import { DText } from '../../components/desktop/primitives';
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
  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={
        <HeroTitle
          title="מסמכי חברה"
          subtitle={loading ? 'טוען…' : docs.length ? `${docs.length} ${docs.length === 1 ? 'מסמך' : 'מסמכים'} · שמורים ונגישים גם במחשב` : 'רישיון מוביל, ביטוחים, נהלים — הכול במקום אחד'}
          onBack={() => navigation.goBack()}
        />
      }
      footer={!loading && !error ? <PrimaryAction label="הוספת מסמך" icon="add" onPress={openComposer} /> : undefined}
      overlay={composer}
    >
      {loading ? (
        <LoadingPanel />
      ) : error ? (
        <ErrorPanel message="טעינת המסמכים נכשלה" hint={error} onRetry={load} />
      ) : docs.length === 0 ? (
        <Reveal>
          <EmptyPanel icon="folder-open" title="אין עדיין מסמכי חברה" body="הוסיפו את המסמך הראשון — עם שם, תאריך ותיאור, כדי שיהיה קל למצוא אותו." action={{ label: 'הוספת מסמך', icon: 'add', onPress: openComposer }} />
        </Reveal>
      ) : (
        docs.map((doc, index) => (
          <Reveal key={doc.id} index={Math.min(index, 8)}>
            <DocumentCard doc={doc} preview={previews[doc.id]} onOpen={open} onDownload={downloadDocumentWithAlert} onDelete={(item) => confirmDeleteDocument(item, load)} />
          </Reveal>
        ))
      )}
    </DriverPage>
  );
}

/** A company document: its cover (the image itself, or the file type), name, date and note. */
function DocumentCard({ doc, preview, onOpen, onDownload, onDelete }: { doc: DocumentRow; preview?: string; onOpen: (doc: DocumentRow) => void; onDownload: (doc: DocumentRow) => void; onDelete: (doc: DocumentRow) => void }) {
  const pdf = !!doc.mime_type?.includes('pdf');
  const name = titleOf(doc);
  return (
    <Surface style={styles.card}>
      <Pressy onPress={() => onOpen(doc)} accessibilityLabel={`פתיחת ${name}`} pressScale={0.985}>
        <View style={styles.cardRow}>
          <View style={styles.thumb}>
            {isImage(doc) && preview ? (
              <Image source={{ uri: preview }} accessibilityLabel="תצוגה מקדימה של הקובץ שנבחר" style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
            ) : (
              <>
                <Ionicons name={pdf ? 'document-text' : 'document'} size={22} color={pdf ? STATUS.expired.fg : DK.accent} />
                <DKText variant="micro" color={pdf ? STATUS.expired.fg : DK.accent} ltr style={styles.center}>
                  {pdf ? 'PDF' : 'FILE'}
                </DKText>
              </>
            )}
          </View>
          <View style={styles.copy}>
            <DKText variant="label" numberOfLines={2}>
              {name}
            </DKText>
            <DKText variant="caption" color={DK.muted}>
              {formatDate(doc.document_date ?? doc.created_at)}
            </DKText>
            {!!doc.description?.trim() && (
              <DKText variant="caption" color={DK.inkSoft} numberOfLines={3}>
                {doc.description}
              </DKText>
            )}
          </View>
        </View>
      </Pressy>
      <View style={styles.actions}>
        <Pressy onPress={() => onDownload(doc)} accessibilityLabel={`הורדת ${name}`} style={styles.action} pressScale={0.94}>
          <Ionicons name="download-outline" size={18} color={DK.accent} />
          <DKText variant="label" color={DK.accent}>
            הורדה
          </DKText>
        </Pressy>
        <Pressy onPress={() => onDelete(doc)} accessibilityLabel={`מחיקת ${name}`} style={[styles.action, styles.actionDanger]} pressScale={0.94}>
          <Ionicons name="trash-outline" size={18} color={STATUS.expired.fg} />
          <DKText variant="label" color={STATUS.expired.fg}>
            מחיקה
          </DKText>
        </Pressy>
      </View>
    </Surface>
  );
}

function Composer({ visible, draft, errors, saving, onClose, onChange, onChooseFile, onSave }: { visible: boolean; draft: Draft; errors: { title: boolean; date: boolean; file: boolean }; saving: boolean; onClose: () => void; onChange: (update: Partial<Draft>) => void; onChooseFile: () => void; onSave: () => void }) {
  return (
    <KitSheet
      visible={visible}
      onClose={onClose}
      dismissable={!saving}
      icon="document-attach"
      title="הוספת מסמך"
      subtitle="השם, התאריך והתיאור נשמרים לצד הקובץ, כדי שיהיה קל למצוא אותו."
      footer={
        <SheetActions>
          <PrimaryAction label="ביטול" tone="ghost" onPress={onClose} disabled={saving} style={styles.flex} />
          <PrimaryAction label="שמירת המסמך" icon="cloud-upload-outline" onPress={onSave} loading={saving} style={styles.flex2} />
        </SheetActions>
      }
    >
      <View style={styles.fields}>
        <EditField first label="שם המסמך" required value={draft.title} onChangeText={(title) => onChange({ title })} placeholder="למשל: רישיון מוביל" editable={!saving} error={errors.title ? 'יש להזין שם למסמך' : undefined} />
        <EditField label="תאריך המסמך" required editor={<DateField value={draft.date} onChange={(date) => onChange({ date })} placeholder="בחירת תאריך" hasError={errors.date} disabled={saving} />} error={errors.date ? 'יש לבחור תאריך' : undefined} />
        <EditField
          label="תיאור"
          editor={<KitInput value={draft.description} onChangeText={(description) => onChange({ description })} placeholder="מה כולל המסמך? (לא חובה)" editable={!saving} multiline style={styles.textarea} accessibilityLabel="תיאור" />}
        />
        <EditField
          label="קובץ מצורף"
          required
          error={errors.file ? 'יש לבחור קובץ להעלאה' : undefined}
          editor={
            <Pressy onPress={onChooseFile} disabled={saving} accessibilityLabel={draft.file ? `הקובץ ${draft.file.name}, החלפה` : 'בחירת קובץ'} style={[styles.upload, errors.file && styles.uploadError]} pressScale={0.98}>
              <View style={[styles.uploadMark, draft.file && { backgroundColor: STATUS.ok.soft }]}>
                <Ionicons name={draft.file ? 'checkmark' : 'cloud-upload-outline'} size={22} color={draft.file ? STATUS.ok.fg : DK.accent} />
              </View>
              <View style={styles.flex}>
                <DKText variant="label" numberOfLines={1}>
                  {draft.file?.name || 'בחירת קובץ'}
                </DKText>
                <DKText variant="caption" color={DK.muted}>
                  {draft.file ? 'מוכן להעלאה · אפשר להחליף' : 'PDF או תמונה · עד 20MB'}
                </DKText>
              </View>
            </Pressy>
          }
        />
      </View>
    </KitSheet>
  );
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
const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex2: { flex: 2 },
  center: { textAlign: 'center' },
  card: { padding: 12, gap: 12 },
  cardRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  thumb: { width: 58, height: 68, borderRadius: 14, overflow: 'hidden', backgroundColor: DK.surfaceSunk, alignItems: 'center', justifyContent: 'center', gap: 2 },
  image: { width: '100%', height: '100%' },
  copy: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row-reverse', gap: 8 },
  action: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 14, backgroundColor: DK.accentSoft },
  actionDanger: { backgroundColor: STATUS.expired.soft },
  fields: { marginHorizontal: -16 },
  textarea: { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' },
  upload: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 72, padding: 12, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(47,91,255,0.35)', backgroundColor: DK.accentSoft },
  uploadError: { borderColor: STATUS.expired.fill },
  uploadMark: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
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

