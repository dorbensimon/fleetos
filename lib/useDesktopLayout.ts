import { Platform, useWindowDimensions } from 'react-native';

/**
 * Below this width the web build keeps the phone layout exactly as it is on
 * iPhone. The desktop tables need the sidebar plus six readable columns,
 * which stop fitting comfortably under ~1024px.
 */
export const DESKTOP_MIN_WIDTH = 1024;

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}
