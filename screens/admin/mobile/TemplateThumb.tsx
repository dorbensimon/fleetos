import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK } from '../../../components/driverKit';
import type { SigningTemplate } from '../../../lib/docuseal';
import { thumbStyles } from './templateThumbStyles';

/**
 * A signing document drawn as a small sheet of paper. The native app has no
 * PDF renderer, so it shows the document mark; the web build draws the real
 * first page (TemplateThumb.web.tsx).
 */
export function TemplateThumb(_: { template: SigningTemplate }) {
  return (
    <View style={thumbStyles.paper} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ionicons name="document-text" size={22} color={DK.accent} />
    </View>
  );
}
