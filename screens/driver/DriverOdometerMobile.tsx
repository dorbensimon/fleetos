import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DK_FONT, DK_SPACE, DKText, DriverPage, HeroTitle, PrimaryAction, Reveal, STATUS, Surface } from '../../components/driverKit';

type Props = {
  insetTop: number;
  insetBottom: number;
  current: number;
  value: string;
  onChange: (digits: string) => void;
  saving: boolean;
  onSave: () => void;
  onBack: () => void;
};

/**
 * One number, big and centred, with the difference from the last reading
 * shown live — and the rule ("only up") explained before it's broken, then
 * inline if it is, instead of an alert after pressing save.
 */
export function DriverOdometerMobile(p: Props) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const next = Number(p.value);
  const empty = p.value.trim() === '';
  const tooLow = !empty && Number.isSafeInteger(next) && next < p.current;
  const delta = !empty && Number.isSafeInteger(next) ? next - p.current : 0;
  const formatted = empty ? '' : next.toLocaleString('he-IL');

  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      hero={<HeroTitle title="עדכון קילומטרים" subtitle="המספר שמופיע עכשיו בלוח המחוונים" onBack={p.onBack} />}
      footer={
        <PrimaryAction
          label="שמירת הקילומטראז׳"
          icon="checkmark"
          onPress={p.onSave}
          loading={p.saving}
          disabled={empty || tooLow}
        />
      }
    >
      <Reveal>
        <Surface style={styles.card}>
          <DKText variant="caption" color={DK.muted} style={styles.center}>
            עדכון קודם: {p.current.toLocaleString('he-IL')} ק״מ
          </DKText>

          <Pressable onPress={() => input.current?.focus()} accessible={false} style={[styles.field, focused && styles.fieldFocused, tooLow && styles.fieldError]}>
            <TextInput
              ref={input}
              value={formatted}
              onChangeText={(text) => p.onChange(text.replace(/\D/g, '').slice(0, 7))}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder="0"
              placeholderTextColor={DK.faint}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              selectTextOnFocus
              accessibilityLabel="הקילומטראז׳ עכשיו"
              accessibilityHint={`מספר של ${p.current.toLocaleString('he-IL')} ומעלה`}
              style={styles.input}
            />
            <DKText variant="label" color={DK.muted} style={styles.center}>
              ק״מ
            </DKText>
          </Pressable>

          <View style={styles.feedback} accessibilityLiveRegion="polite">
            {tooLow ? (
              <View style={[styles.note, { backgroundColor: STATUS.expired.soft }]}>
                <Ionicons name="alert-circle" size={16} color={STATUS.expired.fg} />
                <DKText variant="caption" color={STATUS.expired.fg}>
                  אי אפשר להוריד — המספר צריך להיות {p.current.toLocaleString('he-IL')} ומעלה
                </DKText>
              </View>
            ) : delta > 0 ? (
              <View style={[styles.note, { backgroundColor: STATUS.ok.soft }]}>
                <Ionicons name="trending-up" size={16} color={STATUS.ok.fg} />
                <DKText variant="caption" color={STATUS.ok.fg}>
                  +{delta.toLocaleString('he-IL')} ק״מ מהעדכון הקודם
                </DKText>
              </View>
            ) : (
              <DKText variant="caption" color={DK.muted} style={styles.center}>
                אפשר רק להעלות את המספר. מנהל הצי יראה אותו מיד.
              </DKText>
            )}
          </View>
        </Surface>
      </Reveal>
    </DriverPage>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  card: { paddingVertical: 26, paddingHorizontal: DK_SPACE.lg, gap: 16 },
  field: {
    alignItems: 'center',
    paddingVertical: 18,
    borderRadius: 22,
    backgroundColor: DK.surfaceSunk,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  fieldFocused: { borderColor: DK.accent, backgroundColor: '#FFFFFF' },
  fieldError: { borderColor: STATUS.expired.fill },
  input: {
    width: '100%',
    textAlign: 'center',
    writingDirection: 'ltr',
    fontFamily: DK_FONT.display,
    fontSize: 46,
    lineHeight: 54,
    letterSpacing: -1,
    color: DK.ink,
    paddingVertical: 0,
    fontVariant: ['tabular-nums'],
    outlineStyle: 'none',
  } as any,
  feedback: { minHeight: 36, justifyContent: 'center' },
  note: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14 },
});
