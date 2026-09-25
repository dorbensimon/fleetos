import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DK_SPACE, DKText, DriverPage, HeroTitle, Reveal, Surface } from '../../components/driverKit';
import { ErrorState, LoadingState } from '../../components/ui';
import { LiquidGlassSwitch } from '../../components/ui/LiquidGlassSwitch';
import type { NotificationPreferencesMap, NotificationType } from '../../lib/notificationPreferencesApi';

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
};

function iconFor(type: string): IconName {
  if (type === 'signature_request_assigned') return 'create';
  if (type === 'vehicle_assignment') return 'car-sport';
  if (type === 'driver_profile_updated_by_manager') return 'person';
  return 'time';
}

/**
 * Which updates reach the driver. Personal updates first; the vehicle's
 * expiry alerts grouped below them. Every switch saves on its own.
 */
export function DriverNotificationPrefsMobile(p: Props) {
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
          {group('עדכונים אליי', personal, 0)}
          {group('תוקף מסמכי הרכב', vehicle, 1)}
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

const styles = StyleSheet.create({
  groupTitle: { paddingHorizontal: 6, marginBottom: 8 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: DK_SPACE.md, paddingVertical: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: DK.accentSoft },
  iconOff: { backgroundColor: DK.surfaceSunk },
  text: { flex: 1, gap: 2 },
  note: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: DK_SPACE.sm },
  noteText: { flex: 1 },
});
