import React, { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, KitInput, Pressy, Surface } from '../driverKit';
import { CHECKLIST_LIMITS, STATUS_META, type ChecklistAnswer, type ChecklistItem, type ChecklistStatus } from '../../lib/checklistForms';
import { t } from '../../lib/i18n';

/**
 * One item of the meeting: its text, one big button per answer (icon, word
 * and colour together, never colour alone), and an optional note.
 */
export const ChecklistItemCard = memo(function ChecklistItemCard({
  index,
  item,
  answer,
  options,
  onStatus,
  onNote,
}: {
  index: number;
  item: ChecklistItem;
  answer: ChecklistAnswer | undefined;
  options: ChecklistStatus[];
  onStatus: (itemId: string, status: ChecklistStatus) => void;
  onNote: (itemId: string, note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const status = answer?.status ?? null;
  const note = answer?.note ?? '';
  const meta = status ? STATUS_META[status] : null;

  return (
    <Surface style={[styles.card, meta && { borderColor: `${meta.fill}55` }]}>
      <View style={styles.head}>
        <View style={[styles.num, meta ? { backgroundColor: meta.soft } : null]}>
          {meta ? (
            <Ionicons name={meta.icon} size={18} color={meta.fg} />
          ) : (
            <DKText variant="number" color={DK.inkSoft} style={styles.numText}>
              {index + 1}
            </DKText>
          )}
        </View>
        <DKText variant="body" style={styles.text}>
          {item.text}
        </DKText>
      </View>

      <View style={[styles.options, options.length === 3 && styles.optionsThree]} accessibilityRole="radiogroup" accessibilityLabel={t('checklist.answerForItem', { v1: index + 1 })}>
        {options.map((key) => {
          const on = status === key;
          const m = STATUS_META[key];
          return (
            <Pressy
              key={key}
              onPress={() => onStatus(item.id, key)}
              haptic
              pressScale={0.96}
              accessibilityLabel={t('checklist.optionLabel', { label: m.label, v1: on ? t('common.selectedSuffix') : "", v2: index + 1 })}
              style={[styles.option, options.length === 3 && styles.optionThree, on ? { backgroundColor: m.soft, borderColor: m.fg } : styles.optionOff]}
            >
              <View style={[styles.optionIcon, on ? { backgroundColor: m.fg } : styles.optionIconOff]}>
                <Ionicons name={m.icon} size={options.length === 3 ? 17 : 19} color={on ? '#FFFFFF' : DK.muted} />
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
          <KitInput
            value={note}
            onChangeText={(text) => onNote(item.id, text)}
            placeholder={t('checklist.notePlaceholder')}
            accessibilityLabel={t('checklist.noteForItem', { v1: index + 1 })}
            multiline
            autoFocus
            maxLength={CHECKLIST_LIMITS.note}
            style={styles.noteInput}
          />
          <Pressy onPress={() => setEditing(false)} accessibilityLabel={t('checklist.finishNoteLabel')} style={styles.noteDone} pressScale={0.95}>
            <Ionicons name="checkmark" size={18} color={DK.accent} />
            <DKText variant="label" color={DK.accent}>
              {t('checklist.finishNote')}
            </DKText>
          </Pressy>
        </View>
      ) : note ? (
        <Pressy onPress={() => setEditing(true)} accessibilityLabel={t('checklist.noteEdit', { note })} style={styles.noteSaved} pressScale={0.985}>
          <Ionicons name="chatbox-ellipses-outline" size={18} color={DK.inkSoft} style={styles.noteIcon} />
          <DKText variant="caption" color={DK.inkSoft} style={styles.flex}>
            {note}
          </DKText>
          <DKText variant="micro" color={DK.accent}>
            {t('common.edit')}
          </DKText>
        </Pressy>
      ) : (
        <Pressy onPress={() => setEditing(true)} accessibilityLabel={t('checklist.addNoteForItem', { v1: index + 1 })} style={styles.noteAdd} pressScale={0.97}>
          <Ionicons name="add" size={19} color={DK.accent} />
          <DKText variant="label" color={DK.accent}>
            {t('checklist.addNote')}
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
  options: { flexDirection: 'row-reverse', gap: 10 },
  optionsThree: { gap: 8 },
  option: {
    flex: 1,
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  optionThree: { flexDirection: 'column', gap: 4, minHeight: 72, paddingVertical: 8 },
  optionOff: { backgroundColor: DK.surfaceSunk, borderColor: 'rgba(10,22,38,0.06)' },
  optionIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionIconOff: { backgroundColor: 'rgba(10,22,38,0.07)' },
  optionLabel: { fontSize: 16 },
  noteAdd: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-end', paddingHorizontal: 4 },
  noteSaved: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 14, backgroundColor: DK.surfaceSunk },
  noteIcon: { marginTop: 1 },
  noteEdit: { gap: 8 },
  noteInput: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  noteDone: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: DK.accentSoft, alignSelf: 'flex-start' },
});
