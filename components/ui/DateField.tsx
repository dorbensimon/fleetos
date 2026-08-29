import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, TextInput, Modal, Pressable } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import { COLORS, RADIUS, FONT, formatDate, parseDateValue } from '../../lib/theme';

/**
 * Date input that stays usable on every target.
 *
 * On iOS/Android it opens the platform picker. On web the native module
 * has no implementation, so it falls back to a plain DD/MM/YYYY text
 * field — which is also what people expect in a browser.
 *
 * The value is always exchanged as an ISO date string (YYYY-MM-DD) or
 * null, so callers never deal with Date objects or locale parsing.
 */

function toIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Parses DD/MM/YYYY. Returns null when incomplete or nonsensical. */
function fromDisplay(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return toIso(d);
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
  const [showPicker, setShowPicker] = useState(false);
  const [webText, setWebText] = useState(value ? formatDate(value) : '');

  useEffect(() => {
    setWebText(value ? formatDate(value) : '');
  }, [value]);

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

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.box, hasError && styles.boxError, disabled && styles.boxDisabled]}>
        <Ionicons name="calendar-outline" size={17} color={COLORS.textFaint} />
        <TextInput
          value={webText}
          onChangeText={(t) => {
            setWebText(t);
            if (t.trim() === '') {
              onChange(null);
              return;
            }
            const iso = fromDisplay(t);
            if (iso) onChange(iso);
          }}
          placeholder="DD/MM/YYYY"
          placeholderTextColor={COLORS.textFaint}
          style={styles.webInput}
          textAlign="left"
          editable={!disabled}
        />
        {!disabled && !!value && (
          <TouchableOpacity
            onPress={() => {
              setWebText('');
              onChange(null);
            }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={17} color={COLORS.textFaint} />
          </TouchableOpacity>
        )}
        {disabled && <Ionicons name="lock-closed-outline" size={15} color={COLORS.textFaint} />}
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        activeOpacity={disabled ? 1 : 0.8}
        onPress={openPicker}
        style={[styles.box, hasError && styles.boxError, disabled && styles.boxDisabled]}
      >
        <Ionicons name="calendar-outline" size={17} color={COLORS.textFaint} />
        <AppText style={[styles.value, !value && styles.placeholder]}>
          {value ? formatDate(value) : placeholder}
        </AppText>
        {!disabled && !!value && (
          <TouchableOpacity
            onPress={(event) => {
              event.stopPropagation();
              onChange(null);
            }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={17} color={COLORS.textFaint} />
          </TouchableOpacity>
        )}
        {disabled && <Ionicons name="lock-closed-outline" size={15} color={COLORS.textFaint} />}
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
  webInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONT.regular,
    color: COLORS.text,
  },
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
});
