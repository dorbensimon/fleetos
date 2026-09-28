import React from 'react';
import { StyleSheet } from 'react-native';
import { DK, KitSheet, ListRow, STATUS, Surface } from '../driverKit';
import { CompanyRow } from './CompanyCard';

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
    <KitSheet visible={visible} onClose={onClose} title={company?.name ?? ''} subtitle={active ? 'חברה פעילה' : 'חברה מושבתת'}>
      <Surface style={styles.list}>
        <ListRow first icon="open-outline" title="פתיחת דף החברה" subtitle="פרטים, מנהלים ונהגים" onPress={onOpen} />
        <ListRow icon="card-outline" title="מנוי ותשלום" subtitle="מצב הלקוח, מחיר ומועד חידוש" onPress={onAccount} />
        <ListRow
          icon={active ? 'pause-circle-outline' : 'play-circle-outline'}
          tint={active ? STATUS.soon.fg : STATUS.ok.fg}
          title={active ? 'השבתת החברה' : 'הפעלת החברה מחדש'}
          subtitle={active ? 'המשתמשים שלה לא יוכלו להיכנס. הנתונים נשמרים.' : 'המשתמשים שלה יוכלו להיכנס שוב'}
          onPress={onToggleActive}
        />
      </Surface>
      <Surface style={[styles.list, styles.gap]}>
        <ListRow first icon="trash-outline" tint={STATUS.expired.fg} title="מחיקת החברה" subtitle="מחיקה סופית של כל הנתונים" onPress={onDelete} />
      </Surface>
    </KitSheet>
  );
}

const styles = StyleSheet.create({
  list: { overflow: 'hidden', backgroundColor: DK.surface },
  gap: { marginTop: 12 },
});
