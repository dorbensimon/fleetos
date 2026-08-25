import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../owner/ownerTheme';
import { CompanyUser } from './types';

export function UserRow({
  user,
  onRemove,
  onResetPassword,
  onEdit,
}: {
  user: CompanyUser;
  onRemove: () => void;
  onResetPassword: () => void;
  onEdit: () => void;
}) {
  return (
    <View style={styles.userRow}>
      <TouchableOpacity onPress={onRemove} style={styles.userRemoveButton}>
        <Ionicons name="trash-outline" size={16} color={COLORS.red} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onResetPassword} style={styles.userRemoveButton}>
        <Ionicons name="key-outline" size={16} color={COLORS.blue} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onEdit} style={styles.userRemoveButton}>
        <Ionicons name="pencil-outline" size={16} color={COLORS.gray} />
      </TouchableOpacity>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{user.full_name || 'ללא שם'}</Text>
        <Text style={styles.userEmail}>{user.email || '—'}</Text>
        {!!user.phone && <Text style={styles.userEmail}>{user.phone}</Text>}
      </View>
      {user.must_change_password && (
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>ממתין לקביעת סיסמה</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontSize: 14, fontWeight: '600', color: COLORS.black, textAlign: 'right' },
  userEmail: { fontSize: 12.5, color: COLORS.gray, textAlign: 'right' },
  userRemoveButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  pendingBadge: { backgroundColor: COLORS.disabledBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  pendingBadgeText: { fontSize: 10.5, fontWeight: '600', color: COLORS.disabledText },
});
