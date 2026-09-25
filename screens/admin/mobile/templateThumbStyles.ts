import { StyleSheet } from 'react-native';
import { DK } from '../../../components/driverKit';

/** Shared by TemplateThumb.tsx and TemplateThumb.web.tsx (a platform file can't import its sibling by name). */
export const THUMB = { width: 46, height: 60 };

export const thumbStyles = StyleSheet.create({
  paper: {
    ...THUMB,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(10,22,38,0.14)',
    backgroundColor: DK.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  page: { ...StyleSheet.absoluteFill, backgroundColor: '#FFFFFF' },
});
