import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { showAlert } from '../../lib/platformAlert';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, AppText, LoadingState, EmptyState, ErrorState } from '../../components/ui';
import { DateField } from '../../components/ui/DateField';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { DocumentFileRow } from '../../components/documents/DocumentFileRow';
import { Procedure6FormModal } from '../../components/documents/Procedure6FormModal';
import { COLORS, RADIUS, SPACING, FONT_SIZE, BRAND } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { DocumentRow } from '../../lib/adminApi';
import { listDocuments, readPickedFileBase64, uploadDocument, type PickedFile } from '../../lib/documents';
import { createProcedure6Report, Procedure6FormValues } from '../../lib/procedure6Report';
import {
  chooseDocumentSource,
  confirmDeleteDocument,
  documentDisplayName,
  documentViewerMode,
  downloadDocumentWithAlert,
  getDocumentViewUrl,
  pickDocumentSource,
  type DocumentSource,
} from '../../lib/documentActions';
import { RootStackParamList } from '../../navigation/types';
import { DriverDossierHero } from '../../components/driverCard/DriverDossierHero';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DText, HoverPressable } from '../../components/desktop/primitives';
import { DESKTOP_COLORS } from '../../components/desktop/desktopTheme';

/**
 * A generic "one category, one screen" document list — reused by every
 * row on the driver card (A5 menu): license scans, notes, procedure 6,
 * hazmat certs, etc. all follow the same shape (upload → list → view/
 * delete), so one screen serves all of them instead of duplicating it
 * eleven times.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DocumentCategory'>;

type HeroIcon = keyof typeof Ionicons.glyphMap;

// These categories are all reached from the driver's dossier. Giving each one
// a distinct icon keeps the shared page recognisable while preserving one
// consistent navigation and document-management flow.
const CATEGORY_HERO_ICONS: Record<string, HeroIcon> = {
  license_docs: 'card-outline',
  general: 'document-text-outline',
  transport_info: 'information-circle-outline',
  driver_file: 'folder-open-outline',
  notes_feedback: 'chatbubbles-outline',
  traffic_reports: 'warning-outline',
  accompanying_drivers: 'people-outline',
  procedure_6: 'shield-checkmark-outline',
  certifications: 'ribbon-outline',
  hazmat: 'flask-outline',
  trainings: 'school-outline',
  safety_officer_approval: 'shield-checkmark-outline',
  tachograph_calibration: 'speedometer-outline',
  brakes_semiannual: 'disc-outline',
  brakes_annual: 'disc-outline',
  winter_inspection: 'snow-outline',
  child_detection: 'eye-outline',
};

function CategoryHero({
  title,
  category,
  itemCount,
  onBack,
  insetTop,
}: {
  title: string;
  category: string;
  itemCount: number;
  onBack: () => void;
  insetTop: number;
}) {
  const icon = CATEGORY_HERO_ICONS[category] ?? 'document-text-outline';
  const countLabel = `${itemCount} ${itemCount === 1 ? 'פריט' : 'פריטים'}`;

  return <DriverDossierHero title={title} subtitle={countLabel} icon={icon} insetTop={insetTop} onBack={onBack} />;
}

export default function DocumentCategoryScreen({ route, navigation }: Props) {
  const { ownerType, ownerId, category, title, allowDelete = true, requiresExpiry = false } = route.params;
  const { companyId, profile } = useCompany();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();

  // נוהל 6 replaces the plain "upload any file" flow with a structured
  // form that produces a PDF (see Procedure6FormModal) — drivers may only
  // view/download what an admin already created, never create one here.
  const isProcedure6 = category === 'procedure_6';
  const canCreateProcedure6 = isProcedure6 && profile?.role !== 'driver';
  const [showProcedure6Form, setShowProcedure6Form] = useState(false);

  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await listDocuments(ownerType, ownerId, category);
      if (requestId === loadRequest.current) setDocs(rows);
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(err?.message ?? 'טעינת המסמכים נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [ownerType, ownerId, category]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        loadRequest.current += 1;
      };
    }, [load])
  );

  const addDocument = async () => {
    if (!companyId) return;
    if (requiresExpiry && !expiryDate) {
      showAlert('חסר תוקף', 'יש לבחור תאריך תוקף למסמך לפני ההעלאה');
      return;
    }

    chooseDocumentSource(title, async (source: DocumentSource) => {
      setUploading(true);
      try {
        const file = await pickDocumentSource(source);
        if (!file) return;

        await uploadDocument({ companyId, ownerType, ownerId, category, title, file, expiryDate });
        if (requiresExpiry) setExpiryDate(null);
        await load();
      } catch (err: any) {
        showAlert('העלאה נכשלה', err?.message ?? 'נסה שוב');
      } finally {
        setUploading(false);
      }
    });
  };

  const createProcedure6 = async (values: Procedure6FormValues, photo: PickedFile | null) => {
    if (!companyId) return;

    let photoDataUri: string | null = null;
    if (photo) {
      const base64 = await readPickedFileBase64(photo);
      photoDataUri = `data:${photo.mimeType};base64,${base64}`;
    }

    await createProcedure6Report({ companyId, ownerType, ownerId, values, photoDataUri });
    await load();
    setShowProcedure6Form(false);
  };

  const openDocument = async (doc: DocumentRow) => {
    const url = await getDocumentViewUrl(doc);
    if (!url) return;

    navigation.navigate('DocusealWebView', {
      mode: documentViewerMode(doc),
      title: documentDisplayName(doc),
      src: url,
    });
  };

  const desktopBody = loading ? (
    <LoadingState />
  ) : error ? (
    <ErrorState message={error} onRetry={load} />
  ) : (
    <View style={desktopStyles.wrap}>
      {docs.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title={isProcedure6 ? 'אין עדיין דיווחי נוהל 6' : 'אין עדיין מסמכים'}
          hint={
            isProcedure6
              ? canCreateProcedure6
                ? 'הוסף דיווח כדי ליצור את המסמך הראשון'
                : 'המנהל עדיין לא הוסיף דיווח בקטגוריה זו'
              : 'הנהג עדיין לא צילם או העלה מסמכים בקטגוריה זו'
          }
        />
      ) : (
        <View style={desktopStyles.list}>
          {docs.map((doc) => (
            <DocumentFileRow
              key={doc.id}
              doc={doc}
              variant="card"
              showDate
              showExpiry={requiresExpiry}
              onOpen={openDocument}
              onDownload={downloadDocumentWithAlert}
              onDelete={allowDelete ? (item) => confirmDeleteDocument(item, load) : undefined}
            />
          ))}
        </View>
      )}

      {(!isProcedure6 || canCreateProcedure6) && (
        <>
          {requiresExpiry && (
            <View style={desktopStyles.expiryField}>
              <DText weight="semiBold" style={desktopStyles.expiryLabel}>תוקף המסמך</DText>
              <DateField value={expiryDate} onChange={setExpiryDate} placeholder="בחר תאריך תוקף" />
            </View>
          )}
          <HoverPressable
            style={desktopStyles.uploadBtn}
            hoverStyle={{ backgroundColor: DESKTOP_COLORS.brandHover }}
            onPress={() => (isProcedure6 ? setShowProcedure6Form(true) : addDocument())}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name={isProcedure6 ? 'add-circle-outline' : 'cloud-upload-outline'} size={15} color="#FFFFFF" />
                <DText weight="semiBold" style={desktopStyles.uploadText}>
                  {isProcedure6 ? 'הוסף דיווח נוהל 6' : 'העלה מסמך'}
                </DText>
              </>
            )}
          </HoverPressable>
        </>
      )}
    </View>
  );

  if (isDesktop) {
    return (
      <>
        <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'נהגים', title]}>
          {desktopBody}
        </DesktopShell>
        {isProcedure6 && (
          <Procedure6FormModal visible={showProcedure6Form} onClose={() => setShowProcedure6Form(false)} onSubmit={createProcedure6} />
        )}
      </>
    );
  }

  return (
    <Screen style={styles.screen}>
      <AdminGradientBackground />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + SPACING.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <CategoryHero title={title} category={category} itemCount={docs.length} insetTop={insets.top} onBack={() => navigation.goBack()} />

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <View style={styles.content}>
            {docs.length === 0 ? (
              <EmptyState
                icon="document-text-outline"
                title={isProcedure6 ? 'אין עדיין דיווחי נוהל 6' : 'אין עדיין מסמכים'}
                hint={
                  isProcedure6
                    ? canCreateProcedure6
                      ? 'הוסף דיווח כדי ליצור את המסמך הראשון'
                      : 'המנהל עדיין לא הוסיף דיווח בקטגוריה זו'
                    : 'הנהג עדיין לא צילם או העלה מסמכים בקטגוריה זו'
                }
              />
            ) : (
              docs.map((doc) => (
                <DocumentFileRow
                  key={doc.id}
                  doc={doc}
                  variant="card"
                  showDate
                  showExpiry={requiresExpiry}
                  onOpen={openDocument}
                  onDownload={downloadDocumentWithAlert}
                  onDelete={allowDelete ? (item) => confirmDeleteDocument(item, load) : undefined}
                />
              ))
            )}

            {(!isProcedure6 || canCreateProcedure6) && (
              <>
                {requiresExpiry && (
                  <View style={styles.expiryField}>
                    <AppText weight="bold" style={styles.expiryLabel}>תוקף המסמך</AppText>
                    <DateField value={expiryDate} onChange={setExpiryDate} placeholder="בחר תאריך תוקף" />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.uploadBtn}
                  activeOpacity={0.85}
                  onPress={() => (isProcedure6 ? setShowProcedure6Form(true) : addDocument())}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator color={COLORS.textInverse} />
                  ) : (
                    <>
                      <Ionicons name={isProcedure6 ? 'add-circle-outline' : 'cloud-upload-outline'} size={17} color={COLORS.textInverse} />
                      <AppText weight="bold" style={styles.uploadText}>
                        {isProcedure6 ? 'הוסף דיווח נוהל 6' : 'העלה מסמך'}
                      </AppText>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </ScrollView>

      {isProcedure6 && (
        <Procedure6FormModal
          visible={showProcedure6Form}
          onClose={() => setShowProcedure6Form(false)}
          onSubmit={createProcedure6}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: BRAND.screenBg },
  scrollContent: { flexGrow: 1 },
  content: { paddingHorizontal: SPACING.lg, paddingTop: 0, gap: SPACING.sm },
  expiryField: { gap: SPACING.xs, marginTop: SPACING.sm },
  expiryLabel: { color: COLORS.text, fontSize: 14, textAlign: 'right' },
  uploadBtn: {
    marginTop: SPACING.sm,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.text,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadText: { fontSize: FONT_SIZE.md, color: COLORS.textInverse },
});

const desktopStyles = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 560, alignSelf: 'center', width: '100%', gap: 14 },
  list: { gap: 10 },
  expiryField: { gap: 6, marginTop: 4 },
  expiryLabel: { fontSize: 13 },
  uploadBtn: {
    marginTop: 4,
    height: 36,
    borderRadius: 7,
    backgroundColor: DESKTOP_COLORS.brand,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadText: { fontSize: 13, color: '#FFFFFF' },
});
