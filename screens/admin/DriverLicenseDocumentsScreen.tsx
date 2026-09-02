import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Modal,
  Animated,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingState, ErrorState } from '../../components/ui';
import { DateField } from '../../components/ui/DateField';
import { DC_COLORS, DC_SPACING, DC_TYPO } from '../../components/driverCard/driverCardTheme';
import { useCompany } from '../../lib/CompanyContext';
import { getDriver, updateDriver, DriverRow, DocumentRow } from '../../lib/adminApi';
import {
  listDocuments,
  uploadDocument,
  deleteDocument,
  getDocumentUrl,
  downloadDocument,
  pickImage,
  captureImage,
  pickFile,
} from '../../lib/documents';
import { RootStackParamList } from '../../navigation/types';

/**
 * Dedicated license-photos screen — replaces the generic DocumentCategory
 * list for the "מסמכי רישיון נהיגה" row, per the approved iOS mockup
 * (front/back tiles + expiry + status, distinct from the flat file list
 * every other document category still uses).
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DriverLicenseDocuments'>;

type Side = 'front' | 'back';
const SIDE_TITLE: Record<Side, string> = { front: 'צד קדמי', back: 'צד אחורי' };
const SHEET_ANIM_MS = 280;

export default function DriverLicenseDocumentsScreen({ route, navigation }: Props) {
  const { driverId } = route.params;
  const { companyId } = useCompany();
  const insets = useSafeAreaInsets();

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
  const [failedSide, setFailedSide] = useState<Side | null>(null);

  const [sheetFor, setSheetFor] = useState<Side | null>(null);
  const [viewerSide, setViewerSide] = useState<Side | null>(null);

  const sheetAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [driverRow, allDocs] = await Promise.all([
        getDriver(driverId),
        listDocuments('driver', driverId, 'license_docs'),
      ]);
      const front = allDocs.find((d) => d.title === SIDE_TITLE.front) ?? null;
      const back = allDocs.find((d) => d.title === SIDE_TITLE.back) ?? null;

      const [frontUrl, backUrl] = await Promise.all([
        front ? getDocumentUrl(front) : Promise.resolve(null),
        back ? getDocumentUrl(back) : Promise.resolve(null),
      ]);
      if (requestId !== loadRequest.current) return;
      setDriver(driverRow);
      setDocs({ front, back });
      setImageUrl({ front: frontUrl, back: backUrl });
    } catch (err: any) {
      if (requestId === loadRequest.current) setLoadError(err?.message ?? 'טעינת המסמכים נכשלה');
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
  const status = isVerified ? 'מאומת' : 'ממתין להשלמה';

  const footerText = editMode
    ? 'לחיצה על ריבוע מחליפה את הצילום. אפשר לעדכן את תאריך התוקף בשדה שלמעלה.'
    : bothSides
    ? 'המסמכים נשמרים באזור פרטי ומוצגים בקישור זמני. לחיצה על ריבוע פותחת את הצילום בגדול.'
    : 'לחיצה על הריבוע הריק מעלה צילום של הצד החסר.';

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

  const pickAndUpload = async (source: 'camera' | 'gallery' | 'file') => {
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
      const file = source === 'camera' ? await captureImage() : source === 'gallery' ? await pickImage() : await pickFile();
      if (!file) {
        setUploadingSide(null);
        return;
      }

      const existing = docs[side];
      const uploaded = await uploadDocument({
        companyId,
        ownerType: 'driver',
        ownerId: driverId,
        category: 'license_docs',
        title: SIDE_TITLE[side],
        file,
      });
      if (existing) await deleteDocument(existing);

      const url = await getDocumentUrl(uploaded);
      setDocs((prev) => ({ ...prev, [side]: uploaded }));
      setImageUrl((prev) => ({ ...prev, [side]: url }));
    } catch (err: any) {
      setFailedSide(side);
      Alert.alert('ההעלאה נכשלה', err?.message ?? 'נסה שוב');
    } finally {
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
      Alert.alert('מחיקה נכשלה', 'נסה שוב');
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
      setToast('הפרטים נשמרו');
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 1800);
    } catch (err: any) {
      Alert.alert('השמירה נכשלה', err?.message ?? 'נסה שוב');
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
      Alert.alert('ההורדה נכשלה', err?.message ?? 'נסה שוב');
    }
  };

  const topBuffer = insets.top + 8;

  if (loading) {
    return (
      <View style={[styles.screen, styles.centerFill]}>
        <AdminGradientBackground />
        <LoadingState />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.screen}>
        <AdminGradientBackground />
        <ErrorState message={loadError} onRetry={load} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <AdminGradientBackground />
      <View style={[styles.navBar, { height: 44 + topBuffer, paddingTop: topBuffer }]}>
        <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(242,242,247,0.9)' }]} />
        <View style={styles.navBorder} />
        <View style={styles.navContent}>
          <Pressable onPress={() => navigation.goBack()} style={styles.navBack} hitSlop={8}>
            <Feather name="chevron-right" size={19} color={DC_COLORS.blueLight} />
            <Text style={[DC_TYPO.navBackLink, { color: DC_COLORS.blueLight }]}>חזרה</Text>
          </Pressable>
          <Text style={[DC_TYPO.navTitle, styles.navTitle]} numberOfLines={1}>
            מסמכי רישיון נהיגה
          </Text>
          <Pressable onPress={toggleEdit} style={styles.navEdit} hitSlop={8}>
            <Text style={[DC_TYPO.navBackLink, { color: DC_COLORS.blueLight }]}>{editMode ? 'סיום' : 'עריכה'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.grid}>
          <SideTile
            label="צד קדמי"
            fileName={docs.front?.file_name ?? null}
            url={imageUrl.front}
            editMode={editMode}
            uploading={uploadingSide === 'front'}
            failed={failedSide === 'front'}
            onPress={() => handleTilePress('front')}
            onRemove={() => removeSide('front')}
          />
          <SideTile
            label="צד אחורי"
            fileName={docs.back?.file_name ?? null}
            url={imageUrl.back}
            editMode={editMode}
            uploading={uploadingSide === 'back'}
            failed={failedSide === 'back'}
            onPress={() => handleTilePress('back')}
            onRemove={() => removeSide('back')}
          />
        </View>

        <View style={styles.detailsCard}>
          <View style={styles.detailsRow}>
            <Text style={[DC_TYPO.rowLabel, styles.detailsLabel]}>תוקף הרישיון</Text>
            {editMode ? (
              <View style={styles.expiryField}>
                <DateField value={expiryDraft} onChange={setExpiryDraft} placeholder="לא הוזן" />
              </View>
            ) : (
              <Text style={[DC_TYPO.rowValue, styles.detailsValue]}>
                {driver?.license_expiry ? formatDdMmYyyy(driver.license_expiry) : 'לא הוזן'}
              </Text>
            )}
          </View>
          <View style={styles.detailsSeparator} />
          <View style={styles.detailsRow}>
            <Text style={[DC_TYPO.rowLabel, styles.detailsLabel]}>סטטוס</Text>
            <Text style={[DC_TYPO.badgeWarn, { color: isVerified ? DC_COLORS.green : DC_COLORS.orange }]}>
              {status}
            </Text>
          </View>
        </View>

        <Text style={[DC_TYPO.footer, styles.footer]}>{footerText}</Text>
      </View>

      {editMode && (
        <View style={[styles.saveBar, { paddingBottom: insets.bottom + 12 }]}>
          <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
          <Pressable style={styles.saveButton} onPress={save} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>שמירת שינויים</Text>
            )}
          </Pressable>
        </View>
      )}

      {!!toast && (
        <View style={[styles.toast, { bottom: insets.bottom + 24 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Modal visible={!!sheetFor} transparent animationType="none" onRequestClose={closeSheet}>
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
                <Text style={styles.sheetTitle}>{sheetFor ? `צילום ${SIDE_TITLE[sheetFor]}` : ''}</Text>
                <View style={styles.sheetDivider} />
                <SheetAction label="צילום מסמך" onPress={() => pickAndUpload('camera')} />
                <View style={styles.sheetDivider} />
                <SheetAction label="בחירה מהתמונות" onPress={() => pickAndUpload('gallery')} />
                <View style={styles.sheetDivider} />
                <SheetAction label="בחירה מקבצים" onPress={() => pickAndUpload('file')} />
              </View>
              <View style={styles.sheetCard}>
                <SheetAction label="ביטול" onPress={closeSheet} bold />
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal visible={!!viewerSide} animationType="fade" onRequestClose={() => setViewerSide(null)}>
        <View style={[styles.viewer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.viewerHeader}>
            <Pressable onPress={() => setViewerSide(null)} hitSlop={8}>
              <Text style={styles.viewerAction}>סגירה</Text>
            </Pressable>
            <Text style={styles.viewerTitle} numberOfLines={1}>
              {viewerSide ? `${SIDE_TITLE[viewerSide]} · ${docs[viewerSide]?.file_name ?? ''}` : ''}
            </Text>
          </View>
          {viewerSide && imageUrl[viewerSide] ? (
            <Image source={{ uri: imageUrl[viewerSide]! }} style={styles.viewerImage} resizeMode="contain" />
          ) : null}
          <View style={styles.viewerActions}>
            <Pressable style={styles.viewerActionBtn} onPress={() => viewerSide && download(viewerSide)}>
              <Feather name="download" size={18} color="#FFFFFF" />
              <Text style={styles.viewerActionText}>הורדה</Text>
            </Pressable>
            <Pressable
              style={styles.viewerActionBtn}
              onPress={() => {
                if (!viewerSide) return;
                const side = viewerSide;
                setViewerSide(null);
                openSheet(side);
              }}
            >
              <Feather name="refresh-cw" size={18} color="#FFFFFF" />
              <Text style={styles.viewerActionText}>החלפה</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SideTile({
  label,
  fileName,
  url,
  editMode,
  uploading,
  failed,
  onPress,
  onRemove,
}: {
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
        style={[styles.tile, !filled && styles.tileEmpty]}
      >
        {filled ? (
          <>
            <Image source={{ uri: url! }} style={styles.tileImage} resizeMode="cover" />
            {editMode && (
              <>
                <View style={styles.tileEditOverlay}>
                  <Feather name="repeat" size={20} color="#FFFFFF" />
                  <Text style={styles.tileEditText}>החלפת תמונה</Text>
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
          <ActivityIndicator color={DC_COLORS.blueLight} />
        ) : (
          <>
            <Feather name="camera" size={27} color={DC_COLORS.labelTertiary} />
            <Text style={styles.tileEmptyText}>{failed ? 'ההעלאה נכשלה, נסה שוב' : 'העלאת צילום'}</Text>
          </>
        )}
        {uploading && (
          <View style={styles.tileUploadingOverlay}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        )}
      </Pressable>
      <View style={styles.tileCaption}>
        <Text style={[DC_TYPO.badge, styles.tileCaptionLabel]}>{label}</Text>
        <Text style={[DC_TYPO.badge, styles.tileCaptionValue]} numberOfLines={1}>
          {fileName ?? 'לא הועלה'}
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
  screen: { flex: 1, backgroundColor: DC_COLORS.bg },
  centerFill: { alignItems: 'center', justifyContent: 'center' },
  navBar: { width: '100%' },
  navBorder: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60,60,67,0.2)',
  },
  navContent: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  navBack: { flexDirection: 'row-reverse', alignItems: 'center', minWidth: 70 },
  navTitle: { flex: 1, textAlign: 'center', color: DC_COLORS.label },
  navEdit: { minWidth: 50, alignItems: 'flex-start' },

  body: { flex: 1, padding: DC_SPACING.screenPaddingH },
  grid: { flexDirection: 'row-reverse', gap: 12 },
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
  tileEmptyText: { fontFamily: DC_TYPO.badge.fontFamily, fontSize: 13, color: DC_COLORS.labelTertiary },
  tileImage: { width: '100%', height: '100%' },
  tileEditOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileEditText: { color: '#FFFFFF', fontFamily: DC_TYPO.badgeWarn.fontFamily, fontSize: 13 },
  tileRemove: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCaption: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingHorizontal: 2 },
  tileCaptionLabel: { color: DC_COLORS.labelSecondary },
  tileCaptionValue: { color: DC_COLORS.labelTertiary, flexShrink: 1, textAlign: 'left' },

  detailsCard: {
    marginTop: 16,
    backgroundColor: DC_COLORS.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  detailsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  detailsLabel: { color: DC_COLORS.label },
  detailsValue: { color: DC_COLORS.labelSecondary },
  detailsSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: DC_COLORS.separator },
  expiryField: { width: 160 },

  footer: { color: DC_COLORS.labelTertiary, textAlign: 'right', lineHeight: 18, marginTop: 16 },

  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: DC_SPACING.screenPaddingH,
  },
  saveButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: DC_COLORS.blueLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: { color: '#FFFFFF', fontFamily: DC_TYPO.rowValue.fontFamily, fontSize: 16 },

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
  sheetContainer: { paddingHorizontal: 8, gap: 8 },
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
  viewerTitle: { color: '#FFFFFF', fontFamily: DC_TYPO.navTitle.fontFamily, fontSize: 14, flex: 1, textAlign: 'left' },
  viewerImage: { flex: 1, marginVertical: 16, borderRadius: 14 },
  viewerActions: { flexDirection: 'row-reverse', justifyContent: 'center', gap: 32, paddingTop: 8 },
  viewerActionBtn: { alignItems: 'center', gap: 4 },
  viewerActionText: { color: '#FFFFFF', fontFamily: DC_TYPO.badge.fontFamily, fontSize: 12.5 },
});
