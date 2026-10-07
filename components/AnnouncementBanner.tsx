import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCompany } from '../lib/CompanyContext';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { liveAnnouncement, type Announcement } from '../lib/ownerTools';
import { t } from '../lib/i18n';
import { DText, HoverPressable } from './desktop/primitives';

/**
 * The owner's live announcement, shown to managers (or everyone): a bar above
 * the page on a computer, a floating card at the top on a phone. Closing it
 * hides that one message on this browser; a new message shows again.
 */

const DISMISSED_KEY = 'icar.announcement.dismissed';

function readDismissed(): string | null {
  try {
    return Platform.OS === 'web' ? window.localStorage.getItem(DISMISSED_KEY) : null;
  } catch {
    return null;
  }
}

export function AnnouncementBanner({ inline }: { inline?: boolean }) {
  const { profile } = useCompany();
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);
  const role = profile?.role;
  const show = !!role && role !== 'owner' && (inline ? isDesktop : !isDesktop);

  useEffect(() => {
    if (!show) return;
    let alive = true;
    void liveAnnouncement().then((a) => alive && setItem(a));
    return () => {
      alive = false;
    };
  }, [show, profile?.id]);

  if (!show || !item || dismissed === item.id) return null;

  const close = () => {
    setDismissed(item.id);
    try {
      window.localStorage.setItem(DISMISSED_KEY, item.id);
    } catch {
      // Without storage it simply shows again next time.
    }
  };
  const warn = item.tone === 'warn';

  return (
    <View
      style={[styles.base, warn ? styles.warn : styles.info, inline ? styles.inline : [styles.float, { top: insets.top + 10 }]]}
      accessibilityRole="alert"
    >
      <Ionicons name={warn ? 'warning' : 'megaphone'} size={18} color={warn ? '#B54708' : '#2F5BFF'} />
      <DText weight="medium" style={styles.text}>{item.message}</DText>
      <HoverPressable style={styles.close} hoverStyle={styles.closeHover} onPress={close} accessibilityLabel={t('common.close')}>
        <Ionicons name="close" size={16} color="#5C6773" />
      </HoverPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  info: { backgroundColor: '#EEF2FF', borderColor: 'rgba(47,91,255,0.18)' },
  warn: { backgroundColor: '#FFF6E5', borderColor: 'rgba(217,119,6,0.25)' },
  inline: { borderBottomWidth: 1 },
  float: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 50,
    borderRadius: 14,
    borderWidth: 1,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(22,34,46,0.14)' } as object) : { elevation: 6 }),
  },
  text: { flex: 1, fontSize: 14.5, lineHeight: 21, color: '#16222E', textAlign: 'right' },
  close: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  closeHover: { backgroundColor: 'rgba(22,34,46,0.06)' },
});
