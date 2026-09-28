import { View, Text, StyleSheet } from 'react-native';
import { ListRowNav } from './ListRowNav';
import { ListRowValue } from './ListRowValue';
import { DC_COLORS, DC_SPACING, DC_TYPO } from './driverCardTheme';
import type { DriverCardGroup, DriverCardRow } from './driverCardSections';
import { textStart, textDirection } from '../../lib/i18n';

export function ListGroup({
  group,
  onRowPress,
}: {
  group: DriverCardGroup;
  onRowPress?: (row: DriverCardRow) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={[DC_TYPO.groupTitle, styles.title]}>{group.title}</Text>
      <View style={styles.card}>
        {group.rows.map((row, index) => {
          const showSeparator = index < group.rows.length - 1;
          return row.kind === 'value' ? (
            <ListRowValue
              key={row.label}
              row={row}
              showSeparator={showSeparator}
              onPress={row.pressable ? () => onRowPress?.(row) : undefined}
            />
          ) : (
            <ListRowNav
              key={row.label}
              row={row}
              showSeparator={showSeparator}
              onPress={() => onRowPress?.(row)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: DC_SPACING.groupGap,
  },
  title: {
    color: DC_COLORS.labelTertiary,
    writingDirection: textDirection(),
    textAlign: textStart(),
    marginBottom: 8,
    marginEnd: DC_SPACING.screenPaddingH + 2,
  },
  card: {
    marginHorizontal: DC_SPACING.screenPaddingH,
    backgroundColor: DC_COLORS.surface,
    borderRadius: DC_SPACING.groupRadius,
    overflow: 'hidden',
  },
});
