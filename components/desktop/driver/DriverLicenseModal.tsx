import React, { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle } from 'react-native';
import { BrandLoader } from '../../ui/BrandLoader';
import { Ionicons } from '@expo/vector-icons';
import type { DocumentRow, DriverRow } from '../../../lib/adminApi';
import type { LicenseUpdateRequest } from '../../../lib/licenseUpdate';
import { deleteDocument, getDocumentUrl, listDocuments, uploadDocument } from '../../../lib/documents';
import { chooseDocumentSource, confirmDeleteDocument, downloadDocumentWithAlert, openDocumentExternally, pickDocumentSource } from '../../../lib/documentActions';
import { scanLicenseImage } from '../../../lib/documentScanner';
import { showAlert } from '../../../lib/platformAlert';
import { expiryState, formatDate } from '../../../lib/theme';
import { DesktopModal } from '../DesktopModal';
import { DText, HoverPressable } from '../primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../desktopTheme';
import { EditableDateField, EXPIRY_TONE_MAP, recordStyles, STATE_LABEL } from '../record/RecordKit';

type Side = 'front' | 'back';
const SIDES: Side[] = ['front', 'back'];
/** The document titles the license photos are stored under — shared with DriverLicenseDocumentsScreen. */
export const LICENSE_SIDE_TITLE: Record<Side, string> = { front: 'צד קדמי', back: 'צד אחורי' };

/**
 * Desktop "מסמכי רישיון נהיגה" folder as a centered modal, replacing the
 * separate license page on desktop: the front/back photo slots (upload,
 * scan-for-expiry, replace, download, delete), the license expiry, and a
 * pending license-update request from the driver with approve/reject.
 * Same data and rules as DriverLicenseDocumentsScreen.
 */
export function DriverLicenseModal({
  visible,
  onClose,
  companyId,
  driverId,
  driver,
  pendingRequest,
  reviewing,
  onReview,
  onSaveExpiry,
  onPhotosChanged,
}: {
  visible: boolean;
  onClose: () => void;
  companyId: string;
  driverId: string;
  driver: DriverRow | null;
  pendingRequest: LicenseUpdateRequest | null;
  reviewing: boolean;
  onReview: (approve: boolean) => void;
  onSaveExpiry: (date: string | null) => Promise<string | null>;
  /** Called after a photo is added, replaced or removed, so the page can refresh its status. */
  onPhotosChanged: () => void;
}) {
  const [docs, setDocs] = useState<Record<Side, DocumentRow | null>>({ front: null, back: null });
  const [urls, setUrls] = useState<Record<Side, string | null>>({ front: null, back: null });
  const [busySide, setBusySide] = useState<Side | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const all = await listDocuments('driver', driverId, 'license_docs').catch(() => []);
    const front = all.find((d) => d.title === LICENSE_SIDE_TITLE.front) ?? null;
    const back = all.find((d) => d.title === LICENSE_SIDE_TITLE.back) ?? null;
    const [frontUrl, backUrl] = await Promise.all([
      front ? getDocumentUrl(front).catch(() => null) : Promise.resolve(null),
      back ? getDocumentUrl(back).catch(() => null) : Promise.resolve(null),
    ]);
    setDocs({ front, back });
    setUrls({ front: frontUrl, back: backUrl });
    setLoaded(true);
  }, [driverId]);

  useEffect(() => {
    if (!visible) return;
    setScanNote(null);
    load();
  }, [visible, load]);

  const upload = (side: Side, scan: boolean) => {
    chooseDocumentSource(LICENSE_SIDE_TITLE[side], async (source) => {
      setBusySide(side);
      setScanNote(null);
      try {
        const file = await pickDocumentSource(source);
        if (!file) return;
        const existing = docs[side];
        await uploadDocument({ companyId, ownerType: 'driver', ownerId: driverId, category: 'license_docs', title: LICENSE_SIDE_TITLE[side], file });
        if (existing) await deleteDocument(existing);
        await load();
        onPhotosChanged();
        if (scan) {
          const result = await scanLicenseImage(file);
          if (result.extractedDate) {
            const err = await onSaveExpiry(result.extractedDate);
            setScanNote(err ? `זוהה תוקף ${formatDate(result.extractedDate)}, אך השמירה נכשלה: ${err}` : `זוהה תוקף: ${formatDate(result.extractedDate)}`);
          } else {
            setScanNote('התמונה הועלתה, אך לא זוהה תאריך תוקף. אפשר להזין אותו ידנית למטה.');
          }
        }
      } catch (err: any) {
        showAlert('ההעלאה נכשלה', err?.message ?? 'נסה שוב');
      } finally {
        setBusySide(null);
      }
    });
  };

  const bothSides = !!docs.front && !!docs.back;
  const verified = bothSides && !!driver?.license_expiry;
  const expiry = driver?.license_expiry ?? null;
  const state = expiryState(expiry);
  const tone = DESKTOP_TONES[EXPIRY_TONE_MAP[state]];

  return (
    <DesktopModal visible={visible} title="מסמכי רישיון נהיגה" onClose={onClose} maxWidth={620}>
      <View style={styles.body}>
        {pendingRequest && (
          <View style={[styles.request, { backgroundColor: DESKTOP_TONES.warn.bg }]}>
            <View style={styles.requestText}>
              <DText weight="bold" style={[styles.requestTitle, { color: DESKTOP_TONES.warn.fg }]}>בקשת עדכון רישיון מהנהג</DText>
              <DText style={styles.requestLine}>
                מספר {pendingRequest.requested_license_number} · דרגות {pendingRequest.requested_license_classes} · תוקף עד {formatDate(pendingRequest.requested_license_expiry)}
              </DText>
            </View>
            <HoverPressable style={[styles.requestBtn, styles.approveBtn, reviewing && recordStyles.disabled]} hoverStyle={recordStyles.saveChipHover} pressStyle={recordStyles.pressDown} onPress={() => onReview(true)} disabled={reviewing}>
              <DText weight="bold" style={styles.approveText}>אישור</DText>
            </HoverPressable>
            <HoverPressable style={[styles.requestBtn, styles.rejectBtn, reviewing && recordStyles.disabled]} hoverStyle={recordStyles.rowHover} pressStyle={recordStyles.pressDown} onPress={() => onReview(false)} disabled={reviewing}>
              <DText weight="bold" style={styles.rejectText}>דחייה</DText>
            </HoverPressable>
          </View>
        )}

        <View style={styles.sides}>
          {SIDES.map((side) => {
            const doc = docs[side];
            const url = urls[side];
            const busy = busySide === side;
            return (
              <View key={side} style={styles.side}>
                <DText weight="semiBold" style={styles.sideLabel}>{LICENSE_SIDE_TITLE[side]}</DText>
                {!loaded ? (
                  <View style={styles.slot}><BrandLoader color={DESKTOP_COLORS.brand} /></View>
                ) : doc ? (
                  <HoverPressable style={styles.slot} hoverMotionStyle={styles.slotHoverMotion} onPress={() => openDocumentExternally(doc)} accessibilityLabel={`פתיחת ${LICENSE_SIDE_TITLE[side]} בגודל מלא`}>
                    {url && doc.mime_type?.startsWith('image/') ? (
                      <Image source={{ uri: url }} style={styles.slotImage as ImageStyle} resizeMode="cover" />
                    ) : (
                      <Ionicons name="document-text-outline" size={28} color={DESKTOP_COLORS.brand} />
                    )}
                    {busy && <View style={styles.slotBusy}><BrandLoader color={DESKTOP_COLORS.brand} /></View>}
                  </HoverPressable>
                ) : (
                  <HoverPressable style={[styles.slot, styles.slotEmpty]} hoverStyle={styles.slotEmptyHover} onPress={() => upload(side, false)} disabled={busy} accessibilityLabel={`העלאת ${LICENSE_SIDE_TITLE[side]}`}>
                    {busy ? <BrandLoader color={DESKTOP_COLORS.brand} /> : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={22} color={DESKTOP_COLORS.brand} />
                        <DText weight="semiBold" style={styles.slotEmptyText}>העלאת צילום</DText>
                      </>
                    )}
                  </HoverPressable>
                )}
                <View style={[styles.sideActions, !loaded && styles.hidden]}>
                  <SideAction icon="scan-outline" label={doc ? 'סריקה' : 'סריקה וזיהוי תוקף'} hint={doc ? 'החלפת הצילום וזיהוי תוקף אוטומטי' : undefined} onPress={() => upload(side, true)} disabled={busy} />
                  {doc && <SideAction icon="swap-horizontal-outline" label="החלפה" onPress={() => upload(side, false)} disabled={busy} />}
                  {doc && <SideAction icon="download-outline" label="הורדה" onPress={() => downloadDocumentWithAlert(doc)} />}
                  {doc && (
                    <SideAction
                      icon="trash-outline"
                      label="מחיקה"
                      danger
                      onPress={() => confirmDeleteDocument(doc, async () => { await load(); onPhotosChanged(); })}
                      disabled={busy}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {!!scanNote && <DText style={styles.scanNote}>{scanNote}</DText>}

        <View style={styles.details}>
          <EditableDateField
            label="תוקף הרישיון"
            value={expiry ? formatDate(expiry) : 'לא הוזן'}
            raw={expiry}
            onSave={onSaveExpiry}
          />
          <View style={[recordStyles.field, styles.statusField]}>
            <DText style={recordStyles.fieldGridLabel}>מצב</DText>
            <View style={styles.statusRow}>
              <View style={[recordStyles.dot, styles.statusDot, state !== 'missing' && { backgroundColor: tone.fg }]} />
              <DText weight="semiBold" style={[recordStyles.fieldGridValue, state !== 'missing' && { color: tone.fg }]}>
                {state === 'missing' ? 'לא הוזן תוקף' : STATE_LABEL[state]}
              </DText>
              <DText style={styles.statusSub}>{verified ? '· המסמכים מאומתים' : bothSides ? '' : '· חסר צילום'}</DText>
            </View>
          </View>
        </View>

        <DText style={styles.footnote}>המסמכים נשמרים באזור פרטי ומוצגים בקישור זמני. לחיצה על צילום פותחת אותו בגודל מלא.</DText>
      </View>
    </DesktopModal>
  );
}

function SideAction({
  icon,
  label,
  onPress,
  disabled,
  danger,
  hint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** A fuller description for screen readers when the visible label is short. */
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const color = danger ? DESKTOP_TONES.bad.fg : DESKTOP_COLORS.brand;
  return (
    <HoverPressable
      style={[styles.sideAction, disabled && recordStyles.disabled]}
      hoverStyle={danger ? recordStyles.deleteActionHover : recordStyles.rowHover}
      pressStyle={recordStyles.pressDown}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={hint ?? label}
    >
      <Ionicons name={icon} size={13} color={color} />
      <DText weight="semiBold" style={[styles.sideActionText, { color }]}>{label}</DText>
    </HoverPressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingVertical: 16, gap: 14 },
  request: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8 },
  requestText: { flex: 1, gap: 2 },
  requestTitle: { fontSize: 13 },
  requestLine: { fontSize: 12, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  requestBtn: { height: 30, paddingHorizontal: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'opacity 150ms ease, background-color 150ms ease, transform 120ms ease-out' }) },
  approveBtn: { backgroundColor: DESKTOP_COLORS.brand },
  approveText: { fontSize: 12.5, color: '#FFFFFF' },
  rejectBtn: { borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput, backgroundColor: DESKTOP_COLORS.surface },
  rejectText: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  sides: { flexDirection: 'row-reverse', gap: 14 },
  side: { flex: 1, gap: 8 },
  sideLabel: { fontSize: 12.5 },
  slot: {
    height: 150,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderSoft,
    backgroundColor: DESKTOP_COLORS.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...webOnly({ transition: 'transform 150ms ease, background-color 150ms ease' }),
  },
  slotHoverMotion: webOnly({ transform: 'translateY(-2px)' }),
  slotImage: { width: '100%', height: '100%' },
  slotBusy: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  slotEmpty: { borderStyle: 'dashed', borderColor: DESKTOP_COLORS.borderInput, gap: 6 },
  slotEmptyHover: { backgroundColor: DESKTOP_COLORS.brandFocusRing },
  slotEmptyText: { fontSize: 12.5, color: DESKTOP_COLORS.brand },
  sideActions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 4 },
  sideAction: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 7, borderRadius: 6, ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  sideActionText: { fontSize: 11.5 },
  hidden: { opacity: 0 },
  scanNote: { fontSize: 12, color: DESKTOP_COLORS.inkMuted },
  details: { flexDirection: 'row-reverse', gap: 16 },
  statusField: { flex: 1, width: 'auto' },
  statusRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  statusDot: { marginTop: 0 },
  statusSub: { fontSize: 12, color: DESKTOP_COLORS.inkFaint },
  footnote: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },
});
