import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DK, DKText, KitInput, KitSheet, PrimaryAction, SheetActions, STATUS } from '../driverKit';
import { CompanyRow } from './CompanyCard';
import { t } from '../../lib/i18n';

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
      title={t('owner.deleteQuestion', { v1: company?.name ?? t('owner.theCompany') })}
      subtitle={t('owner.deleteWarning')}
      footer={
        <SheetActions>
          <PrimaryAction label={t('common.keep')} tone="ghost" onPress={onClose} disabled={deleting} style={styles.grow} />
          <PrimaryAction label={t('common.deletePermanently')} tone="destructive" onPress={onConfirm} disabled={!matches} loading={deleting} style={styles.grow} />
        </SheetActions>
      }
    >
      <View style={styles.field}>
        <DKText variant="caption" color={DK.inkSoft}>
          {t('owner.typeNameToConfirm')} <DKText variant="label">{company?.name}</DKText>
        </DKText>
        <KitInput
          value={confirmText}
          onChangeText={onChangeConfirmText}
          placeholder={company?.name}
          accessibilityLabel={t('owner.nameToConfirmLabel')}
          autoCorrect={false}
          style={matches ? styles.match : undefined}
        />
        {matches && (
          <DKText variant="caption" color={STATUS.expired.fg}>
            {t('owner.nameMatches')}
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
