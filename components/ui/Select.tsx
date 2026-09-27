import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './Text';
import { COLORS, CONTENT_MAX_WIDTH, RADIUS, SPACING, CARD_SHADOW } from '../../lib/theme';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { PICKER_FIELD_STYLES } from './pickerFieldStyles';
import { DK, DK_FONT, DK_SHADOW } from '../driverKit/theme';

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
  const phone = !useIsDesktop();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setOpen(true)}
        style={[styles.box, phone && kit.box, hasError && (phone ? kit.boxError : styles.boxError)]}
        accessibilityRole="button"
        accessibilityLabel={selected?.label ?? placeholder}
        accessibilityHint="פתיחת רשימת האפשרויות"
      >
        <Ionicons name="chevron-down" size={phone ? 18 : 16} color={phone ? DK.muted : COLORS.textFaint} />
        <AppText style={[styles.value, phone && kit.value, !selected && (phone ? kit.placeholder : styles.placeholder)]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </AppText>
      </TouchableOpacity>

      <ChoiceSheet open={open} onClose={() => setOpen(false)} value={value} options={options} onPick={onChange} allowClear={allowClear} />
    </>
  );
}

export interface ChoiceSheetOption<T extends string> extends SelectOption<T> {
  /** A second, quieter line under the label. */
  hint?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

/**
 * The sheet that rises from the bottom with a list to choose from — the
 * one behind `Select`, usable on its own (e.g. "which vehicle to open").
 */
export function ChoiceSheet<T extends string>({
  open,
  onClose,
  options,
  onPick,
  value = null,
  title,
  allowClear,
}: {
  open: boolean;
  onClose: () => void;
  options: ChoiceSheetOption<T>[];
  onPick: (v: T | null) => void;
  value?: T | null;
  title?: string;
  allowClear?: boolean;
}) {
  const phone = !useIsDesktop();
  const [mounted, setMounted] = useState(false);
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(1)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;

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

  const translate = translateY.interpolate({ inputRange: [0, 1], outputRange: [0, 440] });
  const pick = (v: T | null) => {
    onPick(v);
    onClose();
  };

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrimOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="סגירה">
          <BlurView intensity={8} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        </Pressable>
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          phone && kit.sheet,
          { bottom: 8 + insets.bottom, transform: [{ translateY: translate }] },
        ]}
      >
        <View style={styles.grabHandle} />
        {!!title && (
          <AppText weight="bold" style={[styles.title, phone && kit.title]} accessibilityRole="header">
            {title}
          </AppText>
        )}
        <Pressable onPress={(e) => e.stopPropagation()}>
          <ScrollView bounces={false}>
            {allowClear && (
              <TouchableOpacity style={[styles.option, phone && kit.option]} onPress={() => pick(null)}>
                <AppText style={[styles.clearText, phone && kit.optionText, phone && { color: DK.muted }]}>ללא</AppText>
              </TouchableOpacity>
            )}
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.option, phone && kit.option, phone && active && kit.optionActive]}
                  accessibilityRole="button"
                  accessibilityLabel={opt.hint ? `${opt.label}, ${opt.hint}` : opt.label}
                  accessibilityState={{ selected: active }}
                  aria-selected={active}
                  onPress={() => pick(opt.value)}
                >
                  {!!opt.icon && (
                    <View style={kit.optionIcon}>
                      <Ionicons name={opt.icon} size={20} color={DK.accent} />
                    </View>
                  )}
                  <View style={styles.optionBody}>
                    <AppText
                      weight={active ? 'bold' : 'regular'}
                      style={[styles.optionText, phone && kit.optionText, active && { color: phone ? DK.accent : COLORS.accent }]}
                    >
                      {opt.label}
                    </AppText>
                    {!!opt.hint && <AppText style={[styles.hint, phone && kit.hint]}>{opt.hint}</AppText>}
                  </View>
                  {active ? (
                    <Ionicons name={phone ? 'checkmark-circle' : 'checkmark'} size={phone ? 20 : 17} color={phone ? DK.accent : COLORS.accent} />
                  ) : opt.icon ? (
                    <Ionicons name="chevron-back" size={18} color={phone ? DK.faint : COLORS.textFaint} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  box: PICKER_FIELD_STYLES.box,
  boxError: PICKER_FIELD_STYLES.boxError,
  value: { flex: 1, fontSize: 15 },
  placeholder: PICKER_FIELD_STYLES.placeholder,

  scrim: { backgroundColor: 'rgba(10, 24, 38, 0.38)' },
  sheet: {
    position: 'absolute',
    left: SPACING.sm,
    right: SPACING.sm,
    maxWidth: CONTENT_MAX_WIDTH,
    marginHorizontal: 'auto',
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
  optionBody: { flex: 1, gap: 2 },
  optionText: { fontSize: 15 },
  hint: { fontSize: 13, color: COLORS.textFaint },
  title: { fontSize: 16, textAlign: 'right', paddingHorizontal: SPACING.lg, paddingTop: SPACING.xs, paddingBottom: SPACING.sm },
  clearText: { flex: 1, fontSize: 15, color: COLORS.textFaint },
});

const kit = StyleSheet.create({
  box: { height: undefined, minHeight: 52, borderRadius: 16, backgroundColor: DK.surfaceSunk, borderColor: 'transparent' },
  boxError: { borderColor: '#FF4D5E' },
  value: { fontFamily: DK_FONT.medium, fontSize: 16, color: DK.ink },
  placeholder: { color: DK.faint },
  sheet: { borderRadius: 28, paddingTop: 10, paddingBottom: 10, ...DK_SHADOW },
  option: { minHeight: 52, marginHorizontal: 8, paddingHorizontal: 14, borderRadius: 14 },
  optionActive: { backgroundColor: DK.accentSoft },
  optionText: { fontFamily: DK_FONT.medium, fontSize: 16, color: DK.ink },
  optionIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  hint: { fontFamily: DK_FONT.regular, fontSize: 14, color: DK.muted },
  title: { fontFamily: DK_FONT.bold, fontSize: 18, color: DK.ink, paddingHorizontal: 22 },
});
