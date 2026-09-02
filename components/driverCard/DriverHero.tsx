import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DC_COLORS, DC_SPACING, DC_TYPO } from './driverCardTheme';

export function DriverHero({
  name,
  avatarLetter,
  statusColor,
  subtitleParts,
}: {
  name: string;
  avatarLetter: string;
  statusColor: string;
  subtitleParts: string[];
}) {
  return (
    <View style={styles.row}>
      <View style={styles.avatarShadowWrap}>
        <LinearGradient
          colors={[DC_COLORS.blueLight, DC_COLORS.blueDeep]}
          style={styles.avatar}
        >
          <View style={styles.avatarHighlight} />
          <Text style={styles.avatarLetter}>{avatarLetter}</Text>
        </LinearGradient>
      </View>
      <View style={styles.textBlock}>
        <Text style={[DC_TYPO.heroName, styles.name]}>{name}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={[DC_TYPO.heroSubtitle, styles.subtitle]}>{subtitleParts.join(' · ')}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: DC_SPACING.screenPaddingH,
    paddingBottom: 18,
  },
  avatarShadowWrap: {
    shadowColor: 'rgba(10,132,255,0.28)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
  },
  avatar: {
    width: DC_SPACING.avatarSize,
    height: DC_SPACING.avatarSize,
    borderRadius: DC_SPACING.avatarRadius,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  avatarLetter: {
    fontFamily: 'Heebo_600SemiBold',
    fontSize: 30,
    letterSpacing: -0.5,
    color: '#FFFFFF',
  },
  textBlock: {
    gap: 3,
    alignItems: 'center',
  },
  name: {
    color: DC_COLORS.label,
    writingDirection: 'rtl',
    textAlign: 'center',
  },
  statusRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  subtitle: {
    color: DC_COLORS.labelSecondary,
    writingDirection: 'rtl',
  },
});
