import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DC_COLORS, DC_TYPO } from './driverCardTheme';
import { CONTENT_MAX_WIDTH } from '../../lib/theme';

export function NavBarCollapsing({
  insetTop,
  title,
  onBack,
  onMore,
  backgroundColor,
}: {
  insetTop: number;
  title?: string;
  backLabel: string;
  onBack?: () => void;
  onMore?: () => void;
  backgroundColor?: string;
}) {
  // Extra buffer below the safe-area inset so the bar clears the Dynamic Island
  // on iPhones that have one (insetTop alone sits flush against it).
  const topBuffer = insetTop + 8;

  return (
    <View style={[styles.wrap, { height: 44 + topBuffer }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: backgroundColor ?? DC_COLORS.bg }]} />
      <View style={[styles.content, { paddingTop: topBuffer }]}>
        <Pressable onPress={onBack} style={styles.backButton} hitSlop={10} accessibilityRole="button" accessibilityLabel="חזור">
          <Feather name="chevron-right" size={20} color={DC_COLORS.blue} />
        </Pressable>

        {title ? <Text style={[DC_TYPO.navTitle, styles.title]} numberOfLines={1}>{title}</Text> : <View style={styles.titleSpacer} />}

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
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  content: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(10,127,208,0.20)',
    shadowColor: '#0A7FD0',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
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
