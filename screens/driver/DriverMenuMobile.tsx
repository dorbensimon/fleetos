import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DK_SPACE, DKText, DriverPage, HeroButton, ListRow, Pressy, Reveal, STATUS, Surface } from '../../components/driverKit';
import { BrandLogo } from '../../components/ui/Brand';

type Props = {
  insetTop: number;
  insetBottom: number;
  name: string;
  subtitle: string;
  companyName: string;
  unreadNotifications: number;
  pendingSignatures: number;
  onBack: () => void;
  onProfile: () => void;
  onDocuments: () => void;
  onSigning: () => void;
  onNotifications: () => void;
  onNotificationSettings: () => void;
  onLogout: () => void;
};

function CountPill({ count, tone }: { count: number; tone: 'accent' | 'soon' }) {
  if (!count) return null;
  return (
    <View style={[styles.pill, { backgroundColor: tone === 'soon' ? STATUS.soon.fill : DK.accent }]}>
      <DKText variant="micro" color={tone === 'soon' ? DK.ink : '#FFFFFF'} ltr style={styles.pillText}>
        {count > 99 ? '99+' : String(count)}
      </DKText>
    </View>
  );
}

/**
 * The driver's menu: who is signed in, on the night; then everything the
 * driver can reach, in two short groups, with live counts where something
 * is waiting. Signing out sits apart at the bottom.
 */
export function DriverMenuMobile(p: Props) {
  const initial = p.name.trim().charAt(0) || '?';
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
              <View style={styles.avatar}>
                <DKText variant="display" color="#FFFFFF" style={styles.avatarText}>
                  {initial}
                </DKText>
              </View>
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
      <Reveal index={0}>
        <Surface>
          <ListRow first icon="person" title="הפרטים שלי" subtitle="טלפון, כתובת ורישיון נהיגה" onPress={p.onProfile} />
          <ListRow icon="folder-open" title="המסמכים שלי" subtitle="רישיון, תיק נהג והדרכות" onPress={p.onDocuments} />
          <ListRow
            icon="create"
            tint={p.pendingSignatures ? STATUS.soon.fg : DK.accent}
            title="מסמכים לחתימה"
            subtitle={p.pendingSignatures ? 'מחכים לחתימה שלך' : 'אין כרגע מה לחתום'}
            trailing={<CountPill count={p.pendingSignatures} tone="soon" />}
            onPress={p.onSigning}
          />
        </Surface>
      </Reveal>

      <Reveal index={1}>
        <DKText variant="micro" color={DK.muted} style={styles.groupTitle} accessibilityRole="header">
          התראות
        </DKText>
        <Surface>
          <ListRow
            first
            icon="notifications"
            title="כל ההתראות"
            subtitle={p.unreadNotifications ? `${p.unreadNotifications} חדשות` : 'אין התראות חדשות'}
            trailing={<CountPill count={p.unreadNotifications} tone="accent" />}
            onPress={p.onNotifications}
          />
          <ListRow icon="options" title="ניהול התראות" subtitle="בחירת העדכונים שיישלחו אליך" onPress={p.onNotificationSettings} />
        </Surface>
      </Reveal>

      <Reveal index={2}>
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
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DK.accent,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  avatarText: { fontSize: 28, lineHeight: 34, textAlign: 'center' },
  identityText: { flex: 1, gap: 2 },
  groupTitle: { paddingHorizontal: 6, marginBottom: 8 },
  pill: { minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pillText: { textAlign: 'center' },
  logout: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: DK_SPACE.md },
  logoutIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: STATUS.expired.soft },
  version: { textAlign: 'center', marginTop: 4 },
});
