// בדיקות קצין בטיחות בתיק רכב (מחשב)
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DesktopModal } from '../desktop/DesktopModal';
import { DLtrText, DText, HoverPressable, StatusPill } from '../desktop/primitives';
import { pageStyles } from '../desktop/record/RecordPage';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly, type DesktopTone } from '../desktop/desktopTheme';
import { dueState, dueText } from '../../lib/meetingPlan';
import { INSPECTION_STATE_META, formatIsoDay, inspectionRepeatLabel } from '../../lib/inspections';
import type { RootStackParamList } from '../../navigation/types';
import { useVehicleInspections } from './useVehicleInspections';
import { defectsText, SAFETY_FOLDER } from './VehicleInspectionsCard';
import type { DocumentRow } from '../../lib/adminApi';
import { documentDisplayName, documentViewerMode, getDocumentViewUrl } from '../../lib/documentActions';
import { formatDate } from '../../lib/theme';
import { t, dirIcon } from '../../lib/i18n';

export { SAFETY_FOLDER };

// צבע לכל מצב
const STATE_TONE: Record<string, DesktopTone> = { ok: 'ok', soon: 'warn', expired: 'bad', missing: 'neutral', info: 'neutral' };

// שורת תיקייה וחלון עם הבדיקה הבאה והיסטוריה
/**
 * "בדיקות בטיחות" in a vehicle's card on the desktop: one folder row among
 * the vehicle's documents, like the signed-documents folders, with the next
 * date (from the repeat interval in the settings), a new inspection and every
 * inspection done in a window, each with its date and document.
 */
export function VehicleInspectionsDesktopSection({
  companyId,
  vehicleId,
  archived,
  first,
  title = t('nav.safetyInspections'),
  documents,
}: {
  companyId: string;
  vehicleId: string;
  archived: boolean;
  first?: boolean;
  title?: string;
  /** Files uploaded to the "בדיקות קצין בטיחות" folder, listed with the inspections. */
  documents?: DocumentRow[];
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { plan, entries, repeatMonths, error, draft } = useVehicleInspections(companyId, vehicleId);
  const [openWindow, setOpenWindow] = useState(false);
  const files = documents ?? [];
  const reminders = repeatMonths > 0;

  const state = reminders && plan?.nextDue && !archived ? dueState(plan.nextDue) : null;
  const statusTone: DesktopTone | null = draft
    ? 'neutral'
    : state === 'late'
      ? 'bad'
      : state && state !== 'later'
        ? 'warn'
        : plan?.lastDefects
          ? 'bad'
          : null;
  const statusLabel = draft
    ? t('inspection.openDraft')
    : state && state !== 'later'
      ? dueText(plan!.nextDue!)
      : plan?.lastDefects
        ? t('vehicle.hasDefects')
        : null;
  const total = entries?.length ?? 0;
  const meta = [
    archived ? null : !reminders ? t('inspection.noReminderSet') : plan?.nextDue ? t('inspection.nextOn', { v1: formatIsoDay(plan.nextDue) }) : null,
    entries === null ? t('common.loadingEllipsis') : total === 0 ? t('inspection.noneForVehicle') : total === 1 ? t('inspection.oneInspection') : t('inspection.countLength', { length: total }),
  ].filter(Boolean).join(' · ');

  const openFile = async (doc: DocumentRow) => {
    const src = await getDocumentViewUrl(doc);
    if (!src) return;
    setOpenWindow(false);
    navigation.navigate('DocusealWebView', { mode: documentViewerMode(doc), title: documentDisplayName(doc), src });
  };

  const go = (inspectionId?: string) => {
    setOpenWindow(false);
    navigation.navigate('SafetyInspection', inspectionId ? { vehicleId, inspectionId } : { vehicleId });
  };

  return (
    <>
      <HoverPressable
        style={[styles.row, !first && styles.rowDivider]}
        hoverStyle={styles.rowHover}
        onPress={() => setOpenWindow(true)}
        accessibilityLabel={[title, meta, statusLabel].filter(Boolean).join(', ')}
      >
        <View style={[styles.rowIcon, total > 0 && styles.rowIconFilled]}>
          <Ionicons name="shield-checkmark-outline" size={16} color={total > 0 ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkMuted} />
        </View>
        <View style={styles.rowText}>
          <DText weight="semiBold" style={styles.rowTitle} numberOfLines={1}>{title}</DText>
          <DText style={styles.rowMeta} numberOfLines={1}>{meta}</DText>
        </View>
        {statusTone && statusLabel && <StatusPill tone={statusTone} label={statusLabel} />}
        <Ionicons name={dirIcon('chevron-back')} size={15} color={DESKTOP_COLORS.inkFaint} />
      </HoverPressable>

      <DesktopModal visible={openWindow} title={title} onClose={() => setOpenWindow(false)} maxWidth={560}>
        <View style={styles.body}>
          {!!error && <DText style={styles.error}>{error}</DText>}

          {!archived && (
            <View style={styles.next}>
              <View style={pageStyles.flex}>
                {reminders ? (
                  <>
                    <DText style={styles.label}>{plan?.firstInspection ? t('inspection.first') : t('inspection.next')}</DText>
                    <View style={styles.dueRow}>
                      <DLtrText weight="bold" style={[styles.dueDate, { color: state === 'late' ? DESKTOP_TONES.bad.fg : state && state !== 'later' ? DESKTOP_TONES.warn.fg : plan?.nextDue ? DESKTOP_COLORS.ink : DESKTOP_COLORS.inkFaint }]}>
                        {plan?.nextDue ? formatIsoDay(plan.nextDue) : t('inspection.noDateSet')}
                      </DLtrText>
                      {state && state !== 'later' && <StatusPill tone={state === 'late' ? 'bad' : 'warn'} label={dueText(plan!.nextDue!)} />}
                    </View>
                    <DText style={styles.muted}>{t('inspection.repeatLabel', { repeatMonths: inspectionRepeatLabel(repeatMonths) })}</DText>
                  </>
                ) : (
                  <View style={styles.dueRow}>
                    <Ionicons name="notifications-off-outline" size={18} color={DESKTOP_COLORS.inkMuted} />
                    <DText weight="semiBold" style={styles.noReminder}>{t('inspection.noReminderSet')}</DText>
                  </View>
                )}
              </View>
              <HoverPressable style={pageStyles.primaryBtn} hoverStyle={pageStyles.primaryBtnHover} pressStyle={pageStyles.pressDown} onPress={() => go(draft?.id)}>
                <Ionicons name={draft ? 'play-outline' : 'add'} size={16} color="#FFFFFF" />
                <DText weight="semiBold" style={pageStyles.primaryBtnText}>{draft ? t('inspection.continueStarted') : t('inspection.new')}</DText>
              </HoverPressable>
            </View>
          )}

          {!!plan?.lastDefects && (
            <View style={styles.defects}>
              <Ionicons name="warning-outline" size={16} color={DESKTOP_TONES.bad.fg} />
              <DText weight="semiBold" style={styles.defectsText}>{t('inspection.hasDefectsColon')} {defectsText(plan.lastDefects)} {t('inspection.inLast')}</DText>
            </View>
          )}

          <View>
            <DText weight="semiBold" style={styles.listTitle}>{t('inspection.previous')}</DText>
            <View style={[pageStyles.card, pageStyles.listCard]}>
              {entries === null ? (
                <DText style={[styles.muted, styles.empty]}>{t('common.loadingEllipsis')}</DText>
              ) : total === 0 && files.length === 0 ? (
                <DText style={[styles.muted, styles.empty]}>{t('inspection.noneForVehicle')}</DText>
              ) : (
                <>
                {entries.map(({ row, state: rowState }, index) => {
                  const rowMeta = INSPECTION_STATE_META[rowState];
                  const defects = row.defect_count > 0 && rowState !== 'draft' ? defectsText(row.defect_count) : null;
                  return (
                    <HoverPressable
                      key={row.id}
                      style={[styles.row, index > 0 && styles.rowDivider]}
                      hoverStyle={styles.rowHover}
                      onPress={() => go(row.id)}
                      accessibilityLabel={t('inspection.fromLabel', { v1: formatIsoDay(row.inspection_date), label: rowMeta.label, v2: defects ? `, ${defects}` : '' })}
                    >
                      <View style={styles.rowIcon}>
                        <Ionicons name="document-text-outline" size={16} color={DESKTOP_COLORS.inkMuted} />
                      </View>
                      <View style={styles.rowText}>
                        <DLtrText weight="semiBold" style={styles.rowTitle}>{formatIsoDay(row.inspection_date)}</DLtrText>
                        <DText style={styles.rowMeta} numberOfLines={1}>{[row.officer_name, defects].filter(Boolean).join(' · ') || ' '}</DText>
                      </View>
                      <StatusPill tone={STATE_TONE[rowMeta.tone]} label={rowMeta.label} />
                      <Ionicons name={dirIcon('chevron-back')} size={15} color={DESKTOP_COLORS.inkFaint} />
                    </HoverPressable>
                  );
                })}
                {files.map((doc, index) => (
                  <HoverPressable
                    key={doc.id}
                    style={[styles.row, (total > 0 || index > 0) && styles.rowDivider]}
                    hoverStyle={styles.rowHover}
                    onPress={() => void openFile(doc)}
                    accessibilityLabel={documentDisplayName(doc)}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name="document-attach-outline" size={16} color={DESKTOP_COLORS.inkMuted} />
                    </View>
                    <View style={styles.rowText}>
                      <DText weight="semiBold" style={styles.rowTitle}>{documentDisplayName(doc)}</DText>
                      <DLtrText style={styles.rowMeta}>{formatDate(doc.created_at)}</DLtrText>
                    </View>
                    <Ionicons name={dirIcon('chevron-back')} size={15} color={DESKTOP_COLORS.inkFaint} />
                  </HoverPressable>
                ))}
                </>
              )}
            </View>
          </View>
        </View>
      </DesktopModal>
    </>
  );
}

// עיצוב השורה והחלון
// Same measures as the folder rows beside it (components/desktop/record/FolderDocuments.tsx).
const styles = StyleSheet.create({
  // השורה
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 16, paddingVertical: 8, ...webOnly({ transition: 'background-color 150ms ease' }) },
  rowDivider: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  rowIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: DESKTOP_COLORS.canvas, alignItems: 'center', justifyContent: 'center' },
  rowIconFilled: { backgroundColor: 'rgba(47,91,255,0.10)' },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { fontSize: 14.5 },
  rowMeta: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  body: { padding: 18, gap: 14 },
  next: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  label: { fontSize: 13, color: DESKTOP_COLORS.inkMuted, marginBottom: 2 },
  dueRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  dueDate: { fontSize: 22, lineHeight: 28 },
  muted: { fontSize: 13, color: DESKTOP_COLORS.inkMuted },
  defects: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: DESKTOP_TONES.bad.bg },
  defectsText: { fontSize: 14, color: DESKTOP_TONES.bad.fg, flex: 1 },
  noReminder: { fontSize: 15, color: DESKTOP_COLORS.ink },
  listTitle: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted, marginBottom: 6, paddingHorizontal: 4 },
  error: { fontSize: 13.5, color: DESKTOP_TONES.bad.fg },
  empty: { padding: 16 },
});
