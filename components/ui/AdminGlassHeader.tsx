import React from 'react';
import { View, TextInput, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './Text';
import { AdminMenuButton } from './AdminMenuButton';
import { NotificationBellButton } from './NotificationBellButton';
import DriversVehiclesToggle, { ToggleValue } from './DriversVehiclesToggle';
import { COLORS, FONT, timeGreeting } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';

/**
 * The frosted-glass banner every admin screen opens with: the hamburger
 * menu top-left, the search field right under it, and the drivers/
 * vehicles toggle right under that — one glass surface, not stacked
 * sections. No title/subtitle — this stays fixed on screen while
 * everything else (KPIs, filters, list) scrolls underneath it.
 */
export function AdminGlassHeader({
  query,
  onChangeQuery,
  searchPlaceholder,
  toggleValue,
  onToggleChange,
}: {
  query: string;
  onChangeQuery: (v: string) => void;
  searchPlaceholder: string;
  toggleValue: ToggleValue;
  onToggleChange: (v: ToggleValue) => void;
}) {
  const insets = useSafeAreaInsets();
  const { profile } = useCompany();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  return (
    <View style={styles.wrap}>
      <BlurView intensity={25} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.tint} />

      <View style={[styles.content, { paddingTop: insets.top + 14 }]}>
        <View style={styles.topRow}>
          <View style={styles.greetingWrap}>
            <AppText style={styles.greeting} numberOfLines={1}>
              {timeGreeting()}, {firstName || 'אדמין'}
            </AppText>
          </View>
          <View style={styles.menuGroup}>
            <NotificationBellButton />
            <AdminMenuButton />
          </View>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={17} color={COLORS.textMuted} />
          <TextInput
            value={query}
            onChangeText={onChangeQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            textAlign="right"
          />
        </View>

        <DriversVehiclesToggle value={toggleValue} onChange={onToggleChange} />
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
    gap: 10,
    marginBottom: 12,
  },
  greetingWrap: { flex: 1 },
  menuGroup: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  greeting: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'right',
  },
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
    color: COLORS.textMuted,
    fontFamily: FONT.regular,
    textAlign: 'right',
    padding: 0,
  },
});
