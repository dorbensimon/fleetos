import React, { useRef, useState } from 'react';
import { Modal, Pressable, PressableProps, ScrollView, StyleProp, Text, TextInput, TextProps, View, ViewStyle, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DESKTOP_COLORS, DESKTOP_FONT, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';
import { formatDate, parseDateValue } from '../../lib/theme';

type Weight = keyof typeof DESKTOP_FONT;

/** Heebo text, right-aligned RTL by default — the desktop counterpart of AppText. */
export function DText({ weight = 'regular', style, ...rest }: TextProps & { weight?: Weight }) {
  return <Text {...rest} style={[styles.text, { fontFamily: DESKTOP_FONT[weight] }, style]} />;
}

/** Latin data (dates, plates, phones) inside the Hebrew UI stays LTR but keeps the RTL column alignment. */
export function DLtrText(props: TextProps & { weight?: Weight }) {
  return <DText {...props} style={[styles.ltr, props.style]} />;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

type HoverState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/**
 * Pressable with react-native-web's hover/focus state exposed to the style
 * callback, plus a pointer cursor — every clickable element on desktop.
 */
export function HoverPressable({
  style,
  hoverStyle,
  pressStyle,
  children,
  ...rest
}: Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  hoverStyle?: StyleProp<ViewStyle>;
  /** Feedback applied the instant the pointer goes down — opt-in, since a scale/transform isn't safe on every layout. */
  pressStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      style={(state) => {
        const { hovered, focused, pressed } = state as HoverState;
        return [
          webOnly({
            cursor: rest.disabled ? 'default' : 'pointer',
            transition: 'transform 100ms ease-out',
            outlineColor: DESKTOP_COLORS.brand,
            outlineOffset: 2,
          }),
          style,
          (hovered || focused) && !rest.disabled ? hoverStyle : null,
          pressed && !rest.disabled ? pressStyle : null,
        ];
      }}
    >
      {children}
    </Pressable>
  );
}

export function StatusPill({ tone, label }: { tone: DesktopTone; label: string }) {
  const colors = DESKTOP_TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: colors.bg }]}>
      <DText weight="bold" style={[styles.pillText, { color: colors.fg }]} numberOfLines={1}>
        {label}
      </DText>
    </View>
  );
}

/** Dense label-left / control-right row used by every desktop form (driver, vehicle, settings). */
export function DesktopFieldRow({
  label,
  required,
  error,
  children,
  last,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[fieldStyles.row, last && fieldStyles.rowLast]}>
      <DText weight="semiBold" style={fieldStyles.label}>
        {label}
        {required ? <DText style={fieldStyles.required}> *</DText> : null}
      </DText>
      <View style={fieldStyles.control}>
        {children}
        {!!error && <DText style={fieldStyles.error}>{error}</DText>}
      </View>
    </View>
  );
}

/** Plain-bordered text input matching the desktop form row — the counterpart of the mobile FormFieldRow's input. */
export function DesktopInput({
  value,
  onChangeText,
  placeholder,
  ltr,
  keyboardType,
  secureTextEntry,
  maxLength,
  editable = true,
  hasError,
  style,
}: {
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  ltr?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'email-address' | 'numeric';
  secureTextEntry?: boolean;
  maxLength?: number;
  editable?: boolean;
  hasError?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={DESKTOP_COLORS.inkFaint}
      keyboardType={keyboardType}
      secureTextEntry={secureTextEntry}
      maxLength={maxLength}
      editable={editable}
      style={[
        fieldStyles.input,
        ltr && fieldStyles.inputLtr,
        !editable && fieldStyles.inputDisabled,
        hasError && fieldStyles.inputError,
        style,
      ]}
    />
  );
}

export interface DesktopSelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

/** Lightweight inline dropdown for desktop forms — a popover under the trigger, not the mobile bottom sheet. */
export function DesktopSelect<T extends string>({
  value,
  options,
  onChange,
  placeholder = 'בחר',
  allowClear,
  hasError,
}: {
  value: T | null;
  options: DesktopSelectOption<T>[];
  onChange: (v: T | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<View>(null);
  const selected = options.find((o) => o.value === value);

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ top: y + height + 4, left: x, width });
      setOpen(true);
    });
  };

  return (
    <View ref={triggerRef}>
      <HoverPressable
        style={[fieldStyles.selectBox, hasError && fieldStyles.inputError]}
        hoverStyle={{ borderColor: DESKTOP_COLORS.brand }}
        onPress={() => (open ? setOpen(false) : openMenu())}
      >
        <Ionicons name="chevron-down" size={14} color={DESKTOP_COLORS.inkFaint} />
        <DText style={[fieldStyles.selectValue, !selected && fieldStyles.placeholder]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </DText>
      </HoverPressable>

      {open && anchor && (
        <Modal transparent visible animationType="none" onRequestClose={() => setOpen(false)}>
          <Pressable style={fieldStyles.selectCatcher} onPress={() => setOpen(false)} />
          <ScrollView style={[fieldStyles.selectMenu, { top: anchor.top, left: anchor.left, width: anchor.width }, prefersReducedMotion() ? fieldStyles.popoverInReduced : fieldStyles.popoverIn]}>
            {allowClear && (
              <HoverPressable
                style={fieldStyles.selectOption}
                hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <DText style={fieldStyles.placeholder}>{placeholder}</DText>
              </HoverPressable>
            )}
            {options.map((option) => (
              <HoverPressable
                key={option.value}
                style={fieldStyles.selectOption}
                hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <DText weight={option.value === value ? 'semiBold' : 'regular'} style={fieldStyles.selectOptionText}>
                  {option.label}
                </DText>
                {!!option.description && <DText style={fieldStyles.selectOptionDesc}>{option.description}</DText>}
              </HoverPressable>
            ))}
          </ScrollView>
        </Modal>
      )}
    </View>
  );
}

const WEEKDAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

function toIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Compact calendar popover matching DesktopSelect's chrome — the desktop counterpart of the mobile DateField (which uses a bottom-sheet). */
export function DesktopDateField({
  value,
  onChange,
  placeholder = 'בחר תאריך',
  hasError,
  allowClear = true,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  hasError?: boolean;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => (value ? parseDateValue(value) : new Date()));
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<View>(null);

  const openPicker = () => {
    setCursor(value ? parseDateValue(value) : new Date());
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ top: y + height + 4, left: x, width });
      setOpen(true);
    });
  };

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const leadingBlanks = monthStart.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const selected = value ? parseDateValue(value) : null;
  const isSelectedDay = (day: number) =>
    !!selected && selected.getFullYear() === cursor.getFullYear() && selected.getMonth() === cursor.getMonth() && selected.getDate() === day;

  return (
    <View ref={triggerRef}>
      <HoverPressable
        style={[fieldStyles.selectBox, hasError && fieldStyles.inputError]}
        hoverStyle={{ borderColor: DESKTOP_COLORS.brand }}
        onPress={openPicker}
      >
        <Ionicons name="calendar-outline" size={14} color={DESKTOP_COLORS.inkFaint} />
        <DText style={[fieldStyles.selectValue, !value && fieldStyles.placeholder]} numberOfLines={1}>
          {value ? formatDate(value) : placeholder}
        </DText>
      </HoverPressable>

      {open && anchor && (
        <Modal transparent visible animationType="none" onRequestClose={() => setOpen(false)}>
          <Pressable style={fieldStyles.selectCatcher} onPress={() => setOpen(false)} />
          <View style={[fieldStyles.calendarMenu, { top: anchor.top, left: anchor.left }, prefersReducedMotion() ? fieldStyles.popoverInReduced : fieldStyles.popoverIn]}>
            <View style={fieldStyles.calendarHeader}>
              <HoverPressable
                style={fieldStyles.calendarNavBtn}
                hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              >
                <Ionicons name="chevron-forward" size={14} color={DESKTOP_COLORS.ink} />
              </HoverPressable>
              <DText weight="semiBold" style={fieldStyles.calendarTitle}>
                {cursor.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}
              </DText>
              <HoverPressable
                style={fieldStyles.calendarNavBtn}
                hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              >
                <Ionicons name="chevron-back" size={14} color={DESKTOP_COLORS.ink} />
              </HoverPressable>
            </View>
            <View style={fieldStyles.calendarWeekRow}>
              {WEEKDAY_LABELS.map((label) => (
                <DText key={label} style={fieldStyles.calendarWeekday}>{label}</DText>
              ))}
            </View>
            <View style={fieldStyles.calendarGrid}>
              {Array.from({ length: leadingBlanks }, (_, i) => (
                <View key={`blank-${i}`} style={fieldStyles.calendarCell} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
                <HoverPressable
                  key={day}
                  style={[fieldStyles.calendarCell, isSelectedDay(day) && fieldStyles.calendarCellSelected]}
                  hoverStyle={!isSelectedDay(day) ? { backgroundColor: DESKTOP_COLORS.rowHover } : null}
                  onPress={() => {
                    onChange(toIsoDate(new Date(cursor.getFullYear(), cursor.getMonth(), day)));
                    setOpen(false);
                  }}
                >
                  <DText weight={isSelectedDay(day) ? 'bold' : 'regular'} style={[fieldStyles.calendarCellText, isSelectedDay(day) && fieldStyles.calendarCellTextSelected]}>
                    {day}
                  </DText>
                </HoverPressable>
              ))}
            </View>
            {allowClear && (
              <HoverPressable
                style={fieldStyles.calendarClear}
                hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <DText style={fieldStyles.calendarClearText}>נקה תאריך</DText>
              </HoverPressable>
            )}
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: DESKTOP_COLORS.ink, fontSize: 13.5, textAlign: 'right', writingDirection: 'rtl' },
  ltr: { writingDirection: 'ltr' },
  pill: { alignSelf: 'flex-end', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2.5 },
  pillText: { fontSize: 11 },
});

const fieldStyles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.borderSoft,
    gap: 16,
  },
  rowLast: { borderBottomWidth: 0 },
  label: { width: 140, fontSize: 13, color: DESKTOP_COLORS.ink, paddingTop: 8 },
  required: { color: DESKTOP_COLORS.danger, fontSize: 13 },
  control: { flex: 1, maxWidth: 380 },
  error: { fontSize: 11.5, color: DESKTOP_COLORS.danger, marginTop: 5 },
  input: {
    height: 34,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    color: DESKTOP_COLORS.ink,
    fontFamily: DESKTOP_FONT.regular,
    textAlign: 'right',
    backgroundColor: DESKTOP_COLORS.surface,
  },
  inputLtr: { textAlign: 'left', writingDirection: 'ltr' },
  inputDisabled: { backgroundColor: DESKTOP_COLORS.surfaceMuted, color: DESKTOP_COLORS.inkFaint },
  inputError: { borderColor: DESKTOP_COLORS.danger },
  selectBox: {
    height: 34,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    borderRadius: 6,
    paddingHorizontal: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: DESKTOP_COLORS.surface,
  },
  selectValue: { flex: 1, fontSize: 13 },
  placeholder: { color: DESKTOP_COLORS.inkFaint },
  selectCatcher: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  selectMenu: {
    position: 'absolute',
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    paddingVertical: 4,
    maxHeight: 260,
    overflow: 'hidden',
    shadowColor: '#0A1520',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  popoverIn: webOnly({
    transformOrigin: 'top center',
    animationKeyframes: {
      from: { opacity: 0, transform: [{ scale: 0.96 }, { translateY: -4 }] },
      to: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] },
    },
    animationDuration: '150ms',
    animationTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
    animationFillMode: 'backwards',
  }),
  popoverInReduced: webOnly({
    animationKeyframes: { from: { opacity: 0 }, to: { opacity: 1 } },
    animationDuration: '150ms',
    animationTimingFunction: 'ease',
    animationFillMode: 'backwards',
  }),
  selectOption: { paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  selectOptionText: { fontSize: 13 },
  selectOptionDesc: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },

  calendarMenu: {
    position: 'absolute',
    width: 248,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    padding: 10,
    shadowColor: '#0A1520',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  calendarHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  calendarNavBtn: { width: 24, height: 24, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  calendarTitle: { fontSize: 12.5 },
  calendarWeekRow: { flexDirection: 'row-reverse', marginBottom: 2 },
  calendarWeekday: { width: 30, textAlign: 'center', fontSize: 10.5, color: DESKTOP_COLORS.inkFaint },
  calendarGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap' },
  calendarCell: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  calendarCellSelected: { backgroundColor: DESKTOP_COLORS.brand },
  calendarCellText: { fontSize: 12 },
  calendarCellTextSelected: { color: '#FFFFFF' },
  calendarClear: { marginTop: 6, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft, paddingTop: 6 },
  calendarClearText: { fontSize: 12, color: DESKTOP_COLORS.inkMuted },
});
