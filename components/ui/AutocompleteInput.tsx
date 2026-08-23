import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText } from './Text';
import { COLORS, RADIUS, SPACING, FONT, CARD_SHADOW } from '../../lib/theme';

export interface AutocompleteOption {
  he: string;
  en: string;
}

/**
 * Free-text input with a filtered suggestion list underneath — narrows
 * as you type (matches from the start of each option's Hebrew or English
 * name, one more letter at a time, so typing in either language works).
 * Picking a suggestion fills the field with the Hebrew name, but typing a
 * value that isn't in the list is also accepted (e.g. a manufacturer not
 * in the common list).
 */
export function AutocompleteInput({
  value,
  onChangeText,
  options,
  placeholder,
  hasError,
}: {
  value: string;
  onChangeText: (v: string) => void;
  options: AutocompleteOption[];
  placeholder?: string;
  hasError?: boolean;
}) {
  const [focused, setFocused] = useState(false);

  const query = value.trim().toLowerCase();
  const suggestions = query
    ? options
        .filter((o) => o.he.toLowerCase().startsWith(query) || o.en.toLowerCase().startsWith(query))
        .slice(0, 8)
    : [];
  const showList =
    focused && suggestions.length > 0 && !(suggestions.length === 1 && suggestions[0].he.toLowerCase() === query);

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textFaint}
        textAlign="right"
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        style={[styles.input, hasError && styles.inputError]}
      />
      {showList && (
        <View style={styles.list}>
          {suggestions.map((opt) => (
            <TouchableOpacity
              key={opt.he}
              style={styles.option}
              onPress={() => {
                onChangeText(opt.he);
                setFocused(false);
              }}
            >
              <AppText style={styles.optionText}>{opt.he}</AppText>
              <AppText style={styles.optionTextEn}>{opt.en}</AppText>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.field,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: FONT.regular,
    color: COLORS.text,
  },
  inputError: { borderColor: COLORS.dangerText },
  list: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.xs,
    maxHeight: 220,
    ...CARD_SHADOW,
  },
  option: {
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
  },
  optionText: { fontSize: 15, textAlign: 'right' },
  optionTextEn: { fontSize: 12, color: COLORS.textFaint, textAlign: 'left' },
});
