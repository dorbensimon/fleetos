import React from 'react';
import { Pressable, PressableProps, StyleProp, Text, TextProps, View, ViewStyle, StyleSheet } from 'react-native';
import { DESKTOP_COLORS, DESKTOP_FONT, DESKTOP_TONES, DesktopTone, webOnly } from './desktopTheme';

type Weight = keyof typeof DESKTOP_FONT;

/** Heebo text, right-aligned RTL by default — the desktop counterpart of AppText. */
export function DText({ weight = 'regular', style, ...rest }: TextProps & { weight?: Weight }) {
  return <Text {...rest} style={[styles.text, { fontFamily: DESKTOP_FONT[weight] }, style]} />;
}

/** Latin data (dates, plates, phones) inside the Hebrew UI stays LTR but keeps the RTL column alignment. */
export function DLtrText(props: TextProps & { weight?: Weight }) {
  return <DText {...props} style={[styles.ltr, props.style]} />;
}

type HoverState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/**
 * Pressable with react-native-web's hover/focus state exposed to the style
 * callback, plus a pointer cursor — every clickable element on desktop.
 */
export function HoverPressable({
  style,
  hoverStyle,
  children,
  ...rest
}: Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  hoverStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      style={(state) => {
        const { hovered, focused } = state as HoverState;
        return [
          webOnly({ cursor: rest.disabled ? 'default' : 'pointer', outlineStyle: 'none' }),
          style,
          (hovered || focused) && !rest.disabled ? hoverStyle : null,
        ];
      }}
    >
      {children}
    </Pressable>
  );
}

export function StatusPill({ tone, label }: { tone: DesktopTone; label: string }) {
  const colors = DESKTOP_TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: colors.bg }]}>
      <DText weight="bold" style={[styles.pillText, { color: colors.fg }]} numberOfLines={1}>
        {label}
      </DText>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: DESKTOP_COLORS.ink, fontSize: 13.5, textAlign: 'right', writingDirection: 'rtl' },
  ltr: { writingDirection: 'ltr' },
  pill: { alignSelf: 'flex-end', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2.5 },
  pillText: { fontSize: 11 },
});
