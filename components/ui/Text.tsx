import React from 'react';
import { Text as RNText, TextProps, StyleSheet } from 'react-native';
import { COLORS, FONT } from '../../lib/theme';

/**
 * React Native has no global font setting, so every piece of text in the
 * admin module goes through this component. It applies Heebo and the
 * default text colour, and switches to the bold face when `weight="bold"`
 * — using fontWeight alone would not pick the right Heebo file.
 */
export interface AppTextProps extends TextProps {
  weight?: 'regular' | 'bold';
}

export function AppText({ weight = 'regular', style, ...rest }: AppTextProps) {
  return (
    <RNText
      {...rest}
      style={[
        styles.base,
        { fontFamily: weight === 'bold' ? FONT.bold : FONT.regular },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    color: COLORS.text,
    fontSize: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
