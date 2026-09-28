import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DK, DKText, KitInput, KitSheet, PrimaryAction, SheetActions, STATUS } from '../driverKit';
import { CompanyRow } from './CompanyCard';

/**
 * Deleting a company for good. The owner types the company's name to
 * unlock the button, so it never happens by a stray tap.
 */
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
    <KitSheet
      visible={visible}
      onClose={onClose}
      dismissable={!deleting}
      icon="trash"
      tone="danger"
      title={`למחוק את ${company?.name ?? 'החברה'}?`}
      subtitle="כל המנהלים, הנהגים, הרכבים והמסמכים שלה יימחקו לצמיתות. אי אפשר לשחזר. אם רק צריך לעצור גישה, עדיף להשבית."
      footer={
        <SheetActions>
          <PrimaryAction label="השארה" tone="ghost" onPress={onClose} disabled={deleting} style={styles.grow} />
          <PrimaryAction label="מחיקה לצמיתות" tone="destructive" onPress={onConfirm} disabled={!matches} loading={deleting} style={styles.grow} />
        </SheetActions>
      }
    >
      <View style={styles.field}>
        <DKText variant="caption" color={DK.inkSoft}>
          כדי לאשר, הקלד את שם החברה: <DKText variant="label">{company?.name}</DKText>
        </DKText>
        <KitInput
          value={confirmText}
          onChangeText={onChangeConfirmText}
          placeholder={company?.name}
          accessibilityLabel="שם החברה לאישור המחיקה"
          autoCorrect={false}
          style={matches ? styles.match : undefined}
        />
        {matches && (
          <DKText variant="caption" color={STATUS.expired.fg}>
            השם תואם. המחיקה תתבצע מיד.
          </DKText>
        )}
      </View>
    </KitSheet>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  field: { gap: 10 },
  match: { borderColor: STATUS.expired.fill, backgroundColor: '#FFFFFF' },
});
