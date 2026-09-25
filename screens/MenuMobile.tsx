import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, CountPill, DK, DK_SPACE, DKText, DriverPage, HeroButton, KitSection, ListRow, Pressy, Reveal, STATUS, Surface } from '../components/driverKit';
import { BrandLogo } from '../components/ui/Brand';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type MenuRow = {
  key: string;
  icon: IconName;
  title: string;
  subtitle?: string;
  count?: number;
  countTone?: 'accent' | 'soon' | 'expired';
  tint?: string;
  onPress: () => void;
};

export type MenuGroup = { title?: string; rows: MenuRow[] };

type Props = {
  insetTop: number;
  insetBottom: number;
  name: string;
  subtitle: string;
  companyName: string;
  groups: MenuGroup[];
  onBack: () => void;
  onProfile: () => void;
  onLogout: () => void;
};

/**
 * The menu, for every role: who is signed in, on the night; then what they
 * can reach in short groups, with live counts where something is waiting.
 * Signing out sits apart at the bottom.
 */
export function MenuMobile(p: Props) {
  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      hero={
        <View>
          <View style={styles.heroBar}>
            <HeroButton icon="chevron-forward" label="חזרה" onPress={p.onBack} />
            <BrandLogo height={20} onDark />
          </View>
          <Pressy onPress={p.onProfile} accessibilityLabel={`${p.name}, ${p.subtitle}. לפרטים שלי`} pressScale={0.98}>
            <View style={styles.identity}>
              <Avatar name={p.name} size={64} tone="accent" />
              <View style={styles.identityText}>
                <DKText variant="title" color={DK.onNight} numberOfLines={1}>
                  {p.name || 'ללא שם'}
                </DKText>
                <DKText variant="caption" color={DK.onNightMuted} numberOfLines={1}>
                  {[p.subtitle, p.companyName].filter(Boolean).join(' · ')}
                </DKText>
              </View>
              <Ionicons name="chevron-back" size={20} color={DK.onNightFaint} />
            </View>
          </Pressy>
        </View>
      }
    >
      {p.groups.map((group, gi) => (
        <Reveal key={group.title ?? gi} index={gi}>
          {/* The first group rises over the hero's edge, where a heading can't sit. */}
          <KitSection title={gi > 0 ? group.title : undefined}>
            {group.rows.map((row, i) => (
              <ListRow
                key={row.key}
                first={i === 0}
                icon={row.icon}
                tint={row.tint ?? (row.count && row.countTone === 'soon' ? STATUS.soon.fg : DK.accent)}
                title={row.title}
                subtitle={row.subtitle}
                trailing={row.count ? <CountPill count={row.count} tone={row.countTone ?? 'accent'} /> : undefined}
                onPress={row.onPress}
              />
            ))}
          </KitSection>
        </Reveal>
      ))}

      <Reveal index={p.groups.length}>
        <Pressy onPress={p.onLogout} accessibilityLabel="התנתקות מהחשבון" pressScale={0.98}>
          <Surface style={styles.logout}>
            <View style={styles.logoutIcon}>
              <Ionicons name="log-out-outline" size={20} color={STATUS.expired.fg} />
            </View>
            <DKText variant="label" color={STATUS.expired.fg} style={styles.flex}>
              התנתקות
            </DKText>
          </Surface>
        </Pressy>
      </Reveal>

      <DKText variant="caption" color={DK.faint} style={styles.version}>
        icar · גרסה 1.0.0
      </DKText>
    </DriverPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heroBar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  identity: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  identityText: { flex: 1, gap: 2 },
  logout: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: DK_SPACE.md },
  logoutIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: STATUS.expired.soft },
  version: { textAlign: 'center', marginTop: 4 },
});
