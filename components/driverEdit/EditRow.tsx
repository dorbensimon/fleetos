import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardTypeOptions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DE_COLORS, DE_RADIUS, DE_TYPO } from './driverEditTheme';

function RowShell({
  tinted,
  last,
  onPress,
  children,
}: {
  tinted: boolean;
  last: boolean;
  onPress?: () => void;
  children: React.ReactNode;
}) {
  const body = (
    <View style={[styles.row, tinted && styles.rowTinted]}>{children}</View>
  );
  return (
    <View style={[styles.wrap, !last && styles.wrapSeparator]}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [tinted && pressed && styles.rowPressed]}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
    </View>
  );
}

/** Read-only row synced from HR — value muted, marked with a "נעול" pill. */
export function EditLockedRow({
  label,
  value,
  last = false,
  ltr = false,
}: {
  label: string;
  value: string | null | undefined;
  last?: boolean;
  ltr?: boolean;
}) {
  const hasValue = !!value;
  return (
    <RowShell tinted={false} last={last}>
      <Text style={[DE_TYPO.rowLabel, styles.label]}>{label}</Text>
      <View style={styles.trailing}>
        <Text
          style={[DE_TYPO.rowValue, styles.value, !hasValue && styles.valueEmpty, ltr && styles.ltr]}
          numberOfLines={1}
        >
          {hasValue ? value : 'לא הוזן'}
        </Text>
        <View style={styles.lockPill}>
          <Text style={[DE_TYPO.pill, styles.lockPillText]}>נעול</Text>
        </View>
      </View>
    </RowShell>
  );
}

/** Borderless inline text input — one of the three fields the admin can actually change. */
export function EditInputRow({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  last = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  last?: boolean;
}) {
  return (
    <RowShell tinted last={last}>
      <Text style={[DE_TYPO.rowLabel, styles.label]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={DE_COLORS.ink30}
        keyboardType={keyboardType}
        style={[DE_TYPO.rowValue, styles.value, styles.input]}
        textAlign="left"
        selectionColor={DE_COLORS.accent}
        cursorColor={DE_COLORS.accent}
      />
    </RowShell>
  );
}

/** Opens a bottom sheet to choose a value; chevron points to the RTL end. */
export function EditPickerRow({
  label,
  value,
  placeholder,
  onPress,
  last = false,
}: {
  label: string;
  value: string | null | undefined;
  placeholder: string;
  onPress: () => void;
  last?: boolean;
}) {
  const hasValue = !!value;
  return (
    <RowShell tinted last={last} onPress={onPress}>
      <Text style={[DE_TYPO.rowLabel, styles.label]}>{label}</Text>
      <View style={styles.trailing}>
        <Text
          style={[DE_TYPO.rowValue, styles.value, !hasValue && styles.valueEmpty]}
          numberOfLines={1}
        >
          {hasValue ? value : placeholder}
        </Text>
        <Feather name="chevron-left" size={17} color={DE_COLORS.accent} />
      </View>
    </RowShell>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 8, marginVertical: 3 },
  wrapSeparator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DE_COLORS.hairline,
    marginHorizontal: 4,
    paddingBottom: 3,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 52,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: DE_RADIUS.row,
  },
  rowTinted: { backgroundColor: DE_COLORS.accentTint },
  rowPressed: { backgroundColor: DE_COLORS.accentTintHover, borderRadius: DE_RADIUS.row },
  label: { color: DE_COLORS.ink, writingDirection: 'rtl' },
  trailing: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexShrink: 1 },
  value: { color: DE_COLORS.ink70, flexShrink: 1 },
  valueEmpty: { color: DE_COLORS.ink30 },
  ltr: { writingDirection: 'ltr' },
  input: {
    flex: 1,
    padding: 0,
    color: DE_COLORS.ink,
  },
  lockPill: {
    paddingHorizontal: DE_RADIUS.pillMax,
    paddingVertical: DE_RADIUS.pillMin - 4,
    borderRadius: DE_RADIUS.pillMax,
    backgroundColor: DE_COLORS.hairline,
  },
  lockPillText: { color: DE_COLORS.ink40, writingDirection: 'rtl' },
});
