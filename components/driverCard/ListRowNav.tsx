import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DriverCardIcon } from './DriverCardIcon';
import { DC_BADGE_TONE, DC_COLORS, DC_SPACING, DC_TYPO } from './driverCardTheme';
import type { DriverCardNavRow } from './driverCardSections';

export function ListRowNav({
  row,
  showSeparator,
  onPress,
}: {
  row: DriverCardNavRow;
  showSeparator: boolean;
  onPress?: () => void;
}) {
  const tone = row.tone ? DC_BADGE_TONE[row.tone] : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.iconSquare, { backgroundColor: DC_COLORS[row.tint] }]}>
        <View style={styles.iconHighlight} />
        <DriverCardIcon icon={row.icon} size={17} color="#FFFFFF" />
      </View>
      <View style={[styles.content, showSeparator && styles.separator]}>
        <Text style={[DC_TYPO.rowLabel, styles.label]}>{row.label}</Text>
        <View style={styles.trailing}>
          {row.badge ? (
            <Text
              style={[tone?.fontWeight === '600' ? DC_TYPO.badgeWarn : DC_TYPO.badge, { color: tone?.color }]}
              numberOfLines={1}
            >
              {row.badge}
            </Text>
          ) : null}
          <Feather name="chevron-left" size={17} color={DC_COLORS.chevron} />
        </View>
      </View>
    </Pressable>
  );
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
  trailing: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
});
