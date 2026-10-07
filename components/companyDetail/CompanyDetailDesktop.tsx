import React, { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Company } from '../../lib/supabase';
import type { CompanyAccount } from '../../lib/companyAccount';
import { accountNextStep, formatMoney, planLabel, statusLabel, statusTone } from '../../lib/companyAccount';
import { lastSeenLabel, type CompanyHealth } from '../../lib/platformOverview';
import { COMPANY_TYPES, companyTypeLabel } from '../../lib/companyType';
import { formatDate } from '../../lib/theme';
import { formatPhone, isValidIsraeliPhone } from '../../lib/phone';
import { isValidEmail } from '../../lib/validation';
import { t } from '../../lib/i18n';
import { DesktopInput, DLtrText, DText, HoverPressable, StatusPill, prefersReducedMotion } from '../desktop/primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../desktop/desktopTheme';
import { OverflowMenu } from '../desktop/record/RecordKit';
import { DetailRow, Fact, FieldEditDialog, GroupLabel, pageStyles, type FieldEditor } from '../desktop/record/RecordPage';
import { CompanyFoldersPanel } from '../owner/CompanyFoldersPanel';
import { NotesCard, OnboardingCard, PaymentsCard } from './OwnerCompanyTools';
import type { CompanyUser } from './types';

/**
 * The owner's company page on a computer: a header with the company's numbers,
 * what needs the owner there, then two columns — details edited in place, the
 * users table and the driver-file folders; the subscription, usage and the
 * disable / delete actions on the side. The phone keeps CompanyDetailMobile.
 */

type Props = {
  company: Company;
  account: CompanyAccount | null;
  /** The company's line in the owner's control room; null while it loads or if it failed. */
  health: CompanyHealth | null;
  admins: CompanyUser[];
  drivers: CompanyUser[];
  /** Saves one or more company columns; resolves to an error message or null. */
  onSaveField: (patch: Partial<Company>) => Promise<string | null>;
  onPickLogo: () => void;
  uploadingLogo: boolean;
  logoError: string;
  onToggleActive: () => void;
  onDelete: () => void;
  onEditAccount: () => void;
  onAddAdmin: () => void;
  onEditUser: (user: CompanyUser) => void;
  onResetUser: (user: CompanyUser) => void;
  onRemoveUser: (user: CompanyUser) => void;
};

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('');

export function CompanyDetailDesktop(p: Props) {
  const { company, account, health } = p;
  const active = company.status === 'active';
  const [editor, setEditor] = useState<FieldEditor | null>(null);
  const motion = !prefersReducedMotion();

  const text = (
    label: string,
    column: keyof Company,
    opts: { ltr?: boolean; required?: boolean; validate?: (v: string) => string | null } = {},
  ) => ({
    kind: 'text' as const,
    label,
    raw: (company[column] as string | null) ?? '',
    ltr: opts.ltr,
    validate: (v: string) => (opts.required && !v.trim() ? t('validation.required') : v.trim() ? opts.validate?.(v.trim()) ?? null : null),
    onSave: (v: string) => p.onSaveField({ [column]: v.trim() || (opts.required ? v.trim() : null) } as Partial<Company>),
  });
  const phone = (v: string) => (isValidIsraeliPhone(v) ? null : t('validation.invalidPhone'));
  const email = (v: string) => (isValidEmail(v) ? null : t('validation.invalidEmail'));
  const businessId = (v: string) => (/^\d{9}$/.test(v.replace(/\D/g, '')) ? null : t('company.businessId9'));

  const facts = [
    { label: t('common.drivers'), value: String(p.drivers.length) },
    { label: t('owner.admins'), value: String(p.admins.length) },
    { label: t('owner.actionsThisWeek'), value: health ? String(health.activity7d) : '—' },
  ];
  const sub = [
    company.company_type ? companyTypeLabel(company.company_type) : null,
    company.business_id ? t('company.businessIdValue', { businessId: company.business_id }) : null,
    `${t('company.inSystemSince')} ${formatDate(company.created_at)}`,
    health ? t('companyPage.lastActivity', { when: lastSeenLabel(health.lastActivity) }) : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <ScrollView style={pageStyles.root} contentContainerStyle={pageStyles.content}>
        {/* Header */}
        <View style={[pageStyles.hero, styles.hero, motion && pageStyles.enter]}>
          <View style={[pageStyles.heroIdentity, styles.who]}>
            {company.logo_url ? (
              <Image source={{ uri: company.logo_url }} accessibilityLabel={t('company.logoOf', { name: company.name })} style={styles.logo} resizeMode="cover" />
            ) : (
              <View style={[styles.logo, styles.logoEmpty]}>
                <DText weight="bold" style={styles.logoText}>{initials(company.name)}</DText>
              </View>
            )}
            <View style={pageStyles.flex}>
              <View style={pageStyles.heroStatusRow}>
                <StatusPill tone={active ? 'ok' : 'neutral'} label={active ? t('company.activeF') : t('owner.disabledCompany')} />
                {account ? <StatusPill tone={statusTone(account.status) === 'off' ? 'neutral' : (statusTone(account.status) as 'ok' | 'warn' | 'bad')} label={statusLabel(account.status)} /> : null}
              </View>
              <DText weight="bold" style={pageStyles.heroName} numberOfLines={1}>{company.name}</DText>
              <View style={pageStyles.heroSub}>
                {sub.map((part, index) => (
                  <React.Fragment key={part}>
                    {index > 0 && <DText style={pageStyles.heroSubDot}>·</DText>}
                    <DText style={pageStyles.heroSubText}>{part}</DText>
                  </React.Fragment>
                ))}
              </View>
            </View>
          </View>
          <View style={pageStyles.facts}>
            {facts.map((fact) => <Fact key={fact.label} {...fact} />)}
          </View>
          <View style={styles.heroActions}>
            <HoverPressable style={pageStyles.softBtn} hoverStyle={pageStyles.softBtnHover} pressStyle={pageStyles.pressDown} onPress={p.onAddAdmin}>
              <Ionicons name="person-add-outline" size={16} color={DESKTOP_COLORS.brand} />
              <DText weight="semiBold" style={pageStyles.softBtnText}>{t('company.addAdmin')}</DText>
            </HoverPressable>
            <OverflowMenu
              items={[
                { label: t('company.editSubscription'), icon: 'card-outline', onPress: p.onEditAccount },
                { label: active ? t('owner.disableCompany') : t('owner.reactivateCompany'), icon: 'power-outline', onPress: p.onToggleActive },
                { label: t('owner.deleteCompany'), icon: 'trash-outline', onPress: p.onDelete, danger: true },
              ]}
            />
          </View>
        </View>

        {!active && (
          <View style={pageStyles.archivedBanner}>
            <Ionicons name="pause-circle-outline" size={18} color={DESKTOP_COLORS.inkMuted} />
            <DText style={[pageStyles.archivedText, pageStyles.flex]}>{t('company.disabledBanner')}</DText>
            <HoverPressable style={pageStyles.softBtn} hoverStyle={pageStyles.softBtnHover} pressStyle={pageStyles.pressDown} onPress={p.onToggleActive}>
              <Ionicons name="power-outline" size={16} color={DESKTOP_COLORS.brand} />
              <DText weight="semiBold" style={pageStyles.softBtnText}>{t('company.enable')}</DText>
            </HoverPressable>
          </View>
        )}

        <Attention health={health} active={active} />

        <View style={pageStyles.gridRow}>
          {/* Main column */}
          <View style={[pageStyles.mainCell, styles.column]}>
            <OnboardingCard companyId={company.id} managerActive={p.admins.some((a) => !a.must_change_password)} drivers={p.drivers.length} />

            <CompanyFoldersPanel companyId={company.id} />

            <UsersCard {...p} />

            <View>
              <GroupLabel>{t('company.detailsTitle')}</GroupLabel>
              <View style={[pageStyles.card, pageStyles.listCard]}>
                <DetailRow first label={t('company.name')} value={company.name} edit={text(t('company.name'), 'name', { required: true })} />
                <DetailRow
                  label={t('company.type')}
                  value={company.company_type ? companyTypeLabel(company.company_type) : null}
                  onPress={() =>
                    setEditor({
                      kind: 'select',
                      label: t('company.type'),
                      raw: company.company_type ?? null,
                      allowClear: true,
                      placeholder: t('company.chooseType'),
                      options: COMPANY_TYPES.map((type) => ({ value: type, label: companyTypeLabel(type) })),
                      onSave: (v) => p.onSaveField({ company_type: v } as Partial<Company>),
                    })
                  }
                />
                <DetailRow label={t('company.businessId')} value={company.business_id} ltr edit={text(t('company.businessId'), 'business_id', { ltr: true, validate: businessId })} />
                <DetailRow label={t('company.address')} value={company.address} edit={text(t('company.address'), 'address')} />
                <DetailRow label={t('company.phone')} value={company.phone ? formatPhone(company.phone) : null} ltr edit={text(t('company.phone'), 'phone', { ltr: true, validate: phone })} />
                <DetailRow label={t('company.safetyOfficer')} value={company.safety_officer_name} edit={text(t('company.safetyOfficer'), 'safety_officer_name')} />
                <DetailRow
                  label={t('company.safetyOfficerPhone')}
                  value={company.safety_officer_phone ? formatPhone(company.safety_officer_phone) : null}
                  ltr
                  edit={text(t('company.safetyOfficerPhone'), 'safety_officer_phone', { ltr: true, validate: phone })}
                />
                <DetailRow
                  label={t('company.logo')}
                  value={company.logo_url ? t('company.clickToReplace') : null}
                  onPress={p.uploadingLogo ? undefined : p.onPickLogo}
                  accessory={p.logoError ? <DText style={styles.error}>{p.logoError}</DText> : p.uploadingLogo ? <DText style={pageStyles.rowNote}>…</DText> : null}
                />
              </View>
            </View>
          </View>

          {/* Side column */}
          <View style={[pageStyles.sideCell, styles.column]}>
            <AccountCard account={account} onEdit={p.onEditAccount} />
            <PaymentsCard companyId={company.id} monthlyPrice={account?.monthly_price ?? null} />
            <NotesCard companyId={company.id} />
            <View>
              <GroupLabel>{t('companyPage.settingsTitle')}</GroupLabel>
              <View style={[pageStyles.card, pageStyles.listCard]}>
                <DetailRow first label={t('company.filesEmail')} value={company.files_email ?? null} ltr edit={text(t('company.filesEmail'), 'files_email', { ltr: true, validate: email })} />
                <DetailRow label={t('common.email')} value={company.email ?? null} ltr edit={text(t('common.email'), 'email', { ltr: true, validate: email })} />
                <DetailRow
                  label={t('company.carrierLicenseExpiry')}
                  value={company.carrier_license_expiry ? formatDate(company.carrier_license_expiry) : null}
                  onPress={() =>
                    setEditor({
                      kind: 'date',
                      label: t('company.carrierLicenseExpiry'),
                      raw: company.carrier_license_expiry ?? null,
                      onSave: (v) => p.onSaveField({ carrier_license_expiry: v }),
                    })
                  }
                />
              </View>
            </View>
            <View>
              <GroupLabel>{t('companyPage.dangerZone')}</GroupLabel>
              <View style={[pageStyles.card, pageStyles.listCard]}>
                <ActionRow
                  first
                  icon="power-outline"
                  title={active ? t('owner.disableCompany') : t('owner.reactivateCompany')}
                  caption={active ? t('owner.disableCaption') : t('owner.reactivateCaption')}
                  onPress={p.onToggleActive}
                />
                <ActionRow danger icon="trash-outline" title={t('owner.deleteCompany')} caption={t('owner.deleteCaption')} onPress={p.onDelete} />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
      <FieldEditDialog editor={editor} onClose={() => setEditor(null)} />
    </>
  );
}

/** What needs the owner in this company (the control room's own checks), or a calm "all good". */
function Attention({ health, active }: { health: CompanyHealth | null; active: boolean }) {
  if (!health || !active) return null;
  const extra: string[] = [];
  if (health.notActivated) extra.push(health.notActivated === 1 ? t('owner.oneOnTempPassword') : t('owner.onTempPassword', { notActivated: health.notActivated }));
  if (!health.issues.length) {
    return (
      <View style={styles.okBanner}>
        <Ionicons name="checkmark-circle" size={18} color={DESKTOP_TONES.ok.fg} />
        <View style={pageStyles.flex}>
          <DText weight="semiBold" style={styles.okTitle}>{t('common.allOk')}</DText>
          <DText style={styles.okText}>{[t('companyPage.allOkDetail'), ...extra].join(' · ')}</DText>
        </View>
      </View>
    );
  }
  return (
    <View style={pageStyles.attention}>
      <Ionicons name="alert-circle" size={18} color="#B54708" style={pageStyles.attentionIcon} />
      <View style={pageStyles.flex}>
        <DText weight="bold" style={pageStyles.attentionTitle}>{t('owner.needsYourAttention')}</DText>
        {health.issues.map((issue) => (
          <View key={issue.title} style={pageStyles.attentionRow}>
            <View style={[styles.dot, { backgroundColor: DESKTOP_TONES[issue.tone].fg }]} />
            <DText weight="semiBold" style={pageStyles.attentionText}>{issue.title}</DText>
            <DText style={[pageStyles.attentionText, styles.issueDetail]}> · {issue.detail}</DText>
          </View>
        ))}
        {extra.length ? <DText style={[pageStyles.attentionText, styles.issueExtra]}>{extra.join(' · ')}</DText> : null}
      </View>
    </View>
  );
}

/** Managers and drivers in one table: a switch between them, search, and the actions on every row. */
function UsersCard(p: Props) {
  const [tab, setTab] = useState<'admin' | 'driver'>(p.admins.length === 0 ? 'admin' : 'driver');
  const [query, setQuery] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const list = tab === 'admin' ? p.admins : p.drivers;
  const pending = list.filter((user) => user.must_change_password).length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return list.filter((user) => {
      if (onlyPending && !user.must_change_password) return false;
      if (!q) return true;
      return (
        (user.full_name ?? '').toLowerCase().includes(q) ||
        (user.email ?? '').toLowerCase().includes(q) ||
        (!!digits && (user.phone ?? '').replace(/\D/g, '').includes(digits))
      );
    });
  }, [list, query, onlyPending]);

  const copy = (user: CompanyUser) => {
    if (!user.email || typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(user.email).then(() => {
      setCopied(user.id);
      setTimeout(() => setCopied((id) => (id === user.id ? null : id)), 1600);
    });
  };

  const tabs: { key: 'admin' | 'driver'; label: string; count: number }[] = [
    { key: 'driver', label: t('common.drivers'), count: p.drivers.length },
    { key: 'admin', label: t('owner.admins'), count: p.admins.length },
  ];

  return (
    <View>
      <GroupLabel
        action={
          <HoverPressable style={pageStyles.linkBtn} hoverStyle={pageStyles.rowHover} onPress={p.onAddAdmin}>
            <Ionicons name="add" size={15} color={DESKTOP_COLORS.brand} />
            <DText weight="semiBold" style={pageStyles.linkText}>{t('company.addAdmin')}</DText>
          </HoverPressable>
        }
      >
        {t('companyPage.usersTitle')}
      </GroupLabel>
      <View style={[pageStyles.card, pageStyles.listCard]}>
        <View style={styles.toolbar}>
          <View style={styles.segment} accessibilityRole="tablist">
            {tabs.map((item) => (
              <HoverPressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === item.key }}
                style={[styles.segmentItem, tab === item.key && styles.segmentItemOn]}
                hoverStyle={tab === item.key ? undefined : styles.segmentHover}
                onPress={() => {
                  setTab(item.key);
                  setOnlyPending(false);
                }}
              >
                <DText weight="semiBold" style={[styles.segmentText, tab === item.key && styles.segmentTextOn]}>
                  {item.label} · {item.count}
                </DText>
              </HoverPressable>
            ))}
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={15} color={DESKTOP_COLORS.inkFaint} style={styles.searchIcon} />
            <DesktopInput value={query} onChangeText={setQuery} placeholder={t('companyPage.searchUsers')} accessibilityLabel={t('companyPage.searchUsers')} style={styles.searchInput} />
          </View>
          {pending > 0 && (
            <HoverPressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: onlyPending }}
              style={[styles.chip, onlyPending && styles.chipOn]}
              hoverStyle={onlyPending ? undefined : styles.segmentHover}
              onPress={() => setOnlyPending((v) => !v)}
            >
              <Ionicons name="time-outline" size={14} color={onlyPending ? '#FFFFFF' : DESKTOP_TONES.warn.fg} />
              <DText weight="semiBold" style={[styles.chipText, onlyPending && styles.chipTextOn]}>
                {t('companyPage.onlyNotActivated')} · {pending}
              </DText>
            </HoverPressable>
          )}
        </View>

        {list.length === 0 ? (
          <DText style={styles.empty}>{tab === 'admin' ? t('company.noAdminsYet') : t('company.noDriversYetShort')}</DText>
        ) : shown.length === 0 ? (
          <DText style={styles.empty}>{t('companyPage.noMatches')}</DText>
        ) : (
          shown.map((user) => (
            <View key={user.id} style={[pageStyles.detailRow, pageStyles.rowDivider, styles.userRow]}>
              <View style={pageStyles.avatar}>
                <DText weight="bold" style={pageStyles.avatarText}>{initials(user.full_name || '?')}</DText>
              </View>
              <View style={styles.userName}>
                <DText weight="semiBold" style={styles.userTitle} numberOfLines={1}>{user.full_name || t('common.unnamed')}</DText>
                <DText style={pageStyles.rowNote}>{t('companyPage.addedOn', { date: formatDate(user.created_at) })}</DText>
              </View>
              <HoverPressable style={styles.email} hoverStyle={styles.emailHover} onPress={() => copy(user)} disabled={!user.email} accessibilityLabel={`${t('companyPage.copyEmail')}: ${user.email ?? ''}`}>
                <DLtrText style={styles.cellText} numberOfLines={1}>{copied === user.id ? t('companyPage.copied') : user.email || '—'}</DLtrText>
              </HoverPressable>
              <DLtrText style={[styles.cellText, styles.phone]} numberOfLines={1}>{user.phone ? formatPhone(user.phone) : '—'}</DLtrText>
              <View style={styles.status}>
                <StatusPill tone={user.must_change_password ? 'warn' : 'ok'} label={user.must_change_password ? t('users.notSignedInYet') : t('vehicle.status.active')} />
              </View>
              <View style={styles.rowActions}>
                <IconAction icon="pencil-outline" label={t('profile.editDetails')} onPress={() => p.onEditUser(user)} />
                <IconAction icon="key-outline" label={t('password.newTemporary')} onPress={() => p.onResetUser(user)} />
                <IconAction icon="trash-outline" label={t('common.deleteAction')} danger onPress={() => p.onRemoveUser(user)} />
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function IconAction({ icon, label, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <HoverPressable
      style={styles.iconBtn}
      hoverStyle={danger ? styles.iconBtnDanger : styles.iconBtnHover}
      pressStyle={pageStyles.pressDown}
      onPress={onPress}
      accessibilityLabel={label}
      {...webOnly({ title: label })}
    >
      <Ionicons name={icon} size={16} color={danger ? DESKTOP_COLORS.danger : DESKTOP_COLORS.inkMuted} />
    </HoverPressable>
  );
}

/** The subscription, standing on its own on the side: status, price and the next date. */
function AccountCard({ account, onEdit }: { account: CompanyAccount | null; onEdit: () => void }) {
  const next = accountNextStep(account);
  const trial = account?.status === 'trial';
  const contact = [account?.contact_name, account?.contact_phone, account?.contact_email].filter(Boolean).join(' · ');
  return (
    <View>
      <GroupLabel
        action={
          <HoverPressable style={pageStyles.linkBtn} hoverStyle={pageStyles.rowHover} onPress={onEdit}>
            <Ionicons name="create-outline" size={14} color={DESKTOP_COLORS.brand} />
            <DText weight="semiBold" style={pageStyles.linkText}>{t('common.edit')}</DText>
          </HoverPressable>
        }
      >
        {t('owner.subscriptionAndPayment')}
      </GroupLabel>
      <View style={[pageStyles.card, pageStyles.listCard]}>
        <View style={styles.accountTop}>
          <DText weight="bold" style={styles.price}>{formatMoney(account?.monthly_price)}</DText>
          <DText style={pageStyles.mutedText}>{t('common.perMonth')} · {planLabel(account?.plan)}</DText>
          {!!next && next.tone !== 'ok' && (
            <DText weight="semiBold" style={[styles.next, { color: DESKTOP_TONES[next.tone === 'bad' ? 'bad' : 'warn'].fg }]}>{next.label}</DText>
          )}
        </View>
        <DetailRow compact label={trial ? t('company.trialEnd') : t('company.renewal')} value={formatDate(trial ? account?.trial_ends_at : account?.renewal_date) || null} onPress={onEdit} />
        {(!!contact || !!account?.notes) && (
          <View style={[pageStyles.rowDivider, styles.accountFoot]}>
            {!!contact && <DText style={pageStyles.rowNote}>{t('company.billingContactColon')} {contact}</DText>}
            {!!account?.notes && <DText style={pageStyles.rowNote}>{t('common.notesColon')} {account.notes}</DText>}
          </View>
        )}
      </View>
    </View>
  );
}

function ActionRow({ icon, title, caption, onPress, danger, first }: { icon: keyof typeof Ionicons.glyphMap; title: string; caption: string; onPress: () => void; danger?: boolean; first?: boolean }) {
  const color = danger ? DESKTOP_COLORS.danger : DESKTOP_COLORS.ink;
  return (
    <HoverPressable style={[pageStyles.detailRow, !first && pageStyles.rowDivider, styles.actionRow]} hoverStyle={danger ? styles.dangerHover : pageStyles.rowHover} onPress={onPress} accessibilityLabel={title}>
      <Ionicons name={icon} size={18} color={color} />
      <View style={pageStyles.flex}>
        <DText weight="semiBold" style={[styles.actionTitle, { color }]}>{title}</DText>
        <DText style={pageStyles.rowNote}>{caption}</DText>
      </View>
    </HoverPressable>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: 16, paddingHorizontal: 20, gap: 24 },
  who: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  logo: { width: 56, height: 56, borderRadius: 14, borderWidth: 1, borderColor: DESKTOP_COLORS.border, backgroundColor: DESKTOP_COLORS.surface },
  logoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(47,91,255,0.08)', borderColor: 'transparent' },
  logoText: { fontSize: 20, color: DESKTOP_COLORS.brand },
  heroActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  column: { gap: 16 },

  okBanner: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14, backgroundColor: DESKTOP_TONES.ok.bg, borderWidth: 1, borderColor: 'rgba(18,183,106,0.18)' },
  okTitle: { fontSize: 14.5, color: DESKTOP_TONES.ok.fg },
  okText: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted },
  dot: { width: 7, height: 7, borderRadius: 4, marginStart: 8 },
  issueDetail: { color: '#8A5A1E' },
  issueExtra: { marginTop: 4, color: '#8A5A1E' },

  toolbar: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: 12 },
  segment: { flexDirection: 'row-reverse', padding: 3, borderRadius: 10, backgroundColor: '#EEF1F4' },
  segmentItem: { height: 30, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease, box-shadow 150ms ease' }) },
  segmentItemOn: { backgroundColor: DESKTOP_COLORS.surface, ...webOnly({ boxShadow: '0 1px 2px rgba(22,34,46,0.1), 0 1px 6px rgba(22,34,46,0.06)' }) },
  segmentHover: { backgroundColor: 'rgba(22,34,46,0.05)' },
  segmentText: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  segmentTextOn: { color: DESKTOP_COLORS.ink },
  search: { flex: 1, minWidth: 200, justifyContent: 'center' },
  searchIcon: { position: 'absolute', end: 11, zIndex: 1 },
  searchInput: { height: 36, borderRadius: 10, paddingEnd: 32 },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: DESKTOP_TONES.warn.bg, ...webOnly({ transition: 'background-color 150ms ease' }) },
  chipOn: { backgroundColor: DESKTOP_TONES.warn.fg },
  chipText: { fontSize: 13, color: DESKTOP_TONES.warn.fg },
  chipTextOn: { color: '#FFFFFF' },

  userRow: { minHeight: 58, gap: 14 },
  userName: { flex: 1.3, minWidth: 0, gap: 1 },
  userTitle: { fontSize: 14.5, color: DESKTOP_COLORS.ink },
  email: { flex: 1.4, minWidth: 0, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 6, ...webOnly({ cursor: 'copy', transition: 'background-color 150ms ease' }) },
  emailHover: { backgroundColor: 'rgba(47,91,255,0.07)' },
  cellText: { fontSize: 13.5, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  phone: { width: 110 },
  status: { width: 96, alignItems: 'flex-end' },
  rowActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 2 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  iconBtnHover: { backgroundColor: '#EEF1F4' },
  iconBtnDanger: { backgroundColor: 'rgba(217,45,32,0.08)' },
  empty: { fontSize: 14, color: DESKTOP_COLORS.inkFaint, textAlign: 'center', paddingVertical: 28, borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },

  accountTop: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 2 },
  price: { fontSize: 26, letterSpacing: -0.4, color: DESKTOP_COLORS.ink, textAlign: 'right', ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  next: { fontSize: 13.5, marginTop: 4 },
  accountFoot: { paddingHorizontal: 16, paddingVertical: 10, gap: 4 },

  actionRow: { minHeight: 60, alignItems: 'center' },
  actionTitle: { fontSize: 14.5 },
  dangerHover: { backgroundColor: 'rgba(217,45,32,0.05)' },
  error: { fontSize: 12.5, color: DESKTOP_COLORS.danger },
});
