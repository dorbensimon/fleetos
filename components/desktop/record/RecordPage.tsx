import React, { useEffect, useRef, useState } from 'react';
import { FocusTarget } from '../../ui/FocusTarget';
import { StyleSheet, View } from 'react-native';
import { BrandLoader } from '../../ui/BrandLoader';
import { Ionicons } from '@expo/vector-icons';
import { DesktopModal } from '../DesktopModal';
import {
  DesktopDateField,
  DesktopInput,
  DesktopSelect,
  DesktopSelectOption,
  DLtrText,
  DText,
  HoverPressable,
  prefersReducedMotion,
} from '../primitives';
import { EASE_OUT } from './RecordKit';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../desktopTheme';
import { t, dirIcon } from '../../../lib/i18n';

/**
 * The building blocks of the desktop record pages (vehicle card, driver
 * card): a header card with a few big numbers, grouped lists of tappable
 * detail rows — each opening one small window with a single field — and the
 * shared page styles, so both pages look and behave the same.
 */

export const digitsOnly = (v: string) => v.replace(/\D/g, '');

// ---------------------------------------------------------------------------
// Field editing — every detail row opens one small window with a single field.

export type TextFieldEditor = {
  kind: 'text';
  label: string;
  raw: string;
  ltr?: boolean;
  numeric?: boolean;
  hint?: string;
  parse?: (v: string) => string;
  format?: (v: string) => string;
  validate?: (v: string) => string | null;
  onSave: (v: string) => Promise<string | null>;
};

export type FieldEditor =
  | TextFieldEditor
  | {
      kind: 'select';
      label: string;
      raw: string | null;
      options: DesktopSelectOption<string>[];
      allowClear?: boolean;
      placeholder?: string;
      onSave: (v: string | null) => Promise<string | null>;
    }
  | { kind: 'date'; label: string; raw: string | null; onSave: (v: string | null) => Promise<string | null> }
  | {
      kind: 'monthYear';
      label: string;
      month: string;
      year: string;
      onSave: (month: string, year: string) => Promise<string | null>;
    }
  | {
      /** Two choices from the same list, e.g. a main and an extra licence class. */
      kind: 'selectPair';
      label: string;
      hint?: string;
      labels: [string, string];
      raw: [string | null, string | null];
      options: DesktopSelectOption<string>[];
      placeholders?: [string, string];
      validate?: (first: string | null, second: string | null) => string | null;
      onSave: (first: string | null, second: string | null) => Promise<string | null>;
    };

function isEmptyEditor(editor: FieldEditor) {
  if (editor.kind === 'monthYear') return !editor.year;
  if (editor.kind === 'selectPair') return !editor.raw[0] && !editor.raw[1];
  return !editor.raw;
}

export function FieldEditDialog({ editor, onClose }: { editor: FieldEditor | null; onClose: () => void }) {
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<string | null>(null);
  const [second, setSecond] = useState<string | null>(null);
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editor) return;
    setError(null);
    setSaving(false);
    if (editor.kind === 'text') setText(editor.raw);
    if (editor.kind === 'select' || editor.kind === 'date') setChoice(editor.raw);
    if (editor.kind === 'selectPair') {
      setChoice(editor.raw[0]);
      setSecond(editor.raw[1]);
    }
    if (editor.kind === 'monthYear') {
      setMonth(editor.month);
      setYear(editor.year);
    }
  }, [editor]);

  if (!editor) return null;

  const save = async () => {
    let result: string | null = null;
    if (editor.kind === 'text') {
      const invalid = editor.validate?.(text) ?? null;
      if (invalid) return setError(invalid);
      setSaving(true);
      result = await editor.onSave(text);
    } else if (editor.kind === 'monthYear') {
      if (month && (Number(month) < 1 || Number(month) > 12)) return setError(t('validation.monthRange'));
      if (year && !/^\d{4}$/.test(year)) return setError(t('validation.year4Digits'));
      setSaving(true);
      result = await editor.onSave(month, year);
    } else if (editor.kind === 'selectPair') {
      const invalid = editor.validate?.(choice, second) ?? null;
      if (invalid) return setError(invalid);
      setSaving(true);
      result = await editor.onSave(choice, second);
    } else {
      setSaving(true);
      result = await editor.onSave(choice);
    }
    setSaving(false);
    if (result) setError(result);
    else onClose();
  };

  const title = `${isEmptyEditor(editor) ? t('record.addPrefix') : t('record.editPrefix')} ${editor.label}`;
  const hint = editor.kind === 'select'
    ? t('record.chooseAndSave')
    : (editor.kind === 'text' || editor.kind === 'selectPair') && editor.hint
      ? editor.hint
      : t('record.typeAndSave');

  return (
    <DesktopModal visible title={title} onClose={onClose} maxWidth={460}>
      <View style={pageStyles.editBody}>
        <DText style={pageStyles.editHint}>{hint}</DText>
        {editor.kind === 'text' && (
          <DesktopInput
            value={editor.format ? editor.format(text) : text}
            onChangeText={(v) => {
              setText(editor.parse ? editor.parse(v) : v);
              setError(null);
            }}
            ltr={editor.ltr}
            keyboardType={editor.numeric ? 'number-pad' : 'default'}
            hasError={!!error}
            onSubmitEditing={() => void save()}
            large
          />
        )}
        {editor.kind === 'select' && (
          <DesktopSelect value={choice} onChange={setChoice} options={editor.options} allowClear={editor.allowClear} placeholder={editor.placeholder} hasError={!!error} large />
        )}
        {editor.kind === 'date' && <DesktopDateField value={choice} onChange={setChoice} hasError={!!error} large />}
        {editor.kind === 'selectPair' && (
          <View style={pageStyles.monthYearRow}>
            {([0, 1] as const).map((index) => (
              <View key={index} style={pageStyles.monthYearCell}>
                <DText style={pageStyles.editFieldLabel}>{editor.labels[index]}</DText>
                <DesktopSelect
                  value={index === 0 ? choice : second}
                  onChange={(v) => {
                    if (index === 0) setChoice(v);
                    else setSecond(v);
                    setError(null);
                  }}
                  options={editor.options}
                  allowClear
                  placeholder={editor.placeholders?.[index] ?? t('common.notSelected')}
                  hasError={!!error}
                  large
                />
              </View>
            ))}
          </View>
        )}
        {editor.kind === 'monthYear' && (
          <View style={pageStyles.monthYearRow}>
            <View style={pageStyles.monthYearCell}>
              <DText style={pageStyles.editFieldLabel}>{t('date.month')}</DText>
              <DesktopInput value={month} onChangeText={(v) => setMonth(digitsOnly(v).slice(0, 2))} placeholder={t('date.monthExample')} ltr keyboardType="number-pad" large />
            </View>
            <View style={pageStyles.monthYearCell}>
              <DText style={pageStyles.editFieldLabel}>{t('date.year')}</DText>
              <DesktopInput value={year} onChangeText={(v) => setYear(digitsOnly(v).slice(0, 4))} placeholder={t('date.yearExample')} ltr keyboardType="number-pad" onSubmitEditing={() => void save()} large />
            </View>
          </View>
        )}
        {!!error && <DText style={pageStyles.editError}>{error}</DText>}
        <View style={pageStyles.editActions}>
          <HoverPressable style={[pageStyles.primaryBtn, pageStyles.editActionBtn, saving && pageStyles.disabled]} hoverStyle={pageStyles.primaryBtnHover} pressStyle={pageStyles.pressDown} onPress={() => void save()} disabled={saving}>
            {saving && <BrandLoader size="small" color="#FFFFFF" />}
            <DText weight="semiBold" style={pageStyles.primaryBtnText}>{t('common.save')}</DText>
          </HoverPressable>
          <HoverPressable style={[pageStyles.plainBtn, pageStyles.editActionBtn]} hoverStyle={pageStyles.plainBtnHover} pressStyle={pageStyles.pressDown} onPress={onClose}>
            <DText weight="semiBold" style={pageStyles.plainBtnText}>{t('common.cancel')}</DText>
          </HoverPressable>
        </View>
      </View>
    </DesktopModal>
  );
}

/**
 * One detail row: label, value, and a faint "עריכה" that turns blue on hover.
 * A row given `edit` (free text) turns into an input in place, with ✓ / ✕
 * at its end; other rows call `onPress` to open the field window.
 */
export function DetailRow({
  label,
  value,
  ltr,
  first,
  onPress,
  edit,
  accessory,
  compact,
  valueColor,
  focusId,
}: {
  label: string;
  value: string | null;
  ltr?: boolean;
  first?: boolean;
  onPress?: () => void;
  edit?: TextFieldEditor;
  /** Extra content inside the value area (a lookup button, a short note). */
  accessory?: React.ReactNode;
  compact?: boolean;
  valueColor?: string;
  /** Lights up and scrolls into view when the page is opened on this key (components/ui/FocusTarget). */
  focusId?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rowRef = useRef<View>(null);
  const ValueText = ltr ? DLtrText : DText;
  const empty = !value;
  const pressable = onPress ?? (edit ? () => {
    setDraft(edit.raw);
    setError(null);
    setEditing(true);
  } : undefined);
  const motion = !prefersReducedMotion();

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    if (!edit || saving) return;
    const invalid = edit.validate?.(draft) ?? null;
    if (invalid) return setError(invalid);
    setSaving(true);
    const result = await edit.onSave(draft);
    setSaving(false);
    if (result) setError(result);
    else cancel();
  };

  // A click anywhere outside the row drops the change, like ✕.
  useEffect(() => {
    if (!editing || saving || typeof document === 'undefined') return;
    const onDown = (event: MouseEvent) => {
      const node = rowRef.current as unknown as HTMLElement | null;
      if (node && !node.contains(event.target as Node)) cancel();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editing, saving]);

  const rowStyle = [pageStyles.detailRow, compact && pageStyles.detailRowCompact, !first && pageStyles.rowDivider];

  if (editing && edit) {
    const row = (
      <View ref={rowRef} style={[...rowStyle, pageStyles.rowEditing]}>
        <DText style={[pageStyles.rowLabel, compact && pageStyles.rowLabelCompact, pageStyles.inlineLabel]} numberOfLines={1}>{label}</DText>
        <View style={[pageStyles.inlineField, motion && pageStyles.inlineFieldIn]}>
          <DesktopInput
            value={edit.format ? edit.format(draft) : draft}
            onChangeText={(v) => {
              setDraft(edit.parse ? edit.parse(v) : v);
              setError(null);
            }}
            ltr={edit.ltr}
            keyboardType={edit.numeric ? 'number-pad' : 'default'}
            hasError={!!error}
            onSubmitEditing={() => void save()}
            autoFocus
            onKeyPress={(e) => {
              if (e.nativeEvent.key === 'Escape') cancel();
            }}
            accessibilityLabel={label}
            style={pageStyles.inlineInput}
          />
          {!!(error || edit.hint) && (
            <DText style={error ? pageStyles.inlineError : pageStyles.inlineHint}>{error ?? edit.hint}</DText>
          )}
        </View>
        <View style={pageStyles.inlineActions}>
          <HoverPressable
            style={[pageStyles.inlineBtn, pageStyles.inlineSave, motion && pageStyles.inlineBtnIn]}
            hoverStyle={pageStyles.inlineSaveHover}
            pressMotionStyle={pageStyles.inlineBtnPress}
            onPress={() => void save()}
            disabled={saving}
            accessibilityLabel={t('common.save')}
          >
            {saving ? <BrandLoader size="small" color="#FFFFFF" /> : <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
          </HoverPressable>
          <HoverPressable
            style={[pageStyles.inlineBtn, pageStyles.inlineCancel, motion && pageStyles.inlineBtnIn, motion && pageStyles.inlineBtnInLate]}
            hoverStyle={pageStyles.inlineCancelHover}
            pressMotionStyle={pageStyles.inlineBtnPress}
            onPress={cancel}
            disabled={saving}
            accessibilityLabel={t('common.cancel')}
          >
            <Ionicons name="close" size={18} color={DESKTOP_COLORS.inkMuted} />
          </HoverPressable>
        </View>
      </View>
    );
    return focusId ? <FocusTarget id={focusId} radius={6} tint={DESKTOP_COLORS.brand}>{row}</FocusTarget> : row;
  }

  const content = (
    <>
      <DText style={[pageStyles.rowLabel, compact && pageStyles.rowLabelCompact]} numberOfLines={1}>{label}</DText>
      <View style={[pageStyles.rowValueWrap, edit && motion && pageStyles.inlineFieldIn]}>
        {empty ? (
          <DText style={pageStyles.rowValueEmpty}>{t('common.notEntered')}</DText>
        ) : (
          <ValueText weight="semiBold" style={[pageStyles.rowValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>{value}</ValueText>
        )}
        {accessory}
      </View>
      {pressable ? (
        <View style={pageStyles.rowEdit}>
          <DText style={[pageStyles.rowEditText, hovered && pageStyles.rowEditTextHover]}>{empty ? t('common.add') : t('common.edit')}</DText>
          <Ionicons name={dirIcon('chevron-back')} size={13} color={hovered ? DESKTOP_COLORS.brand : DESKTOP_COLORS.inkFaint} />
        </View>
      ) : (
        <DText style={pageStyles.rowEditText}>{t('record.calculated')}</DText>
      )}
    </>
  );

  const row = !pressable ? (
    <View style={rowStyle}>{content}</View>
  ) : (
    <HoverPressable
      style={rowStyle}
      hoverStyle={pageStyles.rowHover}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={pressable}
      accessibilityLabel={`${label}: ${value || t('common.notEntered')}. ${empty ? t('common.add') : t('common.edit')}`}
    >
      {content}
    </HoverPressable>
  );
  return focusId ? <FocusTarget id={focusId} radius={6} tint={DESKTOP_COLORS.brand}>{row}</FocusTarget> : row;
}

export function GroupLabel({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View style={pageStyles.groupLabelRow}>
      <DText weight="semiBold" style={pageStyles.groupLabel}>{children}</DText>
      {action}
    </View>
  );
}

/** One of the header's big numbers. */
export function Fact({ label, value, unit, color, muted }: { label: string; value: string; unit?: string; color?: string; muted?: boolean }) {
  return (
    <View style={pageStyles.fact}>
      <DText style={pageStyles.factLabel}>{label}</DText>
      <View style={pageStyles.factValueRow}>
        <DLtrText weight="bold" style={[pageStyles.factValue, muted && pageStyles.factValueMuted, color ? { color } : null]}>{value}</DLtrText>
        {!!unit && <DText style={pageStyles.factUnit}>{unit}</DText>}
      </View>
    </View>
  );
}

export const CARD_SHADOW = '0 1px 2px rgba(22,34,46,0.04), 0 2px 10px rgba(22,34,46,0.035)';

export const pageStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DESKTOP_COLORS.canvas },
  content: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 48, maxWidth: 1160, width: '100%', alignSelf: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  pressDown: { transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.6 },
  enter: webOnly({
    animationKeyframes: { from: { opacity: 0, transform: [{ translateY: 6 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } },
    animationDuration: '400ms',
    animationTimingFunction: EASE_OUT,
    animationFillMode: 'backwards',
  }),

  // Header
  hero: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 20,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexWrap: 'wrap',
    ...webOnly({ boxShadow: CARD_SHADOW }),
  },
  heroIdentity: { flex: 1, minWidth: 200, gap: 1 },
  heroStatusRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 3 },
  heroName: { fontSize: 21, letterSpacing: -0.2, lineHeight: 26 },
  heroSub: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  heroSubText: { fontSize: 14, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  heroSubDot: { fontSize: 14, color: DESKTOP_COLORS.inkFaint },

  facts: { flexDirection: 'row-reverse' },
  fact: { paddingHorizontal: 16, gap: 0, borderEndWidth: 1, borderEndColor: DESKTOP_COLORS.border },
  factLabel: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  factValueRow: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 4 },
  factValue: { fontSize: 17, color: DESKTOP_COLORS.ink, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  factValueMuted: { fontSize: 14, color: DESKTOP_COLORS.inkFaint },
  factUnit: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },

  // Archived / attention
  archivedBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#EEF1F4', borderWidth: 1, borderColor: DESKTOP_COLORS.border },
  archivedTitle: { fontSize: 14.5 },
  archivedText: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted },
  attention: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#FFF6EA', borderWidth: 1, borderColor: '#F6DDB9' },
  attentionIcon: { marginTop: 2 },
  attentionTitle: { fontSize: 14.5, color: '#7A3E00', marginBottom: 2 },
  attentionRow: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', paddingVertical: 2 },
  attentionTag: { backgroundColor: DESKTOP_COLORS.surface, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, marginStart: 8 },
  attentionTagText: { fontSize: 12.5 },
  attentionText: { fontSize: 14, color: '#6B3A06', ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },

  // Grid
  gridRow: { flexDirection: 'row-reverse', alignItems: 'stretch', gap: 18, flexWrap: 'wrap' },
  mainCell: { flexGrow: 1.7, flexBasis: 440, minWidth: 0 },
  sideCell: { flexGrow: 1, flexBasis: 280, minWidth: 0 },
  halfCell: { flexGrow: 1, flexBasis: 380, minWidth: 0 },
  groupLabelRow: { height: 28, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  groupLabel: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted },
  card: {
    flexGrow: 1,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 14,
    overflow: 'hidden',
    ...webOnly({ boxShadow: CARD_SHADOW }),
  },
  listCard: { flexGrow: 0 },

  detailRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 16, paddingVertical: 7, ...webOnly({ transition: 'background-color 150ms ease' }) },
  detailRowCompact: { minHeight: 42, paddingHorizontal: 16, gap: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  rowLabel: { width: 124, fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  rowLabelCompact: { width: 'auto', flex: 1 },
  rowValueWrap: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  rowValue: { fontSize: 14.5, color: DESKTOP_COLORS.ink, flexShrink: 1, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  rowValueEmpty: { fontSize: 14, color: DESKTOP_COLORS.inkFaint },
  rowNote: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  rowEdit: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  rowEditText: { fontSize: 13, color: DESKTOP_COLORS.inkFaint },
  rowEditTextHover: { color: DESKTOP_COLORS.brand },

  // In-row editing — iOS-style: the field eases in, ✓ / ✕ spring up in turn.
  rowEditing: { alignItems: 'flex-start', backgroundColor: 'rgba(0,136,204,0.035)', ...webOnly({ transition: 'background-color 220ms ease' }) },
  inlineLabel: { paddingTop: 7 },
  inlineField: { flex: 1, minWidth: 0, gap: 4 },
  inlineFieldIn: webOnly({
    animationKeyframes: { from: { opacity: 0, transform: [{ scale: 0.985 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } },
    animationDuration: '260ms',
    animationTimingFunction: EASE_OUT,
    animationFillMode: 'backwards',
  }),
  inlineInput: { height: 32, borderRadius: 8, fontSize: 14.5, borderColor: DESKTOP_COLORS.brand, ...webOnly({ boxShadow: '0 0 0 3px rgba(0,136,204,0.12)', outlineStyle: 'none' }) },
  inlineHint: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
  inlineError: { fontSize: 12.5, color: DESKTOP_TONES.bad.fg },
  inlineActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, },
  inlineBtn: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  inlineSave: { backgroundColor: DESKTOP_COLORS.brand },
  inlineSaveHover: { backgroundColor: DESKTOP_COLORS.brandHover },
  inlineCancel: { backgroundColor: '#EEF1F4' },
  inlineCancelHover: { backgroundColor: '#E5E9ED' },
  inlineBtnPress: { transform: [{ scale: 0.9 }] },
  inlineBtnIn: webOnly({
    animationKeyframes: { from: { opacity: 0, transform: [{ scale: 0.5 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } },
    animationDuration: '340ms',
    animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    animationFillMode: 'backwards',
  }),
  inlineBtnInLate: webOnly({ animationDelay: '45ms' }),

  inlineMeta: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap' },
  mutedText: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,136,204,0.10)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13.5, color: DESKTOP_COLORS.brand },

  // Section heads
  docsHead: { marginTop: 10, paddingHorizontal: 4, gap: 1 },
  docsTitle: { fontSize: 18, letterSpacing: -0.2 },

  // Buttons
  primaryBtn: { height: 40, paddingHorizontal: 16, borderRadius: 10, backgroundColor: DESKTOP_COLORS.brand, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  primaryBtnHover: { backgroundColor: DESKTOP_COLORS.brandHover },
  primaryBtnText: { fontSize: 14.5, color: '#FFFFFF' },
  plainBtn: { height: 40, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#EEF1F4', flexDirection: 'row-reverse', alignItems: 'center', gap: 8, ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  plainBtnHover: { backgroundColor: '#E5E9ED' },
  plainBtnText: { fontSize: 14.5, color: DESKTOP_COLORS.ink },
  softBtn: { height: 34, paddingHorizontal: 12, borderRadius: 9, backgroundColor: 'rgba(0,136,204,0.09)', flexDirection: 'row-reverse', alignItems: 'center', gap: 6, ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  softBtnHover: { backgroundColor: 'rgba(0,136,204,0.15)' },
  softBtnText: { fontSize: 13.5, color: DESKTOP_COLORS.brand },
  linkBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 2, height: 26, paddingHorizontal: 8, borderRadius: 8, ...webOnly({ transition: 'background-color 150ms ease' }) },
  linkText: { fontSize: 13.5, color: DESKTOP_COLORS.brand },

  // Edit dialog
  editBody: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 18, gap: 10 },
  editHint: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  editFieldLabel: { fontSize: 13, color: DESKTOP_COLORS.inkMuted, marginBottom: 4 },
  editError: { fontSize: 13.5, color: DESKTOP_TONES.bad.fg },
  editActions: { flexDirection: 'row-reverse', gap: 10, marginTop: 6 },
  editActionBtn: { flex: 1, justifyContent: 'center' },
  monthYearRow: { flexDirection: 'row-reverse', gap: 12 },
  monthYearCell: { flex: 1 },
});
