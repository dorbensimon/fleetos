import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { DC_COLORS, DC_TYPO } from './driverCardTheme';

const COLLAPSE_DISTANCE = 40;

export function NavBarCollapsing({
  scrollY,
  insetTop,
  title,
  backLabel,
  onBack,
  onMore,
  backgroundColor,
}: {
  scrollY: Animated.Value;
  insetTop: number;
  title?: string;
  backLabel: string;
  onBack?: () => void;
  onMore?: () => void;
  backgroundColor?: string;
}) {
  const blurOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const titleOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  // Extra buffer below the safe-area inset so the bar clears the Dynamic Island
  // on iPhones that have one (insetTop alone sits flush against it).
  const topBuffer = insetTop + 8;

  return (
    <View style={[styles.wrap, { height: 44 + topBuffer }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: backgroundColor ?? DC_COLORS.bg }]} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: blurOpacity }]}>
        <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(249,249,249,0.82)' }]} />
        <View style={styles.borderBottom} />
      </Animated.View>

      <View style={[styles.content, { paddingTop: topBuffer }]}>
        <Pressable onPress={onBack} style={styles.backButton} hitSlop={8}>
          <Feather name="chevron-right" size={19} color={DC_COLORS.blue} />
          <Text style={[DC_TYPO.navBackLink, styles.backLabel]}>{backLabel}</Text>
        </Pressable>

        {title ? (
          <Animated.Text
            style={[DC_TYPO.navTitle, styles.title, { opacity: titleOpacity }]}
            numberOfLines={1}
          >
            {title}
          </Animated.Text>
        ) : <View style={styles.titleSpacer} />}

        <Pressable onPress={onMore} style={styles.moreButton} hitSlop={8}>
          <Feather name="more-horizontal" size={18} color={DC_COLORS.blue} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  borderBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60,60,67,0.2)',
  },
  content: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  backButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    minWidth: 70,
  },
  backLabel: {
    color: DC_COLORS.blue,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: DC_COLORS.label,
  },
  titleSpacer: { flex: 1 },
  moreButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: DC_COLORS.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
