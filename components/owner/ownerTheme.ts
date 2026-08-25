/**
 * OwnerHomeScreen and its extracted sub-components predate lib/theme.ts
 * and use their own local palette rather than the shared design system —
 * kept as-is (not migrated) while splitting the screen apart, since that
 * migration is a separate, deliberate design-system decision.
 */
export const COLORS = {
  screenBg: '#EEEEEE',
  white: '#FFFFFF',
  black: '#000000',
  gray: '#666666',
  grayLight: '#979797',
  border: '#E2E2E2',
  blue: '#0088CC',
  red: '#C0392B',
  activeBg: '#E9F1EC',
  activeText: '#5C8A6E',
  disabledBg: '#F0EAEA',
  disabledText: '#B4685F',
  fieldBg: '#FAFAFA',
};

export const AVATAR_PALETTE = ['#0088CC', '#000000', '#666666', '#979797'];
