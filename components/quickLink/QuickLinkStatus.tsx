// מסך מצב לנהג (בטלפון: טקסט בלבד, האתר משתמש בגרסת ה-web)
import React from 'react';
import { View } from 'react-native';
import { DKText, PrimaryAction } from '../driverKit';
import type { QuickLinkStatusKind } from './statusKinds';

export function QuickLinkStatus({ title, text, action }: {
  kind: QuickLinkStatusKind;
  title: string;
  text: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 8 }}>
      <DKText variant="label">{title}</DKText>
      <DKText variant="caption">{text}</DKText>
      {action && <PrimaryAction label={action.label} onPress={action.onPress} />}
    </View>
  );
}
