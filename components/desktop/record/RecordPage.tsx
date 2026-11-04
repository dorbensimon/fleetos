// אבני הבניין של דפי התיק במחשב: כותרת כחולה, מספרים גדולים ושורות פרטים
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { FocusTarget } from '../../ui/FocusTarget';
import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
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
import { DESKTOP_COLORS, DESKTOP_FONT, DESKTOP_TONES, webOnly, DESKTOP_BRAND_SHADOW } from '../desktopTheme';
import { t, dirIcon } from '../../../lib/i18n';

/**
 * The building blocks of the desktop record pages (vehicle card, driver
 * card): a header card with a few big numbers, grouped lists of tappable
 * detail rows — each opening one small window with a single field — and the
 * shared page styles, so both pages look and behave the same.
 */

// משאיר רק ספרות
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

// האם העורך ריק
function isEmptyEditor(editor: FieldEditor) {
  if (editor.kind === 'monthYear') return !editor.year;
  if (editor.kind === 'selectPair') return !editor.raw[0] && !editor.raw[1];
  return !editor.raw;
}

// חלון עריכת שדה (תאריכים ובחירות)
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
            autoFocus
            selectTextOnFocus={editor.numeric}
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

// שורת פרט עם 'עריכה'
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
  field,
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
  /** Inside an EditableSection: the field this row edits when the section opens for editing. */
  field?: FieldEditor;
}) {
  const section = useContext(SectionEditContext);
  const fieldKey = focusId ?? label;
  if (section && field) section.register(fieldKey, field);
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

  // A row of an editable section: plain while reading (a click opens the section on it), a field while editing.
  if (section && field) {
    const row = section.editing ? (
      <View style={[...rowStyle, pageStyles.sectionEditRow]}>
        <DText style={[pageStyles.rowLabel, compact && pageStyles.rowLabelCompact, pageStyles.inlineLabel]} numberOfLines={1}>{label}</DText>
        <View style={pageStyles.inlineField}>
          <SectionFieldControl fieldKey={fieldKey} field={field} label={label} />
          {!!section.errors[fieldKey] && <DText style={pageStyles.inlineError}>{section.errors[fieldKey]}</DText>}
          {!section.errors[fieldKey] && field.kind === 'text' && !!field.hint && <DText style={pageStyles.inlineHint}>{field.hint}</DText>}
        </View>
      </View>
    ) : (
      <HoverPressable
        style={rowStyle}
        hoverStyle={pageStyles.rowHover}
        onPress={() => section.start(fieldKey)}
        accessibilityLabel={`${label}: ${value || t('common.notEntered')}`}
        {...(accessory ? { accessibilityRole: 'none' as const } : null)}
      >
        <DText style={[pageStyles.rowLabel, compact && pageStyles.rowLabelCompact]} numberOfLines={1}>{label}</DText>
        <View style={pageStyles.rowValueWrap}>
          {empty ? (
            <DText style={pageStyles.rowValueEmpty}>{t('common.notEntered')}</DText>
          ) : (
            <ValueText weight="semiBold" style={[pageStyles.rowValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>{value}</ValueText>
          )}
          {accessory}
        </View>
      </HoverPressable>
    );
    return focusId ? <FocusTarget id={focusId} radius={6} tint={DESKTOP_COLORS.brand}>{row}</FocusTarget> : row;
  }

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
            selectTextOnFocus={edit.numeric}
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
      // A button inside the row (the accessory) can't sit in another <button> on web, so the row then stops being one.
      {...(accessory ? { accessibilityRole: 'none' as const } : null)}
    >
      {content}
    </HoverPressable>
  );
  return focusId ? <FocusTarget id={focusId} radius={6} tint={DESKTOP_COLORS.brand}>{row}</FocusTarget> : row;
}

// ---------------------------------------------------------------------------
// Section editing: a pen beside the section's name opens all its fields at once,
// and one "עדכון" saves what changed.

type Draft = string | null | [string | null, string | null];
type SectionEdit = {
  editing: boolean;
  focusKey: string | null;
  drafts: Record<string, Draft>;
  errors: Record<string, string>;
  register: (key: string, field: FieldEditor) => void;
  setDraft: (key: string, value: Draft) => void;
  start: (focusKey?: string) => void;
  save: () => void;
  cancel: () => void;
};
const SectionEditContext = createContext<SectionEdit | null>(null);

// הערך השמור של שדה
const rawOf = (field: FieldEditor): Draft =>
  field.kind === 'selectPair' ? field.raw : field.kind === 'monthYear' ? [field.month || null, field.year || null] : field.raw;
const sameDraft = (a: Draft | undefined, b: Draft) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// שדה עריכה בתוך אזור
function SectionFieldControl({ fieldKey, field, label }: { fieldKey: string; field: FieldEditor; label: string }) {
  const section = useContext(SectionEditContext)!;
  const draft = section.drafts[fieldKey];
  const hasError = !!section.errors[fieldKey];
  if (field.kind === 'text') {
    const text = typeof draft === 'string' ? draft : field.raw;
    return (
      <TextInput
        value={field.format ? field.format(text) : text}
        onChangeText={(v) => section.setDraft(fieldKey, field.parse ? field.parse(v) : v)}
        autoFocus={section.focusKey === fieldKey}
        keyboardType={field.numeric ? 'number-pad' : 'default'}
        onSubmitEditing={section.save}
        onKeyPress={(e) => { if (e.nativeEvent.key === 'Escape') section.cancel(); }}
        accessibilityLabel={label}
        style={[pageStyles.sectionInput, field.ltr && pageStyles.sectionInputLtr, hasError && pageStyles.sectionInputError]}
      />
    );
  }
  if (field.kind === 'select') {
    return <DesktopSelect value={(draft as string | null) ?? null} options={field.options} onChange={(v) => section.setDraft(fieldKey, v)} allowClear={field.allowClear} placeholder={field.placeholder} hasError={hasError} />;
  }
  if (field.kind === 'date') {
    return <DesktopDateField value={(draft as string | null) ?? null} onChange={(v) => section.setDraft(fieldKey, v)} hasError={hasError} />;
  }
  if (field.kind === 'selectPair') {
    const [first, second] = (Array.isArray(draft) ? draft : field.raw) as [string | null, string | null];
    return (
      <View style={pageStyles.sectionPair}>
        <View style={pageStyles.flex}>
          <DesktopSelect value={first} options={field.options} onChange={(v) => section.setDraft(fieldKey, [v, second])} placeholder={field.placeholders?.[0]} hasError={hasError} />
        </View>
        <View style={pageStyles.flex}>
          <DesktopSelect value={second} options={field.options} onChange={(v) => section.setDraft(fieldKey, [first, v])} placeholder={field.placeholders?.[1]} allowClear />
        </View>
      </View>
    );
  }
  if (field.kind === 'monthYear') {
    const [month, year] = (Array.isArray(draft) ? draft : [field.month, field.year]) as [string | null, string | null];
    const input = (value: string | null, onChange: (v: string) => void, placeholder: string, focus: boolean) => (
      <TextInput
        value={value ?? ''}
        onChangeText={onChange}
        autoFocus={focus}
        placeholder={placeholder}
        keyboardType="number-pad"
        onSubmitEditing={section.save}
        onKeyPress={(e) => { if (e.nativeEvent.key === 'Escape') section.cancel(); }}
        style={[pageStyles.sectionInput, pageStyles.sectionInputLtr, pageStyles.flex, hasError && pageStyles.sectionInputError]}
      />
    );
    return (
      <View style={pageStyles.sectionPair}>
        {input(year, (v) => section.setDraft(fieldKey, [month, digitsOnly(v).slice(0, 4)]), t('date.yearExample'), false)}
        {input(month, (v) => section.setDraft(fieldKey, [digitsOnly(v).slice(0, 2), year]), t('date.monthExample'), section.focusKey === fieldKey)}
      </View>
    );
  }
  return <DText style={pageStyles.rowValueEmpty}>{label}</DText>;
}

/** The editing state of the EditableSection around a custom field, if any. */
export function useSectionEdit() {
  return useContext(SectionEditContext);
}
export { SectionFieldControl };

// אזור עם כפתור עריכה ליד השם
/**
 * A titled card whose DetailRows (with `field`) edit together: the pen beside
 * the title, or a click on any row, turns them all into fields with the caret
 * in place; "עדכון" saves only what changed, "ביטול" drops it.
 */
export function EditableSection({ title, action, canEdit = true, cardStyle, children }: { title: string; action?: React.ReactNode; canEdit?: boolean; cardStyle?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const fields = useRef(new Map<string, FieldEditor>()).current;
  fields.clear();
  const [editing, setEditing] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const start = (key?: string) => {
    if (!canEdit) return;
    const next: Record<string, Draft> = {};
    fields.forEach((field, k) => { next[k] = rawOf(field); });
    setDrafts(next);
    setErrors({});
    // The caret goes into the field clicked, or the first text field.
    setFocusKey(key ?? [...fields].find(([, field]) => field.kind === 'text')?.[0] ?? null);
    setEditing(true);
  };
  const cancel = () => { setEditing(false); setErrors({}); };
  const save = async () => {
    if (saving) return;
    const changed = [...fields].filter(([k, field]) => !sameDraft(drafts[k], rawOf(field)));
    const found: Record<string, string> = {};
    for (const [k, field] of changed) {
      const draft = drafts[k];
      const invalid = field.kind === 'text' ? field.validate?.(String(draft ?? ''))
        : field.kind === 'selectPair' ? field.validate?.(...(draft as [string | null, string | null]))
        : null;
      if (invalid) found[k] = invalid;
    }
    if (Object.keys(found).length) return setErrors(found);
    setSaving(true);
    for (const [k, field] of changed) {
      const draft = drafts[k];
      const result = field.kind === 'text' ? await field.onSave(String(draft ?? ''))
        : field.kind === 'selectPair' ? await field.onSave(...(draft as [string | null, string | null]))
        : field.kind === 'select' || field.kind === 'date' ? await field.onSave((draft as string | null) ?? null)
        : field.kind === 'monthYear' ? await field.onSave(...((draft as [string | null, string | null]).map((v) => v ?? '') as [string, string]))
        : null;
      if (result) found[k] = result;
    }
    setSaving(false);
    if (Object.keys(found).length) setErrors(found);
    else setEditing(false);
  };

  const value: SectionEdit = {
    editing,
    focusKey,
    drafts,
    errors,
    register: (k, field) => { fields.set(k, field); },
    setDraft: (k, v) => {
      setDrafts((prev) => ({ ...prev, [k]: v }));
      setErrors((prev) => { if (!prev[k]) return prev; const next = { ...prev }; delete next[k]; return next; });
    },
    start,
    save: () => void save(),
    cancel,
  };

  return (
    <SectionEditContext.Provider value={value}>
      <View style={pageStyles.groupLabelRow}>
        <View style={pageStyles.sectionTitle}>
          <DText weight="semiBold" style={pageStyles.groupLabel}>{title}</DText>
          {canEdit && !editing && (
            <HoverPressable
              style={pageStyles.sectionPen}
              hoverStyle={pageStyles.sectionPenHover}
              onPress={() => start()}
              accessibilityLabel={t('record.editSection', { title })}
              {...webOnly({ title: t('record.editSection', { title }) })}
            >
              <Ionicons name="pencil" size={13} color={DESKTOP_COLORS.inkFaint} />
            </HoverPressable>
          )}
        </View>
        {action}
      </View>
      <View style={[pageStyles.card, cardStyle]}>
        {children}
        {editing && (
          <View style={[pageStyles.sectionFooter, pageStyles.rowDivider]}>
            <HoverPressable style={[pageStyles.primaryBtn, pageStyles.sectionSaveBtn, saving && pageStyles.disabled]} hoverStyle={pageStyles.primaryBtnHover} pressStyle={pageStyles.pressDown} onPress={() => void save()} disabled={saving}>
              {saving ? <BrandLoader size="small" color="#FFFFFF" /> : <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
              <DText weight="semiBold" style={pageStyles.sectionSaveText}>{t('record.update')}</DText>
            </HoverPressable>
            <HoverPressable style={pageStyles.sectionCancelBtn} hoverStyle={pageStyles.rowHover} onPress={cancel} disabled={saving}>
              <DText weight="semiBold" style={pageStyles.sectionCancelText}>{t('common.cancel')}</DText>
            </HoverPressable>
          </View>
        )}
      </View>
    </SectionEditContext.Provider>
  );
}

// כותרת קבוצה
export function GroupLabel({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View style={pageStyles.groupLabelRow}>
      <DText weight="semiBold" style={pageStyles.groupLabel}>{children}</DText>
      {action}
    </View>
  );
}

// מספר גדול בכותרת
/** One of the header's big numbers. */
/** `onDark` is for a fact sitting on the night header (the vehicle card). */
export function Fact({ label, value, unit, color, muted, onDark, nativeID }: { label: string; value: string; unit?: string; color?: string; muted?: boolean; onDark?: boolean; nativeID?: string }) {
  return (
    <View nativeID={nativeID} style={[pageStyles.fact, onDark && pageStyles.factOnDark]}>
      <DText style={[pageStyles.factLabel, onDark && pageStyles.factLabelOnDark]}>{label}</DText>
      <View style={pageStyles.factValueRow}>
        <DLtrText weight="bold" style={[pageStyles.factValue, onDark && pageStyles.factValueOnDark, muted && pageStyles.factValueMuted, muted && onDark && pageStyles.factLabelOnDark, color ? { color } : null]}>{value}</DLtrText>
        {!!unit && <DText style={[pageStyles.factUnit, onDark && pageStyles.factLabelOnDark]}>{unit}</DText>}
      </View>
    </View>
  );
}

// צבעי תוקף שקריאים על הכותרת הכהה
/** Expiry colours readable on the night header. */
export const NIGHT_TONES = { bad: '#FF8A80', warn: '#FFC266' } as const;

// צל של כרטיס
export const CARD_SHADOW = '0 1px 2px rgba(22,34,46,0.04), 0 2px 10px rgba(22,34,46,0.035)';

// עיצוב דפי התיק (משמש גם בדפים אחרים)
export const pageStyles = StyleSheet.create({
  // הרקע של הדף
  root: { flex: 1, backgroundColor: DESKTOP_COLORS.canvas },
  // אזור התוכן (רוחב 1160)
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

  // הכותרת
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
  // השם בכותרת
  heroName: { fontSize: 21, letterSpacing: -0.2, lineHeight: 26 },
  heroSub: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  heroSubText: { fontSize: 14, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  heroSubDot: { fontSize: 14, color: DESKTOP_COLORS.inkFaint },

  // שורת המספרים הגדולים
  facts: { flexDirection: 'row-reverse' },
  fact: { paddingHorizontal: 16, gap: 0, borderEndWidth: 1, borderEndColor: DESKTOP_COLORS.border },
  factLabel: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  factValueRow: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 4 },
  factValue: { fontSize: 17, color: DESKTOP_COLORS.ink, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  factValueMuted: { fontSize: 14, color: DESKTOP_COLORS.inkFaint },
  factUnit: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  // הכותרת הכחולה הכהה
  // The night header of the safety officer check (DK.night), with the same blue and cyan light.
  heroNight: {
    backgroundColor: '#12306E',
    borderColor: 'transparent',
    overflow: 'hidden',
    ...webOnly({ backgroundImage: 'linear-gradient(180deg, #12306E 0%, #0B1C45 60%, #0A1626 100%)', boxShadow: '0 18px 40px -18px rgba(10,22,38,0.55)', isolation: 'isolate' }),
  },
  heroGlow: { position: 'absolute' },
  // זוהר כחול בפינה
  heroGlowBlue: { width: 420, height: 420, top: -200, end: -150, ...webOnly({ backgroundImage: 'radial-gradient(closest-side, rgba(47,91,255,0.42), rgba(47,91,255,0.16) 55%, rgba(47,91,255,0) 100%)' }) },
  // זוהר תכלת בפינה
  heroGlowCyan: { width: 320, height: 320, bottom: -220, start: -80, ...webOnly({ backgroundImage: 'radial-gradient(closest-side, rgba(25,198,240,0.28), rgba(25,198,240,0) 100%)' }) },
  heroNameOnDark: { color: '#FFFFFF' },
  pillOnDark: { backgroundColor: '#FFFFFF', borderRadius: 999 },
  heroSubTextOnDark: { color: 'rgba(255,255,255,0.7)' },
  heroSubDotOnDark: { color: 'rgba(255,255,255,0.45)' },
  factOnDark: { borderEndColor: 'rgba(255,255,255,0.14)' },
  factLabelOnDark: { color: 'rgba(255,255,255,0.66)' },
  factValueOnDark: { color: '#FFFFFF' },

  // פס 'בארכיון'
  // Archived / attention
  archivedBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#EEF1F4', borderWidth: 1, borderColor: DESKTOP_COLORS.border },
  archivedTitle: { fontSize: 14.5 },
  archivedText: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted },
  // אזור 'דורש טיפול'
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
  // אזור לעריכה
  sectionTitle: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  sectionPen: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', ...webOnly({ cursor: 'pointer', transition: 'background-color 150ms ease' }) },
  sectionPenHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  sectionEditRow: { minHeight: 48 },
  sectionInput: {
    width: '100%',
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: DESKTOP_COLORS.rowHover,
    fontFamily: DESKTOP_FONT.semiBold,
    fontSize: 14,
    color: DESKTOP_COLORS.ink,
    textAlign: 'right',
    ...webOnly({ outlineStyle: 'none', caretColor: DESKTOP_COLORS.brand }),
  },
  sectionInputLtr: { textAlign: 'left', writingDirection: 'ltr' },
  sectionInputError: { backgroundColor: DESKTOP_TONES.bad.bg },
  sectionPair: { flexDirection: 'row-reverse', gap: 8 },
  sectionFooter: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  sectionSaveBtn: { height: 34, paddingHorizontal: 16 },
  sectionSaveText: { fontSize: 13.5, color: '#FFFFFF' },
  sectionCancelBtn: { height: 34, paddingHorizontal: 12, borderRadius: 8, justifyContent: 'center' },
  sectionCancelText: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted },
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
  rowEditing: { alignItems: 'flex-start', backgroundColor: 'rgba(47,91,255,0.035)', ...webOnly({ transition: 'background-color 220ms ease' }) },
  inlineLabel: { paddingTop: 7 },
  inlineField: { flex: 1, minWidth: 0, gap: 4 },
  inlineFieldIn: webOnly({
    animationKeyframes: { from: { opacity: 0, transform: [{ scale: 0.985 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } },
    animationDuration: '260ms',
    animationTimingFunction: EASE_OUT,
    animationFillMode: 'backwards',
  }),
  inlineInput: { height: 32, borderRadius: 8, fontSize: 14.5, borderColor: DESKTOP_COLORS.brand, ...webOnly({ boxShadow: '0 0 0 3px rgba(47,91,255,0.12)', outlineStyle: 'none' }) },
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
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(47,91,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13.5, color: DESKTOP_COLORS.brand },

  // Section heads
  docsHead: { marginTop: 10, paddingHorizontal: 4, gap: 1 },
  docsTitle: { fontSize: 18, letterSpacing: -0.2 },

  // כפתור ראשי
  // Buttons
  primaryBtn: { height: 40, paddingHorizontal: 16, borderRadius: 10, backgroundColor: DESKTOP_COLORS.brand, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, ...webOnly({ boxShadow: DESKTOP_BRAND_SHADOW, transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  primaryBtnHover: { backgroundColor: DESKTOP_COLORS.brandHover },
  primaryBtnText: { fontSize: 14.5, color: '#FFFFFF' },
  // כפתור פשוט
  plainBtn: { height: 40, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#EEF1F4', flexDirection: 'row-reverse', alignItems: 'center', gap: 8, ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  plainBtnHover: { backgroundColor: '#E5E9ED' },
  plainBtnText: { fontSize: 14.5, color: DESKTOP_COLORS.ink },
  softBtn: { height: 34, paddingHorizontal: 12, borderRadius: 9, backgroundColor: 'rgba(47,91,255,0.09)', flexDirection: 'row-reverse', alignItems: 'center', gap: 6, ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  softBtnHover: { backgroundColor: 'rgba(47,91,255,0.15)' },
  softBtnText: { fontSize: 13.5, color: DESKTOP_COLORS.brand },
  linkBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 2, height: 26, paddingHorizontal: 8, borderRadius: 8, ...webOnly({ transition: 'background-color 150ms ease' }) },
  linkText: { fontSize: 13.5, color: DESKTOP_COLORS.brand },

  // Edit dialog
  editBody: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 18, gap: 10 },
  editHint: { fontSize: 14, color: DESKTOP_COLORS.inkMuted },
  editFieldLabel: { fontSize: 13, color: DESKTOP_COLORS.inkMuted, marginBottom: 4 },
  editError: { fontSize: 13.5, color: DESKTOP_TONES.bad.fg },
  // כפתורי שמירה וביטול בחלון צף: קטנים, לפי גודל הטקסט
  editActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 6 },
  editActionBtn: { height: 36, minWidth: 96, paddingHorizontal: 16, borderRadius: 9, justifyContent: 'center', ...webOnly({ boxShadow: 'none' }) },
  monthYearRow: { flexDirection: 'row-reverse', gap: 12 },
  monthYearCell: { flex: 1 },
});
