import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import { COLORS, RADIUS, SPACING, CARD_SHADOW } from '../../lib/theme';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Dropdown built on a modal sheet rather than the platform picker, so it
 * looks and behaves identically on iOS, Android and web.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder = 'בחר',
  hasError,
  allowClear,
}: {
  value: T | null;
  options: SelectOption<T>[];
  onChange: (v: T | null) => void;
  placeholder?: string;
  hasError?: boolean;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setOpen(true)}
        style={[styles.box, hasError && styles.boxError]}
      >
        <Ionicons name="chevron-down" size={16} color={COLORS.textFaint} />
        <AppText style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </AppText>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView bounces={false}>
              {allowClear && (
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <AppText style={styles.clearText}>ללא</AppText>
                </TouchableOpacity>
              )}
              {options.map((opt) => {
                const active = opt.value === value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={styles.option}
                    onPress={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    {active && <Ionicons name="checkmark" size={17} color={COLORS.accent} />}
                    <AppText
                      weight={active ? 'bold' : 'regular'}
                      style={[styles.optionText, active && { color: COLORS.accent }]}
                    >
                      {opt.label}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
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
  value: { flex: 1, fontSize: 15 },
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
    maxHeight: '70%',
    paddingVertical: SPACING.sm,
    ...CARD_SHADOW,
  },
  option: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
  },
  optionText: { flex: 1, fontSize: 15 },
  clearText: { flex: 1, fontSize: 15, color: COLORS.textFaint },
});
