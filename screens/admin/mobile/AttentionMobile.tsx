import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, DriverPage, EmptyPanel, ErrorPanel, HeroTitle, ListRow, LoadingPanel, Pressy, Reveal, STATUS, Surface, relativeDays, type Status } from '../../../components/driverKit';
import type { AttentionDetails } from '../../../lib/adminApi';
import { formatDate, expiryState } from '../../../lib/theme';
import { formatPlate } from '../../../lib/plate';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  insetTop: number;
  insetBottom: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  details: AttentionDetails | null;
  onBack: () => void;
  onRetry: () => void;
  onRefresh: () => void;
  onHome: () => void;
  onOpenDriver: (id: string) => void;
  onOpenVehicle: (id: string) => void;
  onOpenLicenseDocs: (driverId: string) => void;
};

type Row = { key: string; title: string; detail: string; status: Status; onPress: () => void };
type Group = { key: string; icon: IconName; title: string; hint: string; status: Status; rows: Row[] };

const PREVIEW = 4;

/**
 * What in the fleet is waiting on the manager, most urgent first. Every
 * group names the drivers or vehicles behind its count, and each one opens
 * straight to where it's fixed.
 */
export function AttentionMobile(p: Props) {
  const d = p.details;
  const groups: Group[] = d
    ? [
        {
          key: 'license',
          icon: 'id-card',
          title: 'רישיונות נהיגה',
          hint: 'פגו או יפוגו בתוך 30 יום',
          status: d.licenseDrivers.some((x) => expiryState(x.license_expiry) === 'expired') ? 'expired' : 'soon',
          rows: d.licenseDrivers.map((x) => {
            const expired = expiryState(x.license_expiry) === 'expired';
            return {
              key: x.id,
              title: x.full_name ?? 'ללא שם',
              detail: `${expired ? 'פג' : 'יפוג'} ${formatDate(x.license_expiry)} · ${relativeDays(x.license_expiry) ?? ''}`,
              status: expired ? 'expired' : 'soon',
              onPress: () => p.onOpenDriver(x.id),
            };
          }),
        },
        {
          key: 'insurance',
          icon: 'shield',
          title: 'ביטוח חובה',
          hint: 'חסר או שתוקפו פג — הרכב לא אמור לנסוע',
          status: 'expired',
          rows: d.insuranceVehicles.map(({ vehicle, expiry }) => ({
            key: vehicle.id,
            title: `${formatPlate(vehicle.plate_number)}${vehicle.manufacturer || vehicle.model ? ` · ${[vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ')}` : ''}`,
            detail: expiry ? `פג ${formatDate(expiry)} · ${relativeDays(expiry) ?? ''}` : 'לא הוזן ביטוח',
            status: 'expired',
            onPress: () => p.onOpenVehicle(vehicle.id),
          })),
        },
        {
          key: 'unassigned',
          icon: 'car-sport',
          title: 'רכבים ללא נהג',
          hint: 'אין לרכב שיוך פעיל — כדאי לשייך נהג',
          status: 'soon',
          rows: d.unassignedVehicles.map((vehicle) => ({
            key: vehicle.id,
            title: formatPlate(vehicle.plate_number),
            detail: [vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ') || 'ללא דגם',
            status: 'soon',
            onPress: () => p.onOpenVehicle(vehicle.id),
          })),
        },
        {
          key: 'docs',
          icon: 'document-text',
          title: 'רישיונות לא מאומתים',
          hint: 'חסר צילום של הרישיון או תאריך התוקף',
          status: 'missing',
          rows: d.missingLicenseDocuments.map(({ driver, missing }) => ({
            key: driver.id,
            title: driver.full_name ?? 'ללא שם',
            detail: `חסר: ${missing.join(', ')}`,
            status: 'missing',
            onPress: () => p.onOpenLicenseDocs(driver.id),
          })),
        },
      ].filter((g) => g.rows.length > 0) as Group[]
    : [];
  const total = groups.reduce((sum, g) => sum + g.rows.length, 0);
  const subtitle = p.loading ? 'בודק את הצי…' : p.error ? 'הבדיקה לא הושלמה' : total ? `${total} ${total === 1 ? 'פריט מחכה' : 'פריטים מחכים'} לטיפול שלך` : 'הכול מטופל';

  return (
    <DriverPage
      insetTop={p.insetTop}
      insetBottom={p.insetBottom}
      refreshing={p.refreshing}
      onRefresh={p.onRefresh}
      hero={<HeroTitle title="דורש טיפול" subtitle={subtitle} onBack={p.onBack} />}
    >
      {p.loading ? (
        <LoadingPanel />
      ) : p.error ? (
        <ErrorPanel message="טעינת המשימות נכשלה" hint={p.error} onRetry={p.onRetry} />
      ) : total === 0 ? (
        <Reveal>
          <EmptyPanel
            icon="checkmark-done"
            tone="ok"
            title="הכול מטופל"
            body="כל הרישיונות והביטוחים בתוקף, ולכל רכב יש נהג. כשמשהו ידרוש טיפול — הוא יופיע כאן."
            action={{ label: 'חזרה לצי', icon: 'home', onPress: p.onHome }}
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
        </>
      )}
    </DriverPage>
  );
}

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
        <Pressy onPress={() => setOpen((v) => !v)} accessibilityLabel={open ? 'הצגת פחות' : `הצגת עוד ${more}`} style={styles.more}>
          <DKText variant="label" color={DK.accent}>
            {open ? 'הצגת פחות' : `הצגת עוד ${more}`}
          </DKText>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={DK.accent} />
        </Pressy>
      )}
    </Surface>
  );
}

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
