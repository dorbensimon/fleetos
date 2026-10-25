// רכיבי בסיס למחשב: טקסט, כפתור, שדות, בחירה ולוח שנה
import React, { useRef, useState } from 'react';
import { FocusTarget } from '../ui/FocusTarget';
import { Dimensions, Modal, Pressable, PressableProps, ScrollView, StyleProp, Text, TextInput, TextInputProps, TextProps, View, ViewStyle, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DESKTOP_COLORS, DESKTOP_FONT, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';
import { formatDate, parseDateValue } from '../../lib/theme';
import { t, dirIcon, textStart, textDirection, getLocale } from '../../lib/i18n';

type Weight = keyof typeof DESKTOP_FONT;

// טקסט בגופן Heebo מיושר לימין
/** Heebo text, right-aligned RTL by default — the desktop counterpart of AppText. */
export function DText({ weight = 'regular', style, ...rest }: TextProps & { weight?: Weight }) {
  return <Text {...rest} style={[styles.text, { fontFamily: DESKTOP_FONT[weight] }, style]} />;
}

// טקסט משמאל לימין (תאריכים, מספרים)
/** Latin data (dates, plates, phones) inside the Hebrew UI stays LTR but keeps the RTL column alignment. */
export function DLtrText(props: TextProps & { weight?: Weight }) {
  return <DText {...props} style={[styles.ltr, props.style]} />;
}

// האם המשתמש ביקש פחות אנימציות
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// האם יש עכבר (ולא מסך מגע)
export function supportsFinePointerHoverMotion(): boolean {
  return !prefersReducedMotion()
    && typeof window !== 'undefined'
    && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
}

// אנימציית פתיחה של חלונית קטנה
/** Entry motion shared by every desktop popover (selects, calendar, overflow menus). */
export function popoverEnterStyle() {
  return prefersReducedMotion() ? fieldStyles.popoverInReduced : fieldStyles.popoverIn;
}

type HoverState = { pressed: boolean; hovered?: boolean; focused?: boolean };

// כפתור שמגיב למעבר עכבר
/**
 * Pressable with react-native-web's hover/focus state exposed to the style
 * callback, plus a pointer cursor — every clickable element on desktop.
 */
export function HoverPressable({
  style,
  hoverStyle,
  hoverMotionStyle,
  pressStyle,
  pressMotionStyle,
  children,
  ...rest
}: Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  hoverStyle?: StyleProp<ViewStyle>;
  /** Pointer-only hover feedback; suppressed for touch, keyboard focus, and reduced motion. */
  hoverMotionStyle?: StyleProp<ViewStyle>;
  /** Feedback applied the instant the pointer goes down — opt-in, since a scale/transform isn't safe on every layout. */
  pressStyle?: StyleProp<ViewStyle>;
  /** Press feedback that is suppressed when the user prefers reduced motion. */
  pressMotionStyle?: StyleProp<ViewStyle>;
}) {
  // Hover styling doubles as the keyboard focus ring, but only for keyboard
  // focus: a mouse click also focuses the element (and a closing modal hands
  // focus back to it), which left a clicked tile looking hovered for good.
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const { onFocus, onBlur } = rest;
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      onFocus={(event) => {
        const target = event.nativeEvent?.target as unknown as Element | null;
        setKeyboardFocus(!!target?.matches?.(':focus-visible'));
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setKeyboardFocus(false);
        onBlur?.(event);
      }}
      style={(state) => {
        const { hovered, pressed } = state as HoverState;
        const focused = keyboardFocus;
        return [
          webOnly({
            cursor: rest.disabled ? 'default' : 'pointer',
            transition: 'transform 100ms ease-out',
            outlineColor: DESKTOP_COLORS.brand,
            outlineOffset: 2,
          }),
          style,
          (hovered || focused) && !rest.disabled ? hoverStyle : null,
          hovered && !rest.disabled && supportsFinePointerHoverMotion() ? hoverMotionStyle : null,
          pressed && !rest.disabled ? pressStyle : null,
          pressed && !rest.disabled && !prefersReducedMotion() ? pressMotionStyle : null,
        ];
      }}
    >
      {children}
    </Pressable>
  );
}

// תגית מצב צבעונית
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

// כותרת עמודה שלחיצה עליה ממיינת
/** A table header that sorts: an up arrow is "closest first", a down arrow "farthest first". */
export function SortHeader({ label, dir, onPress, textStyle }: { label: string; dir: 'asc' | 'desc' | null; onPress: () => void; textStyle?: TextProps['style'] }) {
  const hint = dir === 'asc' ? t('common.sortSoonFirst', { label }) : dir === 'desc' ? t('common.sortFarFirst', { label }) : t('common.sortTap', { label });
  return (
    <HoverPressable style={styles.sortHeader} hoverStyle={styles.sortHeaderHover} onPress={onPress} accessibilityRole="button" accessibilityLabel={hint} {...webOnly({ title: hint })}>
      <DText weight="bold" style={[textStyle, dir && { color: DESKTOP_COLORS.brand }]} numberOfLines={1}>{label}</DText>
      <Ionicons name={dir === 'asc' ? 'arrow-up' : dir === 'desc' ? 'arrow-down' : 'swap-vertical'} size={13} color={dir ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint} />
    </HoverPressable>
  );
}

// שורת שדה: כותרת ותיבה
/** Dense label-left / control-right row used by every desktop form (driver, vehicle, settings). */
export function DesktopFieldRow({
  label,
  required,
  error,
  children,
  last,
  focusId,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  last?: boolean;
  /** Lights up and scrolls into view when the page is opened on this key (components/ui/FocusTarget). */
  focusId?: string;
}) {
  const row = (
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
  return focusId ? <FocusTarget id={focusId} radius={6} tint={DESKTOP_COLORS.brand}>{row}</FocusTarget> : row;
}

// תיבת טקסט
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
  onBlur,
  onSubmitEditing,
  large,
  autoFocus,
  onKeyPress,
  accessibilityLabel,
}: {
  value: string;
  autoFocus?: boolean;
  onKeyPress?: TextInputProps['onKeyPress'];
  accessibilityLabel?: string;
  /** Roomier 44px field for airy settings pages. */
  large?: boolean;
  onChangeText?: (v: string) => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
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
      onBlur={onBlur}
      onSubmitEditing={onSubmitEditing}
      autoFocus={autoFocus}
      onKeyPress={onKeyPress}
      accessibilityLabel={accessibilityLabel}
      style={[
        fieldStyles.input,
        large && fieldStyles.inputLarge,
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

// רשימה נפתחת
// מיקום חלון קופץ: מתחת לשדה, או מעליו כשאין מקום
type PopoverAnchor = { top?: number; bottom?: number; left: number; width: number; maxHeight: number };
/** Under the field, or above it when the window has more room there (a field near the bottom edge). */
function popoverAnchor(x: number, y: number, width: number, height: number, wanted: number): PopoverAnchor {
  const windowHeight = Dimensions.get('window').height;
  const below = windowHeight - (y + height) - 12;
  const above = y - 12;
  if (below >= wanted || below >= above) return { top: y + height + 4, left: x, width, maxHeight: Math.max(120, below) };
  return { bottom: windowHeight - y + 4, left: x, width, maxHeight: above };
}

/** Lightweight inline dropdown for desktop forms — a popover under the trigger, not the mobile bottom sheet. */
export function DesktopSelect<T extends string>({
  value,
  options,
  onChange,
  placeholder = t('common.choose'),
  allowClear,
  hasError,
  large,
}: {
  value: T | null;
  options: DesktopSelectOption<T>[];
  large?: boolean;
  onChange: (v: T | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const triggerRef = useRef<View>(null);
  const selected = options.find((o) => o.value === value);

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor(popoverAnchor(x, y, width, height, 260));
      setOpen(true);
    });
  };

  return (
    <View ref={triggerRef}>
      <HoverPressable
        style={[fieldStyles.selectBox, large && fieldStyles.selectBoxLarge, hasError && fieldStyles.inputError]}
        hoverStyle={{ borderColor: DESKTOP_COLORS.brand }}
        onPress={() => (open ? setOpen(false) : openMenu())}
      >
        <Ionicons name="chevron-down" size={14} color={DESKTOP_COLORS.inkFaint} />
        <DText style={[fieldStyles.selectValue, large && fieldStyles.selectValueLarge, !selected && fieldStyles.placeholder]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </DText>
      </HoverPressable>

      {open && anchor && (
        <Modal transparent visible animationType="none" onRequestClose={() => setOpen(false)}>
          <Pressable style={fieldStyles.selectCatcher} onPress={() => setOpen(false)} />
          <ScrollView style={[fieldStyles.selectMenu, { top: anchor.top, bottom: anchor.bottom, start: anchor.left, width: anchor.width, maxHeight: Math.min(260, anchor.maxHeight) }, prefersReducedMotion() ? fieldStyles.popoverInReduced : fieldStyles.popoverIn]}>
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

// שמות ימי השבוע
const weekdayLabels = () => [t('date.weekdayShort.sun'), t('date.weekdayShort.mon'), t('date.weekdayShort.tue'), t('date.weekdayShort.wed'), t('date.weekdayShort.thu'), t('date.weekdayShort.fri'), t('date.weekdayShort.sat')];

// תאריך בפורמט שנה-חודש-יום
function toIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// בחירת תאריך עם לוח שנה
/** Compact calendar popover matching DesktopSelect's chrome — the desktop counterpart of the mobile DateField (which uses a bottom-sheet). */
export function DesktopDateField({
  value,
  onChange,
  placeholder = t('date.chooseDate'),
  hasError,
  allowClear = true,
  large,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  large?: boolean;
  placeholder?: string;
  hasError?: boolean;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [choosingYear, setChoosingYear] = useState(false);
  const [cursor, setCursor] = useState(() => (value ? parseDateValue(value) : new Date()));
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const triggerRef = useRef<View>(null);

  const openPicker = () => {
    setCursor(value ? parseDateValue(value) : new Date());
    setChoosingYear(false);
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor(popoverAnchor(x, y, width, height, 340));
      setOpen(true);
    });
  };

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const leadingBlanks = monthStart.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const selected = value ? parseDateValue(value) : null;
  const isSelectedDay = (day: number) =>
    !!selected && selected.getFullYear() === cursor.getFullYear() && selected.getMonth() === cursor.getMonth() && selected.getDate() === day;
  const years = Array.from({ length: 101 }, (_, index) => new Date().getFullYear() + 20 - index);

  return (
    <View ref={triggerRef}>
      <HoverPressable
        style={[fieldStyles.selectBox, large && fieldStyles.selectBoxLarge, hasError && fieldStyles.inputError]}
        hoverStyle={{ borderColor: DESKTOP_COLORS.brand }}
        onPress={openPicker}
      >
        <Ionicons name="calendar-outline" size={14} color={DESKTOP_COLORS.inkFaint} />
        <DText style={[fieldStyles.selectValue, large && fieldStyles.selectValueLarge, !value && fieldStyles.placeholder]} numberOfLines={1}>
          {value ? formatDate(value) : placeholder}
        </DText>
      </HoverPressable>

      {open && anchor && (
        <Modal transparent visible animationType="none" onRequestClose={() => setOpen(false)}>
          <Pressable style={fieldStyles.selectCatcher} onPress={() => setOpen(false)} />
          <View style={[fieldStyles.calendarMenu, { top: anchor.top, bottom: anchor.bottom, start: anchor.left }, prefersReducedMotion() ? fieldStyles.popoverInReduced : fieldStyles.popoverIn]}>
            <View style={fieldStyles.calendarHeader}>
              <HoverPressable
                style={fieldStyles.calendarNavBtn}
                hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              >
                <Ionicons name={dirIcon('chevron-forward')} size={14} color={DESKTOP_COLORS.ink} />
              </HoverPressable>
              <HoverPressable
                style={fieldStyles.calendarTitleButton}
                hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                onPress={() => setChoosingYear((current) => !current)}
                accessibilityRole="button"
                accessibilityLabel={t('date.chooseYear')}
              >
                <DText weight="semiBold" style={fieldStyles.calendarTitle}>
                  {choosingYear ? t('date.chooseYear') : cursor.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' })}
                </DText>
              </HoverPressable>
              <HoverPressable
                style={fieldStyles.calendarNavBtn}
                hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              >
                <Ionicons name={dirIcon('chevron-back')} size={14} color={DESKTOP_COLORS.ink} />
              </HoverPressable>
            </View>
            {choosingYear ? (
              <ScrollView style={fieldStyles.calendarYearScroll} contentContainerStyle={fieldStyles.calendarYearGrid} showsVerticalScrollIndicator={false}>
                {years.map((year) => {
                  const active = year === cursor.getFullYear();
                  return <HoverPressable
                    key={year}
                    style={[fieldStyles.calendarYearOption, active && fieldStyles.calendarYearOptionSelected]}
                    hoverStyle={!active ? { backgroundColor: DESKTOP_COLORS.rowHover } : null}
                    onPress={() => {
                      setCursor(new Date(year, cursor.getMonth(), 1));
                      setChoosingYear(false);
                    }}
                  >
                    <DText weight={active ? 'bold' : 'regular'} style={[fieldStyles.calendarCellText, active && fieldStyles.calendarCellTextSelected]}>{year}</DText>
                  </HoverPressable>;
                })}
              </ScrollView>
            ) : (
              <>
                <View style={fieldStyles.calendarWeekRow}>
                  {weekdayLabels().map((label) => (
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
              </>
            )}
            {allowClear && (
              <HoverPressable
                style={fieldStyles.calendarClear}
                hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }}
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <DText style={fieldStyles.calendarClearText}>{t('date.clearDate')}</DText>
              </HoverPressable>
            )}
          </View>
        </Modal>
      )}
    </View>
  );
}

// עיצוב הטקסט והתגית
const styles = StyleSheet.create({
  text: { color: DESKTOP_COLORS.ink, fontSize: 13.5, textAlign: textStart(), writingDirection: textDirection() },
  ltr: { writingDirection: 'ltr' },
  pill: { alignSelf: 'flex-end', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2.5 },
  sortHeader: { flexDirection: 'row-reverse', alignItems: 'center', alignSelf: 'flex-end', gap: 4, marginHorizontal: -6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, maxWidth: '100%', ...webOnly({ cursor: 'pointer' }) },
  sortHeaderHover: { backgroundColor: 'rgba(15, 23, 42, 0.06)' },
  pillText: { fontSize: 11 },
});

// עיצוב השדות
const fieldStyles = StyleSheet.create({
  // שורת שדה
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
  // תיבת טקסט (גובה 34)
  input: {
    height: 34,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    color: DESKTOP_COLORS.ink,
    fontFamily: DESKTOP_FONT.regular,
    textAlign: textStart(),
    backgroundColor: DESKTOP_COLORS.surface,
  },
  // תיבת טקסט גדולה (גובה 44)
  inputLarge: { height: 44, borderRadius: 10, paddingHorizontal: 14, fontSize: 15 },
  inputLtr: { textAlign: 'left', writingDirection: 'ltr' },
  inputDisabled: { backgroundColor: DESKTOP_COLORS.surfaceMuted, color: DESKTOP_COLORS.inkFaint },
  inputError: { borderColor: DESKTOP_COLORS.danger },
  // תיבת בחירה
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
  selectBoxLarge: { height: 44, borderRadius: 10, paddingHorizontal: 14 },
  selectValueLarge: { fontSize: 15 },
  placeholder: { color: DESKTOP_COLORS.inkFaint },
  selectCatcher: { position: 'absolute', top: 0, start: 0, end: 0, bottom: 0 },
  // הרשימה שנפתחת
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

  // לוח השנה שנפתח
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
  calendarTitleButton: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  calendarTitle: { fontSize: 12.5 },
  calendarWeekRow: { flexDirection: 'row-reverse', marginBottom: 2 },
  calendarWeekday: { width: 30, textAlign: 'center', fontSize: 10.5, color: DESKTOP_COLORS.inkFaint },
  calendarGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap' },
  calendarCell: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  calendarCellSelected: { backgroundColor: DESKTOP_COLORS.brand },
  calendarCellText: { fontSize: 12 },
  calendarCellTextSelected: { color: '#FFFFFF' },
  calendarYearScroll: { height: 172 },
  calendarYearGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, paddingBottom: 4 },
  calendarYearOption: { width: 68, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  calendarYearOptionSelected: { backgroundColor: DESKTOP_COLORS.brand },
  calendarClear: { marginTop: 6, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft, paddingTop: 6 },
  calendarClearText: { fontSize: 12, color: DESKTOP_COLORS.inkMuted },
});
