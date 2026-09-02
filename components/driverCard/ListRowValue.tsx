import { View, Text, StyleSheet, Pressable } from 'react-native';
import { DriverCardIcon } from './DriverCardIcon';
import { DC_COLORS, DC_SPACING, DC_TYPO } from './driverCardTheme';
import type { DriverCardValueRow } from './driverCardSections';

export function ListRowValue({
  row,
  showSeparator,
  onPress,
}: {
  row: DriverCardValueRow;
  showSeparator: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={[styles.iconSquare, { backgroundColor: DC_COLORS[row.tint] }]}>
        <View style={styles.iconHighlight} />
        <DriverCardIcon icon={row.icon} size={17} color="#FFFFFF" />
      </View>
      <View style={[styles.content, showSeparator && styles.separator]}>
        <Text style={[DC_TYPO.rowLabel, styles.label]}>{row.label}</Text>
        <Text
          style={[DC_TYPO.rowValue, styles.value]}
          numberOfLines={1}
          {...(row.ltr ? { dir: 'ltr' } : {})}
        >
          {row.value}
        </Text>
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    minHeight: DC_SPACING.rowMinHeight,
    paddingRight: DC_SPACING.rowPaddingH,
  },
  rowPressed: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  iconSquare: {
    width: DC_SPACING.iconSquare,
    height: DC_SPACING.iconSquare,
    borderRadius: DC_SPACING.iconRadius,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginLeft: DC_SPACING.iconTextGap,
  },
  iconHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  content: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: DC_SPACING.rowMinHeight,
    paddingLeft: DC_SPACING.rowPaddingH,
  },
  separator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DC_COLORS.separator,
  },
  label: {
    color: DC_COLORS.label,
    writingDirection: 'rtl',
  },
  value: {
    color: DC_COLORS.labelSecondary,
    writingDirection: 'ltr',
  },
});
