import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { DE_COLORS, DE_RADIUS, DE_TYPO } from './driverEditTheme';

export function EditNavBar({
  title,
  subtitle,
  statusLabel,
  statusActive = true,
  onBack,
  insetTop = 0,
}: {
  title: string;
  subtitle?: string;
  statusLabel?: string;
  statusActive?: boolean;
  onBack?: () => void;
  insetTop?: number;
}) {
  return (
    <View style={[styles.outer, { marginTop: insetTop + 10 }]}>
      <View style={styles.clip}>
        <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.content}>
          <Pressable onPress={onBack} style={styles.backButton} hitSlop={8}>
            <Feather name="chevron-right" size={19} color={DE_COLORS.ink} />
          </Pressable>

          <View style={styles.titleBlock}>
            <Text style={[DE_TYPO.navTitle, styles.title]} numberOfLines={1}>
              {title}
            </Text>
            {!!subtitle && (
              <Text style={[DE_TYPO.navSubtitle, styles.subtitle]} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>

          {statusLabel ? (
            <View
              style={[
                styles.statusChip,
                { backgroundColor: statusActive ? DE_COLORS.statusActiveBg : DE_COLORS.statusInactiveBg },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: statusActive ? DE_COLORS.statusActiveDot : DE_COLORS.statusInactiveDot },
                ]}
              />
              <Text
                style={[
                  DE_TYPO.pill,
                  styles.statusText,
                  { color: statusActive ? DE_COLORS.statusActiveText : DE_COLORS.statusInactiveText },
                ]}
              >
                {statusLabel}
              </Text>
            </View>
          ) : (
            <View style={styles.backButton} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { marginHorizontal: 12 },
  clip: {
    height: 56,
    borderRadius: DE_RADIUS.nav,
    overflow: 'hidden',
    backgroundColor: DE_COLORS.glassNavBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DE_COLORS.glassBorder,
  },
  content: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DE_COLORS.glassBorder,
  },
  titleBlock: { flex: 1, alignItems: 'center' },
  title: { color: DE_COLORS.ink },
  subtitle: { color: DE_COLORS.ink50, marginTop: 1 },
  statusChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    height: 26,
    borderRadius: 13,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { writingDirection: 'rtl' },
});
