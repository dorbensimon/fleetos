import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, EmptyState, Screen, ScreenHeader } from '../../components/ui';
import { getSigningSession, listSignatureRequests, syncSigningRequest, type SignatureRequest } from '../../lib/docuseal';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverSigningDocuments'>;

export default function DriverSigningDocumentsScreen({ navigation, route }: Props) {
  const { companyId, profile } = useCompany();
  const managedDriverId = route.params?.driverId;
  const isManagerView = profile?.role !== 'driver' && !!managedDriverId;
  const [tab, setTab] = useState<'pending' | 'completed'>('pending');
  const [items, setItems] = useState<SignatureRequest[]>([]);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState('');

  const load = useCallback(async () => {
    try {
      let rows = await listSignatureRequests(isManagerView ? companyId ?? undefined : undefined);
      if (managedDriverId) rows = rows.filter((item) => item.driver_id === managedDriverId);
      const pending = rows.filter((item) => item.status === 'pending');
      if (pending.length) {
        await Promise.allSettled(pending.map((item) => syncSigningRequest(item.id)));
        rows = await listSignatureRequests(isManagerView ? companyId ?? undefined : undefined);
        if (managedDriverId) rows = rows.filter((item) => item.driver_id === managedDriverId);
      }
      setItems(rows);
      setError('');
    } catch (err: any) { setError(err?.message || 'טעינת המסמכים נכשלה'); }
  }, [companyId, isManagerView, managedDriverId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = async (item: SignatureRequest) => {
    setOpening(item.id);
    try {
      const session = await getSigningSession(item.id);
      navigation.navigate('DocusealWebView', {
        ...session,
        title: item.status === 'completed' ? 'מסמך חתום' : 'חתימה על מסמך',
        requestId: item.id,
      });
    } catch (err: any) { setError(err?.message || 'פתיחת המסמך נכשלה'); }
    finally { setOpening(''); }
  };

  const visible = items.filter((item) => tab === 'completed' ? item.status === 'completed' : item.status !== 'completed');

  return (
    <Screen>
      <ScreenHeader title={isManagerView ? 'מסמכי הנהג לחתימה' : 'מסמכים לחתימה'} onBack={() => navigation.goBack()} />
      <View style={styles.tabs}>
        {(['pending', 'completed'] as const).map((value) => (
          <TouchableOpacity key={value} style={[styles.tab, tab === value && styles.active]} onPress={() => setTab(value)}>
            <AppText weight="bold" style={{ color: tab === value ? COLORS.accent : COLORS.textMuted }}>
              {value === 'pending' ? 'ממתינים לחתימה' : 'מסמכים חתומים'}
            </AppText>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!!error && <AppText style={styles.error}>{error}</AppText>}
        {visible.map((item) => (
          <TouchableOpacity key={item.id} disabled={opening === item.id} onPress={() => open(item)}>
            <Card style={styles.card}>
              <View style={[styles.icon, item.status === 'completed' && styles.doneIcon]}>
                <Ionicons name={item.status === 'completed' ? 'checkmark' : 'create-outline'} size={22} color={item.status === 'completed' ? COLORS.okText : COLORS.accent} />
              </View>
              <View style={styles.text}>
                <AppText weight="bold">{item.template?.title || 'מסמך לחתימה'}</AppText>
                <AppText style={styles.meta}>{item.status === 'completed' ? 'נחתם ונשמר' : item.status === 'declined' ? 'החתימה נדחתה' : 'לחץ כדי לחתום'}</AppText>
              </View>
              <Ionicons name="chevron-back" size={18} color={COLORS.textFaint} />
            </Card>
          </TouchableOpacity>
        ))}
        {!visible.length && <EmptyState icon="document-text-outline" title={tab === 'completed' ? 'אין מסמכים חתומים' : 'אין מסמכים שממתינים לחתימה'} />}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row-reverse', margin: SPACING.lg, marginBottom: 0, padding: 4, borderRadius: RADIUS.md, backgroundColor: COLORS.neutralBg },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: RADIUS.sm },
  active: { backgroundColor: COLORS.card }, content: { padding: SPACING.lg, gap: SPACING.md },
  card: { flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md, padding: SPACING.md },
  icon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accentSoft },
  doneIcon: { backgroundColor: COLORS.okBg }, text: { flex: 1, alignItems: 'flex-end' },
  meta: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 3 }, error: { color: COLORS.dangerText, textAlign: 'center' },
});
