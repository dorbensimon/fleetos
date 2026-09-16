import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getDriver } from '../../lib/adminApi';
import { listDriverSigningRequests, listSigningTemplates } from '../../lib/docuseal';
import { buildSigningFolders, signingFolderStatus, type SigningFolder } from '../../lib/signingFolders';
import { DC_COLORS, DC_SPACING, DC_TYPO } from './driverCardTheme';

export function SigningFolders({ driverId, onOpen }: { driverId: string; onOpen: (folder: SigningFolder) => void }) {
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
