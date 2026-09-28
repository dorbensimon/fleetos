import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Avatar,
  DK,
  DK_SPACE,
  DKText,
  DriverPage,
  EditField,
  HeroStat,
  HeroTitle,
  InfoLine,
  KitSection,
  ListRow,
  PrimaryAction,
  Pressy,
  Reveal,
  STATUS,
  Surface,
} from '../driverKit';
import { BrandLoader } from '../ui/BrandLoader';
import { formatDate } from '../../lib/theme';
import { formatPhone } from '../../lib/phone';
import type { Company } from '../../lib/supabase';
import { accountNextStep, formatMoney, planLabel, statusLabel, statusTone, BILLING_CYCLES, type CompanyAccount } from '../../lib/companyAccount';
import { ChoiceChips, TonePill } from '../owner/ownerKit';
import type { CompanyEditableFields } from './CompanyInfoCard';
import type { CompanyUser } from './types';
import { t, dirIcon } from '../../lib/i18n';
import { COMPANY_TYPES, companyTypeLabel } from '../../lib/companyType';

/**
 * One company on the owner's phone: who it is and where it stands as a
 * customer on the night; below, the subscription, the managers and the
 * drivers (tap a person for their actions), the company's details to edit,
 * and switching it off or deleting it at the very bottom.
 */

const DRIVERS_PREVIEW = 6;

type Props = {
  insetTop: number;
  insetBottom: number;
  company: Company;
  account: CompanyAccount | null;
  fields: CompanyEditableFields;
  hasChanges: boolean;
  saving: boolean;
  saveError: string;
  uploadingLogo: boolean;
  logoError: string;
  admins: CompanyUser[];
  drivers: CompanyUser[];
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  onChangeFields: (updater: (f: CompanyEditableFields) => CompanyEditableFields) => void;
  onPickLogo: () => void;
  onSave: () => void;
  onEditAccount: () => void;
  onAddAdmin: () => void;
  onUser: (user: CompanyUser) => void;
  onToggleActive: () => void;
  onDelete: () => void;
};

export function CompanyDetailMobile(p: Props) {
  const [allDrivers, setAllDrivers] = useState(false);
  const active = p.company.status === 'active';
  const a = p.account;
  const next = accountNextStep(a);
  const shownDrivers = allDrivers ? p.drivers : p.drivers.slice(0, DRIVERS_PREVIEW);
  const pendingAdmins = p.admins.filter((u) => u.must_change_password).length;
  const set = <K extends keyof CompanyEditableFields>(key: K, value: CompanyEditableFields[K]) => p.onChangeFields((f) => ({ ...f, [key]: value }));

  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      refreshing={p.refreshing}
      onRefresh={p.onRefresh}
      footer={
        p.hasChanges ? (
          <PrimaryAction label={t('company.saveDetails')} icon="checkmark" onPress={p.onSave} loading={p.saving} disabled={!p.fields.name.trim()} />
        ) : undefined
      }
      hero={
        <View>
          <HeroTitle
            title={p.company.name}
            subtitle={[active ? t('company.activeF') : t('owner.health.off'), t('owner.joinedOn', { v1: formatDate(p.company.created_at) })].join(' · ')}
            onBack={p.onBack}
            right={
              p.company.logo_url ? (
                <Image source={{ uri: p.company.logo_url }} accessibilityLabel={t('company.logoOf', { name: p.company.name })} style={styles.heroLogo} resizeMode="contain" />
              ) : undefined
            }
          />
          <View style={styles.stats}>
            <HeroStat value={p.admins.length} label={t('company.managers')} />
            <HeroStat value={p.drivers.length} label={t('common.drivers')} />
            <HeroStat value={a ? statusLabel(a.status) : '–'} label={a?.monthly_price ? t('company.perMonthV1', { v1: formatMoney(a.monthly_price) }) : t('owner.col.subscription')} onPress={p.onEditAccount} />
          </View>
        </View>
      }
    >
      {!active && (
        <Reveal>
          <Surface style={styles.banner}>
            <Ionicons name="pause-circle" size={20} color={STATUS.soon.fg} />
            <DKText variant="caption" color={DK.inkSoft} style={styles.flex}>
              {t('company.disabledBanner')}
            </DKText>
          </Surface>
        </Reveal>
      )}

      <Reveal index={1}>
        {/* The first card rises over the hero's edge, where a heading can't sit: its title lives inside. */}
        <KitSection>
          <View style={styles.cardTitle}>
            <DKText variant="micro" color={DK.muted} accessibilityRole="header" style={styles.flex}>
              {t('owner.subscriptionAndPayment')}
            </DKText>
            <Pressy onPress={p.onEditAccount} accessibilityLabel={t('company.editSubscription')} style={styles.linkChip} pressScale={0.95}>
              <Ionicons name="create-outline" size={14} color={DK.accent} />
              <DKText variant="micro" color={DK.accent}>
                {t('common.edit')}
              </DKText>
            </Pressy>
          </View>
          <View style={styles.accountHead}>
            <View style={styles.flex}>
              <DKText variant="title" style={styles.tabular}>
                {a?.monthly_price != null ? formatMoney(a.monthly_price) : '—'}
                <DKText variant="caption" color={DK.muted}>
                  {a?.monthly_price != null ? t('company.perMonthSuffix') : ''}
                </DKText>
              </DKText>
              <DKText variant="caption" color={DK.muted}>
                {[planLabel(a?.plan), BILLING_CYCLES.find((c) => c.value === a?.billing_cycle)?.label ? t('company.billingLabel', { label: BILLING_CYCLES.find((c) => c.value === a?.billing_cycle)!.label }) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </DKText>
            </View>
            <TonePill tone={statusTone(a?.status)} label={statusLabel(a?.status)} />
          </View>
          {!!next && (
            <InfoLine
              icon={a?.status === 'trial' ? 'timer-outline' : 'calendar-outline'}
              tint={next.tone === 'bad' ? STATUS.expired.fg : next.tone === 'warn' ? STATUS.soon.fg : DK.accent}
              label={a?.status === 'trial' ? t('company.trialEnd') : t('company.renewal')}
              value={`${next.label} · ${formatDate(a?.status === 'trial' ? a.trial_ends_at : a?.renewal_date)}`}
            />
          )}
          {!!a?.vehicle_limit && <InfoLine icon="car-sport-outline" label={t('company.vehicleQuota')} value={t('company.vehiclesLimit', { vehicle_limit: a.vehicle_limit })} />}
          {!!(a?.contact_name || a?.contact_phone || a?.contact_email) && (
            <InfoLine
              icon="person-circle-outline"
              label={t('account.billingContact')}
              value={[a?.contact_name, a?.contact_phone ? formatPhone(a.contact_phone) : null, a?.contact_email].filter(Boolean).join(' · ')}
            />
          )}
          {!!a?.notes && <InfoLine icon="document-text-outline" label={t('common.notes')} value={a.notes} />}
          {!a && <InfoLine icon="card-outline" label={t('owner.col.subscription')} value={t('common.notSetYet')} onPress={p.onEditAccount} />}
        </KitSection>
      </Reveal>

      <Reveal index={2}>
        <KitSection
          title={pendingAdmins ? t('company.managersPending', { pendingAdmins }) : t('company.managers')}
          trailing={
            <Pressy onPress={p.onAddAdmin} accessibilityLabel={t('company.addManager')} style={styles.linkChip} pressScale={0.95}>
              <Ionicons name="add" size={15} color={DK.accent} />
              <DKText variant="micro" color={DK.accent}>
                {t('users.additionalManager')}
              </DKText>
            </Pressy>
          }
        >
          {p.admins.length === 0 ? (
            <ListRow first icon="alert-circle" tint={STATUS.expired.fg} title={t('owner.health.noManager')} subtitle={t('company.noManagerWarning')} onPress={p.onAddAdmin} />
          ) : (
            p.admins.map((u, i) => <PersonRow key={u.id} user={u} first={i === 0} onPress={() => p.onUser(u)} />)
          )}
        </KitSection>
      </Reveal>

      <Reveal index={3}>
        <KitSection title={t('company.driversCount', { length: p.drivers.length })}>
          {p.drivers.length === 0 ? (
            <ListRow first icon="people-outline" tint={DK.muted} title={t('company.noDriversYet')} subtitle={t('company.managersAddDrivers')} />
          ) : (
            <>
              {shownDrivers.map((u, i) => (
                <PersonRow key={u.id} user={u} first={i === 0} onPress={() => p.onUser(u)} />
              ))}
              {p.drivers.length > DRIVERS_PREVIEW && (
                <Pressy onPress={() => setAllDrivers((v) => !v)} accessibilityLabel={allDrivers ? t('company.showFewerDrivers') : t('meeting.showAllDrivers', { length: p.drivers.length })} pressScale={0.98}>
                  <View style={[styles.more, styles.divider]}>
                    <DKText variant="label" color={DK.accent}>
                      {allDrivers ? t('common.showLess') : t('common.showAllN', { length: p.drivers.length })}
                    </DKText>
                  </View>
                </Pressy>
              )}
            </>
          )}
        </KitSection>
      </Reveal>

      <Reveal index={4}>
        <KitSection title={t('settings.section.company')}>
          <Pressy onPress={p.onPickLogo} disabled={p.uploadingLogo} accessibilityLabel={p.fields.logoUrl ? t('company.replaceLogo') : t('company.uploadLogo')} pressScale={0.985}>
            <View style={styles.logoRow}>
              <View style={styles.logoBox}>
                {p.uploadingLogo ? (
                  <BrandLoader size={24} />
                ) : p.fields.logoUrl ? (
                  <Image source={{ uri: p.fields.logoUrl }} accessibilityLabel={t('company.logo')} style={styles.logoImage} resizeMode="contain" />
                ) : (
                  <Ionicons name="image-outline" size={24} color={DK.accent} />
                )}
              </View>
              <View style={styles.flex}>
                <DKText variant="label">{t('company.logoShort')}</DKText>
                <DKText variant="caption" color={p.logoError ? STATUS.expired.fg : DK.muted}>
                  {p.logoError || (p.fields.logoUrl ? t('company.clickToReplace') : t('company.pngOrJpg'))}
                </DKText>
              </View>
              <Ionicons name={dirIcon('chevron-back')} size={18} color={DK.faint} />
            </View>
          </Pressy>
          <EditField label={t('company.name')} required value={p.fields.name} onChangeText={(v) => set('name', v)} error={p.fields.name.trim() ? undefined : t('validation.companyNameRequired')} />
          <View style={[styles.block, styles.divider]}>
            <DKText variant="caption" color={DK.inkSoft}>
              {t('company.typeOf')}
            </DKText>
            <ChoiceChips
              label={t('company.typeOf')}
              clearable
              options={COMPANY_TYPES.map((type) => ({ value: type, label: companyTypeLabel(type) }))}
              value={p.fields.companyType}
              onChange={(v) => set('companyType', v as CompanyEditableFields['companyType'])}
            />
          </View>
          <EditField label={t('company.regOrDealerNumber')} value={p.fields.businessId} onChangeText={(v) => set('businessId', v.replace(/\D/g, ''))} keyboardType="number-pad" ltr maxLength={9} />
          <EditField label={t('common.address')} value={p.fields.address} onChangeText={(v) => set('address', v)} />
          <EditField label={t('company.phone')} value={formatPhone(p.fields.phone)} onChangeText={(v) => set('phone', v.replace(/\D/g, ''))} keyboardType="phone-pad" ltr />
          <EditField label={t('company.safetyOfficer')} value={p.fields.safetyOfficerName} onChangeText={(v) => set('safetyOfficerName', v)} />
          <EditField
            label={t('company.safetyOfficerPhone')}
            value={formatPhone(p.fields.safetyOfficerPhone)}
            onChangeText={(v) => set('safetyOfficerPhone', v.replace(/\D/g, ''))}
            keyboardType="phone-pad"
            ltr
          />
          {!!p.saveError && (
            <View style={[styles.block, styles.divider]}>
              <DKText variant="caption" color={STATUS.expired.fg}>
                {p.saveError}
              </DKText>
            </View>
          )}
        </KitSection>
      </Reveal>

      <Reveal index={5}>
        <Surface style={styles.list}>
          <ListRow
            first
            icon={active ? 'pause-circle-outline' : 'play-circle-outline'}
            tint={active ? STATUS.soon.fg : STATUS.ok.fg}
            title={active ? t('owner.disableCompany') : t('owner.reactivateCompany')}
            subtitle={active ? t('company.disableHintLong') : t('company.usersCanSignInAgain')}
            onPress={p.onToggleActive}
          />
          <ListRow icon="trash-outline" tint={STATUS.expired.fg} title={t('owner.deleteCompany')} subtitle={t('owner.permanentDeleteAll')} onPress={p.onDelete} />
        </Surface>
      </Reveal>
    </DriverPage>
  );
}

function PersonRow({ user, first, onPress }: { user: CompanyUser; first: boolean; onPress: () => void }) {
  return (
    <ListRow
      first={first}
      leading={<Avatar name={user.full_name} size={40} tone={user.must_change_password ? 'muted' : 'soft'} />}
      title={user.full_name || t('common.unnamed')}
      subtitle={user.must_change_password ? t('users.notSignedInTemp') : user.email || (user.phone ? formatPhone(user.phone) : null)}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  stats: { flexDirection: 'row-reverse', gap: 8, marginTop: 16 },
  heroLogo: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF' },
  banner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: DK_SPACE.md, backgroundColor: STATUS.soon.soft },
  linkChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: DK.accentSoft },
  cardTitle: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: DK_SPACE.md, paddingTop: 14 },
  accountHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: DK_SPACE.md, paddingTop: 6, paddingBottom: DK_SPACE.md },
  list: { overflow: 'hidden' },
  more: { alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  block: { paddingHorizontal: DK_SPACE.md, paddingVertical: 12, gap: 10 },
  logoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: DK_SPACE.md },
  logoBox: { width: 52, height: 52, borderRadius: 16, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImage: { width: 52, height: 52 },
});
