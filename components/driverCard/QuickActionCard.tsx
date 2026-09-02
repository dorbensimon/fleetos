import { Pressable, View, Text, StyleSheet } from 'react-native';
import { DriverCardIcon } from './DriverCardIcon';
import { DC_COLORS, DC_SPACING, DC_TYPO } from './driverCardTheme';
import type { DriverCardTint } from './driverCardTheme';
import type { DriverCardIconKey } from './driverCardSections';

export function QuickActionCard({
  label,
  icon,
  tint,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: DriverCardIconKey;
  tint: DriverCardTint;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const tintColor = DC_COLORS[tint];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.card, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <View style={[styles.iconCircle, { backgroundColor: `${tintColor}1A` }]}>
        <DriverCardIcon icon={icon} size={20} color={tintColor} />
      </View>
      <Text style={[DC_TYPO.quickActionLabel, styles.label]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: DC_COLORS.surface,
    borderRadius: DC_SPACING.quickActionRadius,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 7,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 0.5 },
    shadowRadius: 2,
    elevation: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: { opacity: 0.42 },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: DC_COLORS.label,
    writingDirection: 'rtl',
  },
});
