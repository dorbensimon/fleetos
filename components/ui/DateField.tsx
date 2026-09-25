import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Modal, Pressable, ScrollView } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import { COLORS, RADIUS, formatDate, parseDateValue } from '../../lib/theme';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DK, DK_FONT } from '../driverKit/theme';

/**
 * Date input that stays usable on every target.
 *
 * On native it opens the platform picker. On web it uses the same
 * bottom-sheet interaction rather than exposing a free-form text field.
 *
 * The value is always exchanged as an ISO date string (YYYY-MM-DD) or
 * null, so callers never deal with Date objects or locale parsing.
 */

function toIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function WebDatePicker({ value, onConfirm, onClose }: { value: string | null; onConfirm: (iso: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(() => value ? parseDateValue(value) : new Date());
  const [choosingYear, setChoosingYear] = useState(false);
  const daysInMonth = new Date(draft.getFullYear(), draft.getMonth() + 1, 0).getDate();
  const years = Array.from({ length: 101 }, (_, index) => new Date().getFullYear() + 20 - index);
  const dayScrollRef = useRef<ScrollView>(null);
  const monthScrollRef = useRef<ScrollView>(null);
  const yearScrollRef = useRef<ScrollView>(null);

  // The browser picker is a bottom-sheet replica of the native wheel. Keep
  // the selected date in view when it opens; without this the lists start at
  // day 1 / January / 20 years ahead, even though today's date is selected.
  useEffect(() => {
    const scrollToSelected = (ref: React.RefObject<ScrollView | null>, index: number) => {
      ref.current?.scrollTo({ y: Math.max(0, 76 + index * 38 - 85), animated: false });
    };

    scrollToSelected(dayScrollRef, draft.getDate() - 1);
    scrollToSelected(monthScrollRef, draft.getMonth());
    scrollToSelected(yearScrollRef, years.indexOf(draft.getFullYear()));
  }, [draft, years]);

  const update = (part: 'day' | 'month' | 'year', nextValue: number) => {
    const next = new Date(draft);
    const day = draft.getDate();
    if (part === 'day') next.setDate(nextValue);
    if (part === 'month') {
      next.setDate(1);
      next.setMonth(nextValue);
      next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    }
    if (part === 'year') {
      next.setDate(1);
      next.setFullYear(nextValue);
      next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    }
    setDraft(next);
  };

  const chooseYear = (year: number) => {
    update('year', year);
    setChoosingYear(false);
  };

  const column = (items: { value: number; label: string }[], selected: number, part: 'day' | 'month' | 'year', ref: React.RefObject<ScrollView | null>) => (
    <ScrollView ref={ref} style={styles.pickerColumn} contentContainerStyle={styles.pickerColumnContent} showsVerticalScrollIndicator={false}>
      {items.map((item) => {
        const active = item.value === selected;
        return <TouchableOpacity key={item.value} style={[styles.pickerOption, active && styles.pickerOptionActive]} onPress={() => update(part, item.value)}>
          <AppText weight={active ? 'bold' : 'regular'} style={[styles.pickerOptionText, active && styles.pickerOptionTextActive]}>{item.label}</AppText>
        </TouchableOpacity>;
      })}
    </ScrollView>
  );

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.webSheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.grabHandle} />
          <View style={styles.webSheetHeader}>
            <TouchableOpacity onPress={onClose}><AppText style={styles.sheetAction}>ביטול</AppText></TouchableOpacity>
            <TouchableOpacity onPress={() => setChoosingYear((current) => !current)} accessibilityRole="button" accessibilityLabel="בחירת שנה">
              <AppText weight="bold" style={styles.sheetTitle}>{choosingYear ? 'בחירת שנה' : 'בחירת תאריך'}</AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onConfirm(toIso(draft))}><AppText weight="bold" style={styles.sheetAction}>אישור</AppText></TouchableOpacity>
          </View>
          {choosingYear ? (
            <ScrollView style={styles.yearGridScroll} contentContainerStyle={styles.yearGrid} showsVerticalScrollIndicator={false}>
              {years.map((year) => {
                const active = year === draft.getFullYear();
                return <TouchableOpacity key={year} style={[styles.yearOption, active && styles.yearOptionActive]} onPress={() => chooseYear(year)}>
                  <AppText weight={active ? 'bold' : 'regular'} style={[styles.yearOptionText, active && styles.yearOptionTextActive]}>{year}</AppText>
                </TouchableOpacity>;
              })}
            </ScrollView>
          ) : (
            <View style={styles.pickerColumns}>
              {column(Array.from({ length: daysInMonth }, (_, index) => ({ value: index + 1, label: String(index + 1) })), draft.getDate(), 'day', dayScrollRef)}
              {column(HEBREW_MONTHS.map((label, index) => ({ value: index, label })), draft.getMonth(), 'month', monthScrollRef)}
              {column(years.map((year) => ({ value: year, label: String(year) })), draft.getFullYear(), 'year', yearScrollRef)}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function DateField({
  value,
  onChange,
  placeholder = 'בחר תאריך',
  hasError,
  disabled,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  hasError?: boolean;
  disabled?: boolean;
}) {
  const phone = !useIsDesktop();
  const [showPicker, setShowPicker] = useState(false);
  const boxStyle = [styles.box, phone && kit.box, hasError && (phone ? kit.boxError : styles.boxError), disabled && styles.boxDisabled];
  const valueStyle = [styles.value, phone && kit.value, !value && (phone ? kit.placeholder : styles.placeholder)];
  const iconColor = phone ? DK.muted : COLORS.textFaint;

  const openPicker = () => {
    if (disabled) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: value ? parseDateValue(value) : new Date(),
        mode: 'date',
        display: 'default',
        onChange: (event, selected) => {
          if (event.type !== 'dismissed' && selected) onChange(toIso(selected));
        },
      });
      return;
    }
    setShowPicker(true);
  };

  if (Platform.OS === 'web') return <>
    <TouchableOpacity activeOpacity={disabled ? 1 : 0.8} onPress={openPicker} style={boxStyle} accessibilityRole="button" accessibilityLabel={value ? formatDate(value) : placeholder} accessibilityHint="פתיחת בחירת תאריך">
      <Ionicons name="calendar-outline" size={17} color={iconColor} />
      <AppText style={valueStyle}>{value ? formatDate(value) : placeholder}</AppText>
      {!disabled && !!value && <TouchableOpacity onPress={(event) => { event.stopPropagation(); onChange(null); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="ניקוי התאריך"><Ionicons name="close-circle" size={17} color={iconColor} /></TouchableOpacity>}
      {disabled && <Ionicons name="lock-closed-outline" size={15} color={iconColor} />}
    </TouchableOpacity>
    {showPicker && <WebDatePicker value={value} onClose={() => setShowPicker(false)} onConfirm={(iso) => { onChange(iso); setShowPicker(false); }} />}
  </>;

  return (
    <>
      <TouchableOpacity
        activeOpacity={disabled ? 1 : 0.8}
        onPress={openPicker}
        style={boxStyle}
        accessibilityRole="button"
        accessibilityLabel={value ? formatDate(value) : placeholder}
        accessibilityHint="פתיחת בחירת תאריך"
      >
        <Ionicons name="calendar-outline" size={17} color={iconColor} />
        <AppText style={valueStyle}>
          {value ? formatDate(value) : placeholder}
        </AppText>
        {!disabled && !!value && (
          <TouchableOpacity
            onPress={(event) => {
              event.stopPropagation();
              onChange(null);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="ניקוי התאריך"
          >
            <Ionicons name="close-circle" size={17} color={iconColor} />
          </TouchableOpacity>
        )}
        {disabled && <Ionicons name="lock-closed-outline" size={15} color={iconColor} />}
      </TouchableOpacity>

      {showPicker && Platform.OS === 'ios' && (
        // A real Modal isolates the spinner on its own native layer — the
        // inline version used to sit inside whatever accordion/section held
        // this field, and tapping "סיום" could land on that section's own
        // touch target and collapse it right along with the picker.
        <Modal transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowPicker(false)}
          >
            <Pressable style={styles.modalSheet} onPress={(event) => event.stopPropagation()}>
              <DateTimePicker
                value={value ? parseDateValue(value) : new Date()}
                mode="date"
                display="spinner"
                themeVariant="light"
                textColor={COLORS.text}
                onChange={(event, selected) => {
                  if (event.type === 'dismissed') return;
                  if (selected) onChange(toIso(selected));
                }}
              />
              <TouchableOpacity style={styles.iosDone} onPress={() => setShowPicker(false)}>
                <AppText weight="bold" style={styles.iosDoneText}>
                  סיום
                </AppText>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}
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
  boxDisabled: { opacity: 0.55 },
  value: { flex: 1, fontSize: 15, textAlign: 'left' },
  placeholder: { color: COLORS.textFaint },
  iosDone: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 24 },
  iosDoneText: { color: COLORS.accent, fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingBottom: 8,
  },
  webSheet: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: 16,
    paddingBottom: 22,
  },
  grabHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.fieldBorder, marginTop: 9 },
  webSheetHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  sheetTitle: { color: COLORS.text, fontSize: 16 },
  sheetAction: { color: COLORS.accent, fontSize: 15 },
  pickerColumns: { flexDirection: 'row-reverse', gap: 8, height: 208 },
  pickerColumn: { flex: 1, backgroundColor: COLORS.field, borderRadius: RADIUS.md },
  pickerColumnContent: { paddingVertical: 76 },
  pickerOption: { minHeight: 38, justifyContent: 'center', alignItems: 'center', marginHorizontal: 4, borderRadius: RADIUS.sm },
  pickerOptionActive: { backgroundColor: COLORS.accentSoft },
  pickerOptionText: { color: COLORS.textMuted, fontSize: 15 },
  pickerOptionTextActive: { color: COLORS.accent },
  yearGridScroll: { height: 208 },
  yearGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  yearOption: { width: '30.7%', minHeight: 42, borderRadius: RADIUS.md, backgroundColor: COLORS.field, alignItems: 'center', justifyContent: 'center' },
  yearOptionActive: { backgroundColor: COLORS.accentSoft },
  yearOptionText: { color: COLORS.textMuted, fontSize: 15 },
  yearOptionTextActive: { color: COLORS.accent },
});

const kit = StyleSheet.create({
  box: { height: undefined, minHeight: 52, borderRadius: 16, backgroundColor: DK.surfaceSunk, borderColor: 'transparent' },
  boxError: { borderColor: '#FF4D5E' },
  value: { fontFamily: DK_FONT.medium, fontSize: 16, color: DK.ink },
  placeholder: { color: DK.faint },
});
