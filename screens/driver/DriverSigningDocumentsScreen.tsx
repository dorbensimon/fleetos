import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, EmptyState, ErrorState, LoadingState, Screen, ScreenHeader } from '../../components/ui';
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
  const [loading, setLoading] = useState(true);
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    try {
      let rows = await listSignatureRequests(isManagerView ? companyId ?? undefined : undefined);
      if (managedDriverId) rows = rows.filter((item) => item.driver_id === managedDriverId);
      const requestsToSync = rows.filter((item) => item.status === 'pending' || (item.status === 'completed' && !item.signed_file_path));
      if (requestsToSync.length) {
        await Promise.allSettled(requestsToSync.map((item) => syncSigningRequest(item.id)));
        rows = await listSignatureRequests(isManagerView ? companyId ?? undefined : undefined);
        if (managedDriverId) rows = rows.filter((item) => item.driver_id === managedDriverId);
      }
      if (requestId !== loadRequest.current) return;
      setItems(rows);
      setError('');
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(err?.message || 'טעינת המסמכים נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [companyId, isManagerView, managedDriverId]);

  useFocusEffect(useCallback(() => {
    load();
    return () => { loadRequest.current += 1; };
  }, [load]));

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

  const visible = items.filter((item) => tab === 'completed' ? item.status === 'completed' : ['pending', 'declined'].includes(item.status));

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
      {loading ? <LoadingState /> : error && items.length === 0 ? <ErrorState message={error} onRetry={load} /> : <ScrollView contentContainerStyle={styles.content}>
        {!!error && <AppText style={styles.error}>{error}</AppText>}
        {visible.map((item) => (
          <TouchableOpacity key={item.id} disabled={opening === item.id} onPress={() => open(item)}>
            <Card style={styles.card}>
              <View style={[styles.icon, item.status === 'completed' && styles.doneIcon]}>
                <Ionicons name={item.status === 'completed' ? 'checkmark' : 'create-outline'} size={22} color={item.status === 'completed' ? COLORS.okText : COLORS.accent} />
              </View>
              <View style={styles.text}>
                <AppText weight="bold">{item.template?.title || 'מסמך לחתימה'}</AppText>
                <AppText style={styles.meta}>{item.status === 'completed' ? (item.signed_file_path ? 'נחתם ונשמר' : 'נחתם, העותק נשמר כעת') : item.status === 'declined' ? 'החתימה נדחתה' : 'לחץ כדי לחתום'}</AppText>
                {item.status === 'completed' && (
                  <View style={styles.docusealBadge}>
                    <Ionicons name="shield-checkmark-outline" size={13} color={COLORS.okText} />
                    <AppText style={styles.docusealBadgeText}>חתום דיגיטלית · DocuSeal</AppText>
                  </View>
                )}
              </View>
              <Ionicons name="chevron-back" size={18} color={COLORS.textFaint} />
            </Card>
          </TouchableOpacity>
        ))}
        {!visible.length && <EmptyState icon="document-text-outline" title={tab === 'completed' ? 'אין מסמכים חתומים' : 'אין מסמכים שממתינים לחתימה'} />}
      </ScrollView>}
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
  meta: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 3 },
  docusealBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9, backgroundColor: COLORS.okBg },
  docusealBadgeText: { fontSize: 11.5, color: COLORS.okText },
  error: { color: COLORS.dangerText, textAlign: 'center' },
});
