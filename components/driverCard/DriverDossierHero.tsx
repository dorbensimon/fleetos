import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText, BackButton } from '../ui';
import { DOSSIER_BLUE, DOSSIER_BLUE_LIGHT, DOSSIER_INK } from '../../lib/dossierColors';

type IconName = keyof typeof Ionicons.glyphMap;

/** Shared compact identity header for screens opened from a driver's dossier. */
export function DriverDossierHero({ title, subtitle, icon, onBack, insetTop = 0 }: {
  title: string;
  subtitle?: string;
  icon: IconName;
  onBack: () => void;
  insetTop?: number;
}) {
  return <View style={[styles.wrap, { paddingTop: Math.max(insetTop, 12) + 8 }]}>
    <View style={styles.topRow}>
      <BackButton onPress={onBack} style={styles.backButton} />
      <LinearGradient colors={[DOSSIER_BLUE_LIGHT, DOSSIER_BLUE]} style={styles.icon}><Ionicons name={icon} size={42} color="#FFFFFF" /></LinearGradient>
    </View>
    <AppText weight="bold" style={styles.title}>{title}</AppText>
    {!!subtitle && <AppText style={styles.subtitle}>{subtitle}</AppText>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { minHeight: 150, paddingHorizontal: 20 },
  topRow: { height: 72, alignItems: 'center', justifyContent: 'center' },
  backButton: { position: 'absolute', right: 0, top: 15, zIndex: 2 },
  icon: { position: 'absolute', alignSelf: 'center', width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', shadowColor: DOSSIER_BLUE, shadowOpacity: 0.28, shadowRadius: 13, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  title: { marginTop: 7, fontSize: 25, letterSpacing: -0.5, color: DOSSIER_INK, textAlign: 'center' },
  subtitle: { marginTop: 1, fontSize: 15, color: 'rgba(14,30,43,0.5)', textAlign: 'center' },
});
