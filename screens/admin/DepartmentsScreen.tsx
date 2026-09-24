import React, { useCallback, useRef, useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { showAlert } from '../../lib/platformAlert';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, LoadingState, EmptyState, ErrorState, useToast, BackButton } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { COLORS, CONTENT_MAX_WIDTH, SPACING, ACCENT_SHADOW, FONT, FONT_SIZE, BRAND } from '../../lib/theme';
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
    const parts = [
      usage.vehicles === 1 ? 'רכב אחד' : usage.vehicles > 0 ? `${usage.vehicles} רכבים` : '',
      usage.drivers === 1 ? 'נהג אחד' : usage.drivers > 0 ? `${usage.drivers} נהגים` : '',
    ].filter(Boolean);
    const isSingular = usage.vehicles + usage.drivers === 1;
    const message = parts.length
      ? `למחוק את "${dept.name}"? ${parts.join(' ו')} ${isSingular ? 'משויך' : 'משויכים'} אליה כרגע, ו${isSingular ? 'יישאר' : 'יישארו'} ללא מחלקה.`
      : `למחוק את "${dept.name}"?`;

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

  return (
    <View style={styles.screen}>
      <AdminGradientBackground />

      <View style={[styles.topBar, { paddingTop: insets.top + 20 }]}>
        <View style={{ width: 42 }} />
        <AppText weight="bold" style={styles.topTitle} numberOfLines={1}>
          מחלקות
        </AppText>
        <BackButton onPress={() => navigation.goBack()} />
      </View>

      <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <FlatList
            style={styles.list}
            data={departments}
            keyExtractor={(d) => d.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: 40 + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionDot} />
                  <AppText weight="bold" style={styles.sectionTitle}>מחלקה חדשה</AppText>
                </View>
                <View style={styles.card}>
                  <View style={[styles.row, styles.rowLast]}>
                    <TextInput
                      value={newName}
                      onChangeText={setNewName}
                      placeholder="למשל: תפעול"
                      placeholderTextColor={COLORS.textFaint}
                      textAlign="right"
                      onSubmitEditing={addDepartment}
                      returnKeyType="done"
                      style={styles.input}
                    />
                    <TouchableOpacity
                      onPress={addDepartment}
                      disabled={!newName.trim() || adding}
                      activeOpacity={0.85}
                      style={[
                        styles.addButton,
                        (!newName.trim() || adding) ? styles.addButtonDisabled : ACCENT_SHADOW,
                      ]}
                    >
                      <Ionicons name="add" size={20} color={COLORS.textInverse} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={[styles.sectionHeader, { marginTop: SPACING.xl }]}>
                  <View style={styles.sectionDot} />
                  <AppText weight="bold" style={styles.sectionTitle}>רשימת מחלקות</AppText>
                </View>
              </>
            }
            ListEmptyComponent={
              <EmptyState icon="business-outline" title="עדיין אין מחלקות" hint="הוסף מחלקה ראשונה למעלה" />
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={[styles.row, styles.rowLast]}>
                  {editingId === item.id ? (
                    <TextInput
                      style={styles.input}
                      value={editingName}
                      onChangeText={setEditingName}
                      textAlign="right"
                      autoFocus
                      onSubmitEditing={() => saveRename(item.id)}
                      onBlur={() => saveRename(item.id)}
                      returnKeyType="done"
                    />
                  ) : (
                    <AppText weight="bold" style={styles.rowValue}>
                      {item.name}
                    </AppText>
                  )}

                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => {
                        setEditingId(item.id);
                        setEditingName(item.name);
                      }}
                      hitSlop={8}
                    >
                      <Ionicons name="pencil-outline" size={15} color={COLORS.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconButton, styles.iconButtonDanger]}
                      onPress={() => confirmDelete(item)}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={15} color={COLORS.dangerText} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.screenBg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: SPACING.md,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  topTitle: { flex: 1, fontSize: FONT_SIZE.xl, color: BRAND.ink, textAlign: 'center', marginHorizontal: 8 },

  content: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },

  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 9 },
  sectionDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.accent },
  sectionTitle: { fontSize: FONT_SIZE.sm, letterSpacing: 0.8, color: BRAND.inkSecondary },

  card: {
    backgroundColor: 'rgba(255,255,255,.92)',
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: 'rgba(16,31,44,.045)',
    // Soft card shadow; no overflow:hidden (it drops the shadow on iOS).
    shadowColor: BRAND.ink,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingRight: 16,
    paddingLeft: 10,
    minHeight: 56,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(14,30,43,.07)',
    gap: 10,
  },
  rowLast: { borderBottomWidth: 0 },
  input: { flex: 1, fontSize: FONT_SIZE.xl, fontFamily: FONT.medium, padding: 0, color: BRAND.ink, textAlign: 'right' },
  rowValue: { flex: 1, fontSize: FONT_SIZE.xl, fontFamily: FONT.bold, color: BRAND.ink, textAlign: 'right' },

  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { backgroundColor: 'rgba(118,118,128,.18)' },

  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: SPACING.lg, paddingBottom: 40, gap: SPACING.sm },
  rowActions: { flexDirection: 'row-reverse', gap: 8 },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,136,204,.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDanger: { backgroundColor: 'rgba(197,53,53,.10)' },
});
