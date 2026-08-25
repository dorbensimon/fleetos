import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CenterModal } from '../owner/OwnerModals';
import { COLORS } from '../owner/ownerTheme';
import { sharedStyles as s } from './sharedStyles';

export function DeleteCompanyModal({
  visible,
  companyName,
  confirmText,
  deleting,
  onChangeConfirmText,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  companyName: string;
  confirmText: string;
  deleting: boolean;
  onChangeConfirmText: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const matches = confirmText.trim() === companyName;

  return (
    <CenterModal visible={visible} onClose={onClose}>
      <View style={s.deleteHeaderRow}>
        <View style={s.deleteIconBox}>
          <Ionicons name="warning-outline" size={20} color={COLORS.red} />
        </View>
        <Text style={s.deleteTitle}>מחיקת חברה</Text>
      </View>
      <Text style={s.deleteDescription}>
        מחיקת <Text style={s.deleteBold}>{companyName}</Text> תסיר את כל האדמינים והנהגים המשויכים אליה. הפעולה
        אינה ניתנת לשחזור.
      </Text>
      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>להמשך, הקלד את שם החברה:</Text>
        <TextInput
          style={[s.fieldInput, matches && s.fieldInputMatch]}
          placeholder={companyName}
          placeholderTextColor={COLORS.grayLight}
          value={confirmText}
          onChangeText={onChangeConfirmText}
          textAlign="right"
        />
      </View>
      <View style={s.deleteButtonsRow}>
        <TouchableOpacity style={s.cancelButton} onPress={onClose}>
          <Text style={s.cancelButtonText}>ביטול</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.deleteButton, !matches && s.deleteButtonDisabled]}
          onPress={onConfirm}
          disabled={!matches || deleting}
        >
          {deleting ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={[s.deleteButtonText, !matches && s.deleteButtonTextDisabled]}>מחק לצמיתות</Text>
          )}
        </TouchableOpacity>
      </View>
    </CenterModal>
  );
}
