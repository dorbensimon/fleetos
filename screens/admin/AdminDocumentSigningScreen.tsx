import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { listDrivers } from '../../lib/adminApi';
import type { DriverRow } from '../../lib/adminApi';
import { useCompany } from '../../lib/CompanyContext';
import { pickFile, pickImage } from '../../lib/documents';
import {
  assignSigningTemplate,
  createTemplateBuilderSession,
  deleteSigningRecord,
  downloadSignedRequest,
  downloadSigningTemplate,
  getSigningTemplateSourceUrl,
  getSigningSession,
  listSignatureRequests,
  listSigningTemplates,
  type SignatureRequest,
  type SigningFile,
  type SigningTemplate,
} from '../../lib/docuseal';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';
import type { RootStackParamList } from '../../navigation/types';
import { AppText, Card, EmptyState, Input, PrimaryButton, Screen, ScreenHeader, SecondaryButton } from '../../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminDocumentSigning'>;

export default function AdminDocumentSigningScreen({ navigation }: Props) {
  const { companyId, loading: profileLoading, profile } = useCompany();
  const [tab, setTab] = useState<'templates' | 'sent'>('templates');
  const [title, setTitle] = useState('');
  const [templates, setTemplates] = useState<SigningTemplate[]>([]);
  const [requests, setRequests] = useState<SignatureRequest[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<SigningTemplate | null>(null);
  const [builderSource, setBuilderSource] = useState<'gallery' | 'file' | null>(null);
  const [sending, setSending] = useState(false);
  const [previewingTemplateId, setPreviewingTemplateId] = useState<string | null>(null);
  const [sharingTemplateId, setSharingTemplateId] = useState<string | null>(null);
  const [openingRequestId, setOpeningRequestId] = useState<string | null>(null);
  const [sharingRequestId, setSharingRequestId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!profileLoading && !isAdmin) {
      navigation.replace(profile?.role === 'driver' ? 'DriverHome' : 'OwnerHome');
    }
  }, [isAdmin, navigation, profile?.role, profileLoading]);

  const load = useCallback(async () => {
    if (!companyId || !isAdmin) return;
    try {
      const [templateRows, requestRows, driverRows] = await Promise.all([
        listSigningTemplates(companyId), listSignatureRequests(companyId), listDrivers(companyId),
      ]);
      setTemplates(templateRows);
      setRequests(requestRows);
      setDrivers(driverRows);
      setError('');
    } catch (err: any) { setError(err?.message || 'טעינת המסמכים נכשלה'); }
  }, [companyId, isAdmin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (profileLoading || !isAdmin) return null;

  const startBuilder = async (file: SigningFile | null) => {
    if (!file || !companyId) return;
    if (!title.trim()) { setError('יש להקליד שם למסמך'); return; }
    setError('');
    try {
      const session = await createTemplateBuilderSession(companyId, title.trim(), file);
      navigation.navigate('DocusealWebView', {
        mode: 'builder', title: 'מיקום שדה החתימה', token: session.token,
        host: session.host, templateId: session.templateId,
      });
      setTitle('');
    } catch (err: any) { setError(err?.message || 'יצירת התבנית נכשלה'); }
  };

  const startBuilderFrom = async (source: 'gallery' | 'file') => {
    setBuilderSource(source);
    try {
      const file = source === 'gallery' ? await pickImage() : await pickFile();
      await startBuilder(file);
    } finally {
      setBuilderSource(null);
    }
  };

  const send = async () => {
    if (!companyId || !activeTemplate || !selected.length) return;
    setSending(true);
    try {
      const result = await assignSigningTemplate(companyId, activeTemplate.id, selected);
      setActiveTemplate(null);
      setSelected([]);
      setTab('sent');
      await load();
      if (result.failed.length) Alert.alert('השליחה הושלמה חלקית', `נשלח ל-${result.created} נהגים`);
    } catch (err: any) { setError(err?.message || 'שליחת המסמך נכשלה'); }
    finally { setSending(false); }
  };

  const previewTemplate = async (item: SigningTemplate) => {
    setPreviewingTemplateId(item.id);
    setError('');
    try {
      const url = await getSigningTemplateSourceUrl(item);
      if (!url) throw new Error('לא ניתן לפתוח את התבנית כרגע');
      navigation.navigate('DocusealWebView', {
        mode: 'document',
        title: item.title,
        src: url,
      });
    } catch (err: any) {
      setError(err?.message || 'פתיחת התבנית נכשלה');
    } finally {
      setPreviewingTemplateId(null);
    }
  };

  const shareTemplate = async (item: SigningTemplate) => {
    setSharingTemplateId(item.id);
    setError('');
    try {
      await downloadSigningTemplate(item);
    } catch (err: any) {
      setError(err?.message || 'הורדת התבנית נכשלה');
    } finally {
      setSharingTemplateId(null);
    }
  };

  const openRequest = async (item: SignatureRequest) => {
    setOpeningRequestId(item.id);
    try {
      const session = await getSigningSession(item.id);
      navigation.navigate('DocusealWebView', { ...session, title: item.template?.title || 'מסמך חתום', requestId: item.id });
    } catch (err: any) { setError(err?.message || 'פתיחת המסמך נכשלה'); }
    finally { setOpeningRequestId(null); }
  };

  const shareSignedRequest = async (item: SignatureRequest) => {
    setSharingRequestId(item.id);
    setError('');
    try {
      await downloadSignedRequest(item);
    } catch (err: any) {
      setError(err?.message || 'הורדת המסמך החתום נכשלה');
    } finally {
      setSharingRequestId(null);
    }
  };

  const remove = (kind: 'template' | 'request', id: string) => {
    if (!companyId) return;
    Alert.alert('מחיקת מסמך', 'המסמך יימחק גם מ-DocuSeal. להמשיך?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחיקה', style: 'destructive', onPress: async () => {
        try { await deleteSigningRecord(companyId, kind, id); await load(); }
        catch (err: any) { setError(err?.message || 'מחיקת המסמך נכשלה'); }
      } },
    ]);
  };

  return (
    <Screen>
      <ScreenHeader title="מסמכים לחתימה" onBack={() => navigation.goBack()} />
      <View style={styles.tabs}>
        {(['templates', 'sent'] as const).map((value) => (
          <TouchableOpacity key={value} style={[styles.tab, tab === value && styles.tabActive]} onPress={() => setTab(value)}>
            <AppText weight="bold" style={tab === value ? styles.tabTextActive : styles.tabText}>
              {value === 'templates' ? 'תבניות' : 'נשלחו'}
            </AppText>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'templates' && (
          <Card style={styles.createCard}>
            <AppText weight="bold" style={styles.heading}>יצירת טופס חדש</AppText>
            <Input value={title} onChangeText={setTitle} placeholder="שם המסמך" />
            <View style={styles.actions}>
              <PrimaryButton
                style={styles.action}
                label="תמונה מהגלריה"
                icon="images-outline"
                loading={builderSource === 'gallery'}
                disabled={builderSource !== null}
                onPress={() => startBuilderFrom('gallery')}
              />
              <SecondaryButton
                style={styles.action}
                label="PDF או תמונה"
                icon="document-attach-outline"
                disabled={builderSource !== null}
                onPress={() => startBuilderFrom('file')}
              />
            </View>
          </Card>
        )}

        {!!error && <AppText style={styles.error}>{error}</AppText>}

        {tab === 'templates' && templates.map((item) => (
          <TouchableOpacity key={item.id} activeOpacity={0.8} onPress={() => previewTemplate(item)}>
          <Card style={styles.card}>
            {previewingTemplateId === item.id
              ? <Ionicons name="hourglass-outline" size={25} color={COLORS.accent} />
              : <Ionicons name="document-text-outline" size={25} color={COLORS.accent} />}
            <View style={styles.cardText}><AppText weight="bold">{item.title}</AppText><AppText style={styles.meta}>תבנית מוכנה לשליחה</AppText></View>
            <TouchableOpacity onPress={() => shareTemplate(item)} hitSlop={8} disabled={sharingTemplateId === item.id}>
              <Ionicons name="download-outline" size={20} color={COLORS.accent} />
            </TouchableOpacity>
            <SecondaryButton label="שלח" icon="send-outline" onPress={() => setActiveTemplate(item)} />
            <TouchableOpacity onPress={() => remove('template', item.id)}><Ionicons name="trash-outline" size={20} color={COLORS.dangerText} /></TouchableOpacity>
          </Card>
          </TouchableOpacity>
        ))}
        {tab === 'templates' && !templates.length && <EmptyState title="אין עדיין תבניות מוכנות" />}

        {tab === 'sent' && requests.map((item) => (
          <Card key={item.id} style={styles.card}>
            <Ionicons
              name={openingRequestId === item.id ? 'hourglass-outline' : item.status === 'completed' ? 'checkmark-circle' : 'time-outline'}
              size={25}
              color={item.status === 'completed' ? COLORS.okText : COLORS.accent}
            />
            <TouchableOpacity style={styles.cardText} onPress={() => item.status === 'completed' && openRequest(item)} disabled={openingRequestId === item.id}>
              <AppText weight="bold">{item.template?.title || 'מסמך'}</AppText>
              <AppText style={styles.meta}>{item.driverName || 'נהג'} · {item.status === 'completed' ? 'נחתם' : item.status === 'declined' ? 'נדחה' : 'ממתין לחתימה'}</AppText>
            </TouchableOpacity>
            {item.status === 'completed' && (
              <TouchableOpacity onPress={() => shareSignedRequest(item)} hitSlop={8} disabled={sharingRequestId === item.id}>
                <Ionicons name="download-outline" size={20} color={COLORS.accent} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => remove('request', item.id)}><Ionicons name="trash-outline" size={20} color={COLORS.dangerText} /></TouchableOpacity>
          </Card>
        ))}
        {tab === 'sent' && !requests.length && <EmptyState title="לא נשלחו מסמכים" />}
      </ScrollView>

      <Modal visible={!!activeTemplate} transparent animationType="slide" onRequestClose={() => setActiveTemplate(null)}>
        <View style={styles.overlay}><View style={styles.sheet}>
          <AppText weight="bold" style={styles.heading}>בחירת נהגים</AppText>
          <ScrollView style={styles.driverList}>
            {drivers.map((driver) => {
              const checked = selected.includes(driver.id);
              return <TouchableOpacity key={driver.id} style={styles.driver} onPress={() => setSelected(checked ? selected.filter((id) => id !== driver.id) : [...selected, driver.id])}>
                <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={23} color={COLORS.accent} />
                <AppText style={styles.cardText}>{driver.full_name || 'נהג'}</AppText>
              </TouchableOpacity>;
            })}
          </ScrollView>
          <PrimaryButton label={`שלח ל-${selected.length} נהגים`} loading={sending} disabled={!selected.length} onPress={send} />
          <SecondaryButton label="ביטול" onPress={() => setActiveTemplate(null)} />
        </View></View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row-reverse', margin: SPACING.lg, marginBottom: 0, backgroundColor: COLORS.neutralBg, borderRadius: RADIUS.md, padding: 4 },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderRadius: RADIUS.sm },
  tabActive: { backgroundColor: COLORS.card }, tabText: { color: COLORS.textMuted }, tabTextActive: { color: COLORS.accent },
  content: { padding: SPACING.lg, gap: SPACING.md }, createCard: { gap: SPACING.md }, heading: { fontSize: 18, textAlign: 'right' },
  actions: { flexDirection: 'row-reverse', gap: SPACING.sm }, action: { flex: 1 },
  card: { flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md, padding: SPACING.md },
  cardText: { flex: 1, textAlign: 'right' }, meta: { color: COLORS.textMuted, fontSize: 12, marginTop: 3 }, error: { color: COLORS.dangerText, textAlign: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' },
  sheet: { maxHeight: '75%', backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.md },
  driverList: { maxHeight: 360 }, driver: { flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
});
