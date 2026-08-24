import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Select } from './Select';
import { SPACING } from '../../lib/theme';

/**
 * A vehicle's "manufacture date" is only ever a month + year (there's no
 * day-of-month on a production date) — two side-by-side dropdowns instead
 * of a free-text year field and a free-text month field, so there's no way
 * to type an invalid month number or a non-numeric year.
 */

const MONTH_LABELS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

const MONTH_OPTIONS = MONTH_LABELS.map((label, i) => ({ value: String(i + 1), label }));

function yearOptions(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear();
  const years: { value: string; label: string }[] = [];
  for (let y = currentYear + 1; y >= 1980; y--) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
}

const YEAR_OPTIONS = yearOptions();

export function MonthYearField({
  month,
  year,
  onChangeMonth,
  onChangeYear,
  hasError,
}: {
  month: number | null;
  year: number | null;
  onChangeMonth: (month: number | null) => void;
  onChangeYear: (year: number | null) => void;
  hasError?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.item}>
        <Select
          value={month ? String(month) : null}
          onChange={(v) => onChangeMonth(v ? Number(v) : null)}
          options={MONTH_OPTIONS}
          placeholder="חודש"
          hasError={hasError}
          allowClear
        />
      </View>
      <View style={styles.item}>
        <Select
          value={year ? String(year) : null}
          onChange={(v) => onChangeYear(v ? Number(v) : null)}
          options={YEAR_OPTIONS}
          placeholder="שנה"
          hasError={hasError}
          allowClear
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row-reverse', gap: SPACING.md },
  item: { flex: 1 },
});
