import { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getDriver } from '../../lib/adminApi';
import { listDriverSigningRequests, listSigningTemplates } from '../../lib/docuseal';
import { useCompany } from '../../lib/CompanyContext';
import { buildSigningFolders, signingFolderStatus, type SigningFolder } from '../../lib/signingFolders';
import { DK, DKText, KitSection, ListRow, STATUS } from '../driverKit';
import { isChecklistTemplate } from '../../lib/checklistForms';
import { DText, HoverPressable, StatusPill } from '../desktop/primitives';
import { DESKTOP_COLORS, webOnly } from '../desktop/desktopTheme';
import { t, dirIcon, textStart } from '../../lib/i18n';
import { errorMessage } from '../../lib/requestError';

export function SigningFolders({ driverId, onOpen, desktop = false, title = t('signing.formsAndDocsToSign') }: { driverId: string; onOpen: (folder: SigningFolder) => void; desktop?: boolean; /** Phone section heading; none when the list opens a page. */ title?: string | null }) {
  const [folders, setFolders] = useState<SigningFolder[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const { profile } = useCompany();
  // A driver sees only folders with something sent to them; managers also see
  // empty folders, which is where they send a new document from.
  const driverView = profile?.role === 'driver';
  // The loader shows the first time only; a return refreshes quietly.
  const shownFor = useRef<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    const quiet = shownFor.current === driverId;
    if (!quiet) setLoading(true);
    (async () => {
      try {
        const driver = await getDriver(driverId);
        if (!driver?.company_id) throw new Error(t('signing.noCompanyForDriver'));
        const [templates, requests] = await Promise.all([listSigningTemplates(driver.company_id), listDriverSigningRequests(driverId)]);
        const all = buildSigningFolders(templates, requests);
        if (active) { setFolders(driverView ? all.filter(folder => folder.requests.length > 0) : all); setError(''); shownFor.current = driverId; }
      } catch (err: any) { if (active && !quiet) setError(errorMessage(err, t('signing.foldersLoadFailed'))); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [driverId, driverView]));
  if (desktop) {
    return <View style={desktopStyles.wrap}>
      <DText weight="bold" style={desktopStyles.title}>{t('signing.formsAndDocs')}</DText>
      <View style={desktopStyles.card}>
        {loading ? <DText style={desktopStyles.message}>{t('signing.loadingFolders')}</DText> : error ? <DText style={desktopStyles.message}>{error}</DText> : folders.map((folder, index) => {
          const status = signingFolderStatus(folder);
          const tone = status === 'pending' ? 'warn' : status === 'completed' ? 'ok' : status === 'failed' ? 'bad' : 'neutral';
          const label = status === 'pending' ? t('signing.pendingSignature') : status === 'completed' ? t('common.signedDone') : status === 'failed' ? t('status.needsAttention') : t('common.empty');
          return <HoverPressable
            key={folder.id}
            accessibilityLabel={`${folder.title}, ${label}`}
            style={[desktopStyles.row, index > 0 && desktopStyles.divider]}
            hoverStyle={desktopStyles.rowHover}
            hoverMotionStyle={desktopStyles.rowHoverMotion}
            pressMotionStyle={desktopStyles.rowPress}
            onPress={() => onOpen(folder)}
          >
            <View style={desktopStyles.folder}><Ionicons name="folder-outline" size={21} color={DESKTOP_COLORS.brand} /></View>
            <DText weight="semiBold" style={desktopStyles.label}>{folder.title}</DText>
            <StatusPill tone={tone} label={label} />
            <Ionicons name={dirIcon('chevron-back')} size={16} color={DESKTOP_COLORS.inkFaint} />
          </HoverPressable>;
        })}
        {!loading && !error && !folders.length && <DText style={desktopStyles.message}>{driverView ? t('signing.noneSentToYou') : t('signing.noTemplatesYet')}</DText>}
      </View>
    </View>;
  }

  const meta = (folder: SigningFolder) => {
    const status = signingFolderStatus(folder);
    return status === 'pending'
      ? { label: driverView ? t('signing.awaitingYourSignature') : t('common.awaitingDriverSignature'), tone: 'soon' as const, icon: 'time' as const }
      : status === 'completed'
        ? { label: t('common.signedDone'), tone: 'ok' as const, icon: 'checkmark-done' as const }
        : status === 'failed'
          ? { label: t('signing.sendIncomplete'), tone: 'expired' as const, icon: 'alert-circle' as const }
          : { label: driverView ? t('common.empty') : isChecklistTemplate(folder.template) ? t('meeting.notHeldYet') : t('signing.notSentCanSend'), tone: 'missing' as const, icon: 'folder-outline' as const };
  };
  return (
    <KitSection title={title ?? undefined}>
      {loading ? (
        <DKText variant="caption" color={DK.muted} style={s.message}>{t('signing.loadingFolders')}</DKText>
      ) : error ? (
        <DKText variant="caption" color={STATUS.expired.fg} style={s.message}>{error}</DKText>
      ) : !folders.length ? (
        <DKText variant="caption" color={DK.muted} style={s.message}>{driverView ? t('signing.noneSentToYou') : t('signing.noTemplatesYet')}</DKText>
      ) : (
        folders.map((folder, index) => {
          const m = meta(folder);
          return (
            <ListRow
              key={folder.id}
              first={index === 0}
              icon={m.icon}
              tint={m.tone === 'missing' ? DK.accent : STATUS[m.tone].fg}
              title={folder.title}
              subtitle={m.label}
              onPress={() => onOpen(folder)}
            />
          );
        })
      )}
    </KitSection>
  );
}
const s = StyleSheet.create({
  message: { textAlign: 'center', padding: 20 },
});

const desktopStyles = StyleSheet.create({
  wrap: { gap: 8 },
  title: { fontSize: 15, color: DESKTOP_COLORS.ink, letterSpacing: -0.1 },
  card: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 12,
    overflow: 'hidden',
    ...webOnly({ boxShadow: '0 12px 30px -22px rgba(22, 34, 46, 0.32)' }),
  },
  row: {
    minHeight: 60,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    ...webOnly({ transition: 'background-color 150ms ease, transform 150ms ease' }),
  },
  divider: { borderTopWidth: 1, borderColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  rowHoverMotion: webOnly({ transform: 'translateY(-2px)' }),
  rowPress: webOnly({ transform: 'scale(0.98)' }),
  folder: { width: 34, height: 34, borderRadius: 9, backgroundColor: DESKTOP_COLORS.brandFocusRing, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, textAlign: textStart(), color: DESKTOP_COLORS.ink, fontSize: 13, lineHeight: 20 },
  message: { textAlign: 'center', color: DESKTOP_COLORS.inkMuted, padding: 20, fontSize: 13, lineHeight: 20 },
});
