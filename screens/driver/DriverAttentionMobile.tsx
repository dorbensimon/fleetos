import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DK_SPACE, DKText, DriverPage, HeroTitle, Pressy, Reveal, STATUS, Surface, relativeDays, type Status } from '../../components/driverKit';
import { ErrorState, LoadingState } from '../../components/ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type AttentionTask = {
  key: string;
  status: Status;
  icon: IconName;
  title: string;
  /** What happened, in plain words ("פג לפני 40 ימים"). */
  detail: string;
  /** What the driver should do about it. */
  hint: string;
  action: string;
  onPress: () => void;
};

type Props = {
  insetTop: number;
  insetBottom: number;
  loading: boolean;
  error: string;
  expired: AttentionTask[];
  signatures: AttentionTask[];
  soon: AttentionTask[];
  onBack: () => void;
  onRetry: () => void;
  onHome: () => void;
};

export function expiredDetail(date: string | null) {
  return relativeDays(date)?.replace(/^לפני/, 'פג לפני') ?? 'פג תוקף';
}

export function soonDetail(date: string | null) {
  const rel = relativeDays(date);
  return rel === 'היום' ? 'פג היום' : rel === 'מחר' ? 'פג מחר' : rel ? `פג ${rel}` : 'מתקרב';
}

/**
 * Everything that is waiting on the driver, in order of urgency: what has
 * already lapsed, the forms to sign, then what lapses soon. Each card says
 * what happened, what to do, and takes the driver straight there.
 */
export function DriverAttentionMobile(p: Props) {
  const open = p.expired.length + p.signatures.length;
  const subtitle = p.loading
    ? 'בודק מה מחכה לך…'
    : open
      ? `${open} ${open === 1 ? 'דבר מחכה' : 'דברים מחכים'} לטיפול שלך`
      : p.soon.length
        ? 'אין כרגע משהו דחוף'
        : 'הכול מטופל';

  let index = 0;
  const section = (title: string, tone: Status, tasks: AttentionTask[]) =>
    tasks.length > 0 && (
      <View style={styles.section}>
        <Reveal index={index++}>
          <View style={styles.sectionHead}>
            <DKText variant="heading" accessibilityRole="header">
              {title}
            </DKText>
            <View style={[styles.count, { backgroundColor: STATUS[tone].soft }]}>
              <DKText variant="micro" color={STATUS[tone].fg} ltr style={styles.countText}>
                {String(tasks.length)}
              </DKText>
            </View>
          </View>
        </Reveal>
        {tasks.map((task) => (
          <Reveal key={task.key} index={index++}>
            <TaskCard task={task} />
          </Reveal>
        ))}
      </View>
    );

  return (
    <DriverPage insetTop={p.insetTop} insetBottom={p.insetBottom} hero={<HeroTitle title="דורש טיפול" subtitle={subtitle} onBack={p.onBack} />}>
      {p.loading ? (
        <Surface>
          <LoadingState />
        </Surface>
      ) : p.error ? (
        <Surface>
          <ErrorState message={p.error} onRetry={p.onRetry} />
        </Surface>
      ) : open + p.soon.length === 0 ? (
        <Reveal>
          <Surface style={styles.done}>
            <View style={styles.doneIcon}>
              <Ionicons name="checkmark-done" size={32} color={STATUS.ok.fg} />
            </View>
            <DKText variant="title" style={styles.center}>
              הכול מטופל
            </DKText>
            <DKText variant="body" color={DK.muted} style={styles.center}>
              אין מסמכים לחתימה ושום דבר לא פג תוקף. כשמשהו ידרוש טיפול — הוא יופיע כאן.
            </DKText>
            <Pressy onPress={p.onHome} accessibilityLabel="חזרה למסך הבית" style={styles.doneAction}>
              <DKText variant="label" color={DK.accent}>
                חזרה לבית
              </DKText>
            </Pressy>
          </Surface>
        </Reveal>
      ) : (
        <>
          <Reveal index={index++}>
            <Surface style={styles.tally}>
              <Tally count={p.expired.length} label="פג תוקף" tone="expired" />
              <View style={styles.tallyRule} />
              <Tally count={p.signatures.length} label="לחתימה" tone="soon" />
              <View style={styles.tallyRule} />
              <Tally count={p.soon.length} label="פג בקרוב" tone="missing" />
            </Surface>
          </Reveal>
          {section('פג תוקף', 'expired', p.expired)}
          {section('מחכים לחתימה שלך', 'soon', p.signatures)}
          {section('פג בקרוב', 'soon', p.soon)}
        </>
      )}
    </DriverPage>
  );
}

function Tally({ count, label, tone }: { count: number; label: string; tone: Status }) {
  const active = count > 0;
  return (
    <View style={styles.tallyItem} accessible accessibilityLabel={`${label}: ${count}`}>
      <DKText variant="title" color={active ? (tone === 'missing' ? DK.ink : STATUS[tone].fg) : DK.faint} style={styles.center}>
        {String(count)}
      </DKText>
      <DKText variant="caption" color={active ? DK.inkSoft : DK.faint} style={styles.center}>
        {label}
      </DKText>
    </View>
  );
}

function TaskCard({ task }: { task: AttentionTask }) {
  const s = STATUS[task.status];
  return (
    <Pressy onPress={task.onPress} accessibilityLabel={`${task.title}, ${task.detail}. ${task.hint}`} accessibilityHint={task.action} pressScale={0.98}>
      <Surface style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.icon, { backgroundColor: s.soft }]}>
            <Ionicons name={task.icon} size={22} color={s.fg} />
          </View>
          <View style={styles.cardText}>
            <DKText variant="heading" numberOfLines={2}>
              {task.title}
            </DKText>
            <DKText variant="caption" color={s.fg}>
              {task.detail}
            </DKText>
          </View>
        </View>
        <DKText variant="caption" color={DK.muted} style={styles.hint}>
          {task.hint}
        </DKText>
        <View style={[styles.cta, { backgroundColor: task.status === 'expired' ? STATUS.expired.soft : DK.accentSoft }]}>
          <DKText variant="label" color={task.status === 'expired' ? STATUS.expired.fg : DK.accent}>
            {task.action}
          </DKText>
          <Ionicons name="chevron-back" size={17} color={task.status === 'expired' ? STATUS.expired.fg : DK.accent} />
        </View>
      </Surface>
    </Pressy>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  section: { gap: 12 },
  tally: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 14 },
  tallyItem: { flex: 1, gap: 2 },
  tallyRule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: DK.hairline },
  sectionHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  count: { minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  countText: { textAlign: 'center' },
  card: { padding: DK_SPACE.md, gap: 12 },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 2 },
  hint: {},
  cta: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 16, borderRadius: 14 },
  done: { alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 26 },
  doneIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: STATUS.ok.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  doneAction: { marginTop: 6, minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
