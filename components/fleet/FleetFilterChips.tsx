import React, { useEffect, useRef } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { AppText } from '../ui';
import { RADIUS, SPACING } from '../../lib/theme';
import { FLEET_COLORS, FLEET_FONT } from '../../lib/colors';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * Same layout as the shared `FilterChips` (ui/index.tsx), but recolored
 * to the fleet-home palette — kept as its own component rather than
 * restyling the shared one, so other admin screens that still use the
 * original chip look aren't affected.
 */
export function FleetFilterChips<T extends string>({
  options,
  value,
  onChange,
  action,
}: {
  options: { value: T; label: string; count?: number; icon?: React.ComponentProps<typeof Ionicons>['name'] }[];
  value: T;
  onChange: (v: T) => void;
  /**
   * A chip that navigates somewhere instead of filtering this list — it
   * sits at the end of the row, is never "selected", and stays tappable at
   * a count of zero (unlike a filter, an empty destination is still worth
   * opening).
   */
  action?: {
    label: string;
    count?: number;
    icon?: React.ComponentProps<typeof Ionicons>['name'];
    onPress: () => void;
  };
}) {
  const scrollRef = useRef<ScrollView>(null);

  // RTL row: children render right-to-left via `row-reverse` below. A plain
  // horizontal ScrollView still starts scrolled to its LTR content start
  // (the left edge), which would open on the last chip instead of the
  // first — jump to the scroll end once, which lands on the row-reverse
  // layout's first (rightmost) chip.
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, []);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <View style={styles.rowFlip}>
        {options.map((opt) => (
          <Chip
            key={opt.value}
            label={opt.label}
            count={opt.count}
            icon={opt.icon}
            active={opt.value === value}
            onPress={() => {
              if (opt.value !== value) Haptics.selectionAsync();
              onChange(opt.value);
            }}
          />
        ))}

        {!!action && <Chip label={action.label} count={action.count} icon={action.icon} active={false} onPress={action.onPress} />}
      </View>
    </ScrollView>
  );
}

/**
 * "Double-bezel" chip: an outer shell (tinted capsule + hairline ring) holds
 * an inner core (the actual pill) at a smaller concentric radius, like a
 * machined part sitting in its own tray — instead of one flat pill floating
 * directly on the sheet. The count becomes its own nested circular "island"
 * inside the pill rather than a plain badge. Two inner-core content layers
 * (muted + brand gradient) crossfade on `activeAnim`, and the whole shell
 * gets the same press-scale spring used by the toggle and hero buttons
 * elsewhere on this screen.
 */
function Chip({
  label,
  count,
  icon,
  active,
  onPress,
}: {
  label: string;
  count?: number;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  onPress: () => void;
}) {
  const empty = count === 0 && !active;
  const activeAnim = useRef(new Animated.Value(active ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(activeAnim, {
      toValue: active ? 1 : 0,
      duration: 180,
      easing: EASE_OUT,
      useNativeDriver: true,
    }).start();
  }, [active, activeAnim]);

  const pressIn = () => Animated.spring(press, { toValue: 0.96, useNativeDriver: true, stiffness: 400, damping: 24 }).start();
  const pressOut = () => Animated.spring(press, { toValue: 1, useNativeDriver: true, stiffness: 400, damping: 24 }).start();

  const mutedContent = (
    <View style={styles.chip}>
      {icon && <Ionicons name={icon} size={15} color={FLEET_COLORS.textSecondary} />}
      <AppText weight="bold" numberOfLines={1} style={styles.text}>
        {label}
      </AppText>
      {count !== undefined && (
        <View style={styles.badge}>
          <AppText weight="bold" style={styles.badgeText}>
            {count}
          </AppText>
        </View>
      )}
    </View>
  );

  const activeContent = (
    <View style={styles.chip}>
      {icon && <Ionicons name={icon} size={15} color="#fff" />}
      <AppText weight="bold" numberOfLines={1} style={[styles.text, styles.textActive]}>
        {label}
      </AppText>
      {count !== undefined && (
        <View style={[styles.badge, styles.badgeActive]}>
          <AppText weight="bold" style={[styles.badgeText, styles.badgeTextActive]}>
            {count}
          </AppText>
        </View>
      )}
    </View>
  );

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={empty && styles.empty}>
      <Animated.View style={[styles.shell, { transform: [{ scale: press }] }]}>
        <View style={styles.core}>{mutedContent}</View>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.corePad, styles.coreShadow, { opacity: activeAnim }]}
          pointerEvents="none"
        >
          {/* The shadow lives on this un-clipped wrapper, not on the gradient
              below — a shadow and `overflow: hidden` on the same view get
              their shadow clipped away on iOS. */}
          <LinearGradient
            colors={[FLEET_COLORS.primary, FLEET_COLORS.primaryDeep]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.core}
          >
            <View style={styles.coreTopLight} pointerEvents="none" />
            {activeContent}
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const SHELL_PAD = 3;

const styles = StyleSheet.create({
  rowFlip: { flexDirection: 'row-reverse', gap: 10 },
  // Matches the cards' own `marginHorizontal: SPACING.lg` (DriverCard/VehicleCard)
  // so the first chip lines up with the card edge instead of sitting flush
  // against the screen edge.
  row: { paddingVertical: 2, paddingHorizontal: SPACING.lg },

  empty: { opacity: 0.45 },

  // Outer shell: a tinted capsule with a hairline ring, holding the inner
  // pill at a smaller concentric radius — the "machined part in its own
  // tray" read, instead of one pill sitting flat on the sheet.
  shell: {
    position: 'relative',
    padding: SHELL_PAD,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(11,12,16,.035)',
    borderWidth: 1,
    borderColor: 'rgba(11,12,16,.07)',
  },
  corePad: { top: SHELL_PAD, right: SHELL_PAD, bottom: SHELL_PAD, left: SHELL_PAD },

  core: { borderRadius: RADIUS.pill, overflow: 'hidden', backgroundColor: FLEET_COLORS.card },
  coreShadow: {
    borderRadius: RADIUS.pill,
    shadowColor: FLEET_COLORS.primaryInk,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  coreTopLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,.55)',
  },

  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    height: 38,
    paddingRight: 14,
    paddingLeft: 11,
  },

  text: { fontSize: 13.5, color: FLEET_COLORS.textSecondary, fontFamily: FLEET_FONT.bold },
  textActive: { color: '#fff' },

  // The count as its own nested circular "island" inside the pill, matching
  // the trailing-icon-in-its-own-circle pattern rather than a flat badge.
  badge: {
    minWidth: 21,
    height: 21,
    paddingHorizontal: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(11,12,16,.05)',
    borderWidth: 1,
    borderColor: 'rgba(11,12,16,.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeActive: { backgroundColor: 'rgba(255,255,255,.18)', borderColor: 'rgba(255,255,255,.3)' },
  badgeText: { fontSize: 11, color: FLEET_COLORS.textSecondary, fontFamily: FLEET_FONT.bold },
  badgeTextActive: { color: '#fff' },
});
