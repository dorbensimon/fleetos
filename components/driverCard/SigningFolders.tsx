import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getDriver } from '../../lib/adminApi';
import { listDriverSigningRequests, listSigningTemplates } from '../../lib/docuseal';
import { buildSigningFolders, signingFolderStatus, type SigningFolder } from '../../lib/signingFolders';
import { DC_COLORS, DC_SPACING, DC_TYPO } from './driverCardTheme';
import { DText, HoverPressable, StatusPill } from '../desktop/primitives';
import { DESKTOP_COLORS, webOnly } from '../desktop/desktopTheme';

export function SigningFolders({ driverId, onOpen, desktop = false }: { driverId: string; onOpen: (folder: SigningFolder) => void; desktop?: boolean }) {
  const [folders, setFolders] = useState<SigningFolder[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const driver = await getDriver(driverId);
        if (!driver?.company_id) throw new Error('לא נמצא שיוך חברה לנהג');
        const [templates, requests] = await Promise.all([listSigningTemplates(driver.company_id), listDriverSigningRequests(driverId)]);
        if (active) { setFolders(buildSigningFolders(templates, requests)); setError(''); }
      } catch (err: any) { if (active) setError(err?.message || 'טעינת התיקיות נכשלה'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [driverId]));
  if (desktop) {
    return <View style={desktopStyles.wrap}>
      <DText weight="bold" style={desktopStyles.title}>טפסים ומסמכים</DText>
      <View style={desktopStyles.card}>
        {loading ? <DText style={desktopStyles.message}>טוען תיקיות…</DText> : error ? <DText style={desktopStyles.message}>{error}</DText> : folders.map((folder, index) => {
          const status = signingFolderStatus(folder);
          const tone = status === 'pending' ? 'warn' : status === 'completed' ? 'ok' : status === 'failed' ? 'bad' : 'neutral';
          const label = status === 'pending' ? 'ממתין לחתימה' : status === 'completed' ? 'נחתם' : status === 'failed' ? 'דורש טיפול' : 'ריק';
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
            <Ionicons name="chevron-back" size={16} color={DESKTOP_COLORS.inkFaint} />
          </HoverPressable>;
        })}
        {!loading && !error && !folders.length && <DText style={desktopStyles.message}>אין עדיין תבניות זמינות</DText>}
      </View>
    </View>;
  }

  return <View style={s.wrap}>
    <Text style={[DC_TYPO.groupTitle, s.title]}>טפסים ומסמכים</Text>
    <View style={s.card}>
      {loading ? <Text style={s.message}>טוען תיקיות…</Text> : error ? <Text style={s.message}>{error}</Text> : folders.map((folder, index) => {
        const status = signingFolderStatus(folder);
        const color = status === 'pending' ? DC_COLORS.blue : status === 'completed' ? DC_COLORS.green : status === 'failed' ? DC_COLORS.red : DC_COLORS.gray;
        const label = status === 'pending' ? 'ממתין לחתימה' : status === 'completed' ? 'נחתם' : status === 'failed' ? 'דורש טיפול' : 'ריק';
        return <TouchableOpacity key={folder.id} accessibilityRole="button" accessibilityLabel={`${folder.title}, ${label}`} style={[s.row, index > 0 && s.divider]} onPress={() => onOpen(folder)}>
          <View style={s.folder}><Ionicons name="folder-outline" size={23} color={DC_COLORS.gray} /></View>
          <Text style={[DC_TYPO.rowLabel, s.label]}>{folder.title}</Text>
          <Ionicons name={status === 'pending' ? 'time-outline' : status === 'completed' ? 'checkmark-circle' : status === 'failed' ? 'alert-circle-outline' : 'ellipse-outline'} size={18} color={color} />
          <Text style={[DC_TYPO.badge, { color }]}>{label}</Text>
          <Ionicons name="chevron-back" size={16} color={DC_COLORS.chevron} />
        </TouchableOpacity>;
      })}
      {!loading && !error && !folders.length && <Text style={s.message}>אין עדיין תבניות זמינות</Text>}
    </View>
  </View>;
}
const s = StyleSheet.create({
  wrap: { marginBottom: DC_SPACING.groupGap },
  title: { color: DC_COLORS.labelTertiary, textAlign: 'right', marginBottom: 8, marginRight: DC_SPACING.screenPaddingH + 2 },
  card: { marginHorizontal: DC_SPACING.screenPaddingH, backgroundColor: DC_COLORS.surface, borderRadius: DC_SPACING.groupRadius, overflow: 'hidden' },
  row: { minHeight: DC_SPACING.rowMinHeight, flexDirection: 'row-reverse', alignItems: 'center', padding: DC_SPACING.rowPaddingH, gap: 8 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: DC_COLORS.separator },
  folder: { backgroundColor: DC_COLORS.fill, borderRadius: DC_SPACING.iconRadius, padding: 5 },
  label: { flex: 1, textAlign: 'right', color: DC_COLORS.label },
  message: { ...DC_TYPO.footer, textAlign: 'center', color: DC_COLORS.labelSecondary, padding: 16 },
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
  label: { flex: 1, textAlign: 'right', color: DESKTOP_COLORS.ink, fontSize: 13, lineHeight: 20 },
  message: { textAlign: 'center', color: DESKTOP_COLORS.inkMuted, padding: 20, fontSize: 13, lineHeight: 20 },
});
