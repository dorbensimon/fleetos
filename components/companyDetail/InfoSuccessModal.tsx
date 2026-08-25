import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CenterModal } from '../owner/OwnerModals';
import { COLORS } from '../owner/ownerTheme';
import { sharedStyles as s } from './sharedStyles';

/** The green-checkmark "done" dialog shared by the add-admin and reset-password flows. */
export function InfoSuccessModal({
  visible,
  title,
  description,
  onClose,
}: {
  visible: boolean;
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <CenterModal visible={visible} onClose={onClose}>
      <View style={s.deleteHeaderRow}>
        <View style={[s.deleteIconBox, { backgroundColor: COLORS.activeBg }]}>
          <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.activeText} />
        </View>
        <Text style={s.deleteTitle}>{title}</Text>
      </View>
      <Text style={s.deleteDescription}>{description}</Text>
      <TouchableOpacity style={s.primaryButton} onPress={onClose}>
        <Text style={s.primaryButtonText}>סגור</Text>
      </TouchableOpacity>
    </CenterModal>
  );
}
