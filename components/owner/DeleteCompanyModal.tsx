import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CenterModal } from './OwnerModals';
import { COLORS } from './ownerTheme';
import { CompanyRow } from './CompanyCard';

export function DeleteCompanyModal({
  visible,
  company,
  confirmText,
  deleting,
  onChangeConfirmText,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  company: CompanyRow | null;
  confirmText: string;
  deleting: boolean;
  onChangeConfirmText: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const matches = !!company && confirmText.trim() === company.name;

  return (
    <CenterModal visible={visible} onClose={onClose}>
      <View style={styles.headerRow}>
        <View style={styles.iconBox}>
          <Ionicons name="warning-outline" size={20} color={COLORS.red} />
        </View>
        <Text style={styles.title}>מחיקת חברה</Text>
      </View>
      <Text style={styles.description}>
        מחיקת <Text style={styles.companyNameBold}>{company?.name}</Text> תסיר את כל האדמינים והנהגים המשויכים
        אליה. הפעולה אינה ניתנת לשחזור.
      </Text>
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>להמשך, הקלד את שם החברה:</Text>
        <TextInput
          style={[styles.fieldInput, matches && styles.fieldInputMatch]}
          placeholder={company?.name}
          placeholderTextColor={COLORS.grayLight}
          value={confirmText}
          onChangeText={onChangeConfirmText}
          textAlign="right"
        />
      </View>
      <View style={styles.buttonsRow}>
        <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
          <Text style={styles.cancelButtonText}>ביטול</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.deleteButton, !matches && styles.deleteButtonDisabled]}
          onPress={onConfirm}
          disabled={!matches || deleting}
        >
          {deleting ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={[styles.deleteButtonText, !matches && styles.deleteButtonTextDisabled]}>
              מחק לצמיתות
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </CenterModal>
  );
}

export function CompanyCreatedModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <CenterModal visible={visible} onClose={onClose}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBox, { backgroundColor: COLORS.activeBg }]}>
          <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.activeText} />
        </View>
        <Text style={styles.title}>החברה נוצרה בהצלחה</Text>
      </View>
      <Text style={styles.description}>
        האדמין יכול להתחבר עכשיו עם המייל והסיסמה שקבעת, ויתבקש לקבוע סיסמה קבועה משלו בכניסה הראשונה.
      </Text>
      <TouchableOpacity style={styles.createButton} onPress={onClose}>
        <Text style={styles.createButtonText}>סגור</Text>
      </TouchableOpacity>
    </CenterModal>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11 },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.disabledBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.black },
  description: { fontSize: 13.5, color: COLORS.gray, lineHeight: 21, textAlign: 'right' },
  companyNameBold: { color: COLORS.black, fontWeight: '600' },
  fieldGroup: { gap: 7 },
  fieldLabel: { fontSize: 12.5, fontWeight: '600', color: COLORS.gray, textAlign: 'right' },
  fieldInput: {
    height: 48,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.fieldBg,
    fontSize: 15,
    color: COLORS.black,
    paddingHorizontal: 14,
  },
  fieldInputMatch: { borderColor: COLORS.activeText },
  buttonsRow: { flexDirection: 'row', gap: 9 },
  cancelButton: {
    flex: 1,
    height: 46,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: { color: COLORS.black, fontSize: 14.5, fontWeight: '600' },
  deleteButton: {
    flex: 1.3,
    height: 46,
    borderRadius: 11,
    backgroundColor: COLORS.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonDisabled: { backgroundColor: '#EDD9D6' },
  deleteButtonText: { color: COLORS.white, fontSize: 14.5, fontWeight: '600' },
  deleteButtonTextDisabled: { color: '#C39B95' },
  createButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: { color: COLORS.white, fontSize: 15.5, fontWeight: '600' },
});
