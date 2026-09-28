import React, { useEffect, useRef, useState } from 'react';
import { LayoutAnimation, Platform, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DK_FONT, DK_SPACE, DKText, DriverPage, HeroTitle, Pressy, Reveal, Surface, useReducedMotion } from '../components/driverKit';
import { BrandLoader } from '../components/ui/BrandLoader';
import { ErrorState, LoadingState } from '../components/ui';
import { LiquidGlassSwitch } from '../components/ui/LiquidGlassSwitch';
import {
  LEAD_RULES,
  leadPhrase,
  leadStepLabels,
  leadUnitWord,
  notificationGroups,
  type LeadRule,
  type NotificationGroup,
  type NotificationType,
  type NotificationTypeInfo,
  withoutValidity,
} from '../lib/notificationPreferencesApi';
import type { NotificationPreferencesState } from '../lib/useNotificationPreferences';
import { isVehicleFolderNotification } from '../lib/vehicleFolderAlerts';
import { t, getLocale } from '../lib/i18n';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  insetTop: number;
  insetBottom: number;
  state: NotificationPreferencesState;
  onBack: () => void;
};

const ICON: Partial<Record<NotificationType, IconName>> = {
  driver_profile_update: 'person',
  driver_document_upload: 'document-text',
  license_update_requested: 'id-card',
  license_update_reviewed: 'id-card',
  signature_request_completed: 'checkmark-done',
  signature_request_assigned: 'create',
  vehicle_assignment: 'car-sport',
  driver_profile_updated_by_manager: 'person',
  driver_license_expiry: 'id-card',
  company_carrier_license_expiry: 'business',
  vehicle_license_expiry: 'card',
  vehicle_operating_license_expiry: 'briefcase',
  vehicle_insurance_mandatory_expiry: 'shield',
  vehicle_insurance_comprehensive_expiry: 'shield-checkmark',
  vehicle_annual_test_expiry: 'construct',
  vehicle_safety_officer_approval_expiry: 'ribbon',
  vehicle_tachograph_calibration_expiry: 'speedometer',
  vehicle_brakes_semiannual_expiry: 'disc',
  vehicle_brakes_annual_expiry: 'disc',
  vehicle_winter_inspection_expiry: 'snow',
  vehicle_child_detection_expiry: 'happy',
  vehicle_service_due: 'build',
  vehicle_odometer_stale: 'speedometer',
  driver_meeting_due: 'people',
  vehicle_safety_check_due: 'shield-checkmark',
};

const shortLabel = withoutValidity;

const animateNext = () => {
  if (Platform.OS === 'ios') LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
};

/**
 * Which updates reach this user, and — for managers — when each timed one
 * goes out. Switches are per user; lead times are per company. Every change
 * saves on its own.
 */
export function NotificationPrefsMobile({ insetTop, insetBottom, state, onBack }: Props) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState<NotificationType | null>(null);
  const groups = notificationGroups(state.visibleTypes, state.isDriver, state.isOwner);
  const on = state.visibleTypes.filter((entry) => state.prefs?.[entry.type] ?? true).length;
  const canEditLeads = !state.isDriver && !!state.leads;

  const toggleOpen = (type: NotificationType) => {
    if (!reduceMotion) animateNext();
    setOpen((current) => (current === type ? null : type));
  };

  return (
    <DriverPage
      insetTop={insetTop}
      insetBottom={insetBottom}
      hero={
        <HeroTitle
          title={t('owner.notif.manage')}
          subtitle={state.loading || state.error ? t('owner.notif.manageHint') : t('prefs.activeOfTotal', { on, length: state.visibleTypes.length })}
          onBack={onBack}
        />
      }
    >
      {state.loading ? (
        <Surface>
          <LoadingState />
        </Surface>
      ) : state.error ? (
        <Surface>
          <ErrorState message={state.error} onRetry={state.load} />
        </Surface>
      ) : (
        <>
          <Reveal index={0}>
            <Surface style={styles.intro}>
              <View style={styles.introRow}>
                <View style={styles.introIcon}>
                  <Ionicons name="toggle" size={18} color={DK.accent} />
                </View>
                <DKText variant="caption" color={DK.inkSoft} style={styles.flex}>
                  {t('prefs.eachSwitchYouOnly')}
                </DKText>
              </View>
              {canEditLeads && (
                <View style={styles.introRow}>
                  <View style={styles.introIcon}>
                    <Ionicons name="time" size={18} color={DK.accent} />
                  </View>
                  <DKText variant="caption" color={DK.inkSoft} style={styles.flex}>
                    {t('prefs.tapTimingCompany')}
                  </DKText>
                </View>
              )}
            </Surface>
          </Reveal>

          {groups.map((group, index) => (
            <Group
              key={group.key}
              group={group}
              index={index + 1}
              state={state}
              canEditLeads={canEditLeads}
              open={open}
              onToggleOpen={toggleOpen}
              reduceMotion={reduceMotion}
            />
          ))}

          {canEditLeads && !state.leads!.perType && (
            <View style={styles.note}>
              <Ionicons name="information-circle" size={15} color={DK.muted} />
              <DKText variant="caption" color={DK.muted} style={styles.flex}>
                {t('prefs.sharedTimingNow')}
              </DKText>
            </View>
          )}
        </>
      )}
    </DriverPage>
  );
}

function Group({
  group,
  index,
  state,
  canEditLeads,
  open,
  onToggleOpen,
  reduceMotion,
}: {
  group: NotificationGroup;
  index: number;
  state: NotificationPreferencesState;
  canEditLeads: boolean;
  open: NotificationType | null;
  onToggleOpen: (type: NotificationType) => void;
  reduceMotion: boolean;
}) {
  const on = group.items.filter((entry) => state.prefs?.[entry.type] ?? true).length;
  const allOn = on === group.items.length;
  const folderLeads = group.key === 'folders' && canEditLeads;
  const folderValues = group.items.map((entry) => state.leads?.values[entry.type]);
  const sharedFolderValue = folderValues.every((v) => v === folderValues[0]) ? folderValues[0] : undefined;

  const toggleAll = async () => {
    const next = !allOn;
    for (const item of group.items) {
      if ((state.prefs?.[item.type] ?? true) !== next && !(await state.toggle(item.type, next))) return;
    }
  };

  const setAll = async (days: number) => {
    if (!state.leads) return;
    if (!state.leads.perType) {
      await state.setLead(group.items[0].type, days);
      return;
    }
    for (const item of group.items) {
      if (!(await state.setLead(item.type, days))) return;
    }
  };

  return (
    <Reveal index={index}>
      <View style={styles.groupHead}>
        <DKText variant="heading" accessibilityRole="header">
          {group.title}
        </DKText>
        <View style={styles.count}>
          <DKText variant="micro" color={DK.accent}>{`${on}/${group.items.length}`}</DKText>
        </View>
        <View style={styles.flex} />
        {group.items.length > 2 && (
          <Pressy onPress={() => void toggleAll()} disabled={state.savingType != null} style={styles.linkButton} accessibilityLabel={t('prefs.toggleAllIn', { v1: allOn ? t('prefs.turnOff') : t('prefs.turnOn'), title: group.title })}>
            <DKText variant="caption" color={DK.accent}>
              {allOn ? t('notifications.turnAllOff') : t('notifications.turnAllOn')}
            </DKText>
          </Pressy>
        )}
      </View>
      {!!group.subtitle && (
        <DKText variant="caption" color={DK.muted} style={styles.groupSubtitle}>
          {group.subtitle}
        </DKText>
      )}

      {folderLeads && (
        <View style={styles.bulkWrap}>
          <DKText variant="micro" color={DK.muted} style={styles.bulkLabel}>
            {t('prefs.oneTimingAll')}
          </DKText>
          <View style={styles.bulk}>
          {LEAD_RULES.vehicle_license_expiry!.presets.map((days) => {
            const active = sharedFolderValue === days;
            return (
              <Pressy
                key={days}
                onPress={() => void setAll(days)}
                disabled={state.savingLeadType != null}
                haptic
                style={[styles.chip, active && styles.chipActive]}
                accessibilityLabel={t('notifications.daysBeforeAllFolders', { days })}
              >
                <DKText variant="label" color={active ? '#FFFFFF' : DK.inkSoft}>{t('common.daysValue', { days })}</DKText>
              </Pressy>
            );
          })}
          </View>
        </View>
      )}

      <Surface>
        {group.items.map((item, i) => (
          <Row
            key={item.type}
            item={item}
            first={i === 0}
            compact={!!group.compact}
            state={state}
            canEditLeads={canEditLeads}
            open={open === item.type}
            onToggleOpen={() => onToggleOpen(item.type)}
            reduceMotion={reduceMotion}
          />
        ))}
      </Surface>
    </Reveal>
  );
}

function Row({
  item,
  first,
  compact,
  state,
  canEditLeads,
  open,
  onToggleOpen,
  reduceMotion,
}: {
  item: NotificationTypeInfo;
  first: boolean;
  compact: boolean;
  state: NotificationPreferencesState;
  canEditLeads: boolean;
  open: boolean;
  onToggleOpen: () => void;
  reduceMotion: boolean;
}) {
  const value = state.prefs?.[item.type] ?? true;
  const rule = LEAD_RULES[item.type];
  const leadValue = state.leads?.values[item.type];
  const leadEditable = canEditLeads && !!rule && leadValue != null && (state.leads!.perType || isVehicleFolderNotification(item.type));
  const label = compact ? shortLabel(item.label) : item.label;
  const saving = state.savingLeadType === item.type;

  return (
    <View style={[styles.row, !first && styles.divider]}>
      <View style={styles.rowTop}>
        <View style={[styles.icon, !value && styles.iconOff]}>
          <Ionicons name={ICON[item.type] ?? 'notifications'} size={19} color={value ? DK.accent : DK.faint} />
        </View>
        <View style={styles.text}>
          <DKText variant="label" color={value ? DK.ink : DK.muted}>
            {label}
          </DKText>
          {!compact && !!item.description && (
            <DKText variant="caption" color={DK.muted}>
              {item.description}
            </DKText>
          )}
          {leadEditable && (
            <Pressy
              onPress={onToggleOpen}
              style={[styles.leadPill, open && styles.leadPillOpen, !value && styles.dim]}
              pressScale={0.95}
              accessibilityLabel={t('prefs.timingLabel', { label, v1: leadPhrase(leadValue!, rule!), v2: open ? t('common.close') : t('common.change') })}
            >
              <Ionicons name="time" size={14} color={open ? '#FFFFFF' : DK.accent} />
              <DKText variant="micro" color={open ? '#FFFFFF' : DK.accent} style={styles.leadPillText}>
                {leadPhrase(leadValue!, rule!)}
              </DKText>
              {saving ? (
                <BrandLoader size={12} color={open ? '#FFFFFF' : DK.accent} />
              ) : (
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={open ? '#FFFFFF' : DK.accent} />
              )}
            </Pressy>
          )}
        </View>
        <LiquidGlassSwitch
          value={value}
          onValueChange={(next) => void state.toggle(item.type, next)}
          disabled={state.savingType === item.type}
          accessibilityLabel={label}
          tint={DK.accent}
          reduceMotion={reduceMotion}
        />
      </View>
      {leadEditable && open && (
        <LeadEditor label={label} rule={rule!} value={leadValue!} onCommit={(next) => state.setLead(item.type, next)} />
      )}
    </View>
  );
}

/**
 * − value + with the unit in words, then a few one-tap values. Steps and
 * typing settle for a moment before saving; closing the editor saves too.
 */
function LeadEditor({ label, rule, value, onCommit }: { label: string; rule: LeadRule; value: number; onCommit: (value: number) => Promise<boolean> }) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ draft, value, onCommit });
  latest.current = { draft, value, onCommit };

  const clamp = (n: number) => Math.max(rule.min, Math.min(rule.max, Math.round(n / rule.step) * rule.step));

  const commit = (raw: string) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const n = Number(raw);
    if (!raw || !Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const next = clamp(n);
    setDraft(String(next));
    if (next !== value) void onCommit(next);
  };

  useEffect(() => {
    if (!focused && !timer.current) setDraft(String(value));
  }, [value, focused]);

  // Closing with a change still waiting saves it.
  useEffect(
    () => () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      const { draft: pending, value: saved, onCommit: save } = latest.current;
      const n = Number(pending);
      if (pending && Number.isFinite(n)) {
        const next = Math.max(rule.min, Math.min(rule.max, Math.round(n / rule.step) * rule.step));
        if (next !== saved) void save(next);
      }
    },
    [rule],
  );

  const schedule = (raw: string) => {
    setDraft(raw);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(raw), 700);
  };

  const current = Number(draft) || value;
  const step = (dir: 1 | -1) => schedule(String(clamp(current + dir * rule.step)));
  const labels = leadStepLabels(rule);
  const wide = rule.unit === 'km';

  return (
    <View style={styles.editor}>
      <View style={styles.stepper}>
        <Pressy
          onPress={() => step(1)}
          disabled={current >= rule.max}
          haptic
          pressScale={0.9}
          style={[styles.stepBtn, current >= rule.max && styles.dim]}
          accessibilityLabel={`${label}: ${labels.up}`}
        >
          <Ionicons name="add" size={22} color={DK.accent} />
        </Pressy>
        <View style={styles.valueBox}>
          <TextInput
            value={draft}
            onChangeText={(v) => schedule(v.replace(/\D/g, '').slice(0, wide ? 4 : 2))}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              commit(draft);
            }}
            onSubmitEditing={() => commit(draft)}
            keyboardType="number-pad"
            returnKeyType="done"
            selectTextOnFocus
            accessibilityLabel={`${label}: ${leadUnitWord(current, rule)}`}
            style={[styles.valueInput, wide && styles.valueInputWide]}
          />
          <DKText variant="caption" color={DK.muted} numberOfLines={1}>
            {leadUnitWord(current, rule)}
          </DKText>
        </View>
        <Pressy
          onPress={() => step(-1)}
          disabled={current <= rule.min}
          haptic
          pressScale={0.9}
          style={[styles.stepBtn, current <= rule.min && styles.dim]}
          accessibilityLabel={`${label}: ${labels.down}`}
        >
          <Ionicons name="remove" size={22} color={DK.accent} />
        </Pressy>
      </View>
      <View style={styles.presets}>
        {rule.presets.map((preset) => {
          const active = current === preset;
          return (
            <Pressy
              key={preset}
              onPress={() => commit(String(preset))}
              haptic
              style={[styles.preset, active && styles.chipActive]}
              accessibilityLabel={`${label}: ${leadPhrase(preset, rule)}`}
            >
              <DKText variant="label" color={active ? '#FFFFFF' : DK.inkSoft}>
                {rule.unit === 'km' ? preset.toLocaleString(getLocale()) : String(preset)}
              </DKText>
            </Pressy>
          );
        })}
      </View>
      {rule.unit === 'days' && (
        <DKText variant="caption" color={DK.muted} style={styles.editorHint}>
          {t('prefs.andOnDayAllCompany')}
        </DKText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dim: { opacity: 0.45 },
  intro: { padding: DK_SPACE.md, gap: 10 },
  introRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  introIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  groupHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 6, marginBottom: 4, minHeight: 36 },
  groupSubtitle: { paddingHorizontal: 6, marginBottom: 8 },
  count: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: DK.accentSoft },
  linkButton: { paddingHorizontal: 10, minHeight: 36, justifyContent: 'center' },
  bulkWrap: { marginBottom: 10, gap: 6 },
  bulkLabel: { paddingHorizontal: 6 },
  bulk: { flexDirection: 'row-reverse', gap: 8 },
  chip: { flex: 1, minHeight: 40, paddingHorizontal: 8, borderRadius: 999, backgroundColor: DK.surface, borderWidth: 1, borderColor: DK.hairline, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: DK.accent, borderColor: DK.accent },
  row: { paddingHorizontal: DK_SPACE.md, paddingVertical: 12 },
  rowTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 48 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: DK.accentSoft },
  iconOff: { backgroundColor: DK.surfaceSunk },
  text: { flex: 1, gap: 3, alignItems: 'flex-end' },
  leadPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: DK.accentSoft,
    alignSelf: 'flex-end',
  },
  leadPillOpen: { backgroundColor: DK.accent },
  leadPillText: { fontSize: 12.5 },
  editor: { marginTop: 12, padding: 14, borderRadius: 18, backgroundColor: DK.surfaceSunk, gap: 12 },
  stepper: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  stepBtn: { width: 48, height: 48, borderRadius: 16, backgroundColor: DK.surface, borderWidth: 1, borderColor: DK.hairline, alignItems: 'center', justifyContent: 'center' },
  valueBox: { flex: 1, alignItems: 'center', gap: 0 },
  valueInput: { fontFamily: DK_FONT.numeric, fontSize: 30, lineHeight: 36, color: DK.ink, textAlign: 'center', minWidth: 64, paddingVertical: 0, fontVariant: ['tabular-nums'] },
  valueInputWide: { minWidth: 100 },
  presets: { flexDirection: 'row-reverse', gap: 8 },
  preset: { flex: 1, minHeight: 40, borderRadius: 12, backgroundColor: DK.surface, borderWidth: 1, borderColor: DK.hairline, alignItems: 'center', justifyContent: 'center' },
  editorHint: { textAlign: 'center' },
  note: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: DK_SPACE.sm },
});
