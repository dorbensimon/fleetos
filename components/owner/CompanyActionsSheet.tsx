import React from 'react';
import { StyleSheet } from 'react-native';
import { DK, KitSheet, ListRow, STATUS, Surface } from '../driverKit';
import { CompanyRow } from './CompanyCard';
import { t } from '../../lib/i18n';

/** The "⋯" menu of a company: open it, its subscription, switch it off or on, or delete it. */
export function CompanyActionsSheet({
  company,
  visible,
  onClose,
  onOpen,
  onAccount,
  onToggleActive,
  onDelete,
}: {
  company: CompanyRow | null;
  visible: boolean;
  onClose: () => void;
  onOpen: () => void;
  onAccount: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const active = company?.status === 'active';
  return (
    <KitSheet visible={visible} onClose={onClose} title={company?.name ?? ''} subtitle={active ? t('owner.activeCompany') : t('owner.disabledCompany')}>
      <Surface style={styles.list}>
        <ListRow first icon="open-outline" title={t('owner.openCompanyPage')} subtitle={t('owner.detailsManagersDrivers')} onPress={onOpen} />
        <ListRow icon="card-outline" title={t('owner.subscriptionAndPayment')} subtitle={t('owner.statusPriceRenewal')} onPress={onAccount} />
        <ListRow
          icon={active ? 'pause-circle-outline' : 'play-circle-outline'}
          tint={active ? STATUS.soon.fg : STATUS.ok.fg}
          title={active ? t('owner.disableCompany') : t('owner.reactivateCompany')}
          subtitle={active ? t('owner.disableHint') : t('owner.reactivateCaption')}
          onPress={onToggleActive}
        />
      </Surface>
      <Surface style={[styles.list, styles.gap]}>
        <ListRow first icon="trash-outline" tint={STATUS.expired.fg} title={t('owner.deleteCompany')} subtitle={t('owner.permanentDeleteAll')} onPress={onDelete} />
      </Surface>
    </KitSheet>
  );
}

const styles = StyleSheet.create({
  list: { overflow: 'hidden', backgroundColor: DK.surface },
  gap: { marginTop: 12 },
});
