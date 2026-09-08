import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, EmptyState, ErrorState, LoadingState, useToast } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { ConfirmActionModal } from '../../components/driverCard/ConfirmActionModal';
import { useCompany } from '../../lib/CompanyContext';
import { listArchivedDrivers, restoreDriver, deleteDriver, type DriverRow } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';
import { formatDate } from '../../lib/theme';

/**
 * The driver archive — the only screen that shows archived drivers, and
 * the only place a driver can be permanently deleted from.
 *
 * The two-step lifecycle is deliberate: the driver's own file offers
 * "move to archive" and nothing more, so an irreversible deletion always
 * passes through this intermediate, reversible state first. The delete
 * here additionally requires typing the driver's name, since it also
 * takes their documents and files with it.
 */

type Props = NativeStackScreenProps<RootStackParamList, 'DriverArchive'>;

export default function DriverArchiveScreen({ navigation }: Props) {
  const { companyId } = useCompany();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [rows, setRows] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DriverRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setError('לא נמצאה חברה משויכת');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await listArchivedDrivers(companyId));
    } catch (e: any) {
      setError(e?.message ?? 'טעינת הארכיון נכשלה');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const runRestore = async (driver: DriverRow) => {
    if (!companyId || restoringId) return;
    setRestoringId(driver.id);
    const result = await restoreDriver(driver.id, companyId);
    setRestoringId(null);
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    showToast(`${driver.full_name ?? 'הנהג'} שוחזר מהארכיון`);
    await load();
  };

  const runDelete = async () => {
    if (!companyId || !deleteTarget) return;
    setDeleting(true);
    const result = await deleteDriver(deleteTarget.id, companyId);
    setDeleting(false);
    if (!result.ok) {
      setDeleteTarget(null);
      showToast(result.error);
      return;
    }
    const name = deleteTarget.full_name ?? 'הנהג';
    setDeleteTarget(null);
    showToast(`${name} נמחק לצמיתות`);
    await load();
  };

  return (
    <View style={s.screen}>
      <AdminGradientBackground />

      <View style={[s.header, { paddingTop: insets.top + 18 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Ionicons name="chevron-forward" size={22} color="#102A42" />
        </TouchableOpacity>
        <View>
          <AppText weight="bold" style={s.title}>ארכיון נהגים</AppText>
          <AppText style={s.subtitle}>נהגים ללא גישה לאפליקציה</AppText>
        </View>
        <View style={s.spacer} />
      </View>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(x) => x.id}
          contentContainerStyle={s.list}
          refreshing={loading}
          onRefresh={load}
          ListEmptyComponent={
            <EmptyState
              icon="archive-outline"
              title="הארכיון ריק"
              hint="נהג שתעביר לארכיון יופיע כאן, ללא גישה לאפליקציה"
            />
          }
          renderItem={({ item }) => (
            <View style={s.card}>
              <TouchableOpacity
                style={s.cardHead}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('DriverDetail', { driverId: item.id })}
              >
                <View style={s.avatar}>
                  <AppText weight="bold" style={s.avatarText}>
                    {(item.full_name ?? '?').trim().charAt(0)}
                  </AppText>
                </View>
                <View style={s.headText}>
                  <AppText weight="bold" style={s.name} numberOfLines={1}>
                    {item.full_name ?? 'ללא שם'}
                  </AppText>
                  <AppText style={s.meta} numberOfLines={2}>
                    {item.archived_at ? `הועבר לארכיון ב-${formatDate(item.archived_at)}` : 'הועבר לארכיון'}
                    {item.archived_by_name ? ` · על ידי ${item.archived_by_name}` : ''}
                  </AppText>
                </View>
                <Ionicons name="chevron-back" size={18} color="rgba(16,42,66,.3)" />
              </TouchableOpacity>

              <View style={s.actions}>
                <TouchableOpacity
                  style={s.restore}
                  activeOpacity={0.7}
                  disabled={restoringId === item.id}
                  onPress={() => void runRestore(item)}
                >
                  <Ionicons name="arrow-undo-outline" size={16} color="#0088CC" />
                  <AppText weight="bold" style={s.restoreText}>
                    {restoringId === item.id ? 'משחזר…' : 'שחזור'}
                  </AppText>
                </TouchableOpacity>
                <TouchableOpacity style={s.delete} activeOpacity={0.7} onPress={() => setDeleteTarget(item)}>
                  <Ionicons name="trash-outline" size={16} color="#C0392B" />
                  <AppText weight="bold" style={s.deleteText}>מחיקת נהג</AppText>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <ConfirmActionModal
        visible={!!deleteTarget}
        title="מחיקת נהג לצמיתות"
        message={`הפעולה תמחק את ${deleteTarget?.full_name ?? 'הנהג'}, את המסמכים שהועלו לתיק שלו ואת קובצי החתימות השמורים באפליקציה. הטפסים החתומים יישארו במערכת החתימות בלבד. הפעולה אינה ניתנת לשחזור.`}
        confirmLabel="מחק לצמיתות"
        destructive
        loading={deleting}
        requireTypedText={deleteTarget?.full_name ?? null}
        typedTextHint={`לאישור, הקלד את שם הנהג: ${deleteTarget?.full_name ?? ''}`}
        onConfirm={runDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F1F4F7' },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: { width: 42 },
  title: { fontSize: 20, color: '#102A42', textAlign: 'center' },
  subtitle: { fontSize: 12, color: 'rgba(16,42,66,.58)', marginTop: 2, textAlign: 'center' },

  list: { padding: 18, paddingTop: 4, gap: 12, paddingBottom: 42 },
  card: {
    backgroundColor: 'rgba(255,255,255,.92)',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#102A42',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  cardHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 15 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(16,42,66,.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, color: 'rgba(16,42,66,.6)' },
  headText: { flex: 1, alignItems: 'flex-end' },
  name: { fontSize: 16, color: '#102A42', textAlign: 'right' },
  meta: { fontSize: 12.5, color: 'rgba(16,42,66,.6)', marginTop: 3, textAlign: 'right', lineHeight: 18 },

  actions: {
    flexDirection: 'row-reverse',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(16,42,66,.12)',
  },
  restore: {
    flex: 1,
    height: 48,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(16,42,66,.12)',
  },
  restoreText: { fontSize: 15, color: '#0088CC' },
  delete: {
    flex: 1,
    height: 48,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  deleteText: { fontSize: 15, color: '#C0392B' },
});
