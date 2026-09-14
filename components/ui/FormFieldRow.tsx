import React from 'react';
import { StyleProp, StyleSheet, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import { BRAND, COLORS, FONT, FONT_SIZE } from '../../lib/theme';

/**
 * Label + inline text input row shared by the admin driver and vehicle
 * forms: focus rail on the right, accent label while focused, green check
 * when valid, error line underneath. Layout differences between the two
 * forms (label width, row/error margins) are passed in, not re-styled.
 */
export interface FormFieldRowProps<K extends string> {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  fieldKey: K;
  focusedField: K | null;
  setFocusedField: (field: K | null) => void;
  error?: string;
  valid?: boolean;
  placeholder?: string;
  placeholderTextColor?: string;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'email-address' | 'numeric';
  ltr?: boolean;
  last?: boolean;
  maxLength?: number;
  accessibilityLabel?: string;
  labelWidth?: number;
  rowStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  inputStyle?: StyleProp<TextStyle>;
  errorStyle?: StyleProp<TextStyle>;
}

export function FormFieldRow<K extends string>({
  label,
  value,
  onChangeText,
  fieldKey,
  focusedField,
  setFocusedField,
  error,
  valid = false,
  placeholder,
  placeholderTextColor = COLORS.textFaint,
  keyboardType,
  ltr,
  last,
  maxLength,
  accessibilityLabel,
  labelWidth = 88,
  rowStyle,
  labelStyle,
  inputStyle,
  errorStyle,
}: FormFieldRowProps<K>) {
  const focused = focusedField === fieldKey;
  return (
    <>
      <View style={[styles.row, rowStyle, last && styles.rowLast, focused && styles.rowFocused]}>
        <View style={[styles.focusRail, focused && styles.focusRailActive]} />
        <AppText style={[styles.label, { width: labelWidth }, labelStyle, focused && styles.labelFocused]}>{label}</AppText>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocusedField(fieldKey)}
          onBlur={() => setFocusedField(null)}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor}
          keyboardType={keyboardType}
          maxLength={maxLength}
          style={[styles.input, inputStyle, ltr && styles.ltrInput]}
          accessibilityLabel={accessibilityLabel ?? label.replace(' *', '')}
        />
        {valid && (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={14} color="#268A59" />
          </View>
        )}
      </View>
      {!!error && <AppText style={[styles.error, errorStyle]}>{error}</AppText>}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingRight: 6,
    paddingLeft: 16,
    minHeight: 56,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(14,30,43,.07)',
    gap: 10,
  },
  rowLast: { borderBottomWidth: 0 },
  rowFocused: { backgroundColor: 'rgba(0,136,204,.045)' },
  focusRail: { width: 4, height: 22, borderRadius: 2, backgroundColor: 'transparent' },
  focusRailActive: { backgroundColor: COLORS.accent },
  label: { fontSize: FONT_SIZE.lg, fontFamily: FONT.semibold, color: BRAND.ink },
  labelFocused: { color: COLORS.accent },
  input: { flex: 1, fontSize: FONT_SIZE.xl, fontFamily: FONT.medium, padding: 0, color: BRAND.ink, textAlign: 'right' },
  ltrInput: { textAlign: 'left', writingDirection: 'ltr' },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(48,164,108,.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { fontSize: FONT_SIZE.sm, color: COLORS.dangerText },
});
