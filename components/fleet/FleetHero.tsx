import React, { useRef, useState } from 'react';
import { View, TextInput, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../ui';
import { FleetMenuButton, FleetBellButton } from './FleetHeroButtons';
import { RADIUS, timeGreeting } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { FLEET_COLORS, FLEET_FONT } from './fleetTheme';

/**
 * Field-visit hero for the admin fleet screen — same blue gradient and
 * glass language as the driver home screen, redesigned around the
 * admin's job: a glanceable fleet-status row instead of a single vehicle.
 *
 * The nav row (menu/greeting/bell) stays fixed. Below it, the stat cubes
 * fade + rise away as the list scrolls (`scrollY`, driven by whichever
 * list — drivers or vehicles — is currently active), leaving the search
 * field and export button resting just under the nav row. `FLEET_HERO`
 * below is the shared layout math the screen needs to size the sheet
 * that rises to meet this hero.
 */

export const FLEET_HERO = {
  // Gap between the nav row (menu/greeting/bell) and the stat cubes below
  // it — 40px at rest so the cubes don't read as glued to the bell, down
  // to a minimum of 18px once the search field has risen into their spot.
  navGapRest: 40,
  navGapCollapsed: 18,
  cubeRowHeight: 78,
  fieldHeight: 54,
  buttonHeight: 44,
  gap: 12,
} as const;

const { navGapRest, navGapCollapsed, cubeRowHeight, fieldHeight, buttonHeight, gap } = FLEET_HERO;

/** Scroll distance (px) over which the hero fully collapses. */
export const HERO_TRAVEL = navGapRest - navGapCollapsed + cubeRowHeight + gap;

/** Content height below the nav row, at rest (top gap + cubes + gaps + field + button). */
export const HERO_CONTENT_HEIGHT = navGapRest + cubeRowHeight + gap + fieldHeight + gap + buttonHeight;

export function heroNavHeight(insetsTop: number) {
  return insetsTop + 56;
}

export type FleetStat = { label: string; value: number; tint: string };

export function FleetHero({
  scrollY,
  stats,
  query,
  onChangeQuery,
  searchPlaceholder,
  onExportPress,
}: {
  scrollY: Animated.Value;
  stats: [FleetStat, FleetStat, FleetStat];
  query: string;
  onChangeQuery: (v: string) => void;
  searchPlaceholder: string;
  onExportPress?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { profile } = useCompany();
  const fullName = profile?.full_name?.trim();
  const navHeight = heroNavHeight(insets.top);
  const [searchFocused, setSearchFocused] = useState(false);
  const exportPress = useRef(new Animated.Value(1)).current;

  const exportPressIn = () =>
    Animated.spring(exportPress, { toValue: 0.97, useNativeDriver: true, stiffness: 400, damping: 24 }).start();
  const exportPressOut = () =>
    Animated.spring(exportPress, { toValue: 1, useNativeDriver: true, stiffness: 400, damping: 24 }).start();

  const cubesOpacity = scrollY.interpolate({
    inputRange: [0, HERO_TRAVEL],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const cubesScale = scrollY.interpolate({
    inputRange: [0, HERO_TRAVEL],
    outputRange: [1, 0.94],
    extrapolate: 'clamp',
  });
  const cubesTranslateY = scrollY.interpolate({
    inputRange: [0, HERO_TRAVEL],
    outputRange: [0, -20],
    extrapolate: 'clamp',
  });
  // Search field + export button rise together to fill the space the
  // cubes vacate, settling ~18px under the nav row rather than flush
  // against it.
  const riseTranslateY = scrollY.interpolate({
    inputRange: [0, HERO_TRAVEL],
    outputRange: [0, -HERO_TRAVEL],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.wrap, { height: navHeight + HERO_CONTENT_HEIGHT + 40 }]} pointerEvents="box-none">
      <LinearGradient
        colors={[FLEET_COLORS.primary, FLEET_COLORS.primaryDeep, FLEET_COLORS.primaryInk]}
        locations={[0, 0.6, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.glowCyan} pointerEvents="none" />
      <View style={styles.glowWhite} pointerEvents="none" />

      <View style={[styles.navRow, { top: insets.top + 14, height: navHeight - (insets.top + 14) }]}>
        <FleetMenuButton />
        <View style={styles.greetingWrap}>
          <AppText style={styles.greeting} numberOfLines={1}>
            {timeGreeting()}
          </AppText>
          <AppText weight="bold" style={styles.greetingName} numberOfLines={1}>
            {fullName || 'מנהל צי'}
          </AppText>
        </View>
        <FleetBellButton />
      </View>

      <Animated.View
        style={[
          styles.cubesRow,
          { top: navHeight + navGapRest, opacity: cubesOpacity, transform: [{ scale: cubesScale }, { translateY: cubesTranslateY }] },
        ]}
        pointerEvents="none"
      >
        {stats.map((stat) => (
          <View key={stat.label} style={styles.cube}>
            <View style={styles.cubeTint} />
            <AppText weight="bold" style={[styles.cubeValue, { color: stat.tint }]}>
              {stat.value}
            </AppText>
            <AppText style={styles.cubeLabel} numberOfLines={1}>
              {stat.label}
            </AppText>
          </View>
        ))}
      </Animated.View>

      <Animated.View
        style={[
          styles.search,
          searchFocused && styles.searchFocused,
          { top: navHeight + navGapRest + cubeRowHeight + gap, transform: [{ translateY: riseTranslateY }] },
        ]}
      >
        <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={
            searchFocused
              ? ['rgba(255,255,255,.34)', 'rgba(255,255,255,.2)']
              : ['rgba(255,255,255,.26)', 'rgba(255,255,255,.15)']
          }
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.75, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name="search" size={17} color="rgba(255,255,255,.85)" />
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder={searchPlaceholder}
          placeholderTextColor="rgba(255,255,255,.82)"
          style={styles.searchInput}
          textAlign="right"
        />
      </Animated.View>

      {!!onExportPress && (
        <Animated.View
          style={[
            styles.exportWrap,
            {
              top: navHeight + navGapRest + cubeRowHeight + gap + fieldHeight + gap,
              transform: [{ translateY: riseTranslateY }, { scale: exportPress }],
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={onExportPress}
            onPressIn={exportPressIn}
            onPressOut={exportPressOut}
            style={styles.exportBtn}
          >
            <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={['rgba(255,255,255,.9)', 'rgba(255,255,255,.74)']}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.75, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="document-text-outline" size={16} color="#0a3fa8" />
            <AppText weight="bold" style={styles.exportText}>
              ייצוא דוחות
            </AppText>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },

  glowCyan: {
    position: 'absolute',
    top: 110,
    left: -70,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(50,215,225,.35)',
  },
  glowWhite: {
    position: 'absolute',
    top: 250,
    right: -50,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(255,255,255,.22)',
  },

  navRow: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  greetingWrap: { flex: 1, alignItems: 'center' },
  greeting: { fontSize: 12, color: 'rgba(255,255,255,0.72)', fontFamily: FLEET_FONT.regular },
  greetingName: { fontSize: 15, color: '#fff', marginTop: 1, fontFamily: FLEET_FONT.bold },

  cubesRow: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: cubeRowHeight,
    flexDirection: 'row-reverse',
    gap,
  },
  cube: {
    flex: 1,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: FLEET_COLORS.heroGlassBorder,
  },
  cubeTint: { ...StyleSheet.absoluteFillObject, backgroundColor: FLEET_COLORS.heroGlassBg },
  cubeValue: { fontSize: 20, fontFamily: FLEET_FONT.black },
  cubeLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontFamily: FLEET_FONT.regular },

  search: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: fieldHeight,
    borderRadius: 23,
    overflow: 'hidden',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.38)',
    shadowColor: '#08245e',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  searchFocused: {
    borderColor: 'rgba(255,255,255,.55)',
  },
  searchInput: {
    flex: 1,
    fontSize: 15.5,
    color: '#fff',
    fontFamily: FLEET_FONT.regular,
    textAlign: 'right',
    padding: 0,
  },

  exportWrap: { position: 'absolute', left: 20, right: 20, height: buttonHeight },
  exportBtn: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.85)',
    shadowColor: '#08245e',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  exportText: { color: '#0a3fa8', fontSize: 14, fontFamily: FLEET_FONT.bold },
});
