import React, { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  TextInput,
  View,
  ViewStyle,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState, LoadingState } from '../ui';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DK, DK_FONT, DK_RADIUS, DK_SHADOW, DK_SPACE, STATUS, type Status } from './theme';
// Components from the kit's core. Only used inside render functions, never
// at module load, so the index <-> parts import cycle is safe.
import { DKText, Pressy, Surface, useReducedMotion } from './index';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const NATIVE_DRIVER = Platform.OS !== 'web';
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_DRAWER = Easing.bezier(0.32, 0.72, 0, 1);

// ── Sections and lines ────────────────────────────────────────────────────

/** A quiet heading above a white surface — the unit every settings-style screen is built from. */
export function KitSection({
  title,
  trailing,
  children,
  style,
  surfaceStyle,
}: {
  title?: string;
  trailing?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  surfaceStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      {(!!title || !!trailing) && (
        <View style={styles.sectionHead}>
          {!!title && (
            <DKText variant="micro" color={DK.muted} accessibilityRole="header" style={styles.flex}>
              {title}
            </DKText>
          )}
          {trailing}
        </View>
      )}
      <Surface style={surfaceStyle}>{children}</Surface>
    </View>
  );
}

/** A read-only line: icon tile, label, value. Empty values say so in words. */
export function InfoLine({
  icon,
  label,
  value,
  first,
  ltr,
  locked,
  tint = DK.accent,
  onPress,
  trailing,
}: {
  icon: IconName;
  label: string;
  value?: string | null;
  first?: boolean;
  ltr?: boolean;
  locked?: boolean;
  tint?: string;
  onPress?: () => void;
  trailing?: ReactNode;
}) {
  const body = (
    <View style={[styles.line, !first && styles.divider]} accessible={!onPress} accessibilityLabel={`${label}: ${value || 'לא הוזן'}`}>
      <View style={[styles.lineIcon, { backgroundColor: `${tint}14` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={styles.lineText}>
        <DKText variant="caption" color={DK.muted}>
          {label}
        </DKText>
        <DKText variant="label" color={value ? DK.ink : DK.faint} ltr={!!value && ltr} style={ltr && value ? styles.ltrValue : undefined} numberOfLines={2}>
          {value || 'לא הוזן'}
        </DKText>
      </View>
      {trailing}
      {locked && <Ionicons name="lock-closed" size={14} color={DK.faint} accessibilityLabel="נעול לעריכה" />}
      {!!onPress && <Ionicons name="chevron-back" size={18} color={DK.faint} />}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressy onPress={onPress} accessibilityLabel={`${label}: ${value || 'לא הוזן'}`} pressScale={0.985}>
      {body}
    </Pressy>
  );
}

/** A 52pt text input in the kit's look: sunk at rest, white with a blue ring while typing. */
export function KitInput({ ltr, hasError, style, onFocus, onBlur, ...rest }: TextInputProps & { ltr?: boolean; hasError?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={DK.faint}
      textAlign={ltr ? 'left' : 'right'}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[styles.input, ltr && styles.inputLtr, focused && styles.inputFocused, hasError && styles.inputError, rest.editable === false && styles.inputLocked, style]}
    />
  );
}

/** An editable field inside a surface: label above, the input, and its error or hint under it. */
export function EditField({
  label,
  value,
  onChangeText,
  error,
  keyboardType,
  ltr,
  first,
  editor,
  hint,
  placeholder = 'לא הוזן',
  required,
  secureTextEntry,
  autoComplete,
  maxLength,
  editable,
  onBlur,
}: {
  label: string;
  value?: string;
  onChangeText?: (value: string) => void;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  ltr?: boolean;
  first?: boolean;
  /** A picker (date, select) shown instead of the text input. */
  editor?: ReactNode;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  secureTextEntry?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  maxLength?: number;
  editable?: boolean;
  onBlur?: () => void;
}) {
  return (
    <View style={[styles.field, !first && styles.divider]}>
      <DKText variant="caption" color={error ? STATUS.expired.fg : DK.inkSoft}>
        {label}
        {required ? <DKText variant="caption" color={STATUS.expired.fg}> *</DKText> : null}
      </DKText>
      {editor ?? (
        <KitInput
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          accessibilityLabel={label}
          accessibilityHint={error}
          placeholder={placeholder}
          ltr={ltr}
          hasError={!!error}
          secureTextEntry={secureTextEntry}
          autoComplete={autoComplete}
          autoCapitalize={ltr ? 'none' : undefined}
          maxLength={maxLength}
          editable={editable}
          onBlur={onBlur}
        />
      )}
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}

export function FieldMessage({ error, hint }: { error?: string | null; hint?: string | null }) {
  if (error) {
    return (
      <View style={styles.errorRow} accessibilityLiveRegion="polite">
        <Ionicons name="alert-circle" size={14} color={STATUS.expired.fg} />
        <DKText variant="caption" color={STATUS.expired.fg} style={styles.flex}>
          {error}
        </DKText>
      </View>
    );
  }
  if (!hint) return null;
  return (
    <DKText variant="caption" color={DK.muted}>
      {hint}
    </DKText>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────

/** A count beside a row or on a button; hidden at zero. */
export function CountPill({ count, tone = 'accent' }: { count: number; tone?: 'accent' | 'soon' | 'expired' | 'muted' }) {
  if (!count) return null;
  const bg = tone === 'soon' ? STATUS.soon.fill : tone === 'expired' ? STATUS.expired.fill : tone === 'muted' ? DK.surfaceSunk : DK.accent;
  const fg = tone === 'soon' ? DK.ink : tone === 'muted' ? DK.muted : '#FFFFFF';
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <DKText variant="micro" color={fg} ltr style={styles.center}>
        {count > 99 ? '99+' : String(count)}
      </DKText>
    </View>
  );
}

/** A person's initial on a rounded square. */
export function Avatar({ name, size = 48, tone = 'soft' }: { name?: string | null; size?: number; tone?: 'soft' | 'accent' | 'night' | 'muted' }) {
  const initial = (name || '?').trim().charAt(0) || '?';
  const bg = tone === 'accent' ? DK.accent : tone === 'night' ? DK.glass : tone === 'muted' ? DK.surfaceSunk : DK.accentSoft;
  const fg = tone === 'accent' || tone === 'night' ? '#FFFFFF' : tone === 'muted' ? DK.muted : DK.accent;
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: Math.round(size * 0.34), backgroundColor: bg },
        tone === 'night' && styles.avatarNight,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <DKText style={[styles.avatarText, { fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.52) }]} color={fg}>
        {initial}
      </DKText>
    </View>
  );
}

/** A square action tile: icon, an optional big value, title and caption. Two per row. */
export function Tile({
  icon,
  tint = DK.accent,
  value,
  title,
  caption,
  chip,
  highlight = false,
  onPress,
}: {
  icon: IconName;
  tint?: string;
  value?: string;
  title: string;
  caption: string;
  chip?: ReactNode;
  highlight?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressy onPress={onPress} accessibilityLabel={[title, value, caption].filter(Boolean).join(', ')} style={styles.tileWrap} pressScale={0.965}>
      <Surface style={[styles.tile, highlight && styles.tileHighlight]}>
        <View style={styles.tileTop}>
          <View style={[styles.tileIcon, { backgroundColor: `${tint}16` }]}>
            <Ionicons name={icon} size={21} color={tint} />
          </View>
          {chip}
        </View>
        <View style={styles.tileText}>
          {!!value && (
            <DKText variant="title" numberOfLines={1} adjustsFontSizeToFit style={styles.tabular}>
              {value}
            </DKText>
          )}
          <DKText variant="label" numberOfLines={1}>
            {title}
          </DKText>
          <DKText variant="caption" color={DK.muted} numberOfLines={2}>
            {caption}
          </DKText>
        </View>
      </Surface>
    </Pressy>
  );
}

/** A two-per-row grid for `Tile`s. */
export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={styles.tiles}>{children}</View>;
}

/** An inline message in the colour of its meaning, with an optional action. */
export function Banner({
  tone = 'soon',
  icon,
  title,
  children,
  action,
}: {
  tone?: Status | 'info';
  icon?: IconName;
  title?: string;
  children?: ReactNode;
  action?: { label: string; onPress: () => void; loading?: boolean };
}) {
  const s = tone === 'info' ? { fg: DK.accent, soft: DK.accentSoft, icon: 'information-circle' as const } : STATUS[tone];
  return (
    <View style={[styles.banner, { backgroundColor: s.soft }]} accessibilityLiveRegion="polite">
      <View style={styles.bannerRow}>
        <Ionicons name={icon ?? s.icon} size={19} color={s.fg} style={styles.bannerIcon} />
        <View style={styles.flex}>
          {!!title && (
            <DKText variant="label" color={s.fg}>
              {title}
            </DKText>
          )}
          {typeof children === 'string' ? (
            <DKText variant="caption" color={s.fg}>
              {children}
            </DKText>
          ) : (
            children
          )}
        </View>
      </View>
      {!!action && (
        <Pressy onPress={action.onPress} disabled={action.loading} accessibilityLabel={action.label} style={styles.bannerAction}>
          <DKText variant="label" color={s.fg}>
            {action.loading ? 'רגע…' : action.label}
          </DKText>
        </Pressy>
      )}
    </View>
  );
}

/** A calm, composed empty state: icon, what's missing, what will fill it. */
export function EmptyPanel({
  icon,
  title,
  body,
  tone = 'accent',
  action,
  children,
}: {
  icon: IconName;
  title: string;
  body?: string;
  tone?: 'accent' | 'ok' | 'muted';
  action?: { label: string; icon?: IconName; onPress: () => void };
  children?: ReactNode;
}) {
  const fg = tone === 'ok' ? STATUS.ok.fg : tone === 'muted' ? DK.muted : DK.accent;
  const bg = tone === 'ok' ? STATUS.ok.soft : tone === 'muted' ? DK.surfaceSunk : DK.accentSoft;
  return (
    <Surface style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={30} color={fg} />
      </View>
      <DKText variant="heading" style={styles.center}>
        {title}
      </DKText>
      {!!body && (
        <DKText variant="body" color={DK.muted} style={styles.center}>
          {body}
        </DKText>
      )}
      {!!action && (
        <Pressy onPress={action.onPress} accessibilityLabel={action.label} style={styles.emptyAction}>
          {!!action.icon && <Ionicons name={action.icon} size={18} color={DK.accent} />}
          <DKText variant="label" color={DK.accent}>
            {action.label}
          </DKText>
        </Pressy>
      )}
      {children}
    </Surface>
  );
}

export function LoadingPanel() {
  return (
    <Surface>
      <LoadingState />
    </Surface>
  );
}

export function ErrorPanel({ message, hint, onRetry }: { message?: string; hint?: string; onRetry?: () => void }) {
  return (
    <Surface>
      <ErrorState message={message} hint={hint} onRetry={onRetry} />
    </Surface>
  );
}

/** A full-width row inside a surface for one clear action (sign out, archive, delete). */
export function ActionRow({
  icon,
  label,
  onPress,
  tone = 'accent',
  first = true,
  disabled,
  hint,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'danger' | 'muted';
  first?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const fg = tone === 'danger' ? STATUS.expired.fg : tone === 'muted' ? DK.inkSoft : DK.accent;
  const bg = tone === 'danger' ? STATUS.expired.soft : tone === 'muted' ? DK.surfaceSunk : DK.accentSoft;
  return (
    <Pressy onPress={onPress} disabled={disabled} accessibilityLabel={label} accessibilityHint={hint} pressScale={0.985}>
      <View style={[styles.actionRow, !first && styles.divider]}>
        <View style={[styles.lineIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={19} color={fg} />
        </View>
        <View style={styles.flex}>
          <DKText variant="label" color={fg}>
            {label}
          </DKText>
          {!!hint && (
            <DKText variant="caption" color={DK.muted}>
              {hint}
            </DKText>
          )}
        </View>
      </View>
    </Pressy>
  );
}

// ── On the night hero ─────────────────────────────────────────────────────

/** Search on the night hero: frosted glass, white text, a clear button once there's a query. */
export function GlassSearch({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.search, focused && styles.searchFocused]}>
      <Ionicons name="search" size={18} color={DK.onNightMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={DK.onNightFaint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType="search"
        textAlign="right"
        accessibilityLabel={accessibilityLabel ?? placeholder}
        style={styles.searchInput}
      />
      {!!value && (
        <Pressy onPress={() => onChangeText('')} accessibilityLabel="ניקוי החיפוש" style={styles.searchClear} pressScale={0.9}>
          <Ionicons name="close-circle" size={19} color={DK.onNightMuted} />
        </Pressy>
      )}
    </View>
  );
}

/** A big number on frosted glass with what it counts; taps through when it leads somewhere. */
export function HeroStat({
  value,
  label,
  dot,
  onPress,
  active = false,
}: {
  value: number | string;
  label: string;
  dot?: string;
  onPress?: () => void;
  active?: boolean;
}) {
  const body = (
    <View style={[styles.stat, active && styles.statActive]}>
      <DKText style={styles.statValue} color={DK.onNight}>
        {typeof value === 'number' ? value.toLocaleString('he-IL') : value}
      </DKText>
      <View style={styles.statLabelRow}>
        {!!dot && <View style={[styles.statDot, { backgroundColor: dot }]} />}
        <DKText variant="micro" color={DK.onNightMuted} numberOfLines={1} style={styles.flexShrink}>
          {label}
        </DKText>
      </View>
    </View>
  );
  if (!onPress) {
    return (
      <View style={styles.flex} accessible accessibilityLabel={`${label}: ${value}`}>
        {body}
      </View>
    );
  }
  return (
    <Pressy onPress={onPress} accessibilityLabel={`${label}: ${value}`} style={styles.flex} pressScale={0.95}>
      {body}
    </Pressy>
  );
}

/**
 * A two-or-more way switch. The thumb slides under the chosen option
 * (spring, no bounce) so the change reads as one object moving.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  onNight = false,
}: {
  options: { value: T; label: string; icon?: IconName; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  onNight?: boolean;
}) {
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const pos = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    if (reduce) {
      pos.setValue(index);
      return;
    }
    Animated.spring(pos, { toValue: index, useNativeDriver: NATIVE_DRIVER, stiffness: 320, damping: 32, mass: 1 }).start();
  }, [index, pos, reduce]);
  const segment = width ? (width - 8) / options.length : 0;
  return (
    <View
      style={[styles.segmented, onNight ? styles.segmentedNight : styles.segmentedLight]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {!!segment && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segThumb,
            onNight ? styles.segThumbNight : styles.segThumbLight,
            { width: segment, transform: [{ translateX: Animated.multiply(pos, -segment) }] },
          ]}
        />
      )}
      {options.map((o) => {
        const active = o.value === value;
        const fg = active ? (onNight ? DK.nightInk : DK.ink) : onNight ? DK.onNightMuted : DK.muted;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={styles.segOption}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            accessibilityLabel={o.count != null ? `${o.label}, ${o.count}` : o.label}
          >
            {!!o.icon && <Ionicons name={o.icon} size={17} color={active && onNight ? DK.accent : fg} />}
            <DKText variant="label" color={fg}>
              {o.label}
            </DKText>
            {o.count != null && (
              <DKText variant="micro" color={active ? DK.muted : onNight ? DK.onNightFaint : DK.faint} ltr>
                {o.count.toLocaleString('he-IL')}
              </DKText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── On the canvas ─────────────────────────────────────────────────────────

/**
 * Horizontal filter pills, first option at the right. The chosen one is
 * ink with white text — the only dark pill in the row.
 */
export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  trailing,
}: {
  options: { value: T; label: string; count?: number; tone?: Status }[];
  value: T;
  onChange: (value: T) => void;
  trailing?: ReactNode;
}) {
  return (
    // The row is mirrored twice so it starts at the right and scrolls
    // leftward on every platform, including web where RTL scroll varies.
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.flip} contentContainerStyle={styles.pillsContent}>
      <View style={[styles.flip, styles.pillsRow]}>
        {options.map((o) => {
          const active = o.value === value;
          const empty = o.count === 0 && !active;
          return (
            <Pressy
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityLabel={o.count != null ? `${o.label}, ${o.count}` : o.label}
              pressScale={0.95}
              style={[styles.filter, active ? styles.filterActive : styles.filterIdle]}
            >
              {!!o.tone && !active && <View style={[styles.filterDot, { backgroundColor: STATUS[o.tone].fill }]} />}
              <DKText variant="label" color={active ? '#FFFFFF' : empty ? DK.faint : DK.inkSoft} numberOfLines={1}>
                {o.label}
              </DKText>
              {o.count != null && (
                <View style={[styles.filterCount, active && styles.filterCountActive]}>
                  <DKText variant="micro" color={active ? '#FFFFFF' : empty ? DK.faint : DK.muted} ltr style={styles.center}>
                    {o.count.toLocaleString('he-IL')}
                  </DKText>
                </View>
              )}
            </Pressy>
          );
        })}
        {trailing}
      </View>
    </ScrollView>
  );
}

/** The one floating action on a list screen: a blue disc that sits above the home indicator. */
export function Fab({ icon = 'add', label, onPress, bottom }: { icon?: IconName; label: string; onPress: () => void; bottom: number }) {
  return (
    <Pressy onPress={onPress} haptic accessibilityLabel={label} style={[styles.fab, { bottom }]} pressScale={0.92}>
      <Ionicons name={icon} size={24} color="#FFFFFF" />
      <DKText variant="label" color="#FFFFFF">
        {label}
      </DKText>
    </Pressy>
  );
}

// ── Sheet ─────────────────────────────────────────────────────────────────

/**
 * A bottom sheet on the phone (rises with the iOS drawer curve, 300ms;
 * the scrim fades), a centred dialog on the desktop. Closing reverses the
 * same path. Reduced motion keeps the fades and drops the travel.
 */
export function KitSheet({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  tone = 'accent',
  children,
  footer,
  dismissable = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: IconName;
  tone?: 'accent' | 'danger';
  children?: ReactNode;
  footer?: ReactNode;
  dismissable?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(t, { toValue: 1, duration: 300, easing: EASE_DRAWER, useNativeDriver: NATIVE_DRIVER }).start();
    } else if (mounted) {
      Animated.timing(t, { toValue: 0, duration: 220, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start(({ finished }) => finished && setMounted(false));
    }
  }, [mounted, t, visible]);
  if (!mounted) return null;
  const travel = reduce ? 0 : desktop ? 12 : 420;
  const close = () => dismissable && onClose();
  const iconFg = tone === 'danger' ? STATUS.expired.fg : DK.accent;
  const iconBg = tone === 'danger' ? STATUS.expired.soft : DK.accentSoft;
  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: t }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="סגירה" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.sheetHost, desktop && styles.sheetHostDesktop]} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          style={[
            desktop ? styles.dialog : styles.sheet,
            !desktop && { paddingBottom: insets.bottom + 16 },
            {
              opacity: desktop || reduce ? t : 1,
              transform: [
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] }) },
                ...(desktop && !reduce ? [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] : []),
              ],
            },
          ]}
        >
          {!desktop && <View style={styles.grab} />}
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody} style={styles.sheetScroll}>
            <View style={styles.sheetHead}>
              {!!icon && (
                <View style={[styles.sheetIcon, { backgroundColor: iconBg }]}>
                  <Ionicons name={icon} size={24} color={iconFg} />
                </View>
              )}
              <DKText variant="title" accessibilityRole="header">
                {title}
              </DKText>
              {!!subtitle && (
                <DKText variant="body" color={DK.muted}>
                  {subtitle}
                </DKText>
              )}
            </View>
            {children}
          </ScrollView>
          {!!footer && <View style={styles.sheetFooter}>{footer}</View>}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Two buttons side by side at the foot of a sheet: the safe choice and the one that acts. */
export function SheetActions({ children }: { children: ReactNode }) {
  return <View style={styles.sheetActions}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  tabular: { fontVariant: ['tabular-nums'] },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },

  sectionHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 6, marginBottom: 8, minHeight: 20 },
  line: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: DK_SPACE.md, paddingVertical: 10 },
  lineIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  lineText: { flex: 1, gap: 1 },
  ltrValue: { textAlign: 'right' },

  field: { paddingHorizontal: DK_SPACE.md, paddingVertical: 12, gap: 8 },
  input: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: DK.surfaceSunk,
    borderWidth: 1.5,
    borderColor: 'transparent',
    fontFamily: DK_FONT.medium,
    fontSize: 16,
    color: DK.ink,
    writingDirection: 'rtl',
    outlineStyle: 'none',
  } as any,
  inputLtr: { writingDirection: 'ltr' },
  inputFocused: { borderColor: DK.accent, backgroundColor: '#FFFFFF' },
  inputError: { borderColor: STATUS.expired.fill },
  inputLocked: { color: DK.muted },
  errorRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },

  pill: { minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarNight: { borderWidth: 1, borderColor: DK.glassBorder },
  avatarText: { fontFamily: DK_FONT.display, textAlign: 'center' },

  tiles: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  tileWrap: { width: '48%', flexGrow: 1 },
  tile: { minHeight: 162, padding: 16, justifyContent: 'space-between', borderRadius: 24 },
  tileHighlight: { borderWidth: 1.5, borderColor: 'rgba(224,122,0,0.35)' },
  tileTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  tileIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileText: { gap: 2, marginTop: 14 },

  banner: { borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  bannerRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 },
  bannerIcon: { marginTop: 1 },
  bannerAction: { alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', gap: 10, paddingVertical: 34, paddingHorizontal: 26 },
  emptyIcon: { width: 68, height: 68, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyAction: {
    marginTop: 6,
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: DK.accentSoft,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  actionRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: DK_SPACE.md, paddingVertical: 10 },

  search: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    height: 52,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  searchFocused: { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.42)' },
  searchInput: {
    flex: 1,
    height: '100%',
    fontFamily: DK_FONT.medium,
    fontSize: 16,
    color: DK.onNight,
    writingDirection: 'rtl',
    outlineStyle: 'none',
  } as any,
  searchClear: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  stat: {
    minHeight: 86,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  statActive: { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.34)' },
  statValue: { fontFamily: DK_FONT.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  statLabelRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  statDot: { width: 8, height: 8, borderRadius: 4 },

  segmented: { flexDirection: 'row-reverse', padding: 4, borderRadius: 18, height: 52 },
  segmentedNight: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  segmentedLight: { backgroundColor: '#E6EBF2' },
  segThumb: { position: 'absolute', top: 4, bottom: 4, right: 4, borderRadius: 14 },
  segThumbNight: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      web: { boxShadow: '0 6px 18px rgba(4,10,30,0.35)' } as any,
      default: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
    }),
  },
  segThumbLight: { backgroundColor: '#FFFFFF', ...DK_SHADOW },
  segOption: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6 },

  flip: { transform: [{ scaleX: -1 }] },
  pillsContent: { paddingHorizontal: DK_SPACE.md, paddingVertical: 2 },
  pillsRow: { flexDirection: 'row-reverse', gap: 8 },
  filter: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, height: 42, paddingHorizontal: 15, borderRadius: 999 },
  filterIdle: { backgroundColor: DK.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(10,22,38,0.1)' },
  filterActive: { backgroundColor: DK.ink },
  filterDot: { width: 7, height: 7, borderRadius: 4 },
  filterCount: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: DK.surfaceSunk, alignItems: 'center', justifyContent: 'center' },
  filterCountActive: { backgroundColor: 'rgba(255,255,255,0.18)' },

  fab: {
    position: 'absolute',
    left: 20,
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 28,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: DK.accent,
    zIndex: 20,
    ...Platform.select({
      web: { boxShadow: '0 14px 30px rgba(47,91,255,0.38), 0 2px 6px rgba(10,22,38,0.18)' } as any,
      default: { shadowColor: DK.accent, shadowOpacity: 0.38, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
    }),
  },

  scrim: { backgroundColor: 'rgba(6,14,32,0.48)' },
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
  sheetHostDesktop: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    maxHeight: '92%',
    backgroundColor: DK.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 8,
  },
  dialog: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '90%',
    backgroundColor: DK.surface,
    borderRadius: DK_RADIUS.card,
    paddingTop: 8,
    paddingBottom: 16,
    ...DK_SHADOW,
  },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(10,22,38,0.14)', marginBottom: 6 },
  sheetScroll: { flexGrow: 0 },
  sheetBody: { paddingHorizontal: DK_SPACE.lg, paddingTop: 10, paddingBottom: 6, gap: 16 },
  sheetHead: { gap: 6 },
  sheetIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  sheetFooter: { paddingHorizontal: DK_SPACE.lg, paddingTop: 12 },
  sheetActions: { flexDirection: 'row-reverse', gap: 10 },
});
