import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, styles as sheetStyles } from './OwnerModals';
import { COLORS } from './ownerTheme';
import { CompanyRow } from './CompanyCard';

/** The "⋮" menu opened from a company card: toggle active/disabled, or go to delete. */
export function CompanyActionsSheet({
  company,
  visible,
  onClose,
  onToggleActive,
  onDelete,
}: {
  company: CompanyRow | null;
  visible: boolean;
  onClose: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={sheetStyles.sheetHandle} />
      <Text style={styles.companyName}>{company?.name}</Text>
      <TouchableOpacity style={styles.action} onPress={onToggleActive}>
        <Ionicons name="power-outline" size={19} color={COLORS.gray} />
        <Text style={styles.actionText}>{company?.status === 'active' ? 'השבת חברה' : 'הפעל חברה'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.action} onPress={onDelete}>
        <Ionicons name="trash-outline" size={19} color={COLORS.red} />
        <Text style={[styles.actionText, { color: COLORS.red }]}>מחק חברה</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  companyName: { fontSize: 14, fontWeight: '600', color: COLORS.black, textAlign: 'right' },
  action: {
    height: 52,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  actionText: { fontSize: 15, color: COLORS.black },
});
