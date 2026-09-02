import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppText } from '../ui';
import { RootStackParamList } from '../../navigation/types';
import { useCompany } from '../../lib/CompanyContext';
import { countUnreadNotifications } from '../../lib/adminApi';
import { FLEET_COLORS, FLEET_FONT, FLEET_SHADOWS } from './fleetTheme';

const CIRCLE = 42;

/** Hamburger menu button for the fleet hero — hero-glass circle, per §4 "Hero על כחול". */
export function FleetMenuButton() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const press = useRef(new Animated.Value(1)).current;

  const pressIn = () => Animated.spring(press, { toValue: 0.94, useNativeDriver: true, stiffness: 400, damping: 24 }).start();
  const pressOut = () => Animated.spring(press, { toValue: 1, useNativeDriver: true, stiffness: 400, damping: 24 }).start();

  return (
    <Animated.View style={{ transform: [{ scale: press }] }}>
      <TouchableOpacity
        style={styles.glassCircle}
        activeOpacity={1}
        onPress={() => navigation.navigate('Menu')}
        onPressIn={pressIn}
        onPressOut={pressOut}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel="תפריט"
      >
        <BlurView intensity={23} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.glassTint} />
        <View style={styles.menuLines}>
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={[styles.menuLine, { width: 11 }]} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

/** Notification bell — exact spec: 42px circle, blue-gradient fill, red badge, tap scale + one-shot pulse when unread grows. */
export function FleetBellButton() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { companyId } = useCompany();
  const [unread, setUnread] = useState(0);
  const press = useRef(new Animated.Value(1)).current;
  const badgePulse = useRef(new Animated.Value(1)).current;
  const prevUnread = useRef(unread);

  const refreshUnread = useCallback(async () => {
    if (!companyId) return;
    setUnread(await countUnreadNotifications(companyId));
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      refreshUnread();
    }, [refreshUnread])
  );

  useEffect(() => {
    if (unread > prevUnread.current) {
      badgePulse.setValue(1);
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1.25, duration: 160, useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    }
    prevUnread.current = unread;
  }, [unread, badgePulse]);

  const pressIn = () => Animated.spring(press, { toValue: 0.94, useNativeDriver: true, stiffness: 400, damping: 24 }).start();
  const pressOut = () => Animated.spring(press, { toValue: 1, useNativeDriver: true, stiffness: 400, damping: 24 }).start();

  const label = unread > 0 ? `התראות, ${unread} חדשות` : 'התראות';
  const badgeText = unread > 99 ? '99+' : String(unread);

  return (
    <Animated.View style={{ transform: [{ scale: press }] }}>
      <TouchableOpacity
        style={styles.bellWrap}
        activeOpacity={1}
        onPress={() => navigation.navigate('Notifications')}
        onPressIn={pressIn}
        onPressOut={pressOut}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <LinearGradient
          colors={[FLEET_COLORS.primaryLight, '#0a5ad6']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.bellCircle}
        >
          <Ionicons name="notifications" size={19} color={unread > 0 ? '#fff' : 'rgba(255,255,255,.85)'} />
        </LinearGradient>

        {unread > 0 && (
          <Animated.View style={[styles.badge, { transform: [{ scale: badgePulse }] }]}>
            <AppText weight="bold" style={styles.badgeText}>
              {badgeText}
            </AppText>
          </Animated.View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glassCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: FLEET_COLORS.heroGlassBorder,
  },
  glassTint: { ...StyleSheet.absoluteFillObject, backgroundColor: FLEET_COLORS.heroGlassBg },
  menuLines: { gap: 4, alignItems: 'flex-end' },
  menuLine: { width: 17, height: 2, borderRadius: 2, backgroundColor: '#fff' },

  bellWrap: { width: CIRCLE, height: CIRCLE },
  bellCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.45)',
    ...FLEET_SHADOWS.bell,
  },
  badge: {
    position: 'absolute',
    top: -3,
    left: -3,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: FLEET_COLORS.danger.fill,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontFamily: FLEET_FONT.bold },
});
