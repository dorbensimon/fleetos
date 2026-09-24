import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ComplianceItem, Vehicle, VehicleDriverWithProfile } from '../../lib/adminApi';
import { useCompany } from '../../lib/CompanyContext';
import { formatPlate } from '../../lib/plate';
import { expiryState } from '../../lib/theme';
import { DLtrText, DText, HoverPressable, prefersReducedMotion } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';
import { DepartmentsQuickAction, ReportsQuickAction } from './DashboardWidgets';

/**
 * Building blocks of the desktop dashboard, one control per job:
 * - a segmented control picks what the page is about (drivers / vehicles);
 * - filter cards are both the numbers and the filters, and the selected one
 *   fills with its colour (Reminders smart-list style) so the current view
 *   is never in doubt;
 * - "needs attention" is a top-bar dropdown grouping only the problems no
 *   card already covers.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type FleetMode = 'drivers' | 'vehicles';

export type FilterCard<T extends string> = {
  value: T;
  label: string;
  hint: string;
  icon: IconName;
  count: number;
  tone?: DesktopTone;
};

const TABULAR = webOnly({ fontVariantNumeric: 'tabular-nums' });
/** Critically damped: the selection glides and settles with no bounce. */
const SPRING = { stiffness: 340, damping: 37, mass: 1, useNativeDriver: false } as const;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

/** Solid fills for a selected card — dark enough for white text. */
const TONE_FILL: Record<DesktopTone | 'brand', string> = {
  brand: DESKTOP_COLORS.brand,
  ok: '#1E9E4C',
  warn: '#D97706',
  bad: '#DC2F26',
  neutral: '#66727F',
};

function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  if (hour >= 17 && hour < 22) return 'ערב טוב';
  return 'לילה טוב';
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

export function FleetHeader() {
  const { profile } = useCompany();
  const now = new Date();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? '';
  const greeting = firstName ? `${greetingFor(now.getHours())}, ${firstName}` : greetingFor(now.getHours());
  const dateLine = now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <View style={[styles.header, enter(0)]}>
      <View style={styles.headerText}>
        <DText weight="bold" style={styles.greeting}>
          {greeting}
        </DText>
        <DText style={styles.dateLine}>{dateLine}</DText>
      </View>
      <View style={styles.headerActions}>
        <ReportsQuickAction />
        <DepartmentsQuickAction />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control: drivers / vehicles                               */
/* ------------------------------------------------------------------ */

/** Offset from the right edge and width of `value` in a row-reverse strip, once every width before it is known. */
function frameOf<T extends string>(order: T[], widths: Partial<Record<T, number>>, value: T) {
  const index = order.indexOf(value);
  if (index < 0) return null;
  let x = 0;
  for (let i = 0; i < index; i++) {
    const w = widths[order[i]];
    if (w == null) return null;
    x += w;
  }
  const width = widths[value];
  return width == null ? null : { x, width };
}

const MODES: { value: FleetMode; label: string; icon: IconName }[] = [
  { value: 'drivers', label: 'נהגים', icon: 'people' },
  { value: 'vehicles', label: 'רכבים', icon: 'car-sport' },
];

/** Segmented control: a dark thumb glides to the chosen segment on a critically damped spring. */
export function ModeSwitch({
  mode,
  compact,
  onChange,
}: {
  mode: FleetMode;
  /** Icon-only segments for narrow windows; the label stays as the accessible name. */
  compact?: boolean;
  onChange: (mode: FleetMode) => void;
}) {
  const reduce = prefersReducedMotion();
  // Widths only: RN-web reports size changes reliably but not position shifts, so the thumb's
  // offset is the sum of the segments before it (row-reverse: counted from the right edge).
  const widths = useRef<Partial<Record<FleetMode, number>>>({});
  const x = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  const moveTo = (value: FleetMode) => {
    const frame = frameOf(
      MODES.map((m) => m.value),
      widths.current,
      value,
    );
    if (!frame) return;
    if (!placed.current || reduce) {
      x.setValue(frame.x);
      width.setValue(frame.width);
      placed.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(x, { toValue: frame.x, ...SPRING }),
      Animated.spring(width, { toValue: frame.width, ...SPRING }),
    ]).start();
  };

  useEffect(() => {
    moveTo(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      <Animated.View pointerEvents="none" style={[styles.segmentThumb, { right: Animated.add(x, 3), width }]} />
      {MODES.map((item) => {
        const on = item.value === mode;
        return (
          <HoverPressable
            key={item.value}
            onLayout={(e: LayoutChangeEvent) => {
              widths.current[item.value] = e.nativeEvent.layout.width;
              moveTo(mode);
            }}
            style={[styles.segment, compact && styles.segmentCompact]}
            pressMotionStyle={styles.segmentPress}
            onPress={() => onChange(item.value)}
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            aria-selected={on}
          >
            <Ionicons name={item.icon} size={16} color={on ? '#FFFFFF' : DESKTOP_COLORS.inkMuted} />
            {!compact && (
              <DText weight="semiBold" style={[styles.segmentText, on && styles.segmentTextOn]}>
                {item.label}
              </DText>
            )}
          </HoverPressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Filter cards: the numbers are the filters                          */
/* ------------------------------------------------------------------ */

type FilterCardsProps<T extends string> = {
  cards: FilterCard<T>[];
  /** The list's current filter; a value with no card (e.g. archive) selects none. */
  selected: T;
  loading: boolean;
  /** Changing it remounts the rail, so switching drivers/vehicles reads as a new set. */
  animKey: string;
  onSelect: (value: T) => void;
};

/**
 * Status rail: every status is both a number and a filter. One coloured pill
 * slides (spring) under the chosen status and takes on its tone, with a soft
 * glow in the same colour; numbers count up when they arrive or change.
 */
export function FilterCards<T extends string>(props: FilterCardsProps<T>) {
  return <StatusRail key={props.animKey} {...props} />;
}

function StatusRail<T extends string>({ cards, selected, loading, onSelect }: FilterCardsProps<T>) {
  const reduce = prefersReducedMotion();
  const widths = useRef<Partial<Record<string, number>>>({});
  const x = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const current = cards.find((c) => c.value === selected);
  const fill = TONE_FILL[current?.tone ?? 'brand'];

  const moveTo = (value: T) => {
    const frame = frameOf(
      cards.map((c) => c.value),
      widths.current,
      value,
    );
    if (!frame) return;
    if (!placed.current || reduce) {
      x.setValue(frame.x);
      width.setValue(frame.width);
      placed.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(x, { toValue: frame.x, ...SPRING }),
      Animated.spring(width, { toValue: frame.width, ...SPRING }),
    ]).start();
  };

  useEffect(() => {
    moveTo(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <View style={styles.rail} accessibilityRole="tablist">
      <Animated.View
        pointerEvents="none"
        style={[
          styles.railPill,
          { right: x, width, backgroundColor: fill, opacity: current ? 1 : 0 },
          webOnly({ boxShadow: `0 8px 18px -8px ${fill}, inset 0 1px 0 rgba(255,255,255,0.28)` }),
        ]}
      />
      {cards.map((card, index) => {
        const on = card.value === selected;
        const tone = card.tone ? DESKTOP_TONES[card.tone] : null;
        // A warning status with nothing in it goes quiet instead of shouting "0" in red.
        const quiet = !loading && card.count === 0 && !!card.tone && card.tone !== 'ok';
        const countColor = on
          ? '#FFFFFF'
          : quiet
            ? DESKTOP_COLORS.inkFaint
            : tone && (card.tone === 'bad' || card.tone === 'warn')
              ? tone.fg
              : DESKTOP_COLORS.ink;
        return (
          <HoverPressable
            key={card.value}
            onLayout={(e: LayoutChangeEvent) => {
              widths.current[card.value] = e.nativeEvent.layout.width;
              moveTo(selected);
            }}
            style={[styles.stat, enterCard(index)]}
            hoverStyle={on ? undefined : styles.statHover}
            pressMotionStyle={styles.statPress}
            onPress={() => onSelect(card.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            aria-selected={on}
            accessibilityLabel={`${card.label}: ${card.count}. ${card.hint}`}
          >
            <View style={styles.statLabelRow}>
              {!!tone && !on && <View style={[styles.statDot, { backgroundColor: tone.fg }, quiet && styles.quiet]} />}
              <DText weight="medium" style={[styles.statLabel, on && styles.onWhiteSoft]} numberOfLines={1}>
                {card.label}
              </DText>
            </View>
            <CountUp value={loading ? null : card.count} style={[styles.statCount, TABULAR, { color: countColor }]} />
          </HoverPressable>
        );
      })}
    </View>
  );
}

/** Rolls a number from its previous value to the new one (ease-out quart); instant when motion is reduced. */
function CountUp({ value, style }: { value: number | null; style: React.ComponentProps<typeof DText>['style'] }) {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  useEffect(() => {
    if (value == null) return;
    const from = shownRef.current;
    if (from === value || prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
      shownRef.current = value;
      setShown(value);
      return;
    }
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / 650);
      const next = Math.round(from + (value - from) * (1 - Math.pow(1 - p, 4)));
      shownRef.current = next;
      setShown(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <DText weight="bold" style={style}>
      {value == null ? '–' : shown}
    </DText>
  );
}

/* ------------------------------------------------------------------ */
/* Needs attention                                                     */
/* ------------------------------------------------------------------ */

export type AttentionGroup = {
  id: string;
  icon: IconName;
  title: string;
  tone: DesktopTone;
  vehicles: { id: string; plate: string }[];
};

/**
 * Vehicle problems that no card filters for, grouped by problem: missing or
 * expired mandatory insurance, and vehicles nobody is assigned to. License
 * expiry has its own cards, so it is not repeated here.
 */
export function useAttentionGroups(
  vehicles: Vehicle[],
  compliance: Map<string, ComplianceItem[]>,
  vehicleDrivers: Map<string, VehicleDriverWithProfile[]>,
): AttentionGroup[] {
  return useMemo(() => {
    const live = vehicles.filter((v) => v.status !== 'archived');
    const uninsured = live.filter((v) => {
      const insurance = compliance.get(v.id)?.find((c) => c.item_type === 'insurance_mandatory');
      const state = expiryState(insurance?.expiry_date);
      return state === 'missing' || state === 'expired';
    });
    const unassigned = live.filter((v) => !vehicleDrivers.get(v.id)?.length);
    const plates = (list: Vehicle[]) => list.map((v) => ({ id: v.id, plate: formatPlate(v.plate_number) }));
    const groups: AttentionGroup[] = [
      { id: 'insurance', icon: 'shield-outline', title: 'ללא ביטוח חובה בתוקף', tone: 'bad', vehicles: plates(uninsured) },
      { id: 'unassigned', icon: 'person-add-outline', title: 'רכבים ללא נהג', tone: 'warn', vehicles: plates(unassigned) },
    ];
    return groups.filter((g) => g.vehicles.length > 0);
  }, [vehicles, compliance, vehicleDrivers]);
}

/**
 * "Needs attention" lives in the top bar next to the notifications bell: a
 * red pill with the total that drops down the full grouped list (it scrolls,
 * however long it gets). Hidden entirely when nothing needs attention.
 */
export function AttentionMenu({
  vehicles,
  compliance,
  vehicleDrivers,
  loading,
  onOpenVehicle,
}: {
  vehicles: Vehicle[];
  compliance: Map<string, ComplianceItem[]>;
  vehicleDrivers: Map<string, VehicleDriverWithProfile[]>;
  loading?: boolean;
  onOpenVehicle: (vehicleId: string) => void;
}) {
  const groups = useAttentionGroups(vehicles, compliance, vehicleDrivers);
  const [open, setOpen] = useState(false);
  const total = groups.reduce((sum, g) => sum + g.vehicles.length, 0);

  // Escape closes the menu, like any native dropdown.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (loading || total === 0) return null;

  const openVehicle = (vehicleId: string) => {
    setOpen(false);
    onOpenVehicle(vehicleId);
  };

  return (
    <View style={styles.menuWrap}>
      {open && <Pressable style={styles.menuBackdrop} onPress={() => setOpen(false)} accessibilityLabel="סגירה" />}
      <HoverPressable
        style={[styles.attentionPill, open && styles.attentionPillOpen]}
        hoverStyle={styles.attentionPillHover}
        pressMotionStyle={styles.chipPress}
        onPress={() => setOpen((v) => !v)}
        accessibilityLabel={`דורש טיפול, ${total}`}
        accessibilityState={{ expanded: open }}
      >
        <Ionicons name="alert-circle" size={15} color={DESKTOP_TONES.bad.fg} />
        <DText weight="semiBold" style={[styles.attentionPillText, TABULAR]}>
          {total === 1 ? 'רכב אחד דורש טיפול' : `${total} רכבים דורשים טיפול`}
        </DText>
        <Ionicons
          name="chevron-down"
          size={13}
          color={DESKTOP_TONES.bad.fg}
          style={[styles.menuChevron, open && styles.menuChevronOpen]}
        />
      </HoverPressable>
      {open && (
        <View style={[styles.menu, menuEnter()]}>
          <View style={styles.menuHead}>
            <DText weight="bold" style={styles.attentionTitle}>
              דורש טיפול
            </DText>
            <DText style={styles.attentionHint}>לחיצה על מספר רישוי פותחת את הרכב</DText>
          </View>
          <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuBody}>
            <AttentionGroups groups={groups} onOpenVehicle={openVehicle} />
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function AttentionGroups({ groups, onOpenVehicle }: { groups: AttentionGroup[]; onOpenVehicle: (vehicleId: string) => void }) {
  return (
    <>
      {groups.map((group, index) => {
        const tone = DESKTOP_TONES[group.tone];
        return (
          <View key={group.id} style={[styles.group, index > 0 && styles.groupDivider]}>
            <View style={styles.groupHead}>
              <View style={[styles.groupIcon, { backgroundColor: tone.bg }]}>
                <Ionicons name={group.icon} size={15} color={tone.fg} />
              </View>
              <DText weight="semiBold" style={styles.groupTitle} numberOfLines={1}>
                {group.title}
              </DText>
              <DText weight="bold" style={[styles.groupCount, TABULAR, { color: tone.fg }]}>
                {group.vehicles.length}
              </DText>
            </View>
            <View style={styles.chips}>
              {group.vehicles.map((v) => (
                <PlateChip key={v.id} plate={v.plate} onPress={() => onOpenVehicle(v.id)} />
              ))}
            </View>
          </View>
        );
      })}
    </>
  );
}

function PlateChip({ plate, onPress }: { plate: string; onPress: () => void }) {
  return (
    <HoverPressable
      style={styles.chip}
      hoverStyle={styles.chipHover}
      pressMotionStyle={styles.chipPress}
      onPress={onPress}
      accessibilityLabel={`פתח רכב ${plate}`}
    >
      <DLtrText weight="semiBold" style={[styles.chipText, TABULAR]}>
        {plate}
      </DLtrText>
    </HoverPressable>
  );
}

/* ------------------------------------------------------------------ */
/* Motion: CSS keyframes on web, transform + opacity only              */
/* ------------------------------------------------------------------ */

export function enter(order: number) {
  const reduced = prefersReducedMotion();
  return webOnly({
    animationKeyframes: reduced
      ? { from: { opacity: 0 }, to: { opacity: 1 } }
      : { from: { opacity: 0, transform: [{ translateY: 10 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } },
    animationDuration: reduced ? '160ms' : '520ms',
    animationTimingFunction: EASE_OUT,
    animationDelay: reduced ? '0ms' : `${order * 60}ms`,
    animationFillMode: 'backwards',
  });
}

/** Cards rise in one after another; opacity only when motion is reduced. */
function enterCard(index: number) {
  const reduced = prefersReducedMotion();
  return webOnly({
    animationKeyframes: reduced
      ? { from: { opacity: 0 }, to: { opacity: 1 } }
      : {
          from: { opacity: 0, transform: [{ translateY: 8 }, { scale: 0.98 }] },
          to: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
        },
    animationDuration: reduced ? '160ms' : '380ms',
    animationTimingFunction: EASE_OUT,
    animationDelay: reduced ? '0ms' : `${index * 40}ms`,
    animationFillMode: 'backwards',
  });
}

/** Dropdown drops from its trigger: short fade + slight scale, opacity only when motion is reduced. */
function menuEnter() {
  const reduced = prefersReducedMotion();
  return webOnly({
    animationKeyframes: reduced
      ? { from: { opacity: 0 }, to: { opacity: 1 } }
      : {
          from: { opacity: 0, transform: [{ translateY: -4 }, { scale: 0.97 }] },
          to: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
        },
    animationDuration: reduced ? '120ms' : '200ms',
    animationTimingFunction: EASE_OUT,
    transformOrigin: 'top left',
  });
}

export function enterRow(index: number) {
  if (prefersReducedMotion()) return false;
  return webOnly({
    animationKeyframes: {
      from: { opacity: 0, transform: [{ translateY: 6 }] },
      to: { opacity: 1, transform: [{ translateY: 0 }] },
    },
    animationDuration: '300ms',
    animationTimingFunction: EASE_OUT,
    animationDelay: `${Math.min(index, 10) * 22}ms`,
    animationFillMode: 'backwards',
  });
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 },
  headerText: { gap: 2 },
  greeting: { fontSize: 28, lineHeight: 34, color: DESKTOP_COLORS.ink, letterSpacing: -0.6 },
  dateLine: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  headerActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },

  segmented: {
    flexDirection: 'row-reverse',
    padding: 3,
    borderRadius: 14,
    backgroundColor: 'rgba(118,118,128,0.10)',
  },
  segmentThumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: 11,
    backgroundColor: DESKTOP_COLORS.ink,
    ...webOnly({ boxShadow: '0 6px 14px -6px rgba(22,34,46,0.55), inset 0 1px 0 rgba(255,255,255,0.12)' }),
  },
  segment: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 42,
    minWidth: 92,
    paddingHorizontal: 14,
    borderRadius: 11,
  },
  segmentCompact: { minWidth: 44, paddingHorizontal: 0 },
  segmentPress: { transform: [{ scale: 0.95 }] },
  segmentText: { fontSize: 14, color: DESKTOP_COLORS.inkMuted, ...webOnly({ transition: 'color 200ms ease' }) },
  segmentTextOn: { color: '#FFFFFF' },

  rail: { flexDirection: 'row-reverse', flexGrow: 1, flexShrink: 1, minWidth: 0 },
  railPill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 16,
    ...webOnly({ transition: 'background-color 260ms ease' }),
  },
  stat: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 76,
    height: 50,
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: 14,
    borderRadius: 16,
    ...webOnly({ transition: 'background-color 160ms ease' }),
  },
  statHover: { backgroundColor: 'rgba(118,118,128,0.08)' },
  statPress: { transform: [{ scale: 0.96 }] },
  statLabelRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statLabel: { fontSize: 12, color: DESKTOP_COLORS.inkMuted, flexShrink: 1, ...webOnly({ transition: 'color 200ms ease' }) },
  statCount: {
    fontSize: 21,
    lineHeight: 25,
    letterSpacing: -0.5,
    textAlign: 'right',
    ...webOnly({ transition: 'color 200ms ease' }),
  },
  quiet: { opacity: 0.45 },
  onWhiteSoft: { color: 'rgba(255,255,255,0.85)' },

  attentionTitle: { fontSize: 17, color: DESKTOP_COLORS.ink, letterSpacing: -0.2 },
  attentionHint: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, marginTop: 3 },
  group: { paddingVertical: 12 },
  groupDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DESKTOP_COLORS.border },
  groupHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  groupIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { flex: 1, fontSize: 14, color: DESKTOP_COLORS.ink },
  groupCount: { fontSize: 15 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 10, marginRight: 40 },
  attentionPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: DESKTOP_TONES.bad.bg,
    ...webOnly({ transition: 'background-color 150ms ease-out, transform 120ms ease-out' }),
  },
  attentionPillHover: { backgroundColor: 'rgba(255,69,58,0.2)' },
  attentionPillOpen: { backgroundColor: 'rgba(255,69,58,0.2)' },
  menuWrap: { position: 'relative', zIndex: 31 },
  menuBackdrop: { ...webOnly({ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, cursor: 'default' }) },
  menuChevron: { ...webOnly({ transition: `transform 200ms ${EASE_OUT}` }) },
  menuChevronOpen: { transform: [{ rotate: '180deg' }] },
  menu: {
    position: 'absolute',
    top: 40,
    left: 0,
    width: 360,
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DESKTOP_COLORS.border,
    overflow: 'hidden',
    ...webOnly({ boxShadow: '0 12px 32px rgba(16,34,50,0.18), 0 2px 6px rgba(16,34,50,0.06)' }),
  },
  menuHead: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DESKTOP_COLORS.border,
  },
  menuScroll: { ...webOnly({ maxHeight: 'calc(100vh - 150px)' }) },
  menuBody: { paddingHorizontal: 18, paddingVertical: 4 },
  attentionPillText: { fontSize: 13, color: DESKTOP_TONES.bad.fg },
  chip: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 8,
    justifyContent: 'center',
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderSoft,
    ...webOnly({ transition: 'background-color 150ms ease-out, border-color 150ms ease-out, transform 120ms ease-out' }),
  },
  chipHover: { backgroundColor: DESKTOP_COLORS.brandFocusRing, borderColor: 'rgba(0,136,204,0.28)' },
  chipPress: { transform: [{ scale: 0.95 }] },
  chipText: {
    fontSize: 12.5,
    color: DESKTOP_COLORS.ink,
    ...webOnly({ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }),
  },
});
