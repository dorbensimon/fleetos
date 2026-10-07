import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Modal, Animated, Platform, Easing } from 'react-native';
import { BrandLoader } from '../../components/ui/BrandLoader';
import { showAlert } from '../../lib/platformAlert';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingState, ErrorState, useToast } from '../../components/ui';
import { DateField } from '../../components/ui/DateField';
import { DC_COLORS, DC_FONT, DC_TYPO } from '../../components/driverCard/driverCardTheme';
import { useCompany } from '../../lib/CompanyContext';
import { getDriver, updateDriver, DriverRow, DocumentRow } from '../../lib/adminApi';
import { listDocuments, uploadDocument, deleteDocument, getDocumentUrl, downloadDocument, pickImage, captureImage, pickFile } from '../../lib/documents';
import { scanLicenseImage } from '../../lib/documentScanner';
import { CONTENT_MAX_WIDTH } from '../../lib/theme';
import { RootStackParamList } from '../../navigation/types';
import { ActionRow, DK, DK_FONT, DKText, DriverPage, EditField, ErrorPanel, HeroButton, HeroTitle, InfoLine, KitSection, KitSheet, LoadingPanel, PrimaryAction, Reveal, STATUS, StatusChip, Surface, statusOfDate } from '../../components/driverKit';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DText, HoverPressable } from '../../components/desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, DESKTOP_BRAND_SHADOW, webOnly } from '../../components/desktop/desktopTheme';
import { t, textEnd } from '../../lib/i18n';
import { LICENSE_SIDE_STORED_TITLE } from '../../lib/licenseSides';
import { errorMessage } from '../../lib/requestError';

/**
 * Dedicated license-photos screen — replaces the generic DocumentCategory
 * list for the "מסמכי רישיון נהיגה" row, per the approved iOS mockup
 * (front/back tiles + expiry + status, distinct from the flat file list
 * every other document category still uses).
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverLicenseDocuments'>;

type Side = 'front' | 'back';
const SIDE_TITLE: Record<Side, string> = { get front() { return t('documents.frontSide'); }, get back() { return t('documents.backSide'); } };
const SHEET_ANIM_MS = 280;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

export default function DriverLicenseDocumentsScreen({ route, navigation }: Props) {
  const { driverId } = route.params;
  const { companyId, profile } = useCompany();
  const insets = useSafeAreaInsets();
  const isDriverSelf = profile?.role === 'driver' && profile.id === driverId;
  const isDesktop = useIsDesktop();

  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [docs, setDocs] = useState<Record<Side, DocumentRow | null>>({ front: null, back: null });
  const [imageUrl, setImageUrl] = useState<Record<Side, string | null>>({ front: null, back: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [expiryDraft, setExpiryDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [uploadingSide, setUploadingSide] = useState<Side | null>(null);
  const [processingSide, setProcessingSide] = useState<Side | null>(null);
  const [failedSide, setFailedSide] = useState<Side | null>(null);

  const [sheetFor, setSheetFor] = useState<Side | null>(null);
  const [viewerSide, setViewerSide] = useState<Side | null>(null);

  const sheetAnim = useRef(new Animated.Value(0)).current;
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRequest = useRef(0);
  // The driver whose photos are on screen: a reload refreshes them quietly.
  const shownDriverId = useRef<string | null>(null);


  const { showToast: showAppToast } = useToast();
  const showToast = useCallback((message: string, duration: number) => {
    if (!isDesktop) {
      showAppToast(message);
      return;
    }
    setToast(message);
    toastAnim.setValue(0);
    Animated.timing(toastAnim, { toValue: 1, duration: 220, easing: EASE_OUT, useNativeDriver: true }).start();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 160, easing: EASE_OUT, useNativeDriver: true }).start(() => setToast(null));
    }, duration);
  }, [isDesktop, showAppToast, toastAnim]);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    const quiet = shownDriverId.current === driverId;
    if (!quiet) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const [driverRow, allDocs] = await Promise.all([
        getDriver(driverId),
        listDocuments('driver', driverId, 'license_docs'),
      ]);
      const front = allDocs.find((d) => d.title === LICENSE_SIDE_STORED_TITLE.front) ?? null;
      const back = allDocs.find((d) => d.title === LICENSE_SIDE_STORED_TITLE.back) ?? null;

      const [frontUrl, backUrl] = await Promise.all([
        front ? getDocumentUrl(front) : Promise.resolve(null),
        back ? getDocumentUrl(back) : Promise.resolve(null),
      ]);
      if (requestId !== loadRequest.current) return;
      setDriver(driverRow);
      setDocs({ front, back });
      setImageUrl({ front: frontUrl, back: backUrl });
      shownDriverId.current = driverId;
    } catch (err: any) {
      if (requestId === loadRequest.current && !quiet) setLoadError(errorMessage(err, t('documents.loadFailedShort')));
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [driverId]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => { loadRequest.current += 1; };
    }, [load])
  );

  const bothSides = !!docs.front && !!docs.back;
  const isVerified = bothSides && !!driver?.license_expiry;
  const status = isVerified ? t('common.verified') : t('common.pendingCompletion');

  const footerText = editMode
    ? t('license.tapToReplace')
    : bothSides
    ? t('license.privateTapToOpen')
    : t('license.tapEmptyToUpload');

  const openSheet = (side: Side) => {
    setSheetFor(side);
    Animated.timing(sheetAnim, { toValue: 1, duration: SHEET_ANIM_MS, useNativeDriver: true }).start();
  };

  const closeSheet = () => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setSheetFor(null));
  };

  const handleTilePress = (side: Side) => {
    if (editMode) {
      openSheet(side);
      return;
    }
    if (docs[side]) {
      setViewerSide(side);
    } else {
      openSheet(side);
    }
  };

  const pickAndUpload = async (source: 'camera' | 'gallery' | 'file' | 'scan') => {
    const side = sheetFor;
    if (!side || !companyId) return;
    // Close the sheet's Modal synchronously (not via the animated closeSheet(),
    // which only clears it ~180ms later in an animation callback) — launching
    // the native camera/library/file picker while that Modal is still mounted
    // makes iOS's presentation layers collide and the screen appears to hang.
    sheetAnim.setValue(0);
    setSheetFor(null);
    setViewerSide(null);
    setUploadingSide(side);
    setFailedSide(null);
    try {
      // Give the Modal's native dismissal time to actually finish before
      // presenting another one on iOS — react state updating is not the
      // same as the UIViewController finishing its dismiss transition.
      if (Platform.OS === 'ios') await new Promise((resolve) => setTimeout(resolve, 400));
      const file =
        source === 'camera' || source === 'scan'
          ? await captureImage()
          : source === 'gallery'
          ? await pickImage()
          : await pickFile();
      if (!file) {
        setUploadingSide(null);
        return;
      }

      setProcessingSide(side);
      const existing = docs[side];
      const uploaded = await uploadDocument({
        companyId,
        ownerType: 'driver',
        ownerId: driverId,
        category: 'license_docs',
        title: LICENSE_SIDE_STORED_TITLE[side],
        file,
      });
      if (existing) await deleteDocument(existing);

      const url = await getDocumentUrl(uploaded);
      setDocs((prev) => ({ ...prev, [side]: uploaded }));
      setImageUrl((prev) => ({ ...prev, [side]: url }));

      if (source === 'scan') {
        const scan = await scanLicenseImage(file);
        if (scan.extractedDate) {
          await updateDriver(driverId, { license_expiry: scan.extractedDate });
          setDriver((prev) => (prev ? { ...prev, license_expiry: scan.extractedDate } : prev));
          setExpiryDraft(scan.extractedDate);
          showToast(t('license.detected', { v1: formatDdMmYyyy(scan.extractedDate) }), 2400);
        } else {
          showToast(t('license.uploadedNoDateManual'), 2400);
        }
      }
    } catch (err: any) {
      setFailedSide(side);
      showAlert(t('common.uploadFailedFem'), errorMessage(err, t('common.tryAgain')));
    } finally {
      setProcessingSide(null);
      setUploadingSide(null);
    }
  };

  const removeSide = async (side: Side) => {
    const doc = docs[side];
    if (!doc) return;
    try {
      await deleteDocument(doc);
      setDocs((prev) => ({ ...prev, [side]: null }));
      setImageUrl((prev) => ({ ...prev, [side]: null }));
    } catch {
      showAlert(t('common.deleteFailed'), t('common.tryAgain'));
    }
  };

  const toggleEdit = () => {
    if (editMode) {
      setEditMode(false);
      return;
    }
    setViewerSide(null);
    setExpiryDraft(driver?.license_expiry ?? null);
    setEditMode(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateDriver(driverId, { license_expiry: expiryDraft });
      setDriver((prev) => (prev ? { ...prev, license_expiry: expiryDraft } : prev));
      setEditMode(false);
      showToast(t('common.detailsSaved'), 1800);
    } catch (err: any) {
      showAlert(t('common.saveFailedF'), errorMessage(err, t('common.tryAgain')));
    } finally {
      setSaving(false);
    }
  };

  const download = async (side: Side) => {
    const doc = docs[side];
    if (!doc) return;
    try {
      await downloadDocument(doc);
    } catch (err: any) {
      showAlert(t('common.downloadFailed'), errorMessage(err, t('common.tryAgain')));
    }
  };

  const overlays = (
    <>
      {!!toast && (
        <Animated.View
          style={[
            styles.toast,
            {
              bottom: insets.bottom + 24,
              opacity: toastAnim,
              transform: [
                { translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
              ],
            },
          ]}
        >
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}

      {!isDesktop && (
        <KitSheet
          visible={!!sheetFor}
          onClose={() => setSheetFor(null)}
          icon="camera"
          title={sheetFor ? t('license.photoOfSide', { v1: SIDE_TITLE[sheetFor] }) : t('license.photo')}
          subtitle={t('license.scanHint')}
        >
          <Surface style={styles.kitSheetList}>
            <ActionRow icon="scan" label={t('license.scanWithDetect')} hint={t('license.scanRecommended')} onPress={() => pickAndUpload('scan')} />
            <ActionRow first={false} icon="camera-outline" label={t('license.photo')} onPress={() => pickAndUpload('camera')} />
            <ActionRow first={false} icon="images-outline" label={t('common.chooseFromPhotos')} onPress={() => pickAndUpload('gallery')} />
            <ActionRow first={false} icon="document-outline" label={t('common.chooseFromFiles')} onPress={() => pickAndUpload('file')} />
          </Surface>
        </KitSheet>
      )}
      <Modal visible={isDesktop && !!sheetFor} transparent animationType="none" onRequestClose={closeSheet}>
        <Pressable style={styles.sheetOverlay} onPress={closeSheet}>
          <Animated.View
            style={[
              styles.sheetContainer,
              { paddingBottom: insets.bottom + 12 },
              {
                transform: [
                  {
                    translateY: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }),
                  },
                ],
              },
            ]}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetCard}>
                <Text style={styles.sheetTitle}>{sheetFor ? t('license.photoV1', { v1: SIDE_TITLE[sheetFor] }) : ''}</Text>
                <View style={styles.sheetDivider} />
                <SheetAction label={t('common.photographDocument')} onPress={() => pickAndUpload('camera')} />
                <View style={styles.sheetDivider} />
                <SheetAction label={t('common.chooseFromPhotos')} onPress={() => pickAndUpload('gallery')} />
                <View style={styles.sheetDivider} />
                <SheetAction label={t('common.chooseFromFilesAlt')} onPress={() => pickAndUpload('file')} />
                <View style={styles.sheetDivider} />
                <SheetAction label={t('license.scanAutoDetect')} onPress={() => pickAndUpload('scan')} />
              </View>
              <View style={styles.sheetCard}>
                <SheetAction label={t('common.cancel')} onPress={closeSheet} bold />
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal visible={!!viewerSide} animationType="fade" onRequestClose={() => setViewerSide(null)}>
        <View style={[styles.viewer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.viewerHeader}>
            <Pressable onPress={() => setViewerSide(null)} hitSlop={8}>
              <Text style={styles.viewerAction}>{t('common.close')}</Text>
            </Pressable>
            <Text style={styles.viewerTitle} numberOfLines={1}>
              {viewerSide ? `${SIDE_TITLE[viewerSide]} · ${docs[viewerSide]?.file_name ?? ''}` : ''}
            </Text>
          </View>
          {viewerSide && imageUrl[viewerSide] ? (
            <Image source={{ uri: imageUrl[viewerSide]! }} accessibilityLabel={t('license.drivingLicenseSide', { v1: SIDE_TITLE[viewerSide] })} style={styles.viewerImage} resizeMode="contain" />
          ) : null}
          <View style={styles.viewerActions}>
            <Pressable
              style={({ pressed }) => [styles.viewerActionBtn, pressed && styles.viewerActionBtnPressed]}
              onPress={() => viewerSide && download(viewerSide)}
            >
              <Feather name="download" size={18} color="#FFFFFF" />
              <Text style={styles.viewerActionText}>{t('common.download')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.viewerActionBtn, pressed && styles.viewerActionBtnPressed]}
              onPress={() => {
                if (!viewerSide) return;
                const side = viewerSide;
                setViewerSide(null);
                openSheet(side);
              }}
            >
              <Feather name="refresh-cw" size={18} color="#FFFFFF" />
              <Text style={styles.viewerActionText}>{t('common.replace')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!processingSide} transparent animationType="fade">
        <View style={styles.processingOverlay}>
          <View style={[styles.processingCard, !isDesktop && styles.processingCardKit]}>
            <BrandLoader size="large" color={isDesktop ? DC_COLORS.blueLight : DK.accent} />
            <Text style={styles.processingTitle}>{t('common.processingImage')}</Text>
            <Text style={styles.processingSubtitle}>{t('common.pleaseWaitNoReselect')}</Text>
          </View>
        </View>
      </Modal>
    </>
  );

  const expiryStatus = statusOfDate(driver?.license_expiry);
  function phonePage(body: React.ReactNode) {
    return (
      <DriverPage
        insetTop={insets.top}
        insetBottom={insets.bottom}
        hero={
          <HeroTitle
            title={t('driver.drivingLicense')}
            subtitle={[isDriverSelf ? null : driver?.full_name, loading ? null : isVerified ? t('common.verified') : t('common.pendingCompletion')].filter(Boolean).join(' · ') || ' '}
            onBack={() => (editMode ? setEditMode(false) : navigation.goBack())}
            right={!loading && !loadError ? <HeroButton icon={editMode ? 'close' : 'create-outline'} label={editMode ? t('common.cancelEdit') : t('common.edit')} onPress={toggleEdit} /> : undefined}
          />
        }
        footer={editMode ? <PrimaryAction label={t('common.saveChangesAction')} icon="checkmark" onPress={save} loading={saving} /> : undefined}
        overlay={overlays}
      >
        {body}
      </DriverPage>
    );
  }

  if (loading) {
    if (isDesktop) {
      return (
        <DesktopShell active="AdminHome" breadcrumbs={[t('nav.management'), t('common.drivers'), t('license.documents')]}>
          <LoadingState />
        </DesktopShell>
      );
    }
    return phonePage(<LoadingPanel />);
  }

  if (loadError) {
    if (isDesktop) {
      return (
        <DesktopShell active="AdminHome" breadcrumbs={[t('nav.management'), t('common.drivers'), t('license.documents')]}>
          <ErrorState message={loadError} onRetry={load} />
        </DesktopShell>
      );
    }
    return phonePage(<ErrorPanel message={t('license.docsLoadFailed')} hint={loadError} onRetry={load} />);
  }

  const desktopTileGrid = (
    <View style={desktopStyles.grid}>
      <SideTile
        label={t('documents.frontSide')}
        fileName={docs.front?.file_name ?? null}
        url={imageUrl.front}
        editMode={editMode}
        uploading={uploadingSide === 'front'}
        failed={failedSide === 'front'}
        onPress={() => handleTilePress('front')}
        onRemove={() => removeSide('front')}
      />
      <SideTile
        label={t('documents.backSide')}
        fileName={docs.back?.file_name ?? null}
        url={imageUrl.back}
        editMode={editMode}
        uploading={uploadingSide === 'back'}
        failed={failedSide === 'back'}
        onPress={() => handleTilePress('back')}
        onRemove={() => removeSide('back')}
      />
    </View>
  );

  if (isDesktop) {
    return (
      <>
        <DesktopShell
          active={isDriverSelf ? 'DriverDocuments' : 'AdminHome'}
          breadcrumbs={isDriverSelf ? [t('nav.myDocuments'), t('license.documents')] : [t('nav.management'), t('common.drivers'), t('license.documents')]}
        >
          <View style={desktopStyles.wrap}>
            <HoverPressable style={desktopStyles.editButton} onPress={toggleEdit}>
              <DText weight="semiBold" style={desktopStyles.editButtonText}>{editMode ? t('common.finishEdit') : t('common.edit')}</DText>
            </HoverPressable>
            {desktopTileGrid}
            <View style={desktopStyles.card}>
              <View style={desktopStyles.row}>
                <DText weight="semiBold" style={desktopStyles.rowLabel}>{t('license.expiry')}</DText>
                {editMode ? (
                  <DateField value={expiryDraft} onChange={setExpiryDraft} placeholder={t('common.notEntered')} />
                ) : (
                  <DText style={desktopStyles.rowValue}>
                    {driver?.license_expiry ? formatDdMmYyyy(driver.license_expiry) : t('common.notEntered')}
                  </DText>
                )}
              </View>
              <View style={desktopStyles.rowLast}>
                <DText weight="semiBold" style={desktopStyles.rowLabel}>{t('common.status')}</DText>
                <DText weight="semiBold" style={{ color: isVerified ? DESKTOP_TONES.ok.fg : DESKTOP_TONES.warn.fg, fontSize: 12.5 }}>
                  {status}
                </DText>
              </View>
            </View>
            <DText style={desktopStyles.footer}>{footerText}</DText>
            {editMode && (
              <HoverPressable style={desktopStyles.saveButton} onPress={save} disabled={saving}>
                <DText weight="bold" style={[desktopStyles.saveButtonText, saving && { opacity: 0 }]}>{t('common.saveChangesShort')}</DText>
                {saving && <BrandLoader size="small" color="#FFFFFF" style={StyleSheet.absoluteFill} />}
              </HoverPressable>
            )}
          </View>
        </DesktopShell>
        {overlays}
      </>
    );
  }

  const tile = (side: Side) => (
    <SideTile
      phone
      label={SIDE_TITLE[side]}
      fileName={docs[side]?.file_name ?? null}
      url={imageUrl[side]}
      editMode={editMode}
      uploading={uploadingSide === side}
      failed={failedSide === side}
      onPress={() => handleTilePress(side)}
      onRemove={() => removeSide(side)}
    />
  );
  return phonePage(
    <>
      <Reveal index={0}>
        <Surface style={styles.kitTiles}>
          {tile('front')}
          {tile('back')}
        </Surface>
      </Reveal>
      <Reveal index={1}>
        <KitSection title={t('license.details')}>
          {editMode ? (
            <EditField first label={t('license.expiry')} editor={<DateField value={expiryDraft} onChange={setExpiryDraft} placeholder={t('common.notEntered')} />} />
          ) : (
            <InfoLine
              first
              icon="calendar"
              tint={expiryStatus === 'missing' ? DK.accent : STATUS[expiryStatus].fg}
              label={t('license.expiry')}
              value={driver?.license_expiry ? formatDdMmYyyy(driver.license_expiry) : null}
              trailing={driver?.license_expiry ? <StatusChip status={expiryStatus} /> : undefined}
            />
          )}
          <InfoLine
            icon={isVerified ? 'shield-checkmark' : 'hourglass'}
            tint={isVerified ? STATUS.ok.fg : STATUS.soon.fg}
            label={t('common.status')}
            value={isVerified ? t('license.verifiedBoth') : t('license.waitingFor', { v1: [!docs.front && t('documents.frontSide'), !docs.back && t('documents.backSide'), !driver?.license_expiry && t('common.validity')].filter(Boolean).join(', ') })}
          />
        </KitSection>
      </Reveal>
      <DKText variant="caption" color={DK.muted} style={styles.kitFooter}>
        {footerText}
      </DKText>
    </>
  );
}

function SideTile({
  phone = false,
  label,
  fileName,
  url,
  editMode,
  uploading,
  failed,
  onPress,
  onRemove,
}: {
  phone?: boolean;
  label: string;
  fileName: string | null;
  url: string | null;
  editMode: boolean;
  uploading: boolean;
  failed: boolean;
  onPress: () => void;
  onRemove: () => void;
}) {
  const filled = !!url;

  return (
    <View style={styles.tileWrap}>
      <Pressable
        onPress={onPress}
        disabled={uploading}
        style={({ pressed }) => [styles.tile, !filled && styles.tileEmpty, phone && styles.tileKit, phone && !filled && styles.tileEmptyKit, pressed && styles.tilePressed]}
        accessibilityRole="button"
        accessibilityLabel={filled ? `${label}, ${editMode ? t('license.replacePhoto') : t('license.showPhoto')}` : t('license.uploadPhotoLabel', { label })}
      >
        {filled ? (
          <>
            <Image source={{ uri: url! }} style={styles.tileImage} resizeMode="cover" />
            {editMode && (
              <>
                <View style={styles.tileEditOverlay}>
                  <Feather name="repeat" size={20} color="#FFFFFF" />
                  <Text style={styles.tileEditText}>{t('common.replaceImage')}</Text>
                </View>
                <Pressable
                  style={styles.tileRemove}
                  onPress={(e) => {
                    e.stopPropagation();
                    onRemove();
                  }}
                  hitSlop={8}
                >
                  <Feather name="x" size={14} color="#FFFFFF" />
                </Pressable>
              </>
            )}
          </>
        ) : uploading ? (
          <BrandLoader color={DC_COLORS.blueLight} />
        ) : (
          <>
            <Feather name="camera" size={27} color={phone ? DK.accent : DC_COLORS.labelTertiary} />
            <Text style={[styles.tileEmptyText, phone && styles.tileEmptyTextKit]}>{failed ? t('common.uploadFailedRetry') : t('license.uploadPhoto')}</Text>
          </>
        )}
        {uploading && (
          <View style={styles.tileUploadingOverlay}>
            <BrandLoader color="#FFFFFF" />
          </View>
        )}
      </Pressable>
      <View style={styles.tileCaption}>
        <Text style={[DC_TYPO.badge, styles.tileCaptionLabel, phone && styles.tileCaptionKit]}>{label}</Text>
        <Text style={[DC_TYPO.badge, styles.tileCaptionValue, phone && styles.tileCaptionValueKit]} numberOfLines={1}>
          {fileName ?? t('documents.notUploaded')}
        </Text>
      </View>
    </View>
  );
}

function SheetAction({ label, onPress, bold }: { label: string; onPress: () => void; bold?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.sheetAction, pressed && styles.sheetActionPressed]}
    >
      <Text style={[styles.sheetActionText, bold && styles.sheetActionTextBold]}>{label}</Text>
    </Pressable>
  );
}

function formatDdMmYyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const styles = StyleSheet.create({
  kitTiles: { flexDirection: 'row-reverse', gap: 12, padding: 14 },
  kitFooter: { textAlign: 'center', paddingHorizontal: 12 },
  kitSheetList: { overflow: 'hidden' },
  tileKit: { borderRadius: 20, backgroundColor: DK.surfaceSunk, shadowOpacity: 0, elevation: 0 },
  tileEmptyKit: { backgroundColor: DK.accentSoft, borderColor: 'rgba(47,91,255,0.35)' },
  tileEmptyTextKit: { color: DK.accent, fontFamily: DK_FONT.semibold, fontSize: 14 },
  tileCaptionKit: { color: DK.inkSoft, fontFamily: DK_FONT.semibold, fontSize: 13 },
  tileCaptionValueKit: { color: DK.muted, fontFamily: DK_FONT.medium, fontSize: 12 },
  processingCardKit: { borderRadius: 28 },
  processingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14, 30, 43, 0.42)',
  },
  processingCard: {
    minWidth: 220,
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  processingTitle: { color: DC_COLORS.label, fontSize: 16, fontFamily: DC_FONT.bold },
  processingSubtitle: { color: DC_COLORS.labelTertiary, fontSize: 12 },

  tileWrap: { flex: 1, gap: 6 },
  tile: {
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: DC_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  tileEmpty: {
    backgroundColor: '#FBFBFD',
    borderWidth: 1.7,
    borderStyle: 'dashed',
    borderColor: 'rgba(60,60,67,0.3)',
    gap: 8,
  },
  tilePressed: { opacity: 0.85 },
  tileEmptyText: { fontFamily: DC_TYPO.badge.fontFamily, fontSize: 13, color: DC_COLORS.labelTertiary },
  tileImage: { width: '100%', height: '100%' },
  tileEditOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileEditText: { color: '#FFFFFF', fontFamily: DC_TYPO.badgeWarn.fontFamily, fontSize: 13 },
  tileRemove: {
    position: 'absolute',
    top: 8,
    start: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileUploadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCaption: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingHorizontal: 2 },
  tileCaptionLabel: { color: DC_COLORS.labelSecondary },
  tileCaptionValue: { color: DC_COLORS.labelTertiary, flexShrink: 1, textAlign: textEnd() },




  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  toastText: { color: '#FFFFFF', fontFamily: DC_TYPO.rowLabel.fontFamily, fontSize: 14 },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'flex-end' },
  sheetContainer: { paddingHorizontal: 8, gap: 8, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  sheetCard: { backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 14, overflow: 'hidden' },
  sheetTitle: {
    textAlign: 'center',
    color: DC_COLORS.labelTertiary,
    fontFamily: DC_TYPO.badge.fontFamily,
    fontSize: 13,
    paddingVertical: 10,
  },
  sheetDivider: { height: StyleSheet.hairlineWidth, backgroundColor: DC_COLORS.separator },
  sheetAction: { height: 52, alignItems: 'center', justifyContent: 'center' },
  sheetActionPressed: { backgroundColor: 'rgba(0,0,0,0.04)' },
  sheetActionText: { color: DC_COLORS.blueLight, fontFamily: DC_TYPO.rowValue.fontFamily, fontSize: 17 },
  sheetActionTextBold: { fontFamily: DC_TYPO.navTitle.fontFamily },

  viewer: { flex: 1, backgroundColor: '#000000' },
  viewerHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  viewerAction: { color: DC_COLORS.blueLight, fontFamily: DC_TYPO.rowValue.fontFamily, fontSize: 16 },
  viewerTitle: { color: '#FFFFFF', fontFamily: DC_TYPO.navTitle.fontFamily, fontSize: 14, flex: 1, textAlign: textEnd() },
  viewerImage: { flex: 1, marginVertical: 16, borderRadius: 14 },
  viewerActions: { flexDirection: 'row-reverse', justifyContent: 'center', gap: 32, paddingTop: 8 },
  viewerActionBtn: { alignItems: 'center', gap: 4 },
  viewerActionBtnPressed: { opacity: 0.6 },
  viewerActionText: { color: '#FFFFFF', fontFamily: DC_TYPO.badge.fontFamily, fontSize: 12.5 },
});

const desktopStyles = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 460, alignSelf: 'center', width: '100%', gap: 16 },
  editButton: {
    alignSelf: 'flex-start',
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DESKTOP_COLORS.surface,
  },
  editButtonText: { fontSize: 12, color: DESKTOP_COLORS.brand },
  grid: { flexDirection: 'row-reverse', gap: 12 },
  card: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 46,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.borderSoft,
  },
  rowLast: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', height: 46 },
  rowLabel: { fontSize: 13 },
  rowValue: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  footer: { fontSize: 12, color: DESKTOP_COLORS.inkFaint, lineHeight: 18 },
  saveButton: {
    height: 36,
    borderRadius: 7,
    backgroundColor: DESKTOP_COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ boxShadow: DESKTOP_BRAND_SHADOW }),
  },
  saveButtonText: { fontSize: 13, color: '#FFFFFF' },
});
