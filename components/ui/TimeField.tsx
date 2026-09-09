import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, TextInput, Modal, Pressable } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import { COLORS, RADIUS, FONT } from '../../lib/theme';

/**
 * Time input, mirroring DateField's per-platform behaviour: a native
 * picker on iOS/Android, a plain HH:MM text field on web (no native
 * module there). The value is always exchanged as "HH:MM" (24h) or null.
 */

function toHHMM(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function fromHHMM(value: string): Date {
  const [h, m] = value.split(':').map(Number);
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

/** Accepts partial typing (e.g. "9:5") as long as it resolves to a valid HH:MM. */
function parseTypedTime(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function TimeField({
  value,
  onChange,
  placeholder = 'בחר שעה',
  hasError,
  disabled,
}: {
  value: string | null;
  onChange: (hhmm: string | null) => void;
  placeholder?: string;
  hasError?: boolean;
  disabled?: boolean;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [webText, setWebText] = useState(value ?? '');

  useEffect(() => {
    setWebText(value ?? '');
  }, [value]);

  const openPicker = () => {
    if (disabled) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: value ? fromHHMM(value) : new Date(),
        mode: 'time',
        is24Hour: true,
        display: 'default',
        onChange: (event, selected) => {
          if (event.type !== 'dismissed' && selected) onChange(toHHMM(selected));
        },
      });
      return;
    }
    setShowPicker(true);
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.box, hasError && styles.boxError, disabled && styles.boxDisabled]}>
        <Ionicons name="time-outline" size={17} color={COLORS.textFaint} />
        <TextInput
          value={webText}
          onChangeText={(t) => {
            setWebText(t);
            if (t.trim() === '') {
              onChange(null);
              return;
            }
            const parsed = parseTypedTime(t);
            if (parsed) onChange(parsed);
          }}
          placeholder="HH:MM"
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
        <Ionicons name="time-outline" size={17} color={COLORS.textFaint} />
        <AppText style={[styles.value, !value && styles.placeholder]}>{value || placeholder}</AppText>
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
        <Modal transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowPicker(false)}>
            <Pressable style={styles.modalSheet} onPress={(event) => event.stopPropagation()}>
              <DateTimePicker
                value={value ? fromHHMM(value) : new Date()}
                mode="time"
                is24Hour
                display="spinner"
                themeVariant="light"
                textColor={COLORS.text}
                onChange={(event, selected) => {
                  if (event.type === 'dismissed') return;
                  if (selected) onChange(toHHMM(selected));
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
