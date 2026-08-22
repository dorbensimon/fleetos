import React from 'react';
import { View, TextInput, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './Text';
import { AdminMenuButton } from './AdminMenuButton';
import { COLORS, FONT } from '../../lib/theme';

/**
 * The frosted-glass banner every admin screen opens with: title,
 * subtitle, the hamburger menu top-left, and the search field right
 * under the title — one glass surface, not stacked cards.
 */
export function AdminGlassHeader({
  title,
  subtitle,
  query,
  onChangeQuery,
  searchPlaceholder,
}: {
  title: string;
  subtitle: string;
  query: string;
  onChangeQuery: (v: string) => void;
  searchPlaceholder: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.wrap}>
      <BlurView intensity={25} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.tint} />

      <View style={[styles.content, { paddingTop: insets.top + 14 }]}>
        <View style={styles.topRow}>
          <View style={styles.titles}>
            <AppText weight="bold" style={styles.title}>
              {title}
            </AppText>
            <AppText style={styles.subtitle}>{subtitle}</AppText>
          </View>
          <AdminMenuButton />
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={17} color={COLORS.text} />
          <TextInput
            value={query}
            onChangeText={onChangeQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={COLORS.text}
            style={styles.input}
            textAlign="right"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: 'rgba(255,255,255,0.30)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 26,
      },
      android: { elevation: 6 },
    }),
  },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.30)' },
  content: { paddingHorizontal: 20, paddingBottom: 18 },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titles: { alignItems: 'flex-end' },
  title: { fontSize: 19, color: COLORS.text, letterSpacing: -0.2 },
  subtitle: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 1 },
  search: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    height: 54,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  input: {
    flex: 1,
    fontSize: 15.5,
    color: COLORS.text,
    fontFamily: FONT.bold,
    textAlign: 'right',
    padding: 0,
  },
});
