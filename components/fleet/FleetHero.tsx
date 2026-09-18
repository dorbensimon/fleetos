import React, { useRef, useState } from 'react';
import { View, TextInput, StyleSheet, Animated, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../ui';
import { FleetMenuButton, FleetBellButton } from './FleetHeroButtons';
import { RADIUS, timeGreeting } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { FLEET_COLORS, FLEET_FONT } from '../../lib/colors';

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

/**
 * Deterministic "grain" dot field — a fixed, seeded scatter (not
 * re-randomized per render) that breaks up the hero's flat gradient with a
 * whisper of texture, the same idea as a noise overlay on a web hero but
 * built from plain Views since this project has no SVG/noise-image
 * dependency to reach for.
 */
const GRAIN_DOTS = (() => {
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  return Array.from({ length: 44 }, () => ({
    left: `${(rand() * 100).toFixed(1)}%`,
    top: `${(rand() * 100).toFixed(1)}%`,
    size: 1 + Math.round(rand()),
    opacity: 0.025 + rand() * 0.045,
  }));
})();

export const FLEET_HERO = {
  // Keep the fleet status immediately below the greeting. On a phone, a
  // larger gap pushes the useful content below the fold before the list
  // starts, so the resting gap is deliberately compact.
  navGapRest: 18,
  navGapCollapsed: 14,
  cubeRowHeight: 78,
  fieldHeight: 54,
  buttonHeight: 44,
  gap: 12,
} as const;

const { navGapRest, navGapCollapsed, cubeRowHeight, fieldHeight, buttonHeight, gap } = FLEET_HERO;

/** Scroll distance (px) over which the hero fully collapses. */
export const HERO_TRAVEL = navGapRest - navGapCollapsed + cubeRowHeight + gap;

/** Content height below the nav row, at rest. Quick actions live beside search on the same row. */
export const HERO_CONTENT_HEIGHT = navGapRest + cubeRowHeight + gap + fieldHeight + gap;

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
  onAttentionPress,
}: {
  scrollY: Animated.Value;
  stats: [FleetStat, FleetStat, FleetStat];
  query: string;
  onChangeQuery: (v: string) => void;
  searchPlaceholder: string;
  onExportPress?: () => void;
  onAttentionPress?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { profile } = useCompany();
  const fullName = profile?.full_name?.trim();
  const navHeight = heroNavHeight(insets.top);
  const [searchFocused, setSearchFocused] = useState(false);
  const exportPress = useRef(new Animated.Value(1)).current;
  const attentionPress = useRef(new Animated.Value(1)).current;

  const exportPressIn = () =>
    Animated.spring(exportPress, { toValue: 0.97, useNativeDriver: true, stiffness: 400, damping: 24 }).start();
  const exportPressOut = () =>
    Animated.spring(exportPress, { toValue: 1, useNativeDriver: true, stiffness: 400, damping: 24 }).start();

  const pressIn = (v: Animated.Value) =>
    Animated.spring(v, { toValue: 0.94, useNativeDriver: true, stiffness: 400, damping: 24 }).start();
  const pressOut = (v: Animated.Value) =>
    Animated.spring(v, { toValue: 1, useNativeDriver: true, stiffness: 400, damping: 24 }).start();

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
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Three off-center, unevenly sized glows instead of a mirrored
          pair — a mesh-like read rather than the generic symmetric
          "SaaS hero" blob pattern. */}
      <View style={styles.glowIndigo} pointerEvents="none" />
      <View style={styles.glowCyan} pointerEvents="none" />
      <View style={styles.glowWhite} pointerEvents="none" />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {GRAIN_DOTS.map((dot, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: dot.left as any,
              top: dot.top as any,
              width: dot.size,
              height: dot.size,
              borderRadius: dot.size,
              backgroundColor: '#fff',
              opacity: dot.opacity,
            }}
          />
        ))}
      </View>

      <View style={[styles.navRow, { top: insets.top + 2, height: navHeight - (insets.top + 2) }]}>
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
        <View style={styles.statsBar}>
          {stats.map((stat) => (
            <React.Fragment key={stat.label}>
              <View style={styles.statsSeg}>
                <View style={styles.statsSegTopLight} pointerEvents="none" />
                <AppText weight="bold" style={[styles.statsVal, { color: stat.tint }]}>
                  {stat.value}
                </AppText>
                <AppText style={styles.statsLabel} numberOfLines={1}>
                  {stat.label}
                </AppText>
              </View>
            </React.Fragment>
          ))}
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.searchRow,
          { top: navHeight + navGapRest + cubeRowHeight + gap, transform: [{ translateY: riseTranslateY }] },
        ]}
      >
        <View style={[styles.search, searchFocused && styles.searchFocused]}>
          {/* Safari can composite a web BlurView over the native input layer,
              which makes the search text itself look out of focus. The web
              tint + gradient below keep the same glass appearance without
              blurring the editable text. */}
          {Platform.OS !== 'web' && <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />}
          {Platform.OS === 'web' && <View style={[StyleSheet.absoluteFill, styles.searchWebTint]} pointerEvents="none" />}
          <LinearGradient
            colors={searchFocused ? ['rgba(255,255,255,.34)', 'rgba(255,255,255,.2)'] : ['rgba(255,255,255,.26)', 'rgba(255,255,255,.15)']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.75, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Ionicons name="search" size={20} color="rgba(255,255,255,.9)" pointerEvents="none" />
          <TextInput
            value={query}
            onChangeText={onChangeQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={searchPlaceholder}
            placeholderTextColor="rgba(255,255,255,.62)"
            style={styles.searchInput}
            textAlign="right"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={searchPlaceholder}
          />
        </View>
        {!!onAttentionPress && (
          <Animated.View style={{ transform: [{ scale: attentionPress }] }}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={onAttentionPress}
              onPressIn={() => pressIn(attentionPress)}
              onPressOut={() => pressOut(attentionPress)}
              style={[styles.quickAction, styles.attentionBtn]}
              accessibilityLabel="דורש טיפול"
            >
              <Ionicons name="alert-circle-outline" size={24} color="#102A42" />
            </TouchableOpacity>
          </Animated.View>
        )}
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

  glowIndigo: {
    position: 'absolute',
    top: -50,
    left: 30,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(45,70,190,.26)',
  },
  glowCyan: {
    position: 'absolute',
    top: 165,
    right: -95,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(50,215,225,.3)',
  },
  glowWhite: {
    position: 'absolute',
    top: 330,
    left: 4,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,.18)',
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
  },
  statsBar: {
    flex: 1,
    flexDirection: 'row-reverse',
    gap: 14,
  },
  statsSeg: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.24)',
    backgroundColor: 'rgba(255,255,255,.14)',
    paddingHorizontal: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  statsSegTopLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,.55)',
  },
  statsVal: { fontSize: 28, fontFamily: FLEET_FONT.black },
  statsLabel: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,.94)',
    fontFamily: FLEET_FONT.bold,
    textShadowColor: 'rgba(8,36,94,.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  searchRow: { position: 'absolute', left: 20, right: 20, height: fieldHeight, flexDirection: 'row-reverse', gap: 12 },
  search: {
    flex: 1,
    height: fieldHeight,
    borderRadius: 23,
    overflow: 'hidden',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.38)',
    shadowColor: FLEET_COLORS.primaryInk,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  searchFocused: {
    borderColor: 'rgba(255,255,255,.55)',
  },
  searchWebTint: {
    backgroundColor: 'rgba(9,55,130,.4)',
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
    shadowColor: FLEET_COLORS.primaryInk,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  exportText: { color: FLEET_COLORS.primaryDeep, fontSize: 14, fontFamily: FLEET_FONT.bold },
  quickAction: { width: fieldHeight, height: fieldHeight, borderRadius: fieldHeight / 2, alignItems: 'center', justifyContent: 'center' },
  attentionBtn: { backgroundColor: 'rgba(255,255,255,.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,.9)' },
});
