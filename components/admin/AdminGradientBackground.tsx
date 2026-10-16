// רקע מדורג למסכי המנהל בטלפון
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// צבעי הרקע המדורג
/** Shared visual foundation for mobile screens (the fleet home is excluded). */
export const ADMIN_BACKGROUND_COLORS = ['#CFE7F5', '#E4EFF6', '#F1F4F7'] as const;
// נקודות המעבר בין הצבעים
export const ADMIN_BACKGROUND_LOCATIONS = [0, 0.45, 0.9] as const;

// הרקע עצמו
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

// הרקע ממלא את כל המסך
const styles = StyleSheet.create({
  gradient: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
  },
});
