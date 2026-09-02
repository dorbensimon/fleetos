import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { DE_COLORS, DE_RADIUS, DE_TYPO } from './driverEditTheme';

const ENTER_MS = 340;
const EXIT_MS = 220;
const EASE = Easing.bezier(0.32, 0.72, 0, 1);

export interface EditSheetOption {
  value: string;
  label: string;
  description?: string;
}

export function EditBottomSheet({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: EditSheetOption[];
  selectedValue: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(1)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = React.useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.setValue(1);
      scrimOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: ENTER_MS, easing: EASE, useNativeDriver: true }),
        Animated.timing(scrimOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 1, duration: EXIT_MS, easing: EASE, useNativeDriver: true }),
        Animated.timing(scrimOpacity, { toValue: 0, duration: EXIT_MS, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  const translate = translateY.interpolate({ inputRange: [0, 1], outputRange: [0, 420] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrimOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <BlurView intensity={8} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        </Pressable>
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          { bottom: 8 + insets.bottom, transform: [{ translateY: translate }] },
        ]}
      >
        <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.grabHandle} />
        <Text style={[DE_TYPO.sheetTitle, styles.title]}>{title}</Text>

        <ScrollView style={styles.list} showsVerticalScrollIndicator={false} bounces={false}>
          {options.map((option) => {
            const active = option.value === selectedValue;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onSelect(option.value);
                }}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              >
                <View style={styles.optionText}>
                  <Text style={[DE_TYPO.sheetOption, styles.optionLabel, active && styles.optionLabelActive]}>
                    {option.label}
                  </Text>
                  {!!option.description && (
                    <Text style={[DE_TYPO.caption, styles.optionDescription]}>{option.description}</Text>
                  )}
                </View>
                {active && <Feather name="check" size={18} color={DE_COLORS.ink} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: DE_COLORS.scrim },
  panel: {
    position: 'absolute',
    left: 8,
    right: 8,
    borderRadius: DE_RADIUS.sheet,
    overflow: 'hidden',
    backgroundColor: DE_COLORS.glassSheetBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DE_COLORS.glassBorder,
    paddingTop: 10,
    paddingBottom: 16,
    paddingHorizontal: 18,
    maxHeight: 430,
  },
  grabHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: DE_COLORS.hairline,
    marginBottom: 14,
  },
  title: { color: DE_COLORS.ink, writingDirection: 'rtl', textAlign: 'right', marginBottom: 8 },
  list: { maxHeight: 330 },
  option: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: DE_RADIUS.row,
    paddingHorizontal: 8,
  },
  optionPressed: { backgroundColor: DE_COLORS.rowTint },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { color: DE_COLORS.ink70, writingDirection: 'rtl', textAlign: 'right' },
  optionLabelActive: { color: DE_COLORS.ink, fontFamily: DE_TYPO.sheetTitle.fontFamily },
  optionDescription: { color: DE_COLORS.ink40, writingDirection: 'rtl', textAlign: 'right' },
});
