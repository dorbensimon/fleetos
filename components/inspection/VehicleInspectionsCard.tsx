// בדיקות קצין בטיחות בתיק רכב (טלפון)
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DK, DKText, KitSection, KitSheet, ListRow, PrimaryAction, STATUS } from '../driverKit';
import { DuePill } from '../checklist/DuePill';
import { dueState } from '../../lib/meetingPlan';
import { INSPECTION_STATE_META, formatIsoDay, inspectionRepeatLabel } from '../../lib/inspections';
import { listDocuments } from '../../lib/documents';
import { documentDisplayName, documentViewerMode, getDocumentViewUrl } from '../../lib/documentActions';
import type { DocumentRow } from '../../lib/adminApi';
import { formatDate } from '../../lib/theme';
import type { RootStackParamList } from '../../navigation/types';
import { useVehicleInspections } from './useVehicleInspections';
import { t } from '../../lib/i18n';

// תיקיית המסמכים של בדיקות קצין בטיחות בכרטיס הרכב
export const SAFETY_FOLDER = 'safety_officer_approval';

// מספר הליקויים במילים
export function defectsText(count: number): string {
  return count === 1 ? t('inspection.oneDefect') : t('inspection.defectsCount', { count });
}

// הבדיקה הבאה והיסטוריה
/**
 * "בדיקות קצין בטיחות" in a vehicle's card on the phone: when the next
 * inspection is due (from the repeat interval in the settings), a button to
 * start one, and every inspection it had with its date. Each inspection keeps
 * its own signed document; files uploaded to the folder earlier are listed
 * with them.
 */
export function VehicleInspectionsCard({ companyId, vehicleId, archived, title = t('nav.safetyInspections'), onLeave }: {
  companyId: string; vehicleId: string; archived: boolean; title?: string;
  /** Called before going to another screen (e.g. to close the sheet holding the card). */
  onLeave?: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const go = (open: () => void) => {
    onLeave?.();
    open();
  };
  const { plan, entries, repeatMonths, error, draft } = useVehicleInspections(companyId, vehicleId);
  const [files, setFiles] = useState<DocumentRow[]>([]);

  useEffect(() => {
    let live = true;
    listDocuments('vehicle', vehicleId, SAFETY_FOLDER).then((rows) => { if (live) setFiles(rows); }).catch(() => {});
    return () => { live = false; };
  }, [vehicleId]);

  const openFile = async (doc: DocumentRow) => {
    const src = await getDocumentViewUrl(doc);
    if (src) go(() => navigation.navigate('DocusealWebView', { mode: documentViewerMode(doc), title: documentDisplayName(doc), src }));
  };

  const reminders = repeatMonths > 0;
  const state = reminders && plan?.nextDue ? dueState(plan.nextDue) : null;
  const tone = state === 'late' ? STATUS.expired : state && state !== 'later' ? STATUS.soon : null;
  const list = entries ?? [];

  return (
    <View style={styles.wrap}>
      <KitSection title={title} surfaceStyle={styles.card}>
        {!!error && <DKText variant="caption" color={STATUS.expired.fg}>{error}</DKText>}
        {!archived && (
          <View style={styles.top}>
            <View style={[styles.icon, { backgroundColor: tone?.soft ?? (reminders ? DK.accentSoft : STATUS.missing.soft) }]}>
              <Ionicons name={!reminders ? 'notifications-off-outline' : state === 'late' ? 'alert-circle' : 'shield-checkmark'} size={24} color={tone?.fg ?? (reminders ? DK.accent : STATUS.missing.fg)} />
            </View>
            <View style={styles.flex}>
              {reminders ? (
                <>
                  <DKText variant="caption" color={DK.muted}>{plan?.firstInspection ? t('inspection.first') : t('inspection.next')}</DKText>
                  <DKText variant="heading">{plan?.nextDue ? formatIsoDay(plan.nextDue) : t('inspection.noDateSet')}</DKText>
                </>
              ) : (
                <DKText variant="label">{t('inspection.noReminderSet')}</DKText>
              )}
            </View>
            {state && state !== 'later' && <DuePill nextDue={plan!.nextDue!} />}
          </View>
        )}
        <DKText variant="caption" color={DK.muted}>
          {reminders ? t('inspection.repeatLabel', { repeatMonths: inspectionRepeatLabel(repeatMonths) }) : t('inspection.noFixedReminders')}
          {plan?.lastInspection ? t('inspection.lastOn', { v1: formatIsoDay(plan.lastInspection) }) : t('inspection.noneYetSuffix')}
        </DKText>
        {!!plan?.lastDefects && (
          <View style={styles.defects}>
            <Ionicons name="warning" size={16} color={STATUS.expired.fg} />
            <DKText variant="label" color={STATUS.expired.fg} style={styles.flex}>
              {t('inspection.hasDefectsColon')} {defectsText(plan.lastDefects)} {t('inspection.inLast')}
            </DKText>
          </View>
        )}
        {!archived && (
          <PrimaryAction
            label={draft ? t('inspection.continueStarted') : t('inspection.new')}
            icon={draft ? 'play-outline' : 'add-circle-outline'}
            onPress={() => go(() => navigation.navigate('SafetyInspection', draft ? { vehicleId, inspectionId: draft.id } : { vehicleId }))}
          />
        )}
      </KitSection>

      <KitSection title={t('inspection.previous')} surfaceStyle={styles.list}>
        {entries === null ? (
          <DKText variant="caption" color={DK.muted} style={styles.empty}>{t('common.loadingEllipsis')}</DKText>
        ) : list.length === 0 && files.length === 0 ? (
          <DKText variant="caption" color={DK.muted} style={styles.empty}>{t('inspection.noneForVehicle')}</DKText>
        ) : (
          <>
            {list.map(({ row, state: rowState }, i) => {
              const meta = INSPECTION_STATE_META[rowState];
              const pill = meta.tone === 'info' ? { fg: DK.accent, soft: DK.accentSoft } : STATUS[meta.tone];
              return (
                <ListRow
                  key={row.id}
                  first={i === 0}
                  icon="shield-checkmark-outline"
                  title={formatIsoDay(row.inspection_date)}
                  subtitle={[row.officer_name, row.defect_count > 0 && rowState !== 'draft' ? defectsText(row.defect_count) : null].filter(Boolean).join(' · ') || null}
                  trailing={
                    <View style={[styles.pill, { backgroundColor: pill.soft }]}>
                      <DKText variant="micro" color={pill.fg}>{meta.label}</DKText>
                    </View>
                  }
                  onPress={() => go(() => navigation.navigate('SafetyInspection', { vehicleId, inspectionId: row.id }))}
                />
              );
            })}
            {files.map((doc, i) => (
              <ListRow
                key={doc.id}
                first={list.length === 0 && i === 0}
                icon="document-text-outline"
                title={documentDisplayName(doc)}
                subtitle={formatDate(doc.created_at)}
                onPress={() => void openFile(doc)}
              />
            ))}
          </>
        )}
      </KitSection>
    </View>
  );
}

// תיקיית בדיקות קצין בטיחות
/**
 * The safety officer's inspections as one folder in the vehicle's folder
 * list: the row shows when the next one is due, and opens a sheet with a new
 * inspection and every inspection done, each with its date and document.
 */
export function VehicleInspectionsFolder({ companyId, vehicleId, archived, title, first = false }: {
  companyId: string; vehicleId: string; archived: boolean; title: string; first?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { plan, entries, repeatMonths } = useVehicleInspections(companyId, vehicleId);
  const reminders = repeatMonths > 0;
  const late = reminders && !!plan?.nextDue && dueState(plan.nextDue) === 'late';
  const subtitle = [
    !reminders ? t('inspection.noReminderSet') : plan?.nextDue ? `${t('inspection.next')}: ${formatIsoDay(plan.nextDue)}` : t('inspection.noDateSet'),
    entries?.length ? t('inspection.countLength', { length: entries.length }) : null,
  ].filter(Boolean).join(' · ');
  return (
    <>
      <ListRow
        first={first}
        icon="shield-checkmark-outline"
        tint={late ? STATUS.expired.fg : DK.accent}
        title={title}
        subtitle={subtitle}
        onPress={() => setOpen(true)}
      />
      <KitSheet visible={open} onClose={() => setOpen(false)} title={title} icon="shield-checkmark-outline">
        {open && (
          <VehicleInspectionsCard
            companyId={companyId}
            vehicleId={vehicleId}
            archived={archived}
            title=""
            onLeave={() => setOpen(false)}
          />
        )}
      </KitSheet>
    </>
  );
}

// עיצוב הכרטיס
const styles = StyleSheet.create({
  wrap: { gap: 12 },
  flex: { flex: 1 },
  card: { gap: 12, padding: 16 },
  top: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  defects: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: STATUS.expired.soft },
  empty: { padding: 16 },
  list: { paddingVertical: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
