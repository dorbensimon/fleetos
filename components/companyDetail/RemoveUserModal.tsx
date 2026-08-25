import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CenterModal } from '../owner/OwnerModals';
import { COLORS } from '../owner/ownerTheme';
import { sharedStyles as s } from './sharedStyles';
import { CompanyUser } from './types';

export function RemoveUserModal({
  target,
  removing,
  onClose,
  onConfirm,
}: {
  target: CompanyUser | null;
  removing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <CenterModal visible={!!target} onClose={onClose}>
      <View style={s.deleteHeaderRow}>
        <View style={s.deleteIconBox}>
          <Ionicons name="warning-outline" size={20} color={COLORS.red} />
        </View>
        <Text style={s.deleteTitle}>{target?.role === 'admin' ? 'הסרת אדמין' : 'הסרת נהג'}</Text>
      </View>
      <Text style={s.deleteDescription}>
        הסרת <Text style={s.deleteBold}>{target?.email || target?.full_name}</Text> תמחק את המשתמש לצמיתות, כולל
        גישתו למערכת.
        {target?.role === 'admin' ? ' כל הנהגים של החברה הזו יימחקו לצמיתות יחד איתו.' : ''} הפעולה אינה ניתנת
        לשחזור.
      </Text>
      <View style={s.deleteButtonsRow}>
        <TouchableOpacity style={s.cancelButton} onPress={onClose}>
          <Text style={s.cancelButtonText}>ביטול</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.deleteButton} onPress={onConfirm} disabled={removing}>
          {removing ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.deleteButtonText}>הסר לצמיתות</Text>}
        </TouchableOpacity>
      </View>
    </CenterModal>
  );
}
