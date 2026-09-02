import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/** Shared visual foundation for native admin screens (the fleet home is excluded). */
export const ADMIN_BACKGROUND_COLORS = ['#CFE7F5', '#E4EFF6', '#F1F4F7'] as const;
export const ADMIN_BACKGROUND_LOCATIONS = [0, 0.45, 0.9] as const;

export function AdminGradientBackground() {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={ADMIN_BACKGROUND_COLORS}
      locations={ADMIN_BACKGROUND_LOCATIONS}
      style={styles.gradient}
    />
  );
}

const styles = StyleSheet.create({
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 420,
  },
});
