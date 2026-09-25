import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { BrandLoader } from '../ui/BrandLoader';
import { Ionicons } from '@expo/vector-icons';
import { CenterModal } from './OwnerModals';
import { COLORS } from './ownerTheme';
import { sharedStyles } from '../companyDetail/sharedStyles';
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
      <View style={sharedStyles.fieldGroup}>
        <Text style={sharedStyles.fieldLabel}>להמשך, הקלד את שם החברה:</Text>
        <TextInput
          style={[styles.fieldInput, matches && sharedStyles.fieldInputMatch]}
          placeholder={company?.name}
          placeholderTextColor={COLORS.grayLight}
          value={confirmText}
          onChangeText={onChangeConfirmText}
          textAlign="right"
        />
      </View>
      <View style={styles.buttonsRow}>
        <TouchableOpacity style={sharedStyles.cancelButton} onPress={onClose}>
          <Text style={sharedStyles.cancelButtonText}>ביטול</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[sharedStyles.deleteButton, !matches && sharedStyles.deleteButtonDisabled]}
          onPress={onConfirm}
          disabled={!matches || deleting}
        >
          {deleting ? (
            <BrandLoader color={COLORS.white} />
          ) : (
            <Text style={[sharedStyles.deleteButtonText, !matches && sharedStyles.deleteButtonTextDisabled]}>
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
  buttonsRow: { flexDirection: 'row', gap: 9 },
  createButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: { color: COLORS.white, fontSize: 15.5, fontWeight: '600' },
});
