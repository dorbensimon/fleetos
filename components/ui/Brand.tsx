// הלוגו של iCar
import { Image, StyleProp, ImageStyle } from 'react-native';

/**
 * icar brand artwork. Generated from deliverables/branding/icar-logo-v2
 * (prod.py) — edit the geometry there, not the PNGs.
 */

// יחס הרוחב לגובה של הלוגו
/** The horizontal lockup artwork is 311.9 × 87.5. */
const LOCKUP_RATIO = 311.9 / 87.5;

// לוגו לרקע כהה
const LOGO_ON_DARK = require('../../images/icar-logo-on-dark.png');
// לוגו לרקע בהיר
const LOGO_ON_LIGHT = require('../../images/icar-logo-on-light.png');
// הסמל לבד
const SYMBOL = require('../../images/icar-symbol.png');

// סמל ומילה
/** Symbol + "icar" wordmark. `onDark` switches the wordmark to white. */
export function BrandLogo({
  height,
  onDark = false,
  style,
}: {
  height: number;
  onDark?: boolean;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={onDark ? LOGO_ON_DARK : LOGO_ON_LIGHT}
      style={[{ height, width: height * LOCKUP_RATIO }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="icar"
    />
  );
}

// הסמל לבד
/** The symbol alone (square) — for small, quiet placements. */
export function BrandSymbol({ size, style }: { size: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={SYMBOL}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="icar"
    />
  );
}
