// תיקיית מסמכים של נהג
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BrandLoader } from '../../components/ui/BrandLoader';
import { showAlert } from '../../lib/platformAlert';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingState, EmptyState, ErrorState } from '../../components/ui';
import { useDatePrompt } from '../../components/ui/DateField';
import { addMonthsIso, inspectionValidityMonths } from '../../lib/tachograph';
import { scanDocumentDates } from '../../lib/documentDateScan';
import { suggestedDates } from '../../lib/documentDates';
import { DocumentFileRow } from '../../components/documents/DocumentFileRow';
import { Procedure6FormModal } from '../../components/documents/Procedure6FormModal';
import { TrafficReportFormModal } from '../../components/documents/TrafficReportFormModal';
import { TRAFFIC_REPORTS_CATEGORY, TRAFFIC_REPORT_STATUSES, trafficReportStatusLabel, trafficReportSummary, trafficReportUpload, type TrafficReport } from '../../lib/trafficReports';
import { formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { DocumentRow, getVehicle, type Vehicle } from '../../lib/adminApi';
import { vehicleName } from '../../lib/attention';
import { formatPlate } from '../../lib/plate';
import { listDocuments, readPickedFileBase64, storedFolderTitle, updateDocumentDetails, uploadDocument, type PickedFile } from '../../lib/documents';
import { createProcedure6Report, Procedure6FormValues } from '../../lib/procedure6Report';
import { chooseDocumentSource, confirmDeleteDocument, documentDisplayName, documentViewerMode, downloadDocumentWithAlert, getDocumentViewUrl, pickDocumentSource, type DocumentSource } from '../../lib/documentActions';
import { RootStackParamList } from '../../navigation/types';
import { DK, DriverPage, EmptyPanel, ErrorPanel, HeroTitle, LoadingPanel, PrimaryAction, Reveal } from '../../components/driverKit';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DText, HoverPressable } from '../../components/desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_BRAND_SHADOW, webOnly } from '../../components/desktop/desktopTheme';
import { t } from '../../lib/i18n';
import { errorMessage } from '../../lib/requestError';

/**
 * A generic "one category, one screen" document list — reused by every
 * row on the driver card (A5 menu): license scans, notes, procedure 6,
 * hazmat certs, etc. all follow the same shape (upload → list → view/
 * delete), so one screen serves all of them instead of duplicating it
 * eleven times.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DocumentCategory'>;

type HeroIcon = keyof typeof Ionicons.glyphMap;

// אייקון לכל תיקייה
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
  license_annex: 'document-attach-outline',
};

// המסך: מסמכים, העלאה ותוקף
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
  // Traffic reports: only an admin adds them, through the report form.
  const isTrafficReport = category === TRAFFIC_REPORTS_CATEGORY;
  const canManage = profile?.role !== 'driver';
  const [showReportForm, setShowReportForm] = useState(false);
  const usesForm = isProcedure6 || isTrafficReport;
  const openForm = () => (isProcedure6 ? setShowProcedure6Form(true) : setShowReportForm(true));

  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const expiryPrompt = useDatePrompt(t('documents.documentExpiry'));
  const [error, setError] = useState<string | null>(null);
  // תיקייה של רכב: מספר הרכב והדגם, כדי שיהיה ברור באיזה רכב נמצאים
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  useEffect(() => {
    if (ownerType !== 'vehicle') return;
    getVehicle(ownerId).then(setVehicle, () => {});
  }, [ownerType, ownerId]);
  const vehicleLine = vehicle ? `${formatPlate(vehicle.plate_number)} · ${vehicleName(vehicle)}` : null;
  const loadRequest = useRef(0);
  // The folder on screen: reloading it (a return, an upload) keeps the list
  // up and refreshes it quietly instead of flashing the loader.
  const shownFolder = useRef<string | null>(null);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    const folder = `${ownerType}/${ownerId}/${category}`;
    const quiet = shownFolder.current === folder;
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const rows = await listDocuments(ownerType, ownerId, category);
      if (requestId === loadRequest.current) {
        setDocs(rows);
        shownFolder.current = folder;
      }
    } catch (err: any) {
      if (requestId === loadRequest.current && !quiet) setError(errorMessage(err, t('documents.loadFailedShort')));
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

    // File first, then (for dated folders) its expiry date, then the upload.
    chooseDocumentSource(title, async (source: DocumentSource) => {
      const file = await pickDocumentSource(source);
      if (!file) return;
      // Inspection folders: ask the inspection date, then offer the expiry a year later, still editable.
      // Both start from the dates read from the file.
      const months = requiresExpiry ? inspectionValidityMonths(category) : null;
      let read: { inspected: string | null; expiry: string | null } = { inspected: null, expiry: null };
      if (requiresExpiry) {
        setUploading(true);
        read = suggestedDates(await scanDocumentDates(file), months);
        setUploading(false);
      }
      const inspected = months ? await expiryPrompt.ask({ title: t('documents.inspectionDate'), value: read.inspected }) : null;
      if (months && !inspected) return;
      const expiryDate = requiresExpiry ? await expiryPrompt.ask({ value: inspected && months ? addMonthsIso(inspected, months) : read.expiry }) : null;
      if (requiresExpiry && !expiryDate) return;
      setUploading(true);
      try {
        await uploadDocument({ companyId, ownerType, ownerId, category, title: storedFolderTitle(category, title), file, expiryDate });
        await load();
      } catch (err: any) {
        showAlert(t('common.uploadFailedShort'), errorMessage(err, t('common.tryAgain')));
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

  const createTrafficReport = async (report: TrafficReport, file: PickedFile) => {
    if (!companyId) return;
    await uploadDocument({ companyId, ownerType, ownerId, category, title: storedFolderTitle(category, title), file, ...trafficReportUpload(report) });
    await load();
    setShowReportForm(false);
  };

  // A report's details and, for an admin, a button that changes its status.
  const reportRowProps = (doc: DocumentRow) => {
    const summary = isTrafficReport ? trafficReportSummary(doc, formatDate) : null;
    if (!summary) return {};
    return {
      ...summary,
      extraAction: canManage && doc.details?.status ? {
        icon: 'swap-horizontal-outline' as const,
        label: t('trafficReport.changeStatus'),
        onPress: () => showAlert(t('trafficReport.changeStatus'), undefined, [
          ...TRAFFIC_REPORT_STATUSES.filter((s) => s !== doc.details?.status).map((s) => ({
            text: trafficReportStatusLabel(s),
            onPress: () => void updateDocumentDetails(doc, { status: s }).then(load, (err) => showAlert(t('trafficReport.statusSaveFailed'), errorMessage(err, t('common.tryAgain')))),
          })),
          { text: t('common.cancel'), style: 'cancel' as const },
        ]),
      } : undefined,
    };
  };

  const reportForm = isTrafficReport && companyId ? (
    <TrafficReportFormModal visible={showReportForm} companyId={companyId} onClose={() => setShowReportForm(false)} onSubmit={createTrafficReport} />
  ) : undefined;

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
          title={isProcedure6 ? t('procedure6.noneYet') : t('documents.noneYetShort')}
          hint={
            isProcedure6
              ? canCreateProcedure6
                ? t('procedure6.addToCreateFirst')
                : t('procedure6.managerNoneYet')
              : t('documents.driverNoneInCategory')
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
              onDelete={allowDelete && (!isTrafficReport || canManage) ? (item) => confirmDeleteDocument(item, load) : undefined}
              {...reportRowProps(doc)}
            />
          ))}
        </View>
      )}

      {(isTrafficReport ? canManage : !isProcedure6 || canCreateProcedure6) && (
        <>
          {expiryPrompt.element}
          <HoverPressable
            style={desktopStyles.uploadBtn}
            hoverStyle={{ backgroundColor: DESKTOP_COLORS.brandHover }}
            onPress={() => (usesForm ? openForm() : addDocument())}
            disabled={uploading}
          >
            {uploading ? (
              <BrandLoader color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name={usesForm ? 'add-circle-outline' : 'cloud-upload-outline'} size={15} color="#FFFFFF" />
                <DText weight="semiBold" style={desktopStyles.uploadText}>
                  {isProcedure6 ? t('procedure6.addReport') : isTrafficReport ? t('trafficReport.add') : t('documents.uploadDocument')}
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
        <DesktopShell active="AdminHome" breadcrumbs={ownerType === 'vehicle' ? [t('nav.management'), t('common.vehicles'), ...(vehicleLine ? [vehicleLine] : []), title] : [t('nav.management'), t('common.drivers'), title]}>
          {desktopBody}
        </DesktopShell>
        {isProcedure6 && (
          <Procedure6FormModal visible={showProcedure6Form} onClose={() => setShowProcedure6Form(false)} onSubmit={createProcedure6} />
        )}
        {reportForm}
      </>
    );
  }

  const canAdd = isTrafficReport ? canManage : !isProcedure6 || canCreateProcedure6;
  const icon = CATEGORY_HERO_ICONS[category] ?? 'document-text-outline';
  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={
        <HeroTitle
          title={title}
          subtitle={[vehicleLine, loading ? t('documents.loadingEllipsis') : docs.length ? t('documents.inFolder', { length: docs.length, v1: docs.length === 1 ? t('documents.document') : t('common.documents') }) : t('documents.folderEmptyShort')].filter(Boolean).join(' · ')}
          onBack={() => navigation.goBack()}
          right={<View style={styles.heroIcon}><Ionicons name={icon} size={22} color={DK.onNight} /></View>}
        />
      }
      footer={
        canAdd && !loading && !error ? (
          <PrimaryAction
            label={isProcedure6 ? t('procedure6.newReport') : isTrafficReport ? t('trafficReport.add') : t('documents.addDocument')}
            icon={usesForm ? 'add-circle-outline' : 'cloud-upload-outline'}
            loading={uploading}
            onPress={() => (usesForm ? openForm() : void addDocument())}
          />
        ) : undefined
      }
      overlay={
        isProcedure6 ? <Procedure6FormModal visible={showProcedure6Form} onClose={() => setShowProcedure6Form(false)} onSubmit={createProcedure6} /> : reportForm
      }
    >
      {loading ? (
        <LoadingPanel />
      ) : error ? (
        <ErrorPanel message={t('documents.loadFailedShort')} hint={error} onRetry={load} />
      ) : (
        <>
          {docs.length === 0 ? (
            <Reveal>
              <EmptyPanel
                icon={icon}
                title={isProcedure6 ? t('procedure6.noneYet') : t('documents.noneYetShort')}
                body={
                  isProcedure6
                    ? canCreateProcedure6
                      ? t('procedure6.newReportHint')
                      : t('procedure6.managerNoneInFolder')
                    : t('documents.captureFirstHint')
                }
              />
            </Reveal>
          ) : (
            docs.map((doc, index) => (
              <Reveal key={doc.id} index={Math.min(index, 8)}>
                <DocumentFileRow
                  doc={doc}
                  variant="card"
                  showDate
                  showExpiry={requiresExpiry}
                  onOpen={openDocument}
                  onDownload={downloadDocumentWithAlert}
                  onDelete={allowDelete && (!isTrafficReport || canManage) ? (item) => confirmDeleteDocument(item, load) : undefined}
                  {...reportRowProps(doc)}
                />
              </Reveal>
            ))
          )}
          {expiryPrompt.element}
        </>
      )}
    </DriverPage>
  );
}

// עיצוב בטלפון
const styles = StyleSheet.create({
  heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: DK.glass, borderWidth: 1, borderColor: DK.glassBorder, alignItems: 'center', justifyContent: 'center' },
});

// עיצוב במחשב
const desktopStyles = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 560, alignSelf: 'center', width: '100%', gap: 14 },
  list: { gap: 10 },
  uploadBtn: {
    marginTop: 4,
    height: 36,
    borderRadius: 7,
    backgroundColor: DESKTOP_COLORS.brand,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...webOnly({ boxShadow: DESKTOP_BRAND_SHADOW }),
  },
  uploadText: { fontSize: 13, color: '#FFFFFF' },
});
