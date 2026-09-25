import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DK_SPACE, DKText, DriverPage, HeroTitle, KitInput, Pressy, Reveal, Surface } from '../components/driverKit';
import { BrandLoader } from '../components/ui/BrandLoader';
import { ErrorState, LoadingState } from '../components/ui';
import { LiquidGlassSwitch } from '../components/ui/LiquidGlassSwitch';
import type { NotificationPreferencesMap, NotificationType } from '../lib/notificationPreferencesApi';

type Pref = { type: NotificationType; label: string; description?: string };
type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  insetTop: number;
  insetBottom: number;
  loading: boolean;
  error: string | null;
  types: Pref[];
  prefs: NotificationPreferencesMap | null;
  savingType: NotificationType | null;
  onToggle: (type: NotificationType, value: boolean) => void;
  onBack: () => void;
  onRetry: () => void;
  /** Heading for the updates about people (the driver's own, or the drivers'). */
  personalTitle: string;
  /** Company-wide: how many days ahead expiry alerts go out (managers only). */
  lead?: {
    label: string;
    description: string;
    draft: string;
    onDraft: (value: string) => void;
    changed: boolean;
    saving: boolean;
    onSave: () => void;
  } | null;
};

function iconFor(type: string): IconName {
  if (type === 'signature_request_assigned') return 'create';
  if (type === 'vehicle_assignment') return 'car-sport';
  if (type === 'driver_profile_updated_by_manager' || type === 'driver_profile_update') return 'person';
  if (type === 'driver_odometer_update') return 'speedometer';
  if (type?.startsWith('license_update')) return 'id-card';
  if (type?.startsWith('driver_document')) return 'document-text';
  return 'time';
}

/**
 * Which updates reach the driver. Personal updates first; the vehicle's
 * expiry alerts grouped below them. Every switch saves on its own.
 */
export function NotificationPrefsMobile(p: Props) {
  const personal = p.types.filter((t) => !t.type.startsWith('vehicle_') || t.type === 'vehicle_assignment');
  const vehicle = p.types.filter((t) => t.type.startsWith('vehicle_') && t.type !== 'vehicle_assignment');
  const on = p.types.filter((t) => p.prefs?.[t.type] ?? true).length;

  const group = (title: string, rows: Pref[], index: number) =>
    rows.length > 0 && (
      <Reveal index={index}>
        {/* The first group rises over the hero's edge, where a label can't sit. */}
        {index > 0 && (
          <DKText variant="micro" color={DK.muted} style={styles.groupTitle} accessibilityRole="header">
            {title}
          </DKText>
        )}
        <Surface>
          {rows.map((item, i) => {
            const value = p.prefs?.[item.type] ?? true;
            return (
              <View key={item.type} style={[styles.row, i > 0 && styles.divider]}>
                <View style={[styles.icon, !value && styles.iconOff]}>
                  <Ionicons name={iconFor(item.type)} size={19} color={value ? DK.accent : DK.faint} />
                </View>
                <View style={styles.text}>
                  <DKText variant="label">{item.label}</DKText>
                  {!!item.description && (
                    <DKText variant="caption" color={DK.muted}>
                      {item.description}
                    </DKText>
                  )}
                </View>
                <LiquidGlassSwitch
                  value={value}
                  onValueChange={(next) => p.onToggle(item.type, next)}
                  disabled={p.savingType === item.type}
                  accessibilityLabel={item.label}
                  tint={DK.accent}
                />
              </View>
            );
          })}
        </Surface>
      </Reveal>
    );

  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      hero={
        <HeroTitle
          title="ניהול התראות"
          subtitle={p.loading || p.error ? 'בחירת העדכונים שיישלחו אליך' : `${on} מתוך ${p.types.length} סוגי עדכונים פעילים`}
          onBack={p.onBack}
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
          {group(p.personalTitle, personal, 0)}
          {group('תוקף מסמכי הרכב', vehicle, 1)}
          {!!p.lead && <LeadDays {...p.lead} />}
          <View style={styles.note}>
            <Ionicons name="checkmark-circle" size={15} color={DK.muted} />
            <DKText variant="caption" color={DK.muted} style={styles.noteText}>
              כל שינוי נשמר מיד ומשפיע רק עליך.
            </DKText>
          </View>
        </>
      )}
    </DriverPage>
  );
}

/** Company-wide lead time for expiry alerts: a stepper, and a save that appears once it changed. */
function LeadDays(lead: NonNullable<Props['lead']>) {
  const n = Number(lead.draft) || 0;
  const step = (delta: number) => lead.onDraft(String(Math.max(1, Math.min(99, n + delta))));
  return (
    <Reveal index={2}>
      <DKText variant="micro" color={DK.muted} style={styles.groupTitle} accessibilityRole="header">
        הגדרת חברה
      </DKText>
      <Surface style={styles.lead}>
        <View style={styles.text}>
          <DKText variant="label">{lead.label}</DKText>
          <DKText variant="caption" color={DK.muted}>
            {lead.description}
          </DKText>
        </View>
        <View style={styles.stepper}>
          <Pressy onPress={() => step(-1)} accessibilityLabel="פחות יום" style={styles.stepBtn} pressScale={0.9}>
            <Ionicons name="remove" size={20} color={DK.accent} />
          </Pressy>
          <KitInput
            value={lead.draft}
            onChangeText={(v) => lead.onDraft(v.replace(/\D/g, '').slice(0, 2))}
            keyboardType="number-pad"
            textAlign="center"
            accessibilityLabel={`${lead.label}, בימים`}
            style={styles.leadInput}
            editable={!lead.saving}
          />
          <Pressy onPress={() => step(1)} accessibilityLabel="יום נוסף" style={styles.stepBtn} pressScale={0.9}>
            <Ionicons name="add" size={20} color={DK.accent} />
          </Pressy>
          <DKText variant="label" color={DK.muted}>
            ימים
          </DKText>
        </View>
        {(lead.changed || lead.saving) && (
          <Pressy onPress={lead.onSave} disabled={lead.saving} haptic accessibilityLabel="שמירת זמן ההתראה" style={styles.leadSave}>
            {lead.saving ? (
              <BrandLoader size={20} color="#FFFFFF" />
            ) : (
              <DKText variant="label" color="#FFFFFF">
                שמירה
              </DKText>
            )}
          </Pressy>
        )}
      </Surface>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  lead: { padding: DK_SPACE.md, gap: 14 },
  stepper: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  stepBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  leadInput: { width: 70, textAlign: 'center', fontSize: 20 },
  leadSave: { minHeight: 50, borderRadius: 16, backgroundColor: DK.accent, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { paddingHorizontal: 6, marginBottom: 8 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: DK_SPACE.md, paddingVertical: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: DK.accentSoft },
  iconOff: { backgroundColor: DK.surfaceSunk },
  text: { flex: 1, gap: 2 },
  note: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: DK_SPACE.sm },
  noteText: { flex: 1 },
});
