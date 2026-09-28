import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, KitInput, Pressy, STATUS, Surface } from '../driverKit';
import {
  INSPECTION_LIMITS,
  INSPECTION_STATUSES,
  INSPECTION_STATUS_META,
  type InspectionAnswer,
  type InspectionItem,
  type InspectionStatus,
} from '../../lib/inspections';
import { t } from '../../lib/i18n';

/**
 * One item of a vehicle inspection: its text, three big buttons (icon, word
 * and colour together, never colour alone), and a line about the item.
 * "לא תקין" opens that line at once and asks what is wrong; it is the
 * defect, so it cannot stay empty.
 */
export const InspectionItemCard = memo(function InspectionItemCard({
  number,
  item,
  answer,
  onStatus,
  onNote,
}: {
  number: number;
  item: InspectionItem;
  answer: InspectionAnswer | undefined;
  onStatus: (itemId: string, status: InspectionStatus) => void;
  onNote: (itemId: string, note: string) => void;
}) {
  const status = answer?.status ?? null;
  const note = answer?.note ?? '';
  const defect = status === 'not_ok';
  const [editing, setEditing] = useState(false);
  const meta = status ? INSPECTION_STATUS_META[status] : null;

  // A defect with nothing written yet goes straight to the line to write it on.
  useEffect(() => {
    if (defect && !note.trim()) setEditing(true);
  }, [defect, note]);

  const missing = defect && !note.trim();

  return (
    <Surface style={[styles.card, meta && { borderColor: `${meta.fill}55` }]}>
      <View style={styles.head}>
        <View style={[styles.num, meta ? { backgroundColor: meta.soft } : null]}>
          {meta ? (
            <Ionicons name={meta.icon} size={18} color={meta.fg} />
          ) : (
            <DKText variant="number" color={DK.inkSoft} style={styles.numText}>
              {number}
            </DKText>
          )}
        </View>
        <DKText variant="body" style={styles.text}>
          {item.text}
        </DKText>
      </View>

      <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={t('inspection.itemState', { number, text: item.text })}>
        {INSPECTION_STATUSES.map((key) => {
          const on = status === key;
          const m = INSPECTION_STATUS_META[key];
          return (
            <Pressy
              key={key}
              onPress={() => onStatus(item.id, key)}
              haptic
              pressScale={0.96}
              accessibilityLabel={`${m.label}${on ? t('common.selectedSuffix') : ''}, ${item.text}`}
              style={[styles.option, on ? { backgroundColor: m.soft, borderColor: m.fg } : styles.optionOff]}
            >
              <View style={[styles.optionIcon, on ? { backgroundColor: m.fg } : styles.optionIconOff]}>
                <Ionicons name={m.icon} size={17} color={on ? '#FFFFFF' : DK.muted} />
              </View>
              <DKText variant="label" color={on ? m.fg : DK.inkSoft} style={styles.optionLabel} numberOfLines={1}>
                {m.label}
              </DKText>
            </Pressy>
          );
        })}
      </View>

      {editing ? (
        <View style={styles.noteEdit}>
          {defect && (
            <DKText variant="label" color={STATUS.expired.fg} nativeID={`defect-${item.id}`}>
              {t('inspection.whatsProblemRequired')}
            </DKText>
          )}
          <KitInput
            value={note}
            onChangeText={(text) => onNote(item.id, text)}
            placeholder={defect ? t('inspection.problemExample') : t('checklist.notePlaceholder')}
            accessibilityLabel={defect ? t('inspection.problemIn', { text: item.text }) : t('inspection.noteFor', { text: item.text })}
            multiline
            autoFocus={!defect || !note}
            hasError={missing}
            maxLength={INSPECTION_LIMITS.note}
            style={styles.noteInput}
          />
          {!missing && (
            <Pressy onPress={() => setEditing(false)} accessibilityLabel={t('common.done')} style={styles.noteDone} pressScale={0.95}>
              <Ionicons name="checkmark" size={18} color={DK.accent} />
              <DKText variant="label" color={DK.accent}>
                {t('common.done')}
              </DKText>
            </Pressy>
          )}
        </View>
      ) : note ? (
        <Pressy onPress={() => setEditing(true)} accessibilityLabel={t('inspection.noteEdit', { v1: defect ? t('inspection.problem') : t('common.note'), note })} style={[styles.noteSaved, defect && styles.noteDefect]} pressScale={0.985}>
          <Ionicons name={defect ? 'alert-circle' : 'chatbox-ellipses-outline'} size={18} color={defect ? STATUS.expired.fg : DK.inkSoft} style={styles.noteIcon} />
          <DKText variant="caption" color={defect ? STATUS.expired.fg : DK.inkSoft} style={styles.flex}>
            {note}
          </DKText>
          <DKText variant="micro" color={DK.accent}>
            {t('common.edit')}
          </DKText>
        </Pressy>
      ) : (
        <Pressy onPress={() => setEditing(true)} accessibilityLabel={t('inspection.addNoteFor', { text: item.text })} style={styles.noteAdd} pressScale={0.97}>
          <Ionicons name="add" size={19} color={DK.accent} />
          <DKText variant="label" color={DK.accent}>
            {t('common.note')}
          </DKText>
          <DKText variant="caption" color={DK.muted}>
            {t('common.optionalParenShort')}
          </DKText>
        </Pressy>
      )}
    </Surface>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { padding: 16, gap: 14, borderWidth: 1.5, borderColor: 'transparent' },
  head: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 },
  num: { width: 34, height: 34, borderRadius: 11, backgroundColor: DK.surfaceSunk, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  numText: { fontSize: 15, lineHeight: 20 },
  text: { flex: 1, fontSize: 17, lineHeight: 25 },
  options: { flexDirection: 'row-reverse', gap: 8 },
  option: {
    flex: 1,
    minHeight: 72,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  optionOff: { backgroundColor: DK.surfaceSunk, borderColor: 'rgba(10,22,38,0.06)' },
  optionIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionIconOff: { backgroundColor: 'rgba(10,22,38,0.07)' },
  optionLabel: { fontSize: 16 },
  noteAdd: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-end', paddingHorizontal: 4 },
  noteSaved: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 14, backgroundColor: DK.surfaceSunk },
  noteDefect: { backgroundColor: STATUS.expired.soft },
  noteIcon: { marginTop: 1 },
  noteEdit: { gap: 8 },
  noteInput: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  noteDone: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: DK.accentSoft, alignSelf: 'flex-start' },
});
