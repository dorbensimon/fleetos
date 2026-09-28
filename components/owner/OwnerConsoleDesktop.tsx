import React, { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DesktopInput, DText, HoverPressable } from '../desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_SIDEBAR_WIDTH, DESKTOP_TONES, webOnly } from '../desktop/desktopTheme';
import { DesktopModal } from '../desktop/DesktopModal';
import { enter, enterRow } from '../desktop/FleetOverview';
import { BrandLoader } from '../ui/BrandLoader';
import { ErrorState } from '../ui';
import { formatDate, timeGreeting } from '../../lib/theme';
import { ACTIVITY_DAYS, lastSeenLabel, type CompanyHealth, type CompanyIssue, type PlatformOverview, type Tone } from '../../lib/platformOverview';
import { accountNextStep, formatMoney, planLabel, statusLabel, statusTone, type AccountTone } from '../../lib/companyAccount';
import { COMPANY_FILTERS, filterCompanies, type CompanyFilter, type CompanySort } from './ownerConsole';

/**
 * The owner's control room on desktop. One band of business vitals on top
 * (companies, monthly revenue, trials, people, vehicles, use); below, every
 * company as a row that says at a glance whether it is healthy, where it
 * stands as a customer and when it was last used, with the revenue picture
 * and the problems that need the owner beside it. Counts only: people's
 * details stay inside each company's own page.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABULAR = webOnly({ fontVariantNumeric: 'tabular-nums' });

export const TONE_DOT: Record<Tone, string> = { ok: '#1E9E4C', warn: '#D97706', bad: '#DC2F26', off: '#98A2AD' };
export const TONE_LABEL: Record<Tone, string> = { ok: 'תקינה', warn: 'לבדיקה', bad: 'דורשת טיפול', off: 'מושבתת' };

type Props = {
  firstName: string;
  overview: PlatformOverview | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenCompany: (id: string) => void;
  onAddCompany: () => void;
  onExport: () => void;
  onAccount: (company: CompanyHealth) => void;
  onToggleActive: (company: CompanyHealth) => void;
  onDelete: (company: CompanyHealth) => void;
};

export function OwnerConsoleDesktop(p: Props) {
  const { width } = useWindowDimensions();
  const wide = width - DESKTOP_SIDEBAR_WIDTH >= 1180;
  const [filter, setFilter] = useState<CompanyFilter>('all');
  const [sort, setSort] = useState<CompanySort>('health');
  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState<CompanyHealth | null>(null);

  const companies = useMemo(() => p.overview?.companies ?? [], [p.overview]);
  const rows = useMemo(() => filterCompanies(companies, filter, search, sort), [companies, filter, search, sort]);
  const now = new Date();
  const dateLine = now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
      <View style={[styles.header, enter(0)]}>
        <View style={styles.headerText}>
          <DText weight="extraBold" style={styles.title} accessibilityRole="header">
            מרכז הבקרה
          </DText>
          <DText style={styles.subtitle}>
            {[timeGreeting(), p.firstName].filter(Boolean).join(', ')} · {dateLine}
          </DText>
        </View>
        <View style={styles.headerActions}>
          <HoverPressable style={styles.secondaryButton} hoverStyle={styles.secondaryButtonHover} onPress={p.onExport} disabled={!p.overview}>
            <Ionicons name="download-outline" size={16} color={DESKTOP_COLORS.ink} />
            <DText weight="semiBold" style={styles.secondaryButtonText}>
              דוח לקוחות
            </DText>
          </HoverPressable>
          <HoverPressable style={styles.primaryButton} hoverStyle={styles.primaryButtonHover} pressMotionStyle={styles.pressDown} onPress={p.onAddCompany}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <DText weight="bold" style={styles.primaryButtonText}>
              חברה חדשה
            </DText>
          </HoverPressable>
        </View>
      </View>

      {p.loading && !p.overview ? (
        <View style={styles.center}>
          <BrandLoader color={DESKTOP_COLORS.brand} />
        </View>
      ) : p.error && !p.overview ? (
        <View style={styles.panel}>
          <ErrorState message={p.error} onRetry={p.onRetry} />
        </View>
      ) : p.overview ? (
        <>
          <Vitals overview={p.overview} />

          <View style={[styles.columns, !wide && styles.columnsStacked]}>
            <View style={[styles.mainColumn, enter(2)]}>
              <View style={styles.panel}>
                <View style={styles.toolbar}>
                  <View style={styles.filters} accessibilityRole="tablist">
                    {COMPANY_FILTERS.map((f) => {
                      const on = f.value === filter;
                      const count = filterCompanies(companies, f.value, '', 'health').length;
                      return (
                        <HoverPressable
                          key={f.value}
                          onPress={() => setFilter(f.value)}
                          style={[styles.filter, on && styles.filterOn]}
                          hoverStyle={on ? undefined : styles.filterHover}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: on }}
                          aria-selected={on}
                          accessibilityLabel={`${f.label}, ${count}`}
                        >
                          {f.tone && <View style={[styles.dot, { backgroundColor: on ? '#FFFFFF' : TONE_DOT[f.tone] }]} />}
                          <DText weight={on ? 'bold' : 'semiBold'} style={[styles.filterText, on && styles.onDark]}>
                            {f.label}
                          </DText>
                          <DText weight="bold" style={[styles.filterCount, TABULAR, on && styles.onDarkSoft]}>
                            {count}
                          </DText>
                        </HoverPressable>
                      );
                    })}
                  </View>
                  <View style={styles.search}>
                    <DesktopInput value={search} onChangeText={setSearch} placeholder="חיפוש חברה או ח.פ." />
                  </View>
                </View>

                <CompanyTable
                  rows={rows}
                  sort={sort}
                  onSort={setSort}
                  totalCompanies={companies.length}
                  onOpen={p.onOpenCompany}
                  onMenu={setMenu}
                  onClear={() => {
                    setFilter('all');
                    setSearch('');
                  }}
                  onAdd={p.onAddCompany}
                />
              </View>
              <View style={styles.pair}>
                <View style={styles.pairItem}>
                  <ActivityChart days={p.overview.activityByDay} />
                </View>
                <View style={styles.pairItem}>
                  <SecurityPanel overview={p.overview} />
                </View>
              </View>
            </View>

            <View style={[styles.sideColumn, !wide && styles.sideColumnStacked, enter(3)]}>
              <BusinessPanel overview={p.overview} onOpen={p.onOpenCompany} />
              <AttentionQueue issues={p.overview.issues} onOpen={p.onOpenCompany} />
            </View>
          </View>
        </>
      ) : null}

      <DesktopModal visible={!!menu} title={menu?.company.name ?? ''} onClose={() => setMenu(null)} maxWidth={420}>
        {menu && (
          <View style={styles.menu}>
            <MenuAction
              icon="open-outline"
              title="פתיחת דף החברה"
              caption="פרטים, מנהלים, נהגים ורכבים"
              onPress={() => {
                setMenu(null);
                p.onOpenCompany(menu.company.id);
              }}
            />
            <MenuAction
              icon="card-outline"
              title="מנוי ותשלום"
              caption="מצב הלקוח, מסלול, מחיר ומועד חידוש"
              onPress={() => {
                const target = menu;
                setMenu(null);
                p.onAccount(target);
              }}
            />
            <MenuAction
              icon={menu.active ? 'pause-circle-outline' : 'play-circle-outline'}
              title={menu.active ? 'השבתת החברה' : 'הפעלת החברה מחדש'}
              caption={menu.active ? 'המשתמשים שלה לא יוכלו להיכנס עד שתפעיל אותה' : 'המשתמשים שלה יוכלו להיכנס שוב'}
              onPress={() => {
                const target = menu;
                setMenu(null);
                p.onToggleActive(target);
              }}
            />
            <MenuAction
              icon="trash-outline"
              title="מחיקת החברה"
              caption="מחיקה סופית של כל הנתונים. נדרש אישור בשם החברה"
              danger
              onPress={() => {
                const target = menu;
                setMenu(null);
                p.onDelete(target);
              }}
            />
          </View>
        )}
      </DesktopModal>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Vitals                                                              */
/* ------------------------------------------------------------------ */

function Vitals({ overview }: { overview: PlatformOverview }) {
  const t = overview.totals;
  const vehicleIssues = overview.companies.reduce((n, c) => n + (c.active ? c.vehicleIssues : 0), 0);
  const licensesExpired = overview.companies.reduce((n, c) => n + (c.active ? c.licensesExpired : 0), 0);
  const cells: { label: string; value: string; sub: string; tone?: 'bad' | 'warn'; icon: IconName }[] = [
    { label: 'חברות פעילות', value: t.activeCompanies.toLocaleString('he-IL'), sub: `מתוך ${t.companies}`, icon: 'business-outline' },
    {
      label: 'הכנסה חודשית',
      value: formatMoney(t.mrr),
      sub: t.overdue ? `${t.overdue} בפיגור תשלום` : t.paying === 1 ? 'מלקוח משלם אחד' : `מ-${t.paying} לקוחות משלמים`,
      tone: t.overdue ? 'bad' : undefined,
      icon: 'cash-outline',
    },
    {
      label: 'בתקופת ניסיון',
      value: t.trials.toLocaleString('he-IL'),
      sub: t.trialsEndingSoon ? `${t.trialsEndingSoon} מסתיימים השבוע` : 'אין ניסיון שמסתיים השבוע',
      tone: t.trialsEndingSoon ? 'warn' : undefined,
      icon: 'timer-outline',
    },
    {
      label: 'נהגים',
      value: t.drivers.toLocaleString('he-IL'),
      sub: licensesExpired ? `${licensesExpired} עם רישיון שפג` : `${t.admins} מנהלי צי`,
      tone: licensesExpired ? 'bad' : undefined,
      icon: 'people-outline',
    },
    {
      label: 'רכבים',
      value: t.vehicles.toLocaleString('he-IL'),
      sub: vehicleIssues ? `${vehicleIssues} בלי ביטוח או רישיון בתוקף` : 'כולם עם ביטוח ורישיון',
      tone: vehicleIssues ? 'bad' : undefined,
      icon: 'car-sport-outline',
    },
    { label: 'פעולות השבוע', value: t.activity7d.toLocaleString('he-IL'), sub: 'עדכונים בכל החברות', icon: 'pulse-outline' },
  ];
  return (
    <View style={[styles.vitals, enter(1)]}>
      {cells.map((c, i) => (
        <View key={c.label} style={[styles.vital, i > 0 && styles.vitalDivider]} accessible accessibilityLabel={`${c.label}: ${c.value}. ${c.sub}`}>
          <View style={styles.vitalLabelRow}>
            <Ionicons name={c.icon} size={15} color={DESKTOP_COLORS.inkMuted} />
            <DText weight="semiBold" style={styles.vitalLabel} numberOfLines={1}>
              {c.label}
            </DText>
          </View>
          <DText weight="extraBold" style={[styles.vitalValue, TABULAR]} numberOfLines={1}>
            {c.value}
          </DText>
          <DText weight={c.tone ? 'semiBold' : 'regular'} style={[styles.vitalSub, c.tone && { color: DESKTOP_TONES[c.tone].fg }]} numberOfLines={1}>
            {c.sub}
          </DText>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Companies table                                                     */
/* ------------------------------------------------------------------ */

const COLUMNS: { key: string; label: string; sort?: CompanySort; style: object }[] = [
  { key: 'company', label: 'חברה', sort: 'name', style: { flex: 1, minWidth: 200 } },
  { key: 'state', label: 'מצב', sort: 'health', style: { width: 150 } },
  { key: 'team', label: 'צוות', sort: 'size', style: { width: 110 } },
  { key: 'vehicles', label: 'רכבים', style: { width: 120 } },
  { key: 'account', label: 'מנוי', style: { width: 132 } },
  { key: 'activity', label: 'פעילות אחרונה', sort: 'activity', style: { width: 128 } },
  { key: 'menu', label: '', style: { width: 36 } },
];

function CompanyTable({
  rows,
  sort,
  onSort,
  totalCompanies,
  onOpen,
  onMenu,
  onClear,
  onAdd,
}: {
  rows: CompanyHealth[];
  sort: CompanySort;
  onSort: (s: CompanySort) => void;
  totalCompanies: number;
  onOpen: (id: string) => void;
  onMenu: (c: CompanyHealth) => void;
  onClear: () => void;
  onAdd: () => void;
}) {
  const [width, setWidth] = useState(0);
  // Narrow panels drop the two least-needed columns before anything squeezes:
  // the team size first, the subscription only when there is truly no room.
  const compact = width > 0 && width < 820;
  const noAccount = width > 0 && width < 660;
  const columns = COLUMNS.filter((c) => !(c.key === 'account' && noAccount) && !(c.key === 'team' && compact));

  if (totalCompanies === 0) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="business-outline" size={26} color={DESKTOP_COLORS.brand} />
        </View>
        <DText weight="bold" style={styles.emptyTitle}>
          עדיין אין חברות במערכת
        </DText>
        <DText style={styles.emptyBody}>צור את החברה הראשונה יחד עם המנהל שלה. הוא יקבל סיסמה זמנית ויחליף אותה בכניסה הראשונה.</DText>
        <HoverPressable style={[styles.primaryButton, styles.emptyAction]} hoverStyle={styles.primaryButtonHover} onPress={onAdd}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <DText weight="bold" style={styles.primaryButtonText}>
            חברה חדשה
          </DText>
        </HoverPressable>
      </View>
    );
  }

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.tableHead} accessibilityRole="none">
        {columns.map((col) => {
          const on = !!col.sort && col.sort === sort;
          const label = (
            <DText weight={on ? 'bold' : 'semiBold'} style={[styles.th, on && styles.thOn]} numberOfLines={1}>
              {col.label}
            </DText>
          );
          return (
            <View key={col.key} style={[col.style, styles.thCell]}>
              {col.sort ? (
                <HoverPressable
                  onPress={() => onSort(col.sort!)}
                  style={styles.thButton}
                  hoverStyle={styles.thButtonHover}
                  accessibilityLabel={`מיון לפי ${col.label}`}
                  accessibilityState={{ selected: on }}
                >
                  {label}
                  {on && <Ionicons name="arrow-down" size={12} color={DESKTOP_COLORS.ink} />}
                </HoverPressable>
              ) : (
                label
              )}
            </View>
          );
        })}
      </View>

      {rows.length === 0 ? (
        <View style={styles.noResults}>
          <DText style={styles.emptyBody}>אין חברות שמתאימות לחיפוש או לסינון.</DText>
          <HoverPressable onPress={onClear} style={styles.linkButton} hoverStyle={styles.linkButtonHover}>
            <DText weight="semiBold" style={styles.linkText}>
              הצגת כל החברות
            </DText>
          </HoverPressable>
        </View>
      ) : (
        rows.map((row, index) => (
          <CompanyRowView key={row.company.id} row={row} index={index} compact={compact} noAccount={noAccount} last={index === rows.length - 1} onOpen={onOpen} onMenu={onMenu} />
        ))
      )}
    </View>
  );
}

function CompanyAvatar({ row, size = 36 }: { row: CompanyHealth; size?: number }) {
  const radius = Math.round(size * 0.28);
  if (row.company.logo_url) {
    return (
      <Image
        source={{ uri: row.company.logo_url }}
        accessibilityLabel={`לוגו ${row.company.name}`}
        style={[styles.avatar, { width: size, height: size, borderRadius: radius }, !row.active && styles.avatarOff]}
        resizeMode="contain"
      />
    );
  }
  return (
    <View style={[styles.avatar, styles.avatarInitial, { width: size, height: size, borderRadius: radius }, !row.active && styles.avatarInitialOff]}>
      <DText weight="bold" style={[styles.avatarText, !row.active && styles.avatarTextOff]}>
        {row.company.name.trim().charAt(0)}
      </DText>
    </View>
  );
}

function CompanyRowView({
  row,
  index,
  compact,
  noAccount,
  last,
  onOpen,
  onMenu,
}: {
  row: CompanyHealth;
  index: number;
  compact: boolean;
  noAccount: boolean;
  last: boolean;
  onOpen: (id: string) => void;
  onMenu: (c: CompanyHealth) => void;
}) {
  const c = row.company;
  const tone = DESKTOP_TONES[row.tone === 'off' ? 'neutral' : row.tone];
  const idText = [c.company_type, c.business_id].filter(Boolean).join(' ');
  const issueLine = row.issues[0]?.title;
  return (
    <View style={[styles.row, !last && styles.rowDivider, enterRow(index)]}>
      <HoverPressable
        style={styles.rowMain}
        hoverStyle={styles.rowHover}
        onPress={() => onOpen(c.id)}
        accessibilityRole="link"
        accessibilityLabel={`${c.name}, ${TONE_LABEL[row.tone]}${issueLine ? `: ${issueLine}` : ''}`}
      >
        <View style={[styles.cellCompany, { flex: 1, minWidth: 200 }]}>
          <CompanyAvatar row={row} />
          <View style={styles.cellText}>
            <DText weight="bold" style={[styles.companyName, !row.active && styles.muted]} numberOfLines={1}>
              {c.name}
            </DText>
            <DText style={styles.cellSub} numberOfLines={1}>
              {idText || `הצטרפה ב-${formatDate(c.created_at)}`}
            </DText>
          </View>
        </View>

        <View style={[styles.cell, { width: 150 }]}>
          <View style={[styles.stateChip, { backgroundColor: tone.bg }]}>
            <View style={[styles.dot, { backgroundColor: TONE_DOT[row.tone] }]} />
            <DText weight="bold" style={[styles.stateText, { color: tone.fg }]} numberOfLines={1}>
              {TONE_LABEL[row.tone]}
            </DText>
          </View>
          {!!issueLine && (
            <DText style={styles.cellSub} numberOfLines={1}>
              {row.issues.length > 1 ? `${issueLine} ועוד ${row.issues.length - 1}` : issueLine}
            </DText>
          )}
        </View>

        {!compact && (
          <View style={[styles.cell, { width: 110 }]}>
            <DText weight="semiBold" style={[styles.cellMain, TABULAR]}>
              {row.drivers} נהגים
            </DText>
            <DText style={[styles.cellSub, TABULAR]}>
              {row.admins === 1 ? 'מנהל אחד' : `${row.admins} מנהלים`}
            </DText>
          </View>
        )}

        <View style={[styles.cell, { width: 120 }]}>
          <DText weight="semiBold" style={[styles.cellMain, TABULAR]}>
            {row.vehicles}
          </DText>
          {row.vehicleIssues > 0 ? (
            <DText weight="semiBold" style={[styles.cellSub, { color: DESKTOP_TONES.bad.fg }]} numberOfLines={1}>
              {row.vehicleIssues} לא תקינים
            </DText>
          ) : row.unassignedVehicles > 0 ? (
            <DText style={styles.cellSub} numberOfLines={1}>
              {row.unassignedVehicles} בלי נהג
            </DText>
          ) : null}
        </View>

        {!noAccount && (
          <View style={[styles.cell, { width: 132 }]}>
            {row.account ? (
              <>
                <View style={styles.accountLine}>
                  <View style={[styles.dot, { backgroundColor: ACCOUNT_DOT[statusTone(row.account.status)] }]} />
                  <DText weight="semiBold" style={styles.cellMain} numberOfLines={1}>
                    {statusLabel(row.account.status)}
                    {row.account.monthly_price ? ` · ${formatMoney(row.account.monthly_price)}` : ''}
                  </DText>
                </View>
                <DText style={[styles.cellSub, nextTone(row) && { color: DESKTOP_TONES[nextTone(row)!].fg }]} numberOfLines={1}>
                  {accountNextStep(row.account)?.label ?? planLabel(row.account.plan)}
                </DText>
              </>
            ) : (
              <DText style={[styles.cellMain, styles.faint]}>–</DText>
            )}
          </View>
        )}

        <View style={[styles.cell, { width: 128 }]}>
          <DText weight="semiBold" style={[styles.cellMain, !row.lastActivity && styles.faint]} numberOfLines={1}>
            {lastSeenLabel(row.lastActivity)}
          </DText>
          {row.activity7d > 0 && (
            <DText style={[styles.cellSub, TABULAR]} numberOfLines={1}>
              {row.activity7d} פעולות השבוע
            </DText>
          )}
        </View>
      </HoverPressable>
      <HoverPressable style={styles.menuButton} hoverStyle={styles.menuButtonHover} onPress={() => onMenu(row)} accessibilityLabel={`פעולות עבור ${c.name}`}>
        <Ionicons name="ellipsis-horizontal" size={18} color={DESKTOP_COLORS.inkMuted} />
      </HoverPressable>
    </View>
  );
}

const ACCOUNT_DOT: Record<AccountTone, string> = { ok: '#1E9E4C', warn: '#D97706', bad: '#DC2F26', off: '#98A2AD' };

function nextTone(row: CompanyHealth): 'warn' | 'bad' | null {
  const t = accountNextStep(row.account)?.tone;
  return t === 'warn' || t === 'bad' ? t : null;
}

function MenuAction({ icon, title, caption, danger, onPress }: { icon: IconName; title: string; caption: string; danger?: boolean; onPress: () => void }) {
  const color = danger ? DESKTOP_COLORS.danger : DESKTOP_COLORS.ink;
  return (
    <HoverPressable style={styles.menuAction} hoverStyle={danger ? styles.menuActionDangerHover : styles.menuActionHover} onPress={onPress}>
      <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.cellText}>
        <DText weight="bold" style={[styles.menuTitle, { color }]}>
          {title}
        </DText>
        <DText style={styles.cellSub}>{caption}</DText>
      </View>
    </HoverPressable>
  );
}

/* ------------------------------------------------------------------ */
/* Side column                                                         */
/* ------------------------------------------------------------------ */

function PanelTitle({ title, trailing }: { title: string; trailing?: React.ReactNode }) {
  return (
    <View style={styles.panelTitleRow}>
      <DText weight="bold" style={styles.panelTitle} accessibilityRole="header">
        {title}
      </DText>
      {trailing}
    </View>
  );
}

/** Revenue at a glance: monthly income, customers by standing, and the next dates that bring money in. */
function BusinessPanel({ overview, onOpen }: { overview: PlatformOverview; onOpen: (id: string) => void }) {
  const t = overview.totals;
  const segments: { label: string; value: number; color: string }[] = [
    { label: 'משלמים', value: t.paying - t.overdue, color: ACCOUNT_DOT.ok },
    { label: 'בניסיון', value: t.trials, color: ACCOUNT_DOT.warn },
    { label: 'בפיגור', value: t.overdue, color: ACCOUNT_DOT.bad },
  ];
  const total = Math.max(1, segments.reduce((n, s) => n + s.value, 0));
  const upcoming = overview.companies
    .filter((c) => c.active && accountNextStep(c.account))
    .map((c) => ({ c, next: accountNextStep(c.account)!, date: c.account?.status === 'trial' ? c.account.trial_ends_at : c.account?.renewal_date }))
    .filter((x) => !!x.date)
    .sort((a, b) => (a.date! < b.date! ? -1 : 1))
    .slice(0, 4);
  return (
    <View style={styles.panel}>
      <PanelTitle title="הכנסות ומנויים" />
      <View style={styles.chartHead}>
        <DText weight="extraBold" style={[styles.chartValue, TABULAR]}>
          {formatMoney(t.mrr)}
        </DText>
        <DText style={styles.cellSub}>בחודש, לפני מע״מ · {formatMoney(t.mrr * 12)} בשנה</DText>
      </View>
      <View style={styles.stack} accessible accessibilityLabel={segments.map((s) => `${s.label} ${s.value}`).join(', ')}>
        {segments.map((s) =>
          s.value ? <View key={s.label} style={{ flex: s.value / total, backgroundColor: s.color, height: '100%' }} /> : null,
        )}
      </View>
      <View style={styles.legend}>
        {segments.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <DText style={styles.cellSub}>
              {s.label} <DText weight="bold" style={[styles.legendValue, TABULAR]}>{s.value}</DText>
            </DText>
          </View>
        ))}
      </View>
      {upcoming.length > 0 && (
        <View style={styles.upcoming}>
          <DText weight="semiBold" style={styles.upcomingTitle}>
            מה מתקרב
          </DText>
          {upcoming.map(({ c, next }) => (
            <HoverPressable key={c.company.id} style={styles.upcomingRow} hoverStyle={styles.rowHover} onPress={() => onOpen(c.company.id)} accessibilityRole="link">
              <View style={[styles.dot, { backgroundColor: ACCOUNT_DOT[next.tone] }]} />
              <DText weight="semiBold" style={[styles.cellMain, styles.flex1]} numberOfLines={1}>
                {c.company.name}
              </DText>
              <DText style={[styles.cellSub, next.tone === 'bad' && { color: DESKTOP_TONES.bad.fg }]} numberOfLines={1}>
                {next.label}
              </DText>
            </HoverPressable>
          ))}
        </View>
      )}
    </View>
  );
}

function AttentionQueue({ issues, onOpen }: { issues: CompanyIssue[]; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? issues : issues.slice(0, 6);
  return (
    <View style={styles.panel}>
      <PanelTitle
        title="דורש את תשומת לבך"
        trailing={
          issues.length > 0 ? (
            <View style={[styles.countBadge, { backgroundColor: DESKTOP_TONES.bad.bg }]}>
              <DText weight="bold" style={[styles.countBadgeText, TABULAR, { color: DESKTOP_TONES.bad.fg }]}>
                {issues.length}
              </DText>
            </View>
          ) : undefined
        }
      />
      {issues.length === 0 ? (
        <View style={styles.allClear}>
          <Ionicons name="checkmark-circle" size={22} color={TONE_DOT.ok} />
          <View style={styles.cellText}>
            <DText weight="bold" style={styles.cellMain}>
              הכול תקין בכל החברות
            </DText>
            <DText style={styles.cellSub}>אין רכבים, רישיונות או חשבונות שמחכים לך.</DText>
          </View>
        </View>
      ) : (
        <>
          {shown.map((issue, i) => (
            <HoverPressable
              key={`${issue.companyId}-${issue.title}`}
              style={[styles.issue, i > 0 && styles.issueDivider]}
              hoverStyle={styles.rowHover}
              onPress={() => onOpen(issue.companyId)}
              accessibilityRole="link"
              accessibilityLabel={`${issue.companyName}: ${issue.title}. ${issue.detail}`}
            >
              <View style={[styles.issueDot, { backgroundColor: TONE_DOT[issue.tone] }]} />
              <View style={styles.cellText}>
                <DText weight="bold" style={styles.issueTitle} numberOfLines={1}>
                  {issue.title}
                </DText>
                <DText style={styles.cellSub} numberOfLines={2}>
                  <DText weight="semiBold" style={styles.issueCompany}>
                    {issue.companyName}
                  </DText>
                  {' · '}
                  {issue.detail}
                </DText>
              </View>
              <Ionicons name="chevron-back" size={16} color={DESKTOP_COLORS.inkFaint} />
            </HoverPressable>
          ))}
          {issues.length > 6 && (
            <HoverPressable onPress={() => setExpanded((v) => !v)} style={styles.moreButton} hoverStyle={styles.linkButtonHover}>
              <DText weight="semiBold" style={styles.linkText}>
                {expanded ? 'הצגת פחות' : `הצגת כל ${issues.length}`}
              </DText>
            </HoverPressable>
          )}
        </>
      )}
    </View>
  );
}

function ActivityChart({ days }: { days: { day: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((n, d) => n + d.count, 0);
  const focus = hover != null ? days[hover] : null;
  const focusDate = focus ? new Date(`${focus.day}T12:00:00`).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' }) : '';
  return (
    <View style={styles.panel}>
      <PanelTitle title="שימוש במערכת" />
      <View style={styles.chartHead}>
        <DText weight="extraBold" style={[styles.chartValue, TABULAR]}>
          {(focus ? focus.count : total).toLocaleString('he-IL')}
        </DText>
        <DText style={styles.cellSub}>{focus ? `פעולות ב${focusDate}` : `פעולות ב-${ACTIVITY_DAYS} הימים האחרונים`}</DText>
      </View>
      <View
        style={styles.chart}
        accessible
        accessibilityLabel={`${total} פעולות ב-${ACTIVITY_DAYS} הימים האחרונים, בכל החברות`}
      >
        {days.map((d, i) => (
          <HoverPressable
            key={d.day}
            style={styles.barSlot}
            onHoverIn={() => setHover(i)}
            onHoverOut={() => setHover((h) => (h === i ? null : h))}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            accessibilityLabel={`${d.day}: ${d.count} פעולות`}
          >
            <View
              style={[
                styles.bar,
                { height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 100)}%` as unknown as number },
                d.count === 0 && styles.barEmpty,
                hover === i && styles.barOn,
                i === days.length - 1 && hover == null && styles.barToday,
              ]}
            />
          </HoverPressable>
        ))}
      </View>
      <View style={styles.chartAxis}>
        <DText style={styles.axisText}>לפני {ACTIVITY_DAYS} יום</DText>
        <DText style={styles.axisText}>היום</DText>
      </View>
    </View>
  );
}

function SecurityPanel({ overview }: { overview: PlatformOverview }) {
  const disabled = overview.totals.companies - overview.totals.activeCompanies;
  const notActivated = overview.totals.notActivated;
  const lines: { icon: IconName; tone: Tone; title: string; body: string }[] = [
    {
      icon: 'key-outline',
      tone: notActivated ? 'warn' : 'ok',
      title: !notActivated ? 'כל החשבונות הופעלו' : notActivated === 1 ? 'חשבון אחד על סיסמה זמנית' : `${notActivated} חשבונות על סיסמה זמנית`,
      body: notActivated ? 'מנהלים ונהגים שעוד לא נכנסו ולא החליפו את הסיסמה שקיבלו.' : 'כולם כבר בחרו סיסמה משלהם.',
    },
    {
      icon: 'pause-circle-outline',
      tone: 'off',
      title: !disabled ? 'אין חברות מושבתות' : disabled === 1 ? 'חברה אחת מושבתת' : `${disabled} חברות מושבתות`,
      body: disabled === 1 ? 'המשתמשים שלה לא יכולים להיכנס עד שתפעיל אותה מחדש.' : disabled ? 'המשתמשים שלהן לא יכולים להיכנס עד שתפעיל אותן מחדש.' : 'לכל החברות יש גישה פעילה.',
    },
  ];
  return (
    <View style={styles.panel}>
      <PanelTitle title="אבטחה ופרטיות" />
      {lines.map((l, i) => (
        <View key={l.icon} style={[styles.secLine, i > 0 && styles.issueDivider]}>
          <View style={[styles.secIcon, { backgroundColor: DESKTOP_TONES[l.tone === 'off' ? 'neutral' : l.tone].bg }]}>
            <Ionicons name={l.icon} size={17} color={DESKTOP_TONES[l.tone === 'off' ? 'neutral' : l.tone].fg} />
          </View>
          <View style={styles.cellText}>
            <DText weight="bold" style={styles.cellMain}>
              {l.title}
            </DText>
            <DText style={styles.cellSub}>{l.body}</DText>
          </View>
        </View>
      ))}
      <View style={styles.privacyNote}>
        <Ionicons name="lock-closed" size={14} color={DESKTOP_COLORS.inkMuted} />
        <DText style={styles.privacyText}>המסך מציג רק מספרים ותאריכים. שמות, תעודות זהות וטלפונים נפתחים רק בתוך דף החברה.</DText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  page: { padding: 28, paddingBottom: 48, gap: 20, width: '100%', maxWidth: 1480, alignSelf: 'center' },
  center: { paddingVertical: 80, alignItems: 'center' },

  header: { flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  headerText: { gap: 4 },
  title: { fontSize: 30, lineHeight: 36, color: DESKTOP_COLORS.ink, letterSpacing: -0.7 },
  subtitle: { fontSize: 15, color: DESKTOP_COLORS.inkMuted },
  headerActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  primaryButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: DESKTOP_COLORS.brand,
    ...webOnly({ boxShadow: '0 1px 2px rgba(0,80,130,0.2), 0 8px 18px -10px rgba(0,117,179,0.7)' }),
  },
  primaryButtonHover: { backgroundColor: DESKTOP_COLORS.brandHover },
  primaryButtonText: { fontSize: 14, color: '#FFFFFF' },
  pressDown: { transform: [{ scale: 0.97 }] },
  secondaryButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
  },
  secondaryButtonHover: { backgroundColor: DESKTOP_COLORS.rowHover, borderColor: DESKTOP_COLORS.borderInput },
  secondaryButtonText: { fontSize: 14, color: DESKTOP_COLORS.ink },

  vitals: {
    flexDirection: 'row-reverse',
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    paddingVertical: 18,
  },
  vital: { flex: 1, minWidth: 0, paddingHorizontal: 20, gap: 4 },
  vitalDivider: { borderRightWidth: 1, borderRightColor: DESKTOP_COLORS.borderSoft },
  vitalLabelRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  vitalLabel: { fontSize: 13, color: DESKTOP_COLORS.inkMuted },
  vitalValue: { fontSize: 30, lineHeight: 36, color: DESKTOP_COLORS.ink, letterSpacing: -0.6 },
  vitalSub: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },

  columns: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 20 },
  columnsStacked: { flexDirection: 'column', alignItems: 'stretch' },
  mainColumn: { flex: 1, minWidth: 0, gap: 20 },
  pair: { flexDirection: 'row-reverse', gap: 20, flexWrap: 'wrap' },
  pairItem: { flex: 1, minWidth: 320 },
  sideColumn: { width: 340, gap: 20 },
  sideColumnStacked: { width: '100%' },

  panel: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    overflow: 'hidden',
  },
  panelTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 },
  panelTitle: { fontSize: 16, color: DESKTOP_COLORS.ink },
  countBadge: { minWidth: 26, height: 22, paddingHorizontal: 7, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { fontSize: 12.5 },

  toolbar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.borderSoft,
    flexWrap: 'wrap',
  },
  filters: { flexDirection: 'row-reverse', gap: 6, flexWrap: 'wrap' },
  filter: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderSoft,
    ...webOnly({ transition: 'background-color 160ms ease-out, border-color 160ms ease-out' }),
  },
  filterHover: { backgroundColor: '#EEF2F5', borderColor: DESKTOP_COLORS.border },
  filterOn: { backgroundColor: DESKTOP_COLORS.ink, borderColor: DESKTOP_COLORS.ink },
  filterText: { fontSize: 13.5, color: DESKTOP_COLORS.ink },
  filterCount: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
  onDark: { color: '#FFFFFF' },
  onDarkSoft: { color: 'rgba(255,255,255,0.75)' },
  search: { width: 260 },
  dot: { width: 8, height: 8, borderRadius: 4 },

  tableHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 38,
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.borderSoft,
  },
  thCell: { paddingHorizontal: 6 },
  thButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 4, marginHorizontal: -4, borderRadius: 6 },
  thButtonHover: { backgroundColor: '#EBEFF2' },
  th: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  thOn: { color: DESKTOP_COLORS.ink },

  row: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  rowMain: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', minHeight: 66, borderRadius: 10, marginVertical: 4 },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  cellCompany: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 6 },
  cell: { paddingHorizontal: 6, gap: 3, alignItems: 'flex-end' },
  cellText: { flex: 1, minWidth: 0, gap: 2 },
  companyName: { fontSize: 15, color: DESKTOP_COLORS.ink },
  cellMain: { fontSize: 14, color: DESKTOP_COLORS.ink },
  cellSub: { fontSize: 12.5, lineHeight: 18, color: DESKTOP_COLORS.inkFaint },
  muted: { color: DESKTOP_COLORS.inkMuted },
  faint: { color: DESKTOP_COLORS.inkFaint },
  avatar: { backgroundColor: DESKTOP_COLORS.surfaceMuted, borderWidth: 1, borderColor: DESKTOP_COLORS.borderSoft },
  avatarOff: { opacity: 0.45 },
  avatarInitial: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6F2F9', borderColor: 'transparent' },
  avatarInitialOff: { backgroundColor: DESKTOP_COLORS.surfaceMuted },
  avatarText: { fontSize: 16, color: DESKTOP_COLORS.brand },
  avatarTextOff: { color: DESKTOP_COLORS.inkFaint },
  stateChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 9, borderRadius: 12 },
  stateText: { fontSize: 12.5 },
  menuButton: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  menuButtonHover: { backgroundColor: '#EBEFF2' },

  noResults: { alignItems: 'center', gap: 8, paddingVertical: 36 },
  linkButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  linkButtonHover: { backgroundColor: '#E6F2F9' },
  linkText: { fontSize: 13.5, color: DESKTOP_COLORS.brand },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 56, paddingHorizontal: 32 },
  emptyIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#E6F2F9', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 18, color: DESKTOP_COLORS.ink },
  emptyBody: { fontSize: 14, lineHeight: 21, color: DESKTOP_COLORS.inkMuted, textAlign: 'center', maxWidth: 420 },
  emptyAction: { marginTop: 10 },

  allClear: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 18, paddingTop: 4 },
  issue: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12 },
  issueDivider: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  issueDot: { width: 9, height: 9, borderRadius: 5 },
  issueTitle: { fontSize: 14, color: DESKTOP_COLORS.ink },
  issueCompany: { color: DESKTOP_COLORS.inkMuted },
  moreButton: { alignSelf: 'flex-end', marginHorizontal: 12, marginBottom: 12, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },

  chartHead: { paddingHorizontal: 18, gap: 2 },
  chartValue: { fontSize: 26, lineHeight: 32, color: DESKTOP_COLORS.ink, letterSpacing: -0.5 },
  chart: { flexDirection: 'row-reverse', alignItems: 'flex-end', height: 96, gap: 3, paddingHorizontal: 18, marginTop: 14 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 3, backgroundColor: '#9CCBE6', ...webOnly({ transition: 'background-color 120ms ease-out' }) },
  barEmpty: { backgroundColor: DESKTOP_COLORS.borderSoft },
  barOn: { backgroundColor: DESKTOP_COLORS.ink },
  barToday: { backgroundColor: DESKTOP_COLORS.brand },
  chartAxis: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 16 },
  axisText: { fontSize: 12, color: DESKTOP_COLORS.inkFaint },

  secLine: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, paddingHorizontal: 18, paddingVertical: 12 },
  secIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  privacyNote: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 8,
    margin: 12,
    marginTop: 4,
    padding: 12,
    borderRadius: 10,
    backgroundColor: DESKTOP_COLORS.surfaceMuted,
  },
  privacyText: { flex: 1, fontSize: 12.5, lineHeight: 19, color: DESKTOP_COLORS.inkMuted },

  accountLine: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  flex1: { flex: 1 },
  stack: { flexDirection: 'row-reverse', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: DESKTOP_COLORS.borderSoft, marginHorizontal: 18, marginTop: 14, gap: 2 },
  legend: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16 },
  legendItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  legendValue: { fontSize: 12.5, color: DESKTOP_COLORS.ink },
  upcoming: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft, paddingVertical: 8 },
  upcomingTitle: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, paddingHorizontal: 18, paddingVertical: 6 },
  upcomingRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 9, marginHorizontal: 0 },

  menu: { gap: 4 },
  menuAction: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10 },
  menuActionHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  menuActionDangerHover: { backgroundColor: 'rgba(217,45,32,0.06)' },
  menuIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: DESKTOP_COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  menuIconDanger: { backgroundColor: 'rgba(217,45,32,0.08)' },
  menuTitle: { fontSize: 14.5 },
});
