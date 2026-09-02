import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '../ui';
import { DE_CARD_SHADOW, DE_COLORS, DE_RADIUS, DE_TYPO } from './driverEditTheme';

const WASH_COLORS = {
  blue: DE_COLORS.washBlueTop,
  indigo: DE_COLORS.washIndigoTop,
} as const;

export function EditGlassCard({
  title,
  caption,
  badge,
  tint,
  children,
}: {
  title: string;
  caption?: string;
  badge?: React.ReactNode;
  /** Very light color wash so the group reads apart at a glance — decorative only. */
  tint?: 'blue' | 'indigo';
  children: React.ReactNode;
}) {
  return (
    <View style={styles.shadowWrap}>
      <View style={styles.clip}>
        <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
        {tint && (
          <LinearGradient
            colors={[WASH_COLORS[tint], DE_COLORS.washTransparent]}
            locations={[0, 0.6]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <AppText style={[DE_TYPO.cardTitle, styles.title]}>{title}</AppText>
            {!!caption && <AppText style={[DE_TYPO.caption, styles.caption]}>{caption}</AppText>}
          </View>
          {badge}
        </View>
        <View style={styles.rows}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    flex: 0,
    ...DE_CARD_SHADOW,
  },
  clip: {
    flex: 0,
    borderRadius: DE_RADIUS.card,
    overflow: 'hidden',
    backgroundColor: DE_COLORS.glassCardBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DE_COLORS.glassBorder,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
  },
  headerText: { flex: 1, gap: 5 },
  title: { color: DE_COLORS.ink, writingDirection: 'rtl', textAlign: 'right' },
  caption: { color: DE_COLORS.ink50, writingDirection: 'rtl', textAlign: 'right', lineHeight: 18 },
  rows: { paddingBottom: 10 },
});
