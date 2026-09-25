import React, { useEffect, useState } from 'react';
import {
  View,
  ViewProps,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
  TextInput,
  TextInputProps,
  StyleProp,
  ViewStyle,
  Switch,
} from 'react-native';
import { BrandLoader } from './BrandLoader';
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
  CONTENT_MAX_WIDTH,
} from '../../lib/theme';
import { DOSSIER_BLUE } from '../../lib/dossierColors';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DK, DK_FONT, DK_SHADOW, STATUS } from '../driverKit/theme';

/**
 * On the phone these primitives take the icar kit's look (the same one the
 * driver screens are built from); the desktop keeps its own.
 */
function usePhone() {
  return !useIsDesktop();
}

export { AppText } from './Text';
export { ToastProvider, useToast } from './Toast';

/** The single compact back affordance used in app navigation headers. */
export function BackButton({
  onPress,
  accessibilityLabel = 'חזור',
  style,
}: {
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const phone = usePhone();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.appBackButton, phone && kit.backButton, style]}
      hitSlop={10}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name="chevron-forward" size={20} color={phone ? DK.ink : COLORS.accent} />
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export function Screen({ style, contentStyle, children, ...rest }: ViewProps & { contentStyle?: StyleProp<ViewStyle> }) {
  return (
    <View {...rest} style={[styles.screen, style]}>
      <View style={[styles.screenContent, contentStyle]}>{children}</View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Card — white surface lifted by a shadow, never a border             */
/* ------------------------------------------------------------------ */

export function Card({ style, ...rest }: ViewProps) {
  const phone = usePhone();
  return <View {...rest} style={[styles.card, phone && kit.card, style]} />;
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
      {onBack && <BackButton onPress={onBack} />}
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
  const phone = usePhone();
  return (
    <View style={[styles.badge, phone && kit.badge, { backgroundColor: bg }]}>
      <AppText weight="bold" style={[styles.badgeText, phone && kit.badgeText, { color: fg }]}>
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
  contentColor,
  disabledStyle,
  ...rest
}: TouchableOpacityProps & {
  label: string;
  icon?: any;
  loading?: boolean;
  /** Overrides the (otherwise fixed) white text/icon colour — e.g. for a muted disabled label. */
  contentColor?: string;
  /**
   * Replaces the default opacity-fade disabled look with a caller-supplied style
   * (e.g. a flat neutral background) when `disabled` is true. Falls back to the
   * default dimmed look everywhere this isn't passed, so existing call sites are
   * unaffected.
   */
  disabledStyle?: TouchableOpacityProps['style'];
}) {
  const phone = usePhone();
  const isDisabled = !!(rest.disabled || loading);
  const textIconColor = contentColor ?? COLORS.textInverse;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      aria-disabled={isDisabled} aria-busy={!!loading}
      {...rest}
      disabled={isDisabled}
      style={[styles.primaryBtn, phone && kit.primaryBtn, isDisabled && (disabledStyle ?? styles.btnDisabled), style]}
    >
      {loading ? (
        <BrandLoader color={textIconColor} />
      ) : (
        <>
          {!!icon && <Ionicons name={icon} size={phone ? 19 : 17} color={textIconColor} />}
          <AppText weight="bold" style={[styles.primaryBtnText, phone && kit.primaryBtnText, contentColor && { color: contentColor }]}>
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
  const phone = usePhone();
  const fg = phone ? (danger ? STATUS.expired.fg : DK.accent) : danger ? COLORS.dangerText : COLORS.text;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...rest}
      style={[styles.secondaryBtn, danger && styles.dangerBtn, phone && kit.secondaryBtn, phone && danger && kit.dangerBtn, style]}
    >
      {!!icon && <Ionicons name={icon} size={phone ? 18 : 16} color={fg} />}
      <AppText weight="bold" style={[styles.secondaryBtnText, phone && kit.secondaryBtnText, { color: fg }]}>
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
  const phone = usePhone();
  return (
    <View style={[styles.field, phone && kit.field]}>
      <AppText weight="bold" style={[styles.fieldLabel, phone && kit.fieldLabel, phone && !!error && { color: STATUS.expired.fg }]}>
        {label}
        {optional && <AppText style={[styles.fieldOptional, phone && kit.fieldOptional]}> (אופציונלי)</AppText>}
      </AppText>
      {children}
      {!!error &&
        (phone ? (
          <View style={kit.errorRow} accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle" size={14} color={STATUS.expired.fg} />
            <AppText style={kit.fieldError}>{error}</AppText>
          </View>
        ) : (
          <AppText style={styles.fieldError}>{error}</AppText>
        ))}
    </View>
  );
}

/** Focus ring for the phone's inputs (white with a blue edge while typing). */
function useFocusRing(rest: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return {
    focused,
    onFocus: (e: any) => {
      setFocused(true);
      rest.onFocus?.(e);
    },
    onBlur: (e: any) => {
      setFocused(false);
      rest.onBlur?.(e);
    },
  };
}

export function Input({ style, hasError, ...rest }: TextInputProps & { hasError?: boolean }) {
  const phone = usePhone();
  const ring = useFocusRing(rest);
  return (
    <TextInput
      placeholderTextColor={phone ? DK.faint : COLORS.textFaint}
      textAlign="right"
      {...rest}
      onFocus={ring.onFocus}
      onBlur={ring.onBlur}
      style={[
        styles.input,
        phone && kit.input,
        phone && ring.focused && kit.inputFocused,
        phone && rest.multiline && kit.inputMultiline,
        hasError && (phone ? kit.inputError : styles.inputError),
        phone && rest.editable === false && kit.inputLocked,
        style,
      ]}
    />
  );
}

/** LTR input for emails, phone numbers and plate numbers. */
export function InputLtr({ style, hasError, ...rest }: TextInputProps & { hasError?: boolean }) {
  const phone = usePhone();
  const ring = useFocusRing(rest);
  return (
    <TextInput
      placeholderTextColor={phone ? DK.faint : COLORS.textFaint}
      textAlign="left"
      autoCapitalize="none"
      {...rest}
      onFocus={ring.onFocus}
      onBlur={ring.onBlur}
      style={[
        styles.input,
        styles.inputLtr,
        phone && kit.input,
        phone && kit.inputLtr,
        phone && ring.focused && kit.inputFocused,
        hasError && (phone ? kit.inputError : styles.inputError),
        phone && rest.editable === false && kit.inputLocked,
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

/**
 * Full-area loading: the icar loader, centred. It appears only after a short
 * beat, so data that arrives quickly never flashes a loader on screen.
 */
export function LoadingState({ size = 48 }: { size?: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 150);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={styles.loadingCentered} accessibilityRole="progressbar" accessibilityLabel="טוען">
      {shown && <BrandLoader size={size} />}
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
  const phone = usePhone();
  return (
    <View style={styles.centered}>
      {phone ? (
        <View style={kit.stateIcon}>
          <Ionicons name={icon} size={28} color={DK.accent} />
        </View>
      ) : (
        <Ionicons name={icon} size={38} color={COLORS.textFaint} />
      )}
      <AppText weight="bold" style={[styles.emptyTitle, phone && kit.stateTitle]}>
        {title}
      </AppText>
      {!!hint && <AppText style={[styles.emptyHint, phone && kit.stateHint]}>{hint}</AppText>}
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
  const phone = usePhone();
  return (
    <View style={styles.centered}>
      {phone ? (
        <View style={[kit.stateIcon, { backgroundColor: STATUS.expired.soft }]}>
          <Ionicons name="cloud-offline-outline" size={28} color={STATUS.expired.fg} />
        </View>
      ) : (
        <Ionicons name="alert-circle-outline" size={38} color={COLORS.dangerText} />
      )}
      <AppText
        weight="bold"
        style={[styles.errorTitle, phone && kit.stateTitle]}
        accessibilityRole="alert"
      >
        {message}
      </AppText>
      {!!hint && <AppText style={[styles.emptyHint, phone && kit.stateHint]}>{hint}</AppText>}
      {!!onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={[styles.retryBtn, phone && kit.retryBtn]}
          accessibilityRole="button"
          accessibilityLabel="נסה שוב"
        >
          <Ionicons name="refresh" size={16} color={phone ? DK.accent : COLORS.accent} />
          <AppText weight="bold" style={[styles.retryText, phone && kit.retryText]}>
            נסה שוב
          </AppText>
        </TouchableOpacity>
      )}
    </View>
  );
}

/**
 * A labelled on/off row with an explanation line — used by the settings
 * screen's notification toggles. Saves immediately on change; the caller
 * owns the actual persistence + optimistic rollback on failure.
 */
export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const phone = usePhone();
  return (
    <View style={[styles.toggleRow, phone && kit.toggleRow]}>
      <View style={styles.toggleTextWrap}>
        <AppText weight="bold" style={[styles.toggleLabel, phone && kit.toggleLabel]}>
          {label}
        </AppText>
        {!!description && <AppText style={[styles.toggleDescription, phone && kit.toggleDescription]}>{description}</AppText>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: COLORS.fieldBorder, true: phone ? DK.accent : COLORS.accent }}
        thumbColor={COLORS.card}
        ios_backgroundColor={COLORS.fieldBorder}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled, checked: value }}
      />
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
  const phone = usePhone();
  return (
    <View style={[styles.infoRow, phone && kit.infoRow]}>
      <AppText style={[styles.infoLabel, phone && kit.infoLabel]}>{label}</AppText>
      {right ?? (
        <AppText weight="bold" style={[styles.infoValue, phone && kit.infoValue]}>
          {value || '—'}
        </AppText>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.screen },
  screenContent: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },

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
  appBackButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(10,127,208,0.20)',
    shadowColor: DOSSIER_BLUE,
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
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


  // Flat, no shadow at all — the unselected state carries no depth.
  // Pressed-in (active) pill: overflow:hidden clips the rings' shadow to an
  // inward-reading edge, which is what fakes an inset shadow on iOS.

  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 8 },
  loadingCentered: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center' },
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

  toggleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingVertical: 12,
  },
  toggleTextWrap: { flex: 1, gap: 3 },
  toggleLabel: { fontSize: 14.5, color: COLORS.text },
  toggleDescription: { fontSize: 12.5, color: COLORS.textMuted, lineHeight: 17 },

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

/* The phone's look — the icar kit (components/driverKit). */
const kit = StyleSheet.create({
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DK.hairline,
    ...DK_SHADOW,
  },
  card: { borderRadius: 24, padding: 16, ...DK_SHADOW },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontFamily: DK_FONT.semibold, fontSize: 12 },

  primaryBtn: {
    height: undefined,
    minHeight: 54,
    borderRadius: 18,
    gap: 8,
    paddingHorizontal: 18,
    backgroundColor: DK.accent,
    shadowColor: DK.accent,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  primaryBtnText: { fontFamily: DK_FONT.semibold, fontSize: 16 },
  secondaryBtn: { height: undefined, minHeight: 50, borderRadius: 16, gap: 8, backgroundColor: DK.accentSoft },
  dangerBtn: { backgroundColor: STATUS.expired.soft },
  secondaryBtnText: { fontFamily: DK_FONT.semibold, fontSize: 15.5 },

  field: { gap: 8 },
  fieldLabel: { fontFamily: DK_FONT.medium, fontSize: 13.5, lineHeight: 19, color: DK.inkSoft },
  fieldOptional: { color: DK.faint, fontFamily: DK_FONT.regular },
  errorRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  fieldError: { flex: 1, fontFamily: DK_FONT.medium, fontSize: 13.5, lineHeight: 19, color: STATUS.expired.fg },

  input: {
    height: undefined,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: DK.surfaceSunk,
    borderColor: 'transparent',
    fontFamily: DK_FONT.medium,
    fontSize: 16,
    color: DK.ink,
    outlineStyle: 'none',
  } as any,
  inputLtr: { writingDirection: 'ltr' },
  inputMultiline: { paddingTop: 14, paddingBottom: 14, minHeight: 104, textAlignVertical: 'top' },
  inputFocused: { borderColor: DK.accent, backgroundColor: '#FFFFFF' },
  inputError: { borderColor: STATUS.expired.fill },
  inputLocked: { color: DK.muted },


  stateIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  stateTitle: { fontFamily: DK_FONT.bold, fontSize: 17, lineHeight: 23, color: DK.ink, textAlign: 'center' },
  stateHint: { fontFamily: DK_FONT.regular, fontSize: 15, lineHeight: 21, color: DK.muted },
  retryBtn: { minHeight: 46, borderRadius: 999, paddingHorizontal: 18, backgroundColor: DK.accentSoft, marginTop: 10 },
  retryText: { fontFamily: DK_FONT.semibold, fontSize: 15, color: DK.accent },

  toggleRow: { minHeight: 64, paddingVertical: 12 },
  toggleLabel: { fontFamily: DK_FONT.semibold, fontSize: 15, color: DK.ink },
  toggleDescription: { fontFamily: DK_FONT.medium, fontSize: 13.5, lineHeight: 19, color: DK.muted },

  infoRow: { minHeight: 48, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  infoLabel: { fontFamily: DK_FONT.medium, fontSize: 14, color: DK.muted },
  infoValue: { fontFamily: DK_FONT.semibold, fontSize: 15, color: DK.ink },
});
