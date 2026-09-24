import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DocumentRow } from '../../../lib/adminApi';
import { documentIconName } from '../../../lib/documentActions';
import { DESKTOP_COLORS } from '../desktopTheme';

/**
 * Native fallback of the desktop document miniature (see DocumentPreview.web):
 * the desktop record pages only render on web, so this is just the paper
 * sheet with the file-type icon.
 */
export function DocumentPreview({ doc, width, height }: { doc: DocumentRow; width: number; height: number }) {
  return (
    <View style={[styles.paper, { width, height }]}>
      <Ionicons name={documentIconName(doc)} size={Math.round(width * 0.36)} color={DESKTOP_COLORS.inkFaint} />
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
