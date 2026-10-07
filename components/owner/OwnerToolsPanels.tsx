import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DText, HoverPressable } from '../desktop/primitives';
import { DESKTOP_BRAND_SHADOW, DESKTOP_COLORS, DESKTOP_TONES, webOnly } from '../desktop/desktopTheme';
import { BrandLoader } from '../ui/BrandLoader';
import { formatMoney } from '../../lib/companyAccount';
import { formatDate } from '../../lib/theme';
import { showAlert } from '../../lib/platformAlert';
import { getLocale, t } from '../../lib/i18n';
import {
  endAnnouncements,
  isLive,
  listAnnouncements,
  listPaymentsSince,
  monthKey,
  paidByMonth,
  publishAnnouncement,
  type Announcement,
} from '../../lib/ownerTools';

/**
 * Two of the owner's console panels: the message shown to every company's
 * managers, and the money that actually came in, month by month, next to what
 * the subscriptions say should come in.
 */

const TABULAR = webOnly({ fontVariantNumeric: 'tabular-nums' });
const DURATIONS: { days: number | null; label: () => string }[] = [
  { days: 1, label: () => t('ownerTools.forDay') },
  { days: 7, label: () => t('ownerTools.forWeek') },
  { days: 30, label: () => t('ownerTools.forMonth30') },
  { days: null, label: () => t('ownerTools.untilRemoved') },
];

function Choice<T>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.choice} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <HoverPressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[styles.choiceItem, on && styles.choiceOn]}
            hoverStyle={on ? undefined : styles.choiceHover}
            onPress={() => onChange(o.value)}
          >
            <DText weight="semiBold" style={[styles.choiceText, on && styles.choiceTextOn]} numberOfLines={1}>{o.label}</DText>
          </HoverPressable>
        );
      })}
    </View>
  );
}

export function AnnouncementPanel() {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<Announcement['tone']>('info');
  const [audience, setAudience] = useState<Announcement['audience']>('admins');
  const [days, setDays] = useState<number | null>(7);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);

  const load = useCallback(() => listAnnouncements().then(setItems, () => setItems([])), []);
  useEffect(() => {
    void load();
  }, [load]);

  const live = (items ?? []).find((a) => isLive(a)) ?? null;

  const publish = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      await publishAnnouncement({ message, tone, audience, days });
      setMessage('');
      await load();
    } catch {
      showAlert(t('common.updateFailed'), t('common.tryAgainShortly'));
    } finally {
      setBusy(false);
    }
  };

  const end = () =>
    showAlert(t('ownerTools.endAnnouncementTitle'), t('ownerTools.endAnnouncementBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('ownerTools.endAnnouncement'),
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void endAnnouncements()
            .then(load, () => showAlert(t('common.updateFailed'), t('common.tryAgainShortly')))
            .finally(() => setBusy(false));
        },
      },
    ]);

  return (
    <View style={styles.panel}>
      <View style={styles.titleRow}>
        <DText weight="bold" style={styles.title} accessibilityRole="header">{t('ownerTools.announcementTitle')}</DText>
        {live && (
          <View style={[styles.liveBadge]}>
            <View style={styles.liveDot} />
            <DText weight="bold" style={styles.liveText}>{t('ownerTools.live')}</DText>
          </View>
        )}
      </View>
      {items == null ? (
        <View style={styles.loading}><BrandLoader size="small" color={DESKTOP_COLORS.brand} /></View>
      ) : live ? (
        <View style={styles.body}>
          <View style={[styles.preview, live.tone === 'warn' ? styles.previewWarn : styles.previewInfo]}>
            <Ionicons name={live.tone === 'warn' ? 'warning' : 'megaphone'} size={16} color={live.tone === 'warn' ? '#B54708' : DESKTOP_COLORS.brand} />
            <DText style={styles.previewText}>{live.message}</DText>
          </View>
          <DText style={styles.sub}>
            {[
              live.audience === 'everyone' ? t('ownerTools.toEveryone') : t('ownerTools.toManagers'),
              live.ends_at ? t('ownerTools.until', { date: formatDate(live.ends_at) }) : t('ownerTools.untilRemoved'),
            ].join(' · ')}
          </DText>
          <HoverPressable style={styles.secondary} hoverStyle={styles.secondaryHover} onPress={end} disabled={busy}>
            <Ionicons name="stop-circle-outline" size={16} color={DESKTOP_COLORS.danger} />
            <DText weight="semiBold" style={[styles.secondaryText, { color: DESKTOP_COLORS.danger }]}>{t('ownerTools.endAnnouncement')}</DText>
          </HoverPressable>
        </View>
      ) : (
        <View style={styles.body}>
          <DText style={styles.sub}>{t('ownerTools.announcementHint')}</DText>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={t('ownerTools.announcementPlaceholder')}
            placeholderTextColor={DESKTOP_COLORS.inkFaint}
            multiline
            maxLength={400}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            accessibilityLabel={t('ownerTools.announcementTitle')}
            style={[styles.textarea, focused && styles.textareaFocus]}
          />
          <Choice
            value={tone}
            onChange={setTone}
            options={[
              { value: 'info', label: t('ownerTools.toneInfo') },
              { value: 'warn', label: t('ownerTools.toneWarn') },
            ]}
          />
          <Choice
            value={audience}
            onChange={setAudience}
            options={[
              { value: 'admins', label: t('ownerTools.toManagers') },
              { value: 'everyone', label: t('ownerTools.toEveryone') },
            ]}
          />
          <Choice value={days} onChange={setDays} options={DURATIONS.map((d) => ({ value: d.days, label: d.label() }))} />
          <HoverPressable
            style={[styles.primary, (!message.trim() || busy) && styles.disabled]}
            hoverStyle={styles.primaryHover}
            onPress={() => void publish()}
            disabled={!message.trim() || busy}
          >
            {busy ? <BrandLoader size="small" color="#FFFFFF" /> : <Ionicons name="megaphone-outline" size={16} color="#FFFFFF" />}
            <DText weight="bold" style={styles.primaryText}>{t('ownerTools.publish')}</DText>
          </HoverPressable>
        </View>
      )}
    </View>
  );
}

const MONTHS = 6;

/** Money in, per month, for the last six months; the dashed line is what the subscriptions add up to. */
export function CollectedPanel({ expected }: { expected: number }) {
  const [months, setMonths] = useState<{ month: string; total: number }[] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const now = new Date();
    const since = monthKey(new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1), 1));
    listPaymentsSince(since).then(
      (rows) => setMonths(paidByMonth(rows, MONTHS)),
      () => setMonths([]),
    );
  }, []);

  if (!months) return null;
  const max = Math.max(1, expected, ...months.map((m) => m.total));
  const current = months[months.length - 1];
  const focus = hover != null ? months[hover] : current;
  const label = (m: string) => new Date(`${m}T12:00:00`).toLocaleDateString(getLocale(), { month: 'short' });
  const missing = Math.max(0, expected - (current?.total ?? 0));

  return (
    <View style={styles.panel}>
      <View style={styles.titleRow}>
        <DText weight="bold" style={styles.title} accessibilityRole="header">{t('ownerTools.collectedTitle')}</DText>
      </View>
      <View style={styles.head}>
        <DText weight="extraBold" style={[styles.value, TABULAR]}>{formatMoney(focus?.total ?? 0)}</DText>
        <DText style={styles.sub}>
          {hover != null
            ? new Date(`${focus!.month}T12:00:00`).toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' })
            : missing > 0
              ? t('ownerTools.collectedMissing', { amount: formatMoney(missing) })
              : t('ownerTools.collectedThisMonth')}
        </DText>
      </View>
      <View style={styles.chart} accessible accessibilityLabel={months.map((m) => `${label(m.month)} ${formatMoney(m.total)}`).join(', ')}>
        {expected > 0 && <View style={[styles.expected, { bottom: `${(expected / max) * 100}%` as unknown as number }]} />}
        {months.map((m, i) => (
          <HoverPressable
            key={m.month}
            style={styles.slot}
            onHoverIn={() => setHover(i)}
            onHoverOut={() => setHover((h) => (h === i ? null : h))}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            accessibilityLabel={`${label(m.month)}: ${formatMoney(m.total)}`}
          >
            <View
              style={[
                styles.bar,
                { height: `${Math.max(m.total ? 6 : 3, (m.total / max) * 100)}%` as unknown as number },
                !m.total && styles.barEmpty,
                (hover === i || (hover == null && i === months.length - 1)) && styles.barOn,
              ]}
            />
          </HoverPressable>
        ))}
      </View>
      <View style={styles.axis}>
        {months.map((m) => (
          <DText key={m.month} style={styles.axisText}>{label(m.month)}</DText>
        ))}
      </View>
      {expected > 0 && (
        <View style={styles.legend}>
          <View style={styles.legendLine} />
          <DText style={styles.sub}>{t('ownerTools.expectedLine', { amount: formatMoney(expected) })}</DText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: DESKTOP_COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: DESKTOP_COLORS.border, overflow: 'hidden' },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 },
  title: { fontSize: 16, color: DESKTOP_COLORS.ink },
  loading: { paddingVertical: 24, alignItems: 'center' },
  body: { paddingHorizontal: 18, paddingBottom: 18, gap: 10 },
  sub: { fontSize: 12.5, lineHeight: 18, color: DESKTOP_COLORS.inkFaint, textAlign: 'right' },

  liveBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 22, paddingHorizontal: 9, borderRadius: 11, backgroundColor: DESKTOP_TONES.ok.bg },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1E9E4C' },
  liveText: { fontSize: 12, color: DESKTOP_TONES.ok.fg },
  preview: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  previewInfo: { backgroundColor: '#EEF2FF', borderColor: 'rgba(47,91,255,0.18)' },
  previewWarn: { backgroundColor: '#FFF6E5', borderColor: 'rgba(217,119,6,0.25)' },
  previewText: { flex: 1, fontSize: 14, lineHeight: 20, color: DESKTOP_COLORS.ink, textAlign: 'right' },

  textarea: {
    minHeight: 76,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: DESKTOP_COLORS.ink,
    textAlign: 'right',
    ...webOnly({ outlineStyle: 'none', resize: 'vertical', fontFamily: 'inherit', transition: 'border-color 150ms ease, box-shadow 150ms ease' }),
  },
  textareaFocus: { borderColor: DESKTOP_COLORS.brand, ...webOnly({ boxShadow: '0 0 0 3px rgba(47,91,255,0.14)' }) },
  choice: { flexDirection: 'row-reverse', padding: 3, borderRadius: 10, backgroundColor: '#EEF1F4' },
  choiceItem: { flex: 1, height: 30, paddingHorizontal: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease' }) },
  choiceOn: { backgroundColor: DESKTOP_COLORS.surface, ...webOnly({ boxShadow: '0 1px 2px rgba(22,34,46,0.1), 0 1px 6px rgba(22,34,46,0.06)' }) },
  choiceHover: { backgroundColor: 'rgba(22,34,46,0.05)' },
  choiceText: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  choiceTextOn: { color: DESKTOP_COLORS.ink },
  primary: { height: 40, borderRadius: 10, backgroundColor: DESKTOP_COLORS.brand, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, ...webOnly({ boxShadow: DESKTOP_BRAND_SHADOW }) },
  primaryHover: { backgroundColor: DESKTOP_COLORS.brandHover },
  primaryText: { fontSize: 14, color: '#FFFFFF' },
  secondary: { height: 38, borderRadius: 10, borderWidth: 1, borderColor: DESKTOP_COLORS.border, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaryHover: { backgroundColor: 'rgba(217,45,32,0.05)' },
  secondaryText: { fontSize: 14 },
  disabled: { opacity: 0.5 },

  head: { paddingHorizontal: 18, gap: 2 },
  value: { fontSize: 26, lineHeight: 32, color: DESKTOP_COLORS.ink, letterSpacing: -0.5, textAlign: 'right' },
  chart: { flexDirection: 'row-reverse', alignItems: 'flex-end', height: 96, gap: 8, marginHorizontal: 18, marginTop: 14 },
  expected: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: DESKTOP_COLORS.inkFaint },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4, backgroundColor: '#9CCBE6', ...webOnly({ transition: 'background-color 120ms ease-out' }) },
  barEmpty: { backgroundColor: DESKTOP_COLORS.borderSoft },
  barOn: { backgroundColor: DESKTOP_COLORS.brand },
  axis: { flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12 },
  axisText: { flex: 1, fontSize: 11.5, color: DESKTOP_COLORS.inkFaint, textAlign: 'center' },
  legend: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingBottom: 16 },
  legendLine: { width: 18, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: DESKTOP_COLORS.inkFaint },
});
