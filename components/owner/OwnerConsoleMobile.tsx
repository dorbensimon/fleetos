import React, { useMemo, useState } from 'react';
import { FolderCatalogManager } from './FolderCatalogManager';
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
import { accountNextStep, formatMoney, formatMoneyCompact, statusLabel, statusTone } from '../../lib/companyAccount';
import { ACCOUNT_TONE, TonePill } from './ownerKit';
import { COMPANY_FILTERS, filterCompanies, type CompanyFilter } from './ownerConsole';
import { t, dirIcon, getLocale } from '../../lib/i18n';
import { fontStack } from '../../lib/fontStack';

/**
 * The owner's control room on the phone: the night carries the business at a
 * glance (what needs the owner, companies, monthly revenue,
 * search); below, every company as a card that says whether it is healthy,
 * where it stands as a customer and why; then revenue, how the system is
 * being used and its security state. Counts only, like desktop.
 */

const TONE_FILL: Record<Tone, string> = { ok: STATUS.ok.fill, warn: STATUS.soon.fill, bad: STATUS.expired.fill, off: STATUS.missing.fill };
const TONE_FG: Record<Tone, string> = { ok: STATUS.ok.fg, warn: STATUS.soon.fg, bad: STATUS.expired.fg, off: STATUS.missing.fg };
const TONE_SOFT: Record<Tone, string> = { ok: STATUS.ok.soft, warn: STATUS.soon.soft, bad: STATUS.expired.soft, off: STATUS.missing.soft };
const TONE_LABEL: Record<Tone, string> = { get ok() { return t('owner.health.ok'); }, get warn() { return t('owner.health.warn'); }, get bad() { return t('owner.health.bad'); }, get off() { return t('owner.health.off'); } };

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
  unread: number;
  onNotifications: () => void;
  onExport: () => void;
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
            <ErrorPanel message={t('owner.cannotLoadSystem')} hint={p.error ?? undefined} onRetry={p.onRetry} />
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
                  title={t('owner.noCompaniesFound')}
                  body={search ? t('owner.noResultsFor', { search }) : t('owner.noCompaniesForFilter')}
                  action={{
                    label: t('common.showAll'),
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
                  title={t('owner.noCompaniesYetShort')}
                  body={t('owner.createFirstHint')}
                  action={{ label: t('owner.newCompany'), icon: 'add', onPress: p.onAddCompany }}
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
          ListFooterComponent={p.overview ? <Footer overview={p.overview} onOpen={p.onOpenCompany} onExport={p.onExport} /> : null}
          stickyHeaderIndices={[1]}
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: p.insetBottom + 104 + tabBarSpace }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={p.refreshing} onRefresh={p.onRefresh} tintColor="#FFFFFF" colors={[DK.accent]} />}
        />
      </View>
      <Fab label={t('owner.newCompany')} onPress={p.onAddCompany} bottom={p.insetBottom + 18} />
    </View>
  );
}

function Hero(p: Props & { search: string; onSearch: (v: string) => void; onAttention: () => void }) {
  const totals = p.overview?.totals;
  const issues = p.overview?.issues ?? [];
  const bad = issues.some((i) => i.tone === 'bad');
  const tone: Tone = !issues.length ? 'ok' : bad ? 'bad' : 'warn';
  return (
    <NightHero insetTop={0}>
      <View style={styles.topBar}>
        <View style={styles.heroSlot} />
        <BrandLogo height={20} onDark />
        <HeroButton
          icon="notifications-outline"
          label={p.unread ? t('notifications.newCountLabel', { unread: p.unread }) : t('notifications.title')}
          badge={p.unread > 0}
          onPress={p.onNotifications}
        />
      </View>

      <Reveal index={0}>
        <DKText variant="caption" color={DK.onNightMuted}>
          {[timeGreeting(), p.firstName].filter(Boolean).join(', ')}
        </DKText>
        <DKText variant="display" color={DK.onNight} accessibilityRole="header">
          {t('nav.controlCenter')}
        </DKText>
      </Reveal>

      {!!totals && (
        <Reveal index={1}>
          <Pressy
            onPress={p.onAttention}
            accessibilityLabel={issues.length ? t('owner.companiesNeedAttention', { needAttention: totals.needAttention, length: issues.length }) : t('owner.allCompaniesOk')}
            pressScale={0.98}
          >
            <View style={styles.attention}>
              <View style={[styles.attentionDot, { backgroundColor: TONE_FILL[tone] }]} />
              <View style={styles.flex}>
                <DKText variant="micro" color={TONE_FILL[tone]}>
                  {issues.length ? t('owner.needsYourAttention') : t('common.allOk')}
                </DKText>
                <DKText variant="label" color={DK.onNight} numberOfLines={2}>
                  {issues.length
                    ? `${totals.needAttention === 1 ? t('owner.oneCompany') : t('owner.companiesCount', { needAttention: totals.needAttention })} · ${issues[0].title}${issues.length > 1 ? t('owner.andMore', { v1: issues.length - 1 }) : ''}`
                    : t('owner.noOpenIssues')}
                </DKText>
              </View>
              {issues.length > 0 && (
                <DKText style={styles.attentionValue} color={DK.onNight}>
                  {issues.length.toLocaleString(getLocale())}
                </DKText>
              )}
              <Ionicons name={dirIcon('chevron-back')} size={18} color={DK.onNightFaint} />
            </View>
          </Pressy>
        </Reveal>
      )}

      <Reveal index={2} style={styles.stats}>
        <HeroStat value={totals ? `${totals.activeCompanies}/${totals.companies}` : '–'} label={t('owner.activeCompanies')} />
        <HeroStat value={totals ? formatMoneyCompact(totals.mrr) : '–'} label={t('owner.monthlyRevenue')} />
      </Reveal>

      <Reveal index={3} style={styles.block}>
        <GlassSearch value={p.search} onChangeText={p.onSearch} placeholder={t('owner.searchCompany')} />
      </Reveal>
    </NightHero>
  );
}

function CompanyCard({ row, onPress, onMenu }: { row: CompanyHealth; onPress: () => void; onMenu: () => void }) {
  const c = row.company;
  const issue = row.issues[0];
  const meta = `${row.drivers} ${t('common.drivers')}`;
  const next = accountNextStep(row.account);
  return (
    <Surface style={[styles.card, !row.active && styles.cardOff]}>
      <Pressy onPress={onPress} accessibilityLabel={`${c.name}, ${TONE_LABEL[row.tone]}${issue ? `: ${issue.title}` : ''}`} pressScale={0.985}>
        <View style={styles.cardTop}>
          {c.logo_url ? (
            <Image source={{ uri: c.logo_url }} accessibilityLabel={t('company.logoOf', { name: c.name })} style={[styles.logo, !row.active && styles.faded]} resizeMode="contain" />
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
              {row.issues.length > 1 ? t('owner.andMoreDot', { v1: row.issues.length - 1 }) : ''}
            </DKText>
          </View>
        )}
      </Pressy>

      <View style={styles.cardFoot}>
        {!!row.account && row.active && (
          <TonePill
            tone={next && next.tone !== 'ok' ? next.tone : statusTone(row.account.status)}
            label={[statusLabel(row.account.status), next && next.tone !== 'ok' ? next.label : row.account.monthly_price ? formatMoney(row.account.monthly_price) : null].filter(Boolean).join(' · ')}
          />
        )}
        <View style={styles.footItem}>
          <Ionicons name="pulse" size={14} color={DK.muted} />
          <DKText variant="caption" color={DK.muted} numberOfLines={1}>
            {row.lastActivity ? lastSeenLabel(row.lastActivity) : t('owner.inactiveThisMonth')}
          </DKText>
        </View>
        <Pressy onPress={onMenu} accessibilityLabel={t('owner.actionsFor', { name: c.name })} style={styles.more} pressScale={0.9}>
          <Ionicons name="ellipsis-horizontal" size={20} color={DK.inkSoft} />
        </Pressy>
      </View>
    </Surface>
  );
}

function Footer({ overview, onOpen, onExport }: { overview: PlatformOverview; onOpen: (id: string) => void; onExport: () => void }) {
  const days = overview.activityByDay;
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((n, d) => n + d.count, 0);
  const disabled = overview.totals.companies - overview.totals.activeCompanies;
  const notActivated = overview.totals.notActivated;
  const [catalogOpen, setCatalogOpen] = useState(false);
  return (
    <View style={styles.footer}>
      <Revenue overview={overview} onOpen={onOpen} onExport={onExport} />

      <KitSection title={t('folders.catalogTitle')} style={styles.sectionGap}>
        <Pressy onPress={() => setCatalogOpen(true)} accessibilityLabel={t('folders.catalogTitle')} pressScale={0.985}>
          <View style={styles.upRow}>
            <Ionicons name="folder-open-outline" size={18} color={DK.accent} />
            <DKText variant="label" color={DK.accent} style={styles.flex}>
              {t('folders.manageCatalog')}
            </DKText>
            <Ionicons name={dirIcon('chevron-back')} size={16} color={DK.faint} />
          </View>
        </Pressy>
      </KitSection>
      {catalogOpen && <FolderCatalogManager onClosed={() => setCatalogOpen(false)} />}

      <KitSection title={t('owner.systemUsage')} style={styles.sectionGap}>
        <View style={styles.chartBox} accessible accessibilityLabel={t('owner.totalActions', { total, ACTIVITY_DAYS })}>
          <View style={styles.chartHead}>
            <DKText variant="title" style={styles.tabular}>
              {total.toLocaleString(getLocale())}
            </DKText>
            <DKText variant="caption" color={DK.muted}>
              {t('owner.actionsInPrefix')}{ACTIVITY_DAYS} {t('owner.lastDays')}
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
              {t('common.ago')} {ACTIVITY_DAYS} {t('common.dayWord')}
            </DKText>
            <DKText variant="micro" color={DK.faint}>
              {t('common.today')}
            </DKText>
          </View>
        </View>
      </KitSection>

      <KitSection title={t('owner.securityPrivacy')} style={styles.sectionGap}>
        <SecurityLine
          icon="key"
          tone={notActivated ? 'warn' : 'ok'}
          title={!notActivated ? t('owner.allAccountsActivated') : notActivated === 1 ? t('owner.oneOnTempPassword') : t('owner.onTempPassword', { notActivated })}
          body={notActivated ? t('owner.notActivatedHint') : t('owner.allChosePassword')}
        />
        <SecurityLine
          icon="pause-circle"
          tone="off"
          divider
          title={!disabled ? t('owner.noDisabledCompanies') : disabled === 1 ? t('owner.oneDisabledCompany') : t('owner.disabledCompanies', { disabled })}
          body={disabled === 1 ? t('owner.disabledOneHint') : disabled ? t('owner.disabledManyHint') : t('owner.allHaveAccess')}
        />
        <View style={styles.privacy}>
          <Ionicons name="lock-closed" size={15} color={DK.muted} />
          <DKText variant="caption" color={DK.muted} style={styles.flex}>
            {t('owner.privacyNote')}
          </DKText>
        </View>
      </KitSection>
    </View>
  );
}

function Revenue({ overview, onOpen, onExport }: { overview: PlatformOverview; onOpen: (id: string) => void; onExport: () => void }) {
  const totals = overview.totals;
  const segments = [
    { label: t('owner.paying'), value: totals.paying - totals.overdue, color: ACCOUNT_TONE.ok.fill },
    { label: t('owner.trial'), value: totals.trials, color: ACCOUNT_TONE.warn.fill },
    { label: t('account.status.overdue'), value: totals.overdue, color: ACCOUNT_TONE.bad.fill },
  ];
  const total = Math.max(1, segments.reduce((n, s) => n + s.value, 0));
  const upcoming = overview.companies
    .filter((c) => c.active)
    .map((c) => ({ c, next: accountNextStep(c.account), date: c.account?.status === 'trial' ? c.account.trial_ends_at : c.account?.renewal_date }))
    .filter((x) => x.next && x.date && x.next.tone !== 'ok')
    .sort((a, b) => (a.date! < b.date! ? -1 : 1))
    .slice(0, 3);
  return (
    <KitSection title={t('owner.subsAndRevenue')}>
      <View style={styles.chartBox} accessible accessibilityLabel={t('owner.monthlyRevenueLabel', { v1: formatMoney(totals.mrr), v2: segments.map((s) => `${s.label} ${s.value}`).join(', ') })}>
        <View style={styles.chartHead}>
          <DKText variant="title" style={styles.tabular}>
            {formatMoney(totals.mrr)}
          </DKText>
          <DKText variant="caption" color={DK.muted}>
            {t('owner.perMonthExVat')} {formatMoney(totals.mrr * 12)} {t('owner.perYear')}
          </DKText>
        </View>
        <View style={styles.stack}>
          {segments.map((s) => (s.value ? <View key={s.label} style={{ flex: s.value / total, backgroundColor: s.color }} /> : null))}
        </View>
        <View style={styles.legend}>
          {segments.map((s) => (
            <View key={s.label} style={styles.footItem}>
              <View style={[styles.chipDot, { backgroundColor: s.color }]} />
              <DKText variant="caption" color={DK.muted}>
                {s.label} <DKText variant="label">{s.value}</DKText>
              </DKText>
            </View>
          ))}
        </View>
      </View>
      {upcoming.map(({ c, next }) => (
        <Pressy key={c.company.id} onPress={() => onOpen(c.company.id)} accessibilityLabel={`${c.company.name}: ${next!.label}`} pressScale={0.985}>
          <View style={[styles.upRow, styles.divider]}>
            <View style={[styles.chipDot, { backgroundColor: ACCOUNT_TONE[next!.tone].fill }]} />
            <DKText variant="label" numberOfLines={1} style={styles.flex}>
              {c.company.name}
            </DKText>
            <DKText variant="caption" color={ACCOUNT_TONE[next!.tone].fg}>
              {next!.label}
            </DKText>
            <Ionicons name={dirIcon('chevron-back')} size={16} color={DK.faint} />
          </View>
        </Pressy>
      ))}
      <Pressy onPress={onExport} accessibilityLabel={t('owner.generateCustomersReport')} pressScale={0.985}>
        <View style={[styles.upRow, styles.divider]}>
          <Ionicons name="document-text-outline" size={18} color={DK.accent} />
          <DKText variant="label" color={DK.accent} style={styles.flex}>
            {t('owner.customersReport')}
          </DKText>
          <DKText variant="caption" color={DK.muted}>
            {t('owner.pdfShare')}
          </DKText>
        </View>
      </Pressy>
    </KitSection>
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
  attentionValue: { fontFamily: fontStack('Heebo_800ExtraBold'), fontSize: 34, lineHeight: 38, letterSpacing: -1, fontVariant: ['tabular-nums'] },

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
  more: { marginEnd: 'auto', width: 44, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: DK.surfaceSunk },

  footer: { paddingHorizontal: DK_SPACE.md, paddingTop: 16 },
  sectionGap: { marginTop: 22 },
  chartBox: { padding: DK_SPACE.md },
  chartHead: { gap: 2 },
  chart: { flexDirection: 'row-reverse', alignItems: 'flex-end', height: 80, gap: 3, marginTop: 14 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barEmpty: { backgroundColor: '#E3E8F0' },
  barToday: { backgroundColor: DK.accent },
  axis: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 8 },

  stack: { flexDirection: 'row-reverse', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: '#E3E8F0', marginTop: 14, gap: 2 },
  legend: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  upRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: DK_SPACE.md },

  secLine: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, padding: DK_SPACE.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  secIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  privacy: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, margin: 12, marginTop: 0, padding: 12, borderRadius: 14, backgroundColor: DK.surfaceSunk },
});
