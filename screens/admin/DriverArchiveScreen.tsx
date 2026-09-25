import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState, useToast } from '../../components/ui';
import { Avatar, Banner, DK, DKText, DriverPage, EmptyPanel, ErrorPanel, HeroTitle, LoadingPanel, PrimaryAction, Pressy, Reveal, Surface } from '../../components/driverKit';
import { ConfirmActionModal } from '../../components/driverCard/ConfirmActionModal';
import { useCompany } from '../../lib/CompanyContext';
import { listArchivedDrivers, restoreDriver, deleteDriver, type DriverRow } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';
import { formatDate } from '../../lib/theme';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DriverArchiveDesktopView } from '../../components/desktop/DriverArchiveDesktopView';

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
  const isDesktop = useIsDesktop();

  const [rows, setRows] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DriverRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const deleteModal = (
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
  );

  if (isDesktop) {
    return (
      <>
        <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'נהגים', 'ארכיון']}>
          {loading ? null : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <DriverArchiveDesktopView
              drivers={rows}
              restoringId={restoringId}
              onOpenDriver={(driverId) => navigation.navigate('DriverDetail', { driverId })}
              onRestore={(driver) => void runRestore(driver)}
              onDelete={setDeleteTarget}
            />
          )}
        </DesktopShell>
        {deleteModal}
      </>
    );
  }

  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      hero={
        <HeroTitle
          title="ארכיון נהגים"
          subtitle={loading ? 'טוען…' : rows.length ? `${rows.length} נהגים ללא גישה לאפליקציה` : 'נהגים שהועברו לארכיון'}
          onBack={() => navigation.goBack()}
        />
      }
      overlay={deleteModal}
    >
      {loading && !refreshing ? (
        <LoadingPanel />
      ) : error ? (
        <ErrorPanel message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <Reveal>
          <EmptyPanel icon="archive" title="הארכיון ריק" body="נהג שתעביר לארכיון יופיע כאן — בלי גישה לאפליקציה, ועם אפשרות לשחזר אותו בכל רגע." />
        </Reveal>
      ) : (
        <>
          <Reveal index={0}>
            <Banner tone="info" icon="information-circle">
              שחזור מחזיר לנהג את הגישה לאפליקציה. מחיקה לצמיתות מוחקת גם את המסמכים שלו ואינה ניתנת לביטול.
            </Banner>
          </Reveal>
          {rows.map((item, index) => (
            <Reveal key={item.id} index={Math.min(index + 1, 8)}>
              <Surface style={s.card}>
                <Pressy onPress={() => navigation.navigate('DriverDetail', { driverId: item.id })} accessibilityLabel={`${item.full_name ?? 'ללא שם'}, לתיק הנהג`} pressScale={0.985}>
                  <View style={s.head}>
                    <Avatar name={item.full_name} size={48} tone="muted" />
                    <View style={s.flex}>
                      <DKText variant="heading" numberOfLines={1}>
                        {item.full_name ?? 'ללא שם'}
                      </DKText>
                      <DKText variant="caption" color={DK.muted} numberOfLines={2}>
                        {item.archived_at ? `בארכיון מ־${formatDate(item.archived_at)}` : 'בארכיון'}
                        {item.archived_by_name ? ` · על ידי ${item.archived_by_name}` : ''}
                      </DKText>
                    </View>
                    <Ionicons name="chevron-back" size={18} color={DK.faint} />
                  </View>
                </Pressy>
                <View style={s.actions}>
                  <PrimaryAction label="שחזור" icon="arrow-undo" tone="ghost" loading={restoringId === item.id} onPress={() => void runRestore(item)} style={s.flex} />
                  <PrimaryAction label="מחיקה לצמיתות" icon="trash-outline" tone="danger" onPress={() => setDeleteTarget(item)} style={s.flex} />
                </View>
              </Surface>
            </Reveal>
          ))}
        </>
      )}
    </DriverPage>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  card: { padding: 14, gap: 12 },
  head: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row-reverse', gap: 10 },
});
