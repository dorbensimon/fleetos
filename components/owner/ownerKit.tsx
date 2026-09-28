import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, Pressy, STATUS } from '../driverKit';
import type { AccountTone } from '../../lib/companyAccount';

/**
 * Small pieces the owner's screens share, in the app kit's look (DK tokens):
 * a row of choice chips and the colours of an account's standing.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const ACCOUNT_TONE: Record<AccountTone, { fg: string; fill: string; soft: string }> = {
  ok: STATUS.ok,
  warn: STATUS.soon,
  bad: STATUS.expired,
  off: STATUS.missing,
};

/** One-of-many choice as chips that wrap; tapping the chosen one again clears it when `clearable`. */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  clearable = false,
  label,
}: {
  options: { value: T; label: string; icon?: IconName; tone?: AccountTone }[];
  value: T | '' | null;
  onChange: (value: T | '') => void;
  clearable?: boolean;
  /** Read out with each chip, e.g. "סטטוס". */
  label: string;
}) {
  return (
    <View style={styles.row} accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        const tone = o.tone ? ACCOUNT_TONE[o.tone] : null;
        return (
          <Pressy
            key={o.value}
            onPress={() => onChange(on && clearable ? '' : o.value)}
            accessibilityLabel={`${label}: ${o.label}${on ? ', נבחר' : ''}`}
            pressScale={0.95}
            style={[styles.chip, on ? styles.chipOn : styles.chipIdle]}
          >
            {tone ? <View style={[styles.dot, { backgroundColor: on ? '#FFFFFF' : tone.fill }]} /> : null}
            {o.icon ? <Ionicons name={o.icon} size={16} color={on ? '#FFFFFF' : DK.inkSoft} /> : null}
            <DKText variant="label" color={on ? '#FFFFFF' : DK.inkSoft}>
              {o.label}
            </DKText>
          </Pressy>
        );
      })}
    </View>
  );
}

/** A soft pill that says where an account stands. */
export function TonePill({ tone, label }: { tone: AccountTone; label: string }) {
  const t = ACCOUNT_TONE[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.soft }]}>
      <View style={[styles.dot, { backgroundColor: t.fill }]} />
      <DKText variant="micro" color={t.fg} numberOfLines={1}>
        {label}
      </DKText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5 },
  chipIdle: { backgroundColor: DK.surfaceSunk, borderColor: 'transparent' },
  chipOn: { backgroundColor: DK.ink, borderColor: DK.ink },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 13, alignSelf: 'flex-start' },
});
