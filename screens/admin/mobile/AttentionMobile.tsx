// 'דורש טיפול' בטלפון
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, DriverPage, EmptyPanel, ErrorPanel, HeroTitle, ListRow, LoadingPanel, Pressy, Reveal, STATUS, Surface, type Status } from '../../../components/driverKit';
import type { AttentionGroup, AttentionItem, AttentionKind } from '../../../lib/attention';
import { t } from '../../../lib/i18n';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  insetTop: number;
  insetBottom: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  groups: AttentionGroup[] | null;
  onBack: () => void;
  onRetry: () => void;
  onRefresh: () => void;
  onHome: () => void;
  onOpen: (item: AttentionItem) => void;
  onAllValidity: () => void;
};

type Row = { key: string; title: string; detail: string; status: Status; onPress: () => void };
type Group = { key: string; icon: IconName; title: string; hint: string; status: Status; rows: Row[] };

// כמה פריטים מוצגים לפני 'עוד'
const PREVIEW = 4;

// אייקון לכל קבוצה
const ICON: Record<AttentionKind, IconName> = {
  insurance: 'shield',
  registration: 'document-text',
  license: 'id-card',
  licenseDocs: 'camera',
  trafficReports: 'warning',
  unassigned: 'car-sport',
};

// הקבוצות לפי דחיפות
/**
 * What in the fleet is waiting on the manager, most urgent first — the same
 * list as the desktop top-bar menu (lib/attention.ts). Every group names the
 * drivers or vehicles behind its count, and each one opens straight to where
 * it's fixed. Every other date is one tap away in "תוקפים".
 */
export function AttentionMobile(p: Props) {
  const groups: Group[] = (p.groups ?? []).map((g) => ({
    key: g.kind,
    icon: ICON[g.kind],
    title: g.title,
    hint: g.hint,
    status: g.tone === 'bad' ? 'expired' : 'soon',
    rows: g.items.map((item) => ({
      key: `${item.ownerType}|${item.ownerId}`,
      title: item.name ? `${item.title} · ${item.name}` : item.title,
      detail: item.detail,
      status: item.tone === 'bad' ? 'expired' : 'soon',
      onPress: () => p.onOpen(item),
    })),
  }));
  const total = groups.reduce((sum, g) => sum + g.rows.length, 0);
  const subtitle = p.loading ? t('attention.checkingFleet') : p.error ? t('attention.checkIncomplete') : total ? t('attention.itemsForYou', { total, v1: total === 1 ? t('attention.itemWaiting') : t('attention.itemsWaiting') }) : t('attention.allHandled');

  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      refreshing={p.refreshing}
      onRefresh={p.onRefresh}
      hero={<HeroTitle title={t('status.needsAttention')} subtitle={subtitle} onBack={p.onBack} />}
    >
      {p.loading ? (
        <LoadingPanel />
      ) : p.error ? (
        <ErrorPanel message={t('attention.loadFailed')} hint={p.error} onRetry={p.onRetry} />
      ) : total === 0 ? (
        <Reveal>
          <EmptyPanel
            icon="checkmark-done"
            tone="ok"
            title={t('attention.allHandled')}
            body={t('attention.allGoodBody')}
            action={{ label: t('attention.backToFleet'), icon: 'home', onPress: p.onHome }}
          />
        </Reveal>
      ) : (
        <>
          <Reveal index={0}>
            <Surface style={styles.tally}>
              {groups.map((g, i) => (
                <React.Fragment key={g.key}>
                  {i > 0 && <View style={styles.tallyRule} />}
                  <View style={styles.tallyItem} accessible accessibilityLabel={`${g.title}: ${g.rows.length}`}>
                    <DKText variant="title" color={g.status === 'missing' ? DK.ink : STATUS[g.status].fg} style={styles.center}>
                      {String(g.rows.length)}
                    </DKText>
                    <DKText variant="micro" color={DK.muted} style={styles.center} numberOfLines={2}>
                      {g.title}
                    </DKText>
                  </View>
                </React.Fragment>
              ))}
            </Surface>
          </Reveal>
          {groups.map((g, i) => (
            <Reveal key={g.key} index={i + 1}>
              <GroupCard group={g} />
            </Reveal>
          ))}
          <Surface>
            <ListRow first icon="hourglass" title={t('attention.allValidity')} subtitle={t('attention.allValidityHint')} onPress={p.onAllValidity} />
          </Surface>
        </>
      )}
    </DriverPage>
  );
}

// כרטיס קבוצה
function GroupCard({ group }: { group: Group }) {
  const [open, setOpen] = useState(false);
  const s = STATUS[group.status];
  const rows = open ? group.rows : group.rows.slice(0, PREVIEW);
  const more = group.rows.length - PREVIEW;
  return (
    <Surface style={styles.group}>
      <View style={styles.groupHead}>
        <View style={[styles.groupIcon, { backgroundColor: s.soft }]}>
          <Ionicons name={group.icon} size={22} color={group.status === 'missing' ? DK.inkSoft : s.fg} />
        </View>
        <View style={styles.flex}>
          <DKText variant="heading" accessibilityRole="header">
            {group.title}
          </DKText>
          <DKText variant="caption" color={DK.muted}>
            {group.hint}
          </DKText>
        </View>
        <View style={[styles.count, { backgroundColor: s.soft }]}>
          <DKText variant="label" color={group.status === 'missing' ? DK.inkSoft : s.fg} ltr style={styles.center}>
            {String(group.rows.length)}
          </DKText>
        </View>
      </View>
      {rows.map((row) => (
        <ListRow
          key={row.key}
          icon={row.status === 'expired' ? 'alert-circle' : row.status === 'soon' ? 'time' : 'help-circle'}
          tint={row.status === 'missing' ? DK.muted : STATUS[row.status].fg}
          title={row.title}
          subtitle={row.detail}
          onPress={row.onPress}
        />
      ))}
      {more > 0 && (
        <Pressy onPress={() => setOpen((v) => !v)} accessibilityLabel={open ? t('common.showLess') : t('common.showMore', { more })} style={styles.more}>
          <DKText variant="label" color={DK.accent}>
            {open ? t('common.showLess') : t('common.showMore', { more })}
          </DKText>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={DK.accent} />
        </Pressy>
      )}
    </Surface>
  );
}

// עיצוב המסך
const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  tally: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 },
  tallyItem: { flex: 1, gap: 2, paddingHorizontal: 2 },
  tallyRule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: DK.hairline },
  group: { overflow: 'hidden' },
  groupHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 16 },
  groupIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 34, height: 30, borderRadius: 15, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  more: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: DK.hairline,
  },
});
