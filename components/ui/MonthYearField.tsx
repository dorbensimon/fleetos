import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import { COLORS, RADIUS, SPACING, CARD_SHADOW } from '../../lib/theme';

/**
 * Month + year picker, for dates that have no day.
 *
 * A vehicle's production date is registered as חודש/שנה only, so the
 * regular DateField (which always yields a full YYYY-MM-DD) would be
 * inventing a day that nobody entered. This keeps the two values the
 * `vehicles` table actually stores — `production_year` and
 * `production_month` — while still being a picker rather than two
 * free-text boxes an admin can typo into.
 *
 * Built as a modal sheet like Select, so it behaves the same on iOS,
 * Android and web without touching a native module.
 */

const MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

const FIRST_YEAR = 1980;

function yearOptions(): number[] {
  const newest = new Date().getFullYear() + 1;
  const years: number[] = [];
  for (let y = newest; y >= FIRST_YEAR; y--) years.push(y);
  return years;
}

export function MonthYearField({
  year,
  month,
  onChange,
  placeholder = 'בחר חודש ושנה',
  hasError,
}: {
  year: number | null;
  month: number | null;
  onChange: (year: number | null, month: number | null) => void;
  placeholder?: string;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draftYear, setDraftYear] = useState<number | null>(year);
  const [draftMonth, setDraftMonth] = useState<number | null>(month);

  // The form loads asynchronously when editing, so the committed value can
  // arrive after this component first mounted.
  useEffect(() => {
    setDraftYear(year);
    setDraftMonth(month);
  }, [year, month]);

  const label =
    year && month ? `${MONTHS[month - 1]} ${year}` : year ? String(year) : null;

  const confirm = () => {
    // A month on its own has nothing to anchor it to, so it is dropped.
    onChange(draftYear, draftYear ? draftMonth : null);
    setOpen(false);
  };

  const clear = () => {
    setDraftYear(null);
    setDraftMonth(null);
    onChange(null, null);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setOpen(true)}
        style={[styles.box, hasError && styles.boxError]}
      >
        <Ionicons name="calendar-outline" size={17} color={COLORS.textFaint} />
        <AppText style={[styles.value, !label && styles.placeholder]} numberOfLines={1}>
          {label ?? placeholder}
        </AppText>
        {!!label && (
          <TouchableOpacity onPress={clear} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={COLORS.textFaint} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <AppText weight="bold" style={styles.sheetTitle}>
              {draftYear
                ? draftMonth
                  ? `${MONTHS[draftMonth - 1]} ${draftYear}`
                  : String(draftYear)
                : 'בחר שנה'}
            </AppText>

            <View style={styles.columns}>
              <View style={styles.column}>
                <AppText style={styles.columnTitle}>חודש</AppText>
                <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
                  {MONTHS.map((name, index) => {
                    const active = draftMonth === index + 1;
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[styles.option, active && styles.optionActive]}
                        onPress={() => setDraftMonth(active ? null : index + 1)}
                      >
                        <AppText
                          weight={active ? 'bold' : 'regular'}
                          style={[styles.optionText, active && styles.optionTextActive]}
                        >
                          {name}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.column}>
                <AppText style={styles.columnTitle}>שנה</AppText>
                <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
                  {yearOptions().map((y) => {
                    const active = draftYear === y;
                    return (
                      <TouchableOpacity
                        key={y}
                        style={[styles.option, active && styles.optionActive]}
                        onPress={() => setDraftYear(y)}
                      >
                        <AppText
                          weight={active ? 'bold' : 'regular'}
                          style={[styles.optionText, active && styles.optionTextActive]}
                        >
                          {y}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.clearBtn} onPress={clear}>
                <AppText weight="bold" style={styles.clearText}>
                  נקה
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={confirm}>
                <AppText weight="bold" style={styles.confirmText}>
                  אישור
                </AppText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.field,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
    paddingHorizontal: 14,
  },
  boxError: { borderColor: COLORS.dangerText },
  value: { flex: 1, fontSize: 15, textAlign: 'right' },
  placeholder: { color: COLORS.textFaint },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
    ...CARD_SHADOW,
  },
  sheetTitle: { fontSize: 16, color: COLORS.text, textAlign: 'center' },

  columns: { flexDirection: 'row-reverse', gap: SPACING.md, height: 240 },
  column: { flex: 1, gap: 6 },
  columnTitle: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },

  option: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  optionActive: { backgroundColor: COLORS.accentSoft },
  optionText: { fontSize: 14.5, color: COLORS.text },
  optionTextActive: { color: COLORS.accent },

  actions: { flexDirection: 'row-reverse', gap: SPACING.sm },
  clearBtn: {
    flex: 1,
    height: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: { fontSize: 14, color: COLORS.textMuted },
  confirmBtn: {
    flex: 2,
    height: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { fontSize: 14.5, color: COLORS.textInverse },
});
