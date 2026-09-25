import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DK,
  DK_SPACE,
  DKText,
  DriverPage,
  HeroButton,
  HeroTitle,
  ListRow,
  Reveal,
  StatusChip,
  Surface,
} from '../../components/driverKit';
import { ErrorState, LoadingState } from '../../components/ui';
import type { DriverCardGroup, DriverCardIconKey, DriverCardRow } from '../../components/driverCard/driverCardSections';
import type { DriverCardTint } from '../../components/driverCard/driverCardTheme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<DriverCardIconKey, IconName> = {
  phone: 'call',
  email: 'mail',
  message: 'mail',
  car: 'car-sport',
  id: 'id-card',
  sign: 'create',
  doc: 'document-text',
  info: 'information-circle',
  folder: 'folder',
  chat: 'chatbubbles',
  alert: 'warning',
  users: 'people',
  shield: 'shield-checkmark',
  award: 'ribbon',
  hazard: 'flame',
  cap: 'school',
  edit: 'create',
  key: 'key',
};

/** The dossier's category colours, retuned to sit with the icar blue. */
const TINTS: Record<DriverCardTint, string> = {
  blue: '#2F5BFF',
  green: '#12A36B',
  orange: '#D56F00',
  red: '#D92D3A',
  purple: '#7A4DFF',
  teal: '#0B96A3',
  indigo: '#4B4FE0',
  gray: '#56657A',
};

type Props = {
  insetTop: number;
  insetBottom: number;
  loading: boolean;
  error: string | null;
  name: string;
  groups: DriverCardGroup[];
  isNavigable: (row: DriverCardRow) => boolean;
  onRow: (row: DriverCardRow) => void;
  onSigning: () => void;
  onEditProfile: () => void;
  onBack: () => void;
  onRetry: () => void;
};

/**
 * The driver's own file: who they are, then every folder of documents,
 * grouped the same way the manager sees them — minus manager-only actions.
 */
export function DriverDocumentsMobile(p: Props) {
  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      hero={
        <HeroTitle
          title="המסמכים שלי"
          subtitle={p.name}
          onBack={p.onBack}
          right={<HeroButton icon="create-outline" label="עריכת הפרטים שלי" onPress={p.onEditProfile} />}
        />
      }
    >
      {p.loading ? (
        <Surface>
          <LoadingState />
        </Surface>
      ) : p.error ? (
        <Surface>
          <ErrorState message={p.error} onRetry={p.onRetry} />
        </Surface>
      ) : (
        <>
          <Reveal index={0}>
            <Surface>
              <ListRow
                first
                icon="create"
                tint={TINTS.orange}
                title="מסמכים לחתימה"
                subtitle="טפסים שמנהל הצי שלח אליך"
                onPress={p.onSigning}
              />
            </Surface>
          </Reveal>
          {p.groups.map((group, gi) => (
            <Reveal key={group.title} index={gi + 1}>
              <DKText variant="micro" color={DK.muted} style={styles.groupTitle} accessibilityRole="header">
                {group.title}
              </DKText>
              <Surface>
                {group.rows.map((row, ri) => {
                  const navigable = p.isNavigable(row);
                  const tone = row.kind === 'nav' ? row.tone : undefined;
                  const chip =
                    row.kind === 'nav' && row.badge && (tone === 'bad' || tone === 'warn') ? (
                      <StatusChip status={tone === 'bad' ? 'expired' : 'soon'} label={row.badge} />
                    ) : null;
                  const value = row.kind === 'value' ? row.value : !chip ? row.badge ?? null : null;
                  return (
                    <ListRow
                      key={row.key + ri}
                      first={ri === 0}
                      icon={ICONS[row.icon]}
                      tint={TINTS[row.tint]}
                      title={row.label}
                      value={value}
                      ltrValue={row.kind === 'value' ? !!row.ltr : true}
                      trailing={chip}
                      onPress={navigable ? () => p.onRow(row) : undefined}
                    />
                  );
                })}
              </Surface>
            </Reveal>
          ))}
          <View style={styles.note}>
            <Ionicons name="lock-closed" size={14} color={DK.muted} />
            <DKText variant="caption" color={DK.muted} style={styles.noteText}>
              חלק מהפרטים מנוהלים על ידי מנהל הצי. אפשר לצפות במסמכים ולהעלות מסמכים לפי ההרשאות שלך.
            </DKText>
          </View>
        </>
      )}
    </DriverPage>
  );
}

const styles = StyleSheet.create({
  groupTitle: { paddingHorizontal: 6, marginBottom: 8 },
  note: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 6, paddingHorizontal: DK_SPACE.sm, marginTop: 4 },
  noteText: { flex: 1 },
});

