import React from 'react';
import {
  View,
  ViewProps,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
  TextInput,
  TextInputProps,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import {
  COLORS,
  CARD_SHADOW,
  SUBTLE_SHADOW,
  RADIUS,
  SPACING,
  FONT,
  ExpiryState,
  EXPIRY_STYLE,
} from '../../lib/theme';

export { AppText } from './Text';
export { AdminBottomBar } from './AdminBottomBar';
export { AdminGlassHeader } from './AdminGlassHeader';
export { AdminMenuButton } from './AdminMenuButton';
export { NotificationBellButton } from './NotificationBellButton';
export { AutocompleteInput } from './AutocompleteInput';
export { ToastProvider, useToast } from './Toast';
export { DriverMenuButton } from './DriverMenuButton';
export { default as DriversVehiclesToggle } from './DriversVehiclesToggle';
export type { ToggleValue } from './DriversVehiclesToggle';

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export function Screen({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[styles.screen, style]} />;
}

/* ------------------------------------------------------------------ */
/* Card — white surface lifted by a shadow, never a border             */
/* ------------------------------------------------------------------ */

export function Card({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[styles.card, style]} />;
}

export function PressableCard({ style, ...rest }: TouchableOpacityProps) {
  return <TouchableOpacity activeOpacity={0.85} {...rest} style={[styles.card, style]} />;
}

/* ------------------------------------------------------------------ */
/* Screen header                                                       */
/* ------------------------------------------------------------------ */

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack && (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-forward" size={22} color={COLORS.text} />
        </TouchableOpacity>
      )}
      <View style={styles.headerText}>
        <AppText weight="bold" style={styles.headerTitle} numberOfLines={1}>
          {title}
        </AppText>
        {!!subtitle && (
          <AppText style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </AppText>
        )}
      </View>
      {right}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

export function Badge({
  label,
  bg,
  fg,
}: {
  label: string;
  bg: string;
  fg: string;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <AppText weight="bold" style={[styles.badgeText, { color: fg }]}>
        {label}
      </AppText>
    </View>
  );
}

/** Badge driven by an expiry date's state. */
export function ExpiryBadge({ state, label }: { state: ExpiryState; label?: string }) {
  const s = EXPIRY_STYLE[state];
  return <Badge label={label ?? s.label} bg={s.bg} fg={s.fg} />;
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export function PrimaryButton({
  label,
  icon,
  loading,
  style,
  ...rest
}: TouchableOpacityProps & { label: string; icon?: any; loading?: boolean }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      {...rest}
      disabled={rest.disabled || loading}
      style={[styles.primaryBtn, (rest.disabled || loading) && styles.btnDisabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.textInverse} />
      ) : (
        <>
          {!!icon && <Ionicons name={icon} size={17} color={COLORS.textInverse} />}
          <AppText weight="bold" style={styles.primaryBtnText}>
            {label}
          </AppText>
        </>
      )}
    </TouchableOpacity>
  );
}

export function SecondaryButton({
  label,
  icon,
  danger,
  style,
  ...rest
}: TouchableOpacityProps & { label: string; icon?: any; danger?: boolean }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      {...rest}
      style={[styles.secondaryBtn, danger && styles.dangerBtn, style]}
    >
      {!!icon && (
        <Ionicons name={icon} size={16} color={danger ? COLORS.dangerText : COLORS.text} />
      )}
      <AppText weight="bold" style={[styles.secondaryBtnText, danger && { color: COLORS.dangerText }]}>
        {label}
      </AppText>
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------------ */
/* Form field                                                          */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  error,
  optional,
  children,
}: {
  label: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <AppText weight="bold" style={styles.fieldLabel}>
        {label}
        {optional && <AppText style={styles.fieldOptional}> (אופציונלי)</AppText>}
      </AppText>
      {children}
      {!!error && <AppText style={styles.fieldError}>{error}</AppText>}
    </View>
  );
}

export function Input({ style, hasError, ...rest }: TextInputProps & { hasError?: boolean }) {
  return (
    <TextInput
      placeholderTextColor={COLORS.textFaint}
      textAlign="right"
      {...rest}
      style={[styles.input, hasError && styles.inputError, style]}
    />
  );
}

/** LTR input for emails, phone numbers and plate numbers. */
export function InputLtr({ style, hasError, ...rest }: TextInputProps & { hasError?: boolean }) {
  return (
    <TextInput
      placeholderTextColor={COLORS.textFaint}
      textAlign="left"
      autoCapitalize="none"
      {...rest}
      style={[styles.input, styles.inputLtr, hasError && styles.inputError, style]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Search + filter chips                                               */
/* ------------------------------------------------------------------ */

export function SearchBar({ style, ...rest }: TextInputProps) {
  return (
    <View style={styles.searchBar}>
      <Ionicons name="search" size={16} color={COLORS.textFaint} />
      <TextInput
        placeholderTextColor={COLORS.textFaint}
        textAlign="right"
        {...rest}
        style={[styles.searchInput, style]}
      />
    </View>
  );
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: {
    value: T;
    label: string;
    count?: number;
    badgeColor?: string;
    icon?: React.ComponentProps<typeof Ionicons>['name'];
  }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
      style={styles.chipScrollFlip}
    >
      <View style={styles.chipRowFlip}>
        {options.map((opt) => {
          const active = opt.value === value;
          const empty = opt.count === 0 && !active;
          const dotColor = opt.badgeColor ?? COLORS.textFaint;

          const content = (
            <View style={styles.chip}>
              {opt.icon ? (
                <Ionicons name={opt.icon} size={15} color={dotColor} />
              ) : (
                <View style={[styles.chipDotHalo, { backgroundColor: `${dotColor}22` }]}>
                  <View style={[styles.chipDot, { backgroundColor: dotColor }]} />
                </View>
              )}
              <AppText
                weight="bold"
                numberOfLines={1}
                style={[
                  styles.chipText,
                  active && styles.chipTextActive,
                  empty && styles.chipTextEmpty,
                ]}
              >
                {opt.label}
              </AppText>
              {opt.count !== undefined && (
                <View style={styles.chipBadge}>
                  <AppText
                    weight="bold"
                    style={[styles.chipBadgeText, empty && styles.chipTextEmpty]}
                  >
                    {opt.count}
                  </AppText>
                </View>
              )}
            </View>
          );

          return (
            <TouchableOpacity key={opt.value} activeOpacity={0.8} onPress={() => onChange(opt.value)}>
              {active ? (
                // Pressed-in look: a clipped ring throws its shadow inward,
                // which reads as an inset shadow — RN has no real inset shadow.
                <View style={styles.chipPressedClip}>
                  <View style={[styles.chipRing, styles.chipRingDark]} pointerEvents="none" />
                  <View style={[styles.chipRing, styles.chipRingLight]} pointerEvents="none" />
                  {content}
                </View>
              ) : (
                // Flat, no shadow — depth only ever appears on the active pill.
                <View style={styles.chipInactive}>{content}</View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function LoadingState() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={COLORS.accent} />
    </View>
  );
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  hint,
}: {
  icon?: any;
  title: string;
  hint?: string;
}) {
  return (
    <View style={styles.centered}>
      <Ionicons name={icon} size={38} color={COLORS.textFaint} />
      <AppText weight="bold" style={styles.emptyTitle}>
        {title}
      </AppText>
      {!!hint && <AppText style={styles.emptyHint}>{hint}</AppText>}
    </View>
  );
}

/**
 * Shown when a load() call fails (network error, Supabase RLS/permission
 * error, etc) instead of silently falling through to an EmptyState/"not
 * found" message that misrepresents the failure as absence of data.
 */
export function ErrorState({
  message = 'משהו השתבש בטעינת הנתונים',
  hint = 'בדוק את החיבור לאינטרנט ונסה שוב',
  onRetry,
}: {
  message?: string;
  hint?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.centered}>
      <Ionicons name="alert-circle-outline" size={38} color={COLORS.dangerText} />
      <AppText
        weight="bold"
        style={styles.errorTitle}
        accessibilityRole="alert"
      >
        {message}
      </AppText>
      {!!hint && <AppText style={styles.emptyHint}>{hint}</AppText>}
      {!!onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={styles.retryBtn}
          accessibilityRole="button"
          accessibilityLabel="נסה שוב"
        >
          <Ionicons name="refresh" size={16} color={COLORS.accent} />
          <AppText weight="bold" style={styles.retryText}>
            נסה שוב
          </AppText>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** A labelled value, used all over the detail screens. */
export function InfoRow({
  label,
  value,
  right,
}: {
  label: string;
  value?: string | null;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.infoRow}>
      <AppText style={styles.infoLabel}>{label}</AppText>
      {right ?? (
        <AppText weight="bold" style={styles.infoValue}>
          {value || '—'}
        </AppText>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.screen },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...CARD_SHADOW,
  },

  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingTop: 56,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    backgroundColor: COLORS.card,
    ...SUBTLE_SHADOW,
  },
  backBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 21 },
  headerSubtitle: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },

  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11 },

  primaryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 50,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
  },
  primaryBtnText: { color: COLORS.textInverse, fontSize: 15.5 },
  btnDisabled: { opacity: 0.6 },

  secondaryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.neutralBg,
    paddingHorizontal: SPACING.lg,
  },
  dangerBtn: { backgroundColor: COLORS.dangerBg },
  secondaryBtnText: { fontSize: 14 },

  field: { gap: 6 },
  fieldLabel: { fontSize: 12.5, color: COLORS.textMuted },
  fieldOptional: { color: COLORS.textFaint, fontFamily: FONT.regular },
  fieldError: { fontSize: 11.5, color: COLORS.dangerText },

  input: {
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.field,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: FONT.regular,
    color: COLORS.text,
  },
  inputLtr: { textAlign: 'left' },
  inputError: { borderColor: COLORS.dangerText },

  searchBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.sm,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.card,
    paddingHorizontal: SPACING.md,
    ...SUBTLE_SHADOW,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: FONT.regular, color: COLORS.text },

  chipScrollFlip: { transform: [{ scaleX: -1 }] },
  chipRowFlip: { transform: [{ scaleX: -1 }], flexDirection: 'row-reverse', gap: 11 },
  chipRow: { paddingVertical: 2, paddingHorizontal: 1 },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    height: 40,
    paddingRight: 14,
    paddingLeft: 11,
  },
  // Flat, no shadow at all — the unselected state carries no depth.
  chipInactive: { backgroundColor: '#F7F7F6', borderRadius: RADIUS.pill },
  // Pressed-in (active) pill: overflow:hidden clips the rings' shadow to an
  // inward-reading edge, which is what fakes an inset shadow on iOS.
  chipPressedClip: {
    borderRadius: RADIUS.pill,
    backgroundColor: '#E4E2E0',
    overflow: 'hidden',
  },
  chipRing: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: RADIUS.pill,
    borderWidth: 8,
    borderColor: '#E4E2E0',
  },
  chipRingDark: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowOffset: { width: 3, height: 3 },
    shadowRadius: 6,
  },
  chipRingLight: {
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.95,
    shadowOffset: { width: -3, height: -3 },
    shadowRadius: 6,
  },
  chipDotHalo: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  chipText: { fontSize: 13.5, color: '#3A3A3A' },
  chipTextActive: { color: '#111111' },
  chipTextEmpty: { color: '#B4B4B4' },
  chipBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: '#EDEDEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipBadgeText: { fontSize: 11, color: COLORS.textMuted },

  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 14.5, color: COLORS.textMuted, marginTop: 4 },
  emptyHint: { fontSize: 12.5, color: COLORS.textFaint, textAlign: 'center', paddingHorizontal: SPACING.xl },
  errorTitle: { fontSize: 14.5, color: COLORS.text, marginTop: 4, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accentSoft,
  },
  retryText: { fontSize: 13.5, color: COLORS.accent },

  infoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  infoLabel: { fontSize: 13, color: COLORS.textMuted },
  infoValue: { fontSize: 13.5, flexShrink: 1, textAlign: 'left' },
});
