import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import { Input } from './index';
import { COLORS, RADIUS } from '../../lib/theme';

/**
 * Free-text input with a suggestion list underneath.
 *
 * The list is rendered inline rather than as a floating overlay: an
 * absolutely positioned dropdown gets clipped by the parent Card on
 * Android, and inside a scrolling form pushing the content down is the
 * behaviour that survives every platform.
 *
 * Typing anything is always allowed — the suggestions are a shortcut to
 * consistent spelling, not a closed list.
 */

export interface Suggestion {
  /** What gets written into the field when picked. */
  value: string;
  /** Optional second line, e.g. the English name of a brand. */
  hint?: string;
}

export function AutocompleteInput({
  value,
  onChangeText,
  suggest,
  placeholder,
  hasError,
}: {
  value: string;
  onChangeText: (text: string) => void;
  suggest: (query: string) => Suggestion[];
  placeholder?: string;
  hasError?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const matches = focused && !dismissed ? suggest(value) : [];
  // A single suggestion identical to what is already typed is just noise.
  const visible = matches.filter(
    (m) => !(matches.length === 1 && m.value.trim() === value.trim())
  );

  return (
    <View>
      <Input
        value={value}
        onChangeText={(text) => {
          setDismissed(false);
          onChangeText(text);
        }}
        onFocus={() => setFocused(true)}
        // Delayed so a tap on a suggestion registers before the list closes.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        hasError={hasError}
        autoCorrect={false}
      />

      {visible.length > 0 && (
        <View style={styles.list}>
          {visible.map((item) => (
            <TouchableOpacity
              key={item.value}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => {
                onChangeText(item.value);
                setDismissed(true);
              }}
            >
              <Ionicons name="arrow-up-outline" size={13} color={COLORS.textFaint} />
              <AppText style={styles.rowText} numberOfLines={1}>
                {item.value}
              </AppText>
              {!!item.hint && <AppText style={styles.rowHint}>{item.hint}</AppText>}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.fieldBorder,
    backgroundColor: COLORS.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
  },
  rowText: { flex: 1, fontSize: 14.5, color: COLORS.text, textAlign: 'right' },
  rowHint: { fontSize: 11.5, color: COLORS.textFaint },
});
