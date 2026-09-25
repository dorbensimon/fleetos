import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK, DKText, KitInput, PrimaryAction, Pressy, STATUS, SheetActions } from '../../../components/driverKit';
import { BrandLoader } from '../../../components/ui/BrandLoader';
import type { SigningTemplate } from '../../../lib/docuseal';
import { driversCount, loadSendRecipients, recipientNote, sendToRecipients, type SendOutcome, type SendRecipient } from '../../../lib/signingSend';

/**
 * "שליחה לנהגים" on the phone: the desktop sheet's flow (lib/signingSend.ts)
 * in the kit. It lives inside the document's sheet rather than a sheet of its
 * own, so iOS never has to present one modal while another is closing.
 */
export function useSendToDrivers(companyId: string, template: SigningTemplate | null) {
  const [drivers, setDrivers] = useState<SendRecipient[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const templateId = template?.id;

  useEffect(() => {
    setDrivers(null);
    setLoadError(false);
    setQuery('');
    setPicked(new Set());
    setProgress(null);
    setOutcome(null);
    if (!templateId) return;
    let cancelled = false;
    loadSendRecipients(companyId, templateId)
      .then((rows) => !cancelled && setDrivers(rows))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [companyId, templateId]);

  const visible = useMemo(() => {
    const q = query.trim();
    return (drivers ?? []).filter((d) => !q || d.name.includes(q));
  }, [drivers, query]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    const targets = (drivers ?? []).filter((d) => picked.has(d.id));
    if (!templateId || !targets.length) return;
    setProgress({ done: 0, total: targets.length });
    setOutcome(await sendToRecipients(companyId, templateId, targets, (done, total) => setProgress({ done, total })));
  };

  return {
    drivers,
    loadError,
    query,
    setQuery,
    picked,
    setPicked,
    toggle,
    visible,
    progress,
    outcome,
    sending: progress !== null && outcome === null,
    send,
  };
}

export type SendState = ReturnType<typeof useSendToDrivers>;

export function SendBody({ s }: { s: SendState }) {
  if (s.outcome) {
    const ok = s.outcome.sent > 0;
    const tone = ok ? STATUS.ok : STATUS.expired;
    return (
      <View style={styles.result} accessibilityLiveRegion="polite">
        <View style={[styles.resultIcon, { backgroundColor: tone.soft }]}>
          <Ionicons name={ok ? 'checkmark' : 'alert'} size={30} color={tone.fg} />
        </View>
        <DKText variant="heading" style={styles.center}>
          {ok ? `המסמך נשלח ל-${driversCount(s.outcome.sent)}` : 'המסמך לא נשלח'}
        </DKText>
        {ok && (
          <DKText variant="body" color={DK.muted} style={styles.center}>
            הנהגים יראו אותו באפליקציה, ואחרי החתימה הוא יישמר בתיק של כל נהג.
          </DKText>
        )}
        {s.outcome.failed.length > 0 && (
          <View style={styles.failed}>
            <DKText variant="label" color={STATUS.expired.fg}>
              {s.outcome.failed.length === 1 ? 'לנהג אחד לא נשלח:' : `ל-${s.outcome.failed.length} נהגים לא נשלח:`}
            </DKText>
            {s.outcome.failed.map((f) => (
              <DKText key={f.name} variant="caption" color={STATUS.expired.fg}>
                {f.name} – {f.reason}
              </DKText>
            ))}
          </View>
        )}
      </View>
    );
  }
  if (s.loadError) {
    return (
      <DKText variant="body" color={STATUS.expired.fg} style={styles.center}>
        לא הצלחנו לטעון את רשימת הנהגים. סגרו ונסו שוב בעוד רגע.
      </DKText>
    );
  }
  if (!s.drivers) {
    return (
      <View style={styles.loading} accessibilityLabel="טוען נהגים">
        <BrandLoader size={34} />
      </View>
    );
  }
  if (!s.drivers.length) {
    return (
      <DKText variant="body" color={DK.muted} style={styles.center}>
        אין עדיין נהגים פעילים בחברה.
      </DKText>
    );
  }
  const notYet = s.drivers.filter((d) => d.state === 'none');
  return (
    <View style={styles.pick}>
      <View style={styles.quick}>
        <QuickChip icon="people" label={`כל הנהגים (${s.drivers.length})`} disabled={s.sending} onPress={() => s.setPicked(new Set(s.drivers!.map((d) => d.id)))} />
        {notYet.length > 0 && notYet.length !== s.drivers.length && (
          <QuickChip label={`רק מי שעוד לא קיבל (${notYet.length})`} disabled={s.sending} onPress={() => s.setPicked(new Set(notYet.map((d) => d.id)))} />
        )}
        {s.picked.size > 0 && <QuickChip label="ניקוי הבחירה" muted disabled={s.sending} onPress={() => s.setPicked(new Set())} />}
      </View>
      {s.drivers.length > 6 && (
        <KitInput value={s.query} onChangeText={s.setQuery} placeholder="חיפוש נהג לפי שם" accessibilityLabel="חיפוש נהג לפי שם" returnKeyType="search" />
      )}
      <View style={styles.list}>
        {s.visible.map((d, index) => {
          const on = s.picked.has(d.id);
          const note = recipientNote(d, on);
          return (
            <Pressy
              key={d.id}
              onPress={() => s.toggle(d.id)}
              disabled={s.sending}
              accessibilityLabel={`${d.name}${note ? `, ${note}` : ''}, ${on ? 'נבחר' : 'לא נבחר'}`}
              pressScale={0.985}
            >
              <View style={[styles.driver, index > 0 && styles.divider, on && styles.driverOn]}>
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? DK.accent : DK.faint} />
                <View style={styles.flex}>
                  <DKText variant="label" numberOfLines={1}>
                    {d.name}
                  </DKText>
                  {!!note && (
                    <DKText variant="caption" color={d.state === 'signed' ? STATUS.ok.fg : STATUS.soon.fg}>
                      {note}
                    </DKText>
                  )}
                </View>
              </View>
            </Pressy>
          );
        })}
        {!s.visible.length && (
          <DKText variant="caption" color={DK.muted} style={styles.none}>
            לא נמצא נהג בשם הזה.
          </DKText>
        )}
      </View>
    </View>
  );
}

export function SendFooter({ s, onCancel, onDone }: { s: SendState; onCancel: () => void; onDone: () => void }) {
  if (s.outcome) return <PrimaryAction label="סיום" onPress={onDone} />;
  const count = s.picked.size;
  return (
    <SheetActions>
      <PrimaryAction label="חזרה" tone="ghost" onPress={onCancel} disabled={s.sending} style={styles.flex} />
      <PrimaryAction
        label={s.sending ? `שולח… ${s.progress!.done} מתוך ${s.progress!.total}` : count ? `שליחה ל-${driversCount(count)}` : 'בחרו נהגים'}
        icon={s.sending ? undefined : 'paper-plane'}
        onPress={() => void s.send()}
        disabled={!count || s.sending}
        style={styles.flex2}
      />
    </SheetActions>
  );
}

function QuickChip({ icon, label, muted, disabled, onPress }: { icon?: React.ComponentProps<typeof Ionicons>['name']; label: string; muted?: boolean; disabled?: boolean; onPress: () => void }) {
  const fg = muted ? DK.inkSoft : DK.accent;
  return (
    <Pressy onPress={onPress} disabled={disabled} accessibilityLabel={label} pressScale={0.95} style={[styles.chip, muted && styles.chipMuted]}>
      {!!icon && <Ionicons name={icon} size={16} color={fg} />}
      <DKText variant="label" color={fg}>
        {label}
      </DKText>
    </Pressy>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex2: { flex: 2 },
  center: { textAlign: 'center' },
  loading: { alignItems: 'center', paddingVertical: 28 },
  pick: { gap: 12 },
  quick: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: DK.accentSoft },
  chipMuted: { backgroundColor: DK.surfaceSunk },
  list: { borderRadius: 18, backgroundColor: DK.surfaceSunk, overflow: 'hidden' },
  driver: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 8 },
  driverOn: { backgroundColor: DK.accentSoft },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  none: { textAlign: 'center', padding: 16 },
  result: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  resultIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  failed: { alignSelf: 'stretch', gap: 4, padding: 14, borderRadius: 16, backgroundColor: STATUS.expired.soft },
});
