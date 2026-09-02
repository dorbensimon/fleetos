import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './Text';
import { COLORS, RADIUS, SPACING, CARD_SHADOW } from '../../lib/theme';

const ENTER_MS = 340;
const EXIT_MS = 220;
const SHEET_EASE = Easing.bezier(0.32, 0.72, 0, 1);

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
  const [mounted, setMounted] = useState(false);
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(1)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (open) {
      setMounted(true);
      translateY.setValue(1);
      scrimOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: ENTER_MS, easing: SHEET_EASE, useNativeDriver: true }),
        Animated.timing(scrimOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      return;
    }

    if (mounted) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 1, duration: EXIT_MS, easing: SHEET_EASE, useNativeDriver: true }),
        Animated.timing(scrimOpacity, { toValue: 0, duration: EXIT_MS, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [mounted, open, scrimOpacity, translateY]);

  const close = () => setOpen(false);
  const translate = translateY.interpolate({ inputRange: [0, 1], outputRange: [0, 440] });

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

      <Modal visible={mounted} transparent animationType="none" onRequestClose={close}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrimOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close}>
            <BlurView intensity={8} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, styles.scrim]} />
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { bottom: 8 + insets.bottom, transform: [{ translateY: translate }] },
          ]}
        >
          <View style={styles.grabHandle} />
          <Pressable onPress={(e) => e.stopPropagation()}>
            <ScrollView bounces={false}>
              {allowClear && (
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => {
                    onChange(null);
                    close();
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
                      close();
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
        </Animated.View>
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

  scrim: { backgroundColor: 'rgba(10, 24, 38, 0.38)' },
  sheet: {
    position: 'absolute',
    left: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    maxHeight: '70%',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    ...CARD_SHADOW,
  },
  grabHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.fieldBorder,
    marginBottom: SPACING.xs,
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
