import React, { ReactNode, useState } from 'react';
import { StyleSheet, TextInput, type KeyboardTypeOptions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DK_FONT, DK_SPACE, DKText, STATUS, Surface } from '../../components/driverKit';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <DKText variant="micro" color={DK.muted} style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </DKText>
      <Surface>{children}</Surface>
    </View>
  );
}

/** A read-only line: icon tile, label, value. Empty values say so in words. */
export function InfoLine({ icon, label, value, first, ltr, locked }: { icon: IconName; label: string; value?: string | null; first?: boolean; ltr?: boolean; locked?: boolean }) {
  return (
    <View style={[styles.line, !first && styles.divider]} accessible accessibilityLabel={`${label}: ${value || 'לא הוזן'}`}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={18} color={DK.accent} />
      </View>
      <View style={styles.lineText}>
        <DKText variant="caption" color={DK.muted}>
          {label}
        </DKText>
        <DKText variant="label" color={value ? DK.ink : DK.faint} ltr={!!value && ltr} style={ltr && value ? styles.ltrValue : undefined} numberOfLines={2}>
          {value || 'לא הוזן'}
        </DKText>
      </View>
      {locked && <Ionicons name="lock-closed" size={14} color={DK.faint} accessibilityLabel="מנוהל על ידי מנהל הצי" />}
    </View>
  );
}

/** An editable field: label above, a full-width 52pt input, the error under it. */
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
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, !first && styles.divider]}>
      <DKText variant="caption" color={error ? STATUS.expired.fg : DK.inkSoft}>
        {label}
      </DKText>
      {editor ?? (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          accessibilityHint={error}
          placeholder="לא הוזן"
          placeholderTextColor={DK.faint}
          textAlign={ltr ? 'left' : 'right'}
          style={[styles.input, ltr && styles.inputLtr, focused && styles.inputFocused, !!error && styles.inputError]}
        />
      )}
      {!!error && (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={14} color={STATUS.expired.fg} />
          <DKText variant="caption" color={STATUS.expired.fg}>
            {error}
          </DKText>
        </View>
      )}
      {!error && !!hint && (
        <DKText variant="caption" color={DK.muted}>
          {hint}
        </DKText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { paddingHorizontal: 6, marginBottom: 8 },
  line: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: DK_SPACE.md, paddingVertical: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
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
  errorRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
});
