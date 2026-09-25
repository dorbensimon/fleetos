import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { showAlert } from '../../lib/platformAlert';
import { departmentDeleteMessage } from '../../lib/driverFields';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState, useToast } from '../../components/ui';
import { DK, DK_SPACE, DKText, DriverPage, EmptyPanel, ErrorPanel, HeroTitle, KitInput, KitSection, LoadingPanel, Pressy, Reveal, STATUS, Surface } from '../../components/driverKit';
import { useCompany } from '../../lib/CompanyContext';
import { listDepartments, createDepartment, updateDepartment, deleteDepartment, countDepartmentUsage, Department } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DepartmentsDesktopView } from '../../components/desktop/DepartmentsDesktopView';

/**
 * Manages the company's internal org units ("תפעול", "הסעות" ...) that
 * vehicles can be tagged with. Reached from the hamburger menu, not a
 * tab — this is a rarely-touched setup screen, not daily-use. Styled to
 * match the driver-form field/card/button system (DriverFormScreen,
 * DriverLicenseDocumentsScreen) rather than a bespoke look.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'Departments'>;

export default function DepartmentsScreen({ navigation }: Props) {
  const { companyId } = useCompany();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);
  const isDesktop = useIsDesktop();

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError(null);
    if (!companyId) {
      if (requestId === loadRequest.current) {
        setError('לא נמצאה חברה משויכת');
        setLoading(false);
      }
      return;
    }
    try {
      const rows = await listDepartments(companyId);
      if (requestId === loadRequest.current) setDepartments(rows);
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(err?.message ?? 'טעינת המחלקות נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        loadRequest.current += 1;
      };
    }, [load])
  );

  const addDepartment = async () => {
    if (!companyId || !newName.trim()) return;
    setAdding(true);
    try {
      await createDepartment(companyId, newName.trim());
      setNewName('');
      await load();
      showToast('נשמר בהצלחה');
    } catch (err: any) {
      showAlert('הוספת מחלקה נכשלה', String(err?.message ?? 'נסה שוב'));
    } finally {
      setAdding(false);
    }
  };

  const saveRename = async (id: string) => {
    if (!editingName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await updateDepartment(id, editingName.trim());
      setEditingId(null);
      await load();
      showToast('נשמר בהצלחה');
    } catch (err: any) {
      showAlert('שינוי השם נכשל', String(err?.message ?? 'נסה שוב'));
    }
  };

  const confirmDelete = async (dept: Department) => {
    if (!companyId) return;
    let usage = { vehicles: 0, drivers: 0 };
    try {
      usage = await countDepartmentUsage(dept.id);
    } catch {
      // If the count fails, still allow deleting — the warning just won't have numbers.
    }
    const message = departmentDeleteMessage(dept.name, usage);

    showAlert(
      'מחיקת מחלקה',
      message,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDepartment(companyId, dept.id);
              await load();
            } catch (err: any) {
              showAlert('מחיקה נכשלה', String(err?.message ?? 'נסה שוב'));
            }
          },
        },
      ]
    );
  };

  if (isDesktop) {
    return (
      <DesktopShell active="Departments" breadcrumbs={['ניהול', 'מחלקות']}>
        {loading ? null : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <DepartmentsDesktopView
            departments={departments}
            newName={newName}
            onChangeNewName={setNewName}
            onAdd={() => void addDepartment()}
            adding={adding}
            editingId={editingId}
            editingName={editingName}
            onChangeEditingName={setEditingName}
            onStartEdit={(dept) => { setEditingId(dept.id); setEditingName(dept.name); }}
            onSaveEdit={(id) => void saveRename(id)}
            onCancelEdit={() => { setEditingId(null); setEditingName(''); }}
            onDelete={(dept) => void confirmDelete(dept)}
          />
        )}
      </DesktopShell>
    );
  }

  const canAdd = !!newName.trim() && !adding;
  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={
        <HeroTitle
          title="מחלקות"
          subtitle={loading ? 'טוען…' : departments.length ? `${departments.length} מחלקות בחברה` : 'חלוקת הנהגים והרכבים לפי יחידות'}
          onBack={() => navigation.goBack()}
        />
      }
    >
      {loading ? (
        <LoadingPanel />
      ) : error ? (
        <ErrorPanel message={error} onRetry={load} />
      ) : (
        <>
          <Reveal index={0}>
            <Surface style={styles.add}>
              <KitInput
                value={newName}
                onChangeText={setNewName}
                placeholder="שם מחלקה חדשה, למשל: תפעול"
                onSubmitEditing={() => void addDepartment()}
                returnKeyType="done"
                accessibilityLabel="שם מחלקה חדשה"
                style={styles.flex}
              />
              <Pressy onPress={() => void addDepartment()} disabled={!canAdd} haptic accessibilityLabel="הוספת מחלקה" style={[styles.addBtn, !canAdd && styles.addBtnIdle]} pressScale={0.92}>
                <Ionicons name="add" size={24} color={canAdd ? '#FFFFFF' : DK.faint} />
              </Pressy>
            </Surface>
          </Reveal>
          {departments.length === 0 ? (
            <Reveal index={1}>
              <EmptyPanel icon="business" title="עדיין אין מחלקות" body="מחלקות עוזרות לסנן ולארגן נהגים ורכבים. הוסף את הראשונה למעלה." />
            </Reveal>
          ) : (
            <Reveal index={1}>
              <KitSection title="רשימת מחלקות">
                {departments.map((item, index) => (
                  <View key={item.id} style={[styles.row, index > 0 && styles.divider]}>
                    <View style={styles.icon}>
                      <Ionicons name="business" size={18} color={DK.accent} />
                    </View>
                    {editingId === item.id ? (
                      <KitInput
                        value={editingName}
                        onChangeText={setEditingName}
                        autoFocus
                        onSubmitEditing={() => void saveRename(item.id)}
                        onBlur={() => void saveRename(item.id)}
                        returnKeyType="done"
                        accessibilityLabel={`שם חדש למחלקה ${item.name}`}
                        style={styles.flex}
                      />
                    ) : (
                      <DKText variant="label" style={styles.flex} numberOfLines={2}>
                        {item.name}
                      </DKText>
                    )}
                    {editingId === item.id ? (
                      <Pressy onPress={() => void saveRename(item.id)} accessibilityLabel="שמירת השם" style={[styles.iconBtn, styles.iconBtnAccent]} pressScale={0.9}>
                        <Ionicons name="checkmark" size={19} color="#FFFFFF" />
                      </Pressy>
                    ) : (
                      <>
                        <Pressy
                          onPress={() => {
                            setEditingId(item.id);
                            setEditingName(item.name);
                          }}
                          accessibilityLabel={`שינוי שם ${item.name}`}
                          style={styles.iconBtn}
                          pressScale={0.9}
                        >
                          <Ionicons name="pencil" size={17} color={DK.accent} />
                        </Pressy>
                        <Pressy onPress={() => void confirmDelete(item)} accessibilityLabel={`מחיקת ${item.name}`} style={[styles.iconBtn, styles.iconBtnDanger]} pressScale={0.9}>
                          <Ionicons name="trash-outline" size={17} color={STATUS.expired.fg} />
                        </Pressy>
                      </>
                    )}
                  </View>
                ))}
              </KitSection>
            </Reveal>
          )}
        </>
      )}
    </DriverPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  add: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 12 },
  addBtn: { width: 52, height: 52, borderRadius: 16, backgroundColor: DK.accent, alignItems: 'center', justifyContent: 'center' },
  addBtnIdle: { backgroundColor: DK.surfaceSunk },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, minHeight: 64, paddingHorizontal: DK_SPACE.md, paddingVertical: 8 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  iconBtnAccent: { backgroundColor: DK.accent },
  iconBtnDanger: { backgroundColor: STATUS.expired.soft },
});
