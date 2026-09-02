import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../ui';
import { SG_COLORS, SG_RADIUS, SG_SHADOW, SG_TYPO } from './signingTheme';

const CARD_HEIGHT = 132;

export function AddTemplateCard({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.addWrap}>
      <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.addTint} pointerEvents="none" />
      <Ionicons name="add" size={30} color="rgba(255,255,255,0.9)" />
    </TouchableOpacity>
  );
}

export function TemplateCard({
  title,
  createdLabel,
  footerValue,
  primary,
  loading,
  onPress,
  onSend,
}: {
  title: string;
  createdLabel: string;
  footerValue: string;
  primary: boolean;
  loading?: boolean;
  onPress: () => void;
  onSend: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={loading}
      style={[styles.cardWrap, { width: primary ? 212 : 150 }, primary ? SG_SHADOW.cardPrimary : SG_SHADOW.cardSecondary]}
    >
      <BlurView intensity={primary ? 34 : 22} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[styles.tint, primary ? styles.tintPrimary : styles.tintSecondary]} pointerEvents="none" />

      <View style={styles.cardTop}>
        {loading ? (
          <Ionicons name="hourglass-outline" size={24} color={SG_COLORS.accentLine} />
        ) : (
          <Ionicons name="pencil-outline" size={24} color={SG_COLORS.accentLine} />
        )}
      </View>

      <View>
        <AppText numberOfLines={1} style={[SG_TYPO.cardTitle, styles.title]}>
          {title}
        </AppText>
        <AppText numberOfLines={1} style={[SG_TYPO.sub, styles.sub]}>
          {createdLabel}
        </AppText>
      </View>

      <View style={styles.footerRow}>
        <View>
          <AppText style={[SG_TYPO.label, styles.footerLabel]}>עודכן</AppText>
          <AppText style={[SG_TYPO.cardMeta, styles.footerValue]}>{footerValue}</AppText>
        </View>
        <TouchableOpacity hitSlop={8} onPress={onSend}>
          <AppText style={[SG_TYPO.recipients, styles.sendLink]}>שלח ‹</AppText>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  addWrap: {
    width: 64,
    height: CARD_HEIGHT,
    borderRadius: SG_RADIUS.card,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.2)' },
  cardWrap: {
    height: CARD_HEIGHT,
    borderRadius: SG_RADIUS.card,
    overflow: 'hidden',
    padding: 18,
    justifyContent: 'space-between',
  },
  tint: { ...StyleSheet.absoluteFillObject },
  tintPrimary: { backgroundColor: 'rgba(255,255,255,0.55)' },
  tintSecondary: { backgroundColor: 'rgba(255,255,255,0.35)' },
  cardTop: { alignItems: 'flex-end' },
  title: { color: SG_COLORS.textPrimary, textAlign: 'right', writingDirection: 'rtl' },
  sub: { color: SG_COLORS.textTertiary, textAlign: 'right', writingDirection: 'rtl', marginTop: 2 },
  footerRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  footerLabel: { color: SG_COLORS.textTertiary },
  footerValue: { color: SG_COLORS.textPrimary, marginTop: 1 },
  sendLink: { color: SG_COLORS.brand },
});
