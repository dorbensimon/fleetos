import React, { useMemo, useState } from 'react';
import { FlatList, Image, RefreshControl, StatusBar, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DK,
  DK_SPACE,
  DKText,
  EmptyPanel,
  ErrorPanel,
  Fab,
  FilterPills,
  GlassSearch,
  HeroButton,
  HeroStat,
  KitSection,
  LoadingPanel,
  NightHero,
  NightUnderlay,
  Pressy,
  Reveal,
  STATUS,
  Surface,
  useTabBarScroll,
  useTabBarSpace,
} from '../driverKit';
import { BrandLogo } from '../ui/Brand';
import { timeGreeting } from '../../lib/theme';
import { ACTIVITY_DAYS, lastSeenLabel, type CompanyHealth, type PlatformOverview, type Tone } from '../../lib/platformOverview';
import { COMPANY_FILTERS, filterCompanies, type CompanyFilter } from './ownerConsole';

/**
 * The owner's control room on the phone: the night carries the platform at a
 * glance (what needs the owner, three live counts, search); below, every
 * company as a card that says whether it is healthy and why, then how the
 * system is being used and its security state. Counts only, like desktop.
 */

const TONE_FILL: Record<Tone, string> = { ok: STATUS.ok.fill, warn: STATUS.soon.fill, bad: STATUS.expired.fill, off: STATUS.missing.fill };
const TONE_FG: Record<Tone, string> = { ok: STATUS.ok.fg, warn: STATUS.soon.fg, bad: STATUS.expired.fg, off: STATUS.missing.fg };
const TONE_SOFT: Record<Tone, string> = { ok: STATUS.ok.soft, warn: STATUS.soon.soft, bad: STATUS.expired.soft, off: STATUS.missing.soft };
const TONE_LABEL: Record<Tone, string> = { ok: 'תקינה', warn: 'לבדיקה', bad: 'דורשת טיפול', off: 'מושבתת' };

type Props = {
  insetTop: number;
  insetBottom: number;
  firstName: string;
  overview: PlatformOverview | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onRetry: () => void;
  onOpenCompany: (id: string) => void;
  onCompanyMenu: (company: CompanyHealth) => void;
  onAddCompany: () => void;
  onTemplates: () => void;
};

type Entry =
  | { kind: 'bar' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'company'; row: CompanyHealth; index: number };

export function OwnerConsoleMobile(p: Props) {
  const [filter, setFilter] = useState<CompanyFilter>('all');
  const [search, setSearch] = useState('');
  const tabBarScroll = useTabBarScroll();
  const tabBarSpace = useTabBarSpace();

  const companies = useMemo(() => p.overview?.companies ?? [], [p.overview]);
  const rows = useMemo(() => filterCompanies(companies, filter, search, 'health'), [companies, filter, search]);
  const loading = p.loading && !p.overview;

  const data: Entry[] = [
    { kind: 'bar' },
    ...(loading
      ? [{ kind: 'loading' as const }]
      : p.error && !p.overview
        ? [{ kind: 'error' as const }]
        : rows.length
          ? rows.map((row, index) => ({ kind: 'company' as const, row, index }))
          : [{ kind: 'empty' as const }]),
  ];

  const renderItem = ({ item: entry }: { item: Entry }) => {
    switch (entry.kind) {
      case 'bar':
        return (
          <View style={styles.bar}>
            <FilterPills<CompanyFilter>
              value={filter}
              onChange={setFilter}
              options={COMPANY_FILTERS.map((f) => ({
                value: f.value,
                label: f.label,
                count: p.overview ? filterCompanies(companies, f.value, '', 'health').length : undefined,
                tone: f.tone === 'bad' ? 'expired' : f.tone === 'ok' ? 'ok' : f.tone === 'off' ? 'missing' : undefined,
              }))}
            />
          </View>
        );
      case 'loading':
        return (
          <View style={styles.cell}>
            <LoadingPanel />
          </View>
        );
      case 'error':
        return (
          <View style={styles.cell}>
            <ErrorPanel message="לא ניתן לטעון את נתוני המערכת" hint={p.error ?? undefined} onRetry={p.onRetry} />
          </View>
        );
      case 'empty':
        return (
          <View style={styles.cell}>
            <Reveal>
              {companies.length ? (
                <EmptyPanel
                  icon="search"
                  tone="muted"
                  title="לא נמצאו חברות"
                  body={search ? `אין תוצאות עבור "${search}".` : 'אין חברות שמתאימות לסינון הזה.'}
                  action={{
                    label: 'הצגת הכל',
                    icon: 'refresh',
                    onPress: () => {
                      setSearch('');
                      setFilter('all');
                    },
                  }}
                />
              ) : (
                <EmptyPanel
                  icon="business"
                  title="עדיין אין חברות"
                  body="צור את החברה הראשונה יחד עם המנהל שלה. הוא יקבל סיסמה זמנית ויחליף אותה בכניסה הראשונה."
                  action={{ label: 'חברה חדשה', icon: 'add', onPress: p.onAddCompany }}
                />
              )}
            </Reveal>
          </View>
        );
      case 'company':
        return (
          <View style={styles.cell}>
            <Reveal index={Math.min(entry.index, 8)}>
              <CompanyCard row={entry.row} onPress={() => p.onOpenCompany(entry.row.company.id)} onMenu={() => p.onCompanyMenu(entry.row)} />
            </Reveal>
          </View>
        );
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.statusStrip, { height: p.insetTop }]} />
      <View style={styles.flex}>
        <NightUnderlay />
        <FlatList
          data={data}
          keyExtractor={(e) => (e.kind === 'company' ? e.row.company.id : e.kind)}
          renderItem={renderItem}
          {...tabBarScroll}
          ListHeaderComponent={<Hero {...p} search={search} onSearch={setSearch} onAttention={() => setFilter('attention')} />}
          ListFooterComponent={p.overview ? <Footer overview={p.overview} /> : null}
          stickyHeaderIndices={[1]}
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: p.insetBottom + 104 + tabBarSpace }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={p.refreshing} onRefresh={p.onRefresh} tintColor="#FFFFFF" colors={[DK.accent]} />}
        />
      </View>
      <Fab label="חברה חדשה" onPress={p.onAddCompany} bottom={p.insetBottom + 18} />
    </View>
  );
}

function Hero(p: Props & { search: string; onSearch: (v: string) => void; onAttention: () => void }) {
  const t = p.overview?.totals;
  const issues = p.overview?.issues ?? [];
  const bad = issues.some((i) => i.tone === 'bad');
  const tone: Tone = !issues.length ? 'ok' : bad ? 'bad' : 'warn';
  return (
    <NightHero insetTop={0}>
      <View style={styles.topBar}>
        <View style={styles.heroSlot} />
        <BrandLogo height={20} onDark />
        <HeroButton icon="document-text-outline" label="תבניות חתימה" onPress={p.onTemplates} />
      </View>

      <Reveal index={0}>
        <DKText variant="caption" color={DK.onNightMuted}>
          {[timeGreeting(), p.firstName].filter(Boolean).join(', ')}
        </DKText>
        <DKText variant="display" color={DK.onNight} accessibilityRole="header">
          מרכז הבקרה
        </DKText>
      </Reveal>

      {!!t && (
        <Reveal index={1}>
          <Pressy
            onPress={p.onAttention}
            accessibilityLabel={issues.length ? `${t.needAttention} חברות דורשות טיפול, ${issues.length} נושאים` : 'הכול תקין בכל החברות'}
            pressScale={0.98}
          >
            <View style={styles.attention}>
              <View style={[styles.attentionDot, { backgroundColor: TONE_FILL[tone] }]} />
              <View style={styles.flex}>
                <DKText variant="micro" color={TONE_FILL[tone]}>
                  {issues.length ? 'דורש את תשומת לבך' : 'הכול תקין'}
                </DKText>
                <DKText variant="label" color={DK.onNight} numberOfLines={2}>
                  {issues.length
                    ? `${t.needAttention === 1 ? 'חברה אחת' : `${t.needAttention} חברות`} · ${issues[0].title}${issues.length > 1 ? ` ועוד ${issues.length - 1}` : ''}`
                    : 'אין בעיות פתוחות באף חברה'}
                </DKText>
              </View>
              {issues.length > 0 && (
                <DKText style={styles.attentionValue} color={DK.onNight}>
                  {issues.length.toLocaleString('he-IL')}
                </DKText>
              )}
              <Ionicons name="chevron-back" size={18} color={DK.onNightFaint} />
            </View>
          </Pressy>
        </Reveal>
      )}

      <Reveal index={2} style={styles.stats}>
        <HeroStat value={t ? `${t.activeCompanies}/${t.companies}` : '–'} label="חברות פעילות" />
        <HeroStat value={t?.drivers ?? '–'} label="נהגים" />
        <HeroStat value={t?.vehicles ?? '–'} label="רכבים" />
      </Reveal>

      <Reveal index={3} style={styles.block}>
        <GlassSearch value={p.search} onChangeText={p.onSearch} placeholder="חיפוש חברה או ח.פ." />
      </Reveal>
    </NightHero>
  );
}

function CompanyCard({ row, onPress, onMenu }: { row: CompanyHealth; onPress: () => void; onMenu: () => void }) {
  const c = row.company;
  const issue = row.issues[0];
  const meta = `${row.drivers} נהגים · ${row.vehicles} רכבים`;
  return (
    <Surface style={[styles.card, !row.active && styles.cardOff]}>
      <Pressy onPress={onPress} accessibilityLabel={`${c.name}, ${TONE_LABEL[row.tone]}${issue ? `: ${issue.title}` : ''}`} pressScale={0.985}>
        <View style={styles.cardTop}>
          {c.logo_url ? (
            <Image source={{ uri: c.logo_url }} accessibilityLabel={`לוגו ${c.name}`} style={[styles.logo, !row.active && styles.faded]} resizeMode="contain" />
          ) : (
            <View style={[styles.logo, styles.initial, !row.active && styles.initialOff]}>
              <DKText variant="title" color={row.active ? DK.accent : DK.muted}>
                {c.name.trim().charAt(0)}
              </DKText>
            </View>
          )}
          <View style={styles.flex}>
            <DKText variant="heading" numberOfLines={1} color={row.active ? DK.ink : DK.muted}>
              {c.name}
            </DKText>
            <DKText variant="caption" color={DK.muted} numberOfLines={1}>
              {meta}
            </DKText>
          </View>
          <View style={[styles.chip, { backgroundColor: TONE_SOFT[row.tone] }]}>
            <View style={[styles.chipDot, { backgroundColor: TONE_FILL[row.tone] }]} />
            <DKText variant="micro" color={TONE_FG[row.tone]}>
              {TONE_LABEL[row.tone]}
            </DKText>
          </View>
        </View>

        {!!issue && (
          <View style={[styles.issue, { backgroundColor: TONE_SOFT[issue.tone] }]}>
            <Ionicons name="alert-circle" size={16} color={TONE_FG[issue.tone]} />
            <DKText variant="caption" color={TONE_FG[issue.tone]} numberOfLines={2} style={styles.flex}>
              {issue.title}
              {row.issues.length > 1 ? ` · ועוד ${row.issues.length - 1}` : ''}
            </DKText>
          </View>
        )}
      </Pressy>

      <View style={styles.cardFoot}>
        <View style={styles.footItem}>
          <Ionicons name="pulse" size={14} color={DK.muted} />
          <DKText variant="caption" color={DK.muted} numberOfLines={1}>
            {row.lastActivity ? `פעילות ${lastSeenLabel(row.lastActivity)}` : 'לא פעילה החודש'}
          </DKText>
        </View>
        {row.pendingSignatures > 0 && (
          <View style={styles.footItem}>
            <Ionicons name="create-outline" size={14} color={DK.muted} />
            <DKText variant="caption" color={DK.muted}>
              {row.pendingSignatures} לחתימה
            </DKText>
          </View>
        )}
        <Pressy onPress={onMenu} accessibilityLabel={`פעולות עבור ${c.name}`} style={styles.more} pressScale={0.9}>
          <Ionicons name="ellipsis-horizontal" size={20} color={DK.inkSoft} />
        </Pressy>
      </View>
    </Surface>
  );
}

function Footer({ overview }: { overview: PlatformOverview }) {
  const days = overview.activityByDay;
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((n, d) => n + d.count, 0);
  const disabled = overview.totals.companies - overview.totals.activeCompanies;
  const notActivated = overview.totals.notActivated;
  return (
    <View style={styles.footer}>
      <KitSection title="שימוש במערכת">
        <View style={styles.chartBox} accessible accessibilityLabel={`${total} פעולות ב-${ACTIVITY_DAYS} הימים האחרונים`}>
          <View style={styles.chartHead}>
            <DKText variant="title" style={styles.tabular}>
              {total.toLocaleString('he-IL')}
            </DKText>
            <DKText variant="caption" color={DK.muted}>
              פעולות ב-{ACTIVITY_DAYS} הימים האחרונים
            </DKText>
          </View>
          <View style={styles.chart}>
            {days.map((d, i) => (
              <View key={d.day} style={styles.barSlot}>
                <View
                  style={[
                    styles.chartBar,
                    { height: `${Math.max(d.count ? 6 : 3, (d.count / max) * 100)}%` as unknown as number },
                    d.count === 0 && styles.barEmpty,
                    i === days.length - 1 && styles.barToday,
                  ]}
                />
              </View>
            ))}
          </View>
          <View style={styles.axis}>
            <DKText variant="micro" color={DK.faint}>
              לפני {ACTIVITY_DAYS} יום
            </DKText>
            <DKText variant="micro" color={DK.faint}>
              היום
            </DKText>
          </View>
        </View>
      </KitSection>

      <KitSection title="אבטחה ופרטיות" style={styles.sectionGap}>
        <SecurityLine
          icon="key"
          tone={notActivated ? 'warn' : 'ok'}
          title={!notActivated ? 'כל החשבונות הופעלו' : notActivated === 1 ? 'חשבון אחד על סיסמה זמנית' : `${notActivated} חשבונות על סיסמה זמנית`}
          body={notActivated ? 'מנהלים ונהגים שעוד לא נכנסו ולא החליפו את הסיסמה שקיבלו.' : 'כולם כבר בחרו סיסמה משלהם.'}
        />
        <SecurityLine
          icon="pause-circle"
          tone="off"
          divider
          title={!disabled ? 'אין חברות מושבתות' : disabled === 1 ? 'חברה אחת מושבתת' : `${disabled} חברות מושבתות`}
          body={disabled === 1 ? 'המשתמשים שלה לא יכולים להיכנס עד שתפעיל אותה מחדש.' : disabled ? 'המשתמשים שלהן לא יכולים להיכנס עד שתפעיל אותן מחדש.' : 'לכל החברות יש גישה פעילה.'}
        />
        <View style={styles.privacy}>
          <Ionicons name="lock-closed" size={15} color={DK.muted} />
          <DKText variant="caption" color={DK.muted} style={styles.flex}>
            המסך מציג רק מספרים ותאריכים. שמות, תעודות זהות וטלפונים נפתחים רק בתוך דף החברה.
          </DKText>
        </View>
      </KitSection>
    </View>
  );
}

function SecurityLine({
  icon,
  tone,
  title,
  body,
  divider,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: Tone;
  title: string;
  body: string;
  divider?: boolean;
}) {
  return (
    <View style={[styles.secLine, divider && styles.divider]}>
      <View style={[styles.secIcon, { backgroundColor: TONE_SOFT[tone] }]}>
        <Ionicons name={icon} size={19} color={TONE_FG[tone]} />
      </View>
      <View style={styles.flex}>
        <DKText variant="label">{title}</DKText>
        <DKText variant="caption" color={DK.muted}>
          {body}
        </DKText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: DK.canvas },
  statusStrip: { backgroundColor: DK.night[0] },
  content: { flexGrow: 1, backgroundColor: DK.canvas },
  tabular: { fontVariant: ['tabular-nums'] },

  topBar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  heroSlot: { width: 48, height: 48 },
  block: { marginTop: 16 },
  stats: { flexDirection: 'row-reverse', gap: 8, marginTop: 12 },

  attention: {
    marginTop: 20,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  attentionDot: { width: 10, height: 10, borderRadius: 5 },
  attentionValue: { fontFamily: 'Heebo_800ExtraBold', fontSize: 34, lineHeight: 38, letterSpacing: -1, fontVariant: ['tabular-nums'] },

  bar: { backgroundColor: DK.canvas, paddingTop: 14, paddingBottom: 12 },
  chartBar: { width: '100%', borderRadius: 3, backgroundColor: '#A9BCFF' },
  cell: { paddingHorizontal: DK_SPACE.md, paddingBottom: 12 },

  card: { padding: DK_SPACE.md, gap: 12 },
  cardOff: { backgroundColor: DK.surfaceSunk },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48, borderRadius: 16, backgroundColor: DK.surfaceSunk },
  faded: { opacity: 0.45 },
  initial: { alignItems: 'center', justifyContent: 'center', backgroundColor: DK.accentSoft },
  initialOff: { backgroundColor: '#E6EAF0' },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 14 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  issue: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, marginTop: 12 },
  cardFoot: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: DK.hairline,
  },
  footItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, flexShrink: 1 },
  more: { marginRight: 'auto', width: 44, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: DK.surfaceSunk },

  footer: { paddingHorizontal: DK_SPACE.md, paddingTop: 16 },
  sectionGap: { marginTop: 22 },
  chartBox: { padding: DK_SPACE.md },
  chartHead: { gap: 2 },
  chart: { flexDirection: 'row-reverse', alignItems: 'flex-end', height: 80, gap: 3, marginTop: 14 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barEmpty: { backgroundColor: '#E3E8F0' },
  barToday: { backgroundColor: DK.accent },
  axis: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 8 },

  secLine: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, padding: DK_SPACE.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  secIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  privacy: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, margin: 12, marginTop: 0, padding: 12, borderRadius: 14, backgroundColor: DK.surfaceSunk },
});
