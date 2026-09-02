import React, { useCallback, useRef, useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, LoadingState, EmptyState, ErrorState, useToast } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { COLORS, SPACING, ACCENT_SHADOW } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { listDepartments, createDepartment, updateDepartment, deleteDepartment, Department } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';

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
      Alert.alert('הוספת מחלקה נכשלה', String(err?.message ?? 'נסה שוב'));
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
      Alert.alert('שינוי השם נכשל', String(err?.message ?? 'נסה שוב'));
    }
  };

  const confirmDelete = (dept: Department) => {
    Alert.alert(
      'מחיקת מחלקה',
      `למחוק את "${dept.name}"? רכבים ששויכו אליה יישארו ללא מחלקה.`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDepartment(dept.id);
              await load();
            } catch (err: any) {
              Alert.alert('מחיקה נכשלה', String(err?.message ?? 'נסה שוב'));
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <AdminGradientBackground />

      <View style={[styles.navBar, { paddingTop: insets.top }]}>
        <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.navContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <AppText weight="bold" style={styles.navBack}>‹ חזרה</AppText>
          </TouchableOpacity>
          <AppText weight="bold" style={styles.navTitle} numberOfLines={1}>
            מחלקות
          </AppText>
          <View style={{ minWidth: 50 }} />
        </View>
      </View>

      <View style={styles.content}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <FlatList
            style={styles.list}
            data={departments}
            keyExtractor={(d) => d.id}
            contentContainerStyle={styles.listContent}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6F9' },

  navBar: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'rgba(240,246,251,.72)',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(14,30,43,.06)',
  },
  navContent: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 18,
  },
  navBack: { fontSize: 17, lineHeight: 22, color: COLORS.accent },
  navTitle: { fontSize: 17, lineHeight: 22, color: '#101F2C' },

  content: { flex: 1, paddingHorizontal: 18, paddingTop: SPACING.lg },

  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 9 },
  sectionDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.accent },
  sectionTitle: { fontSize: 12, letterSpacing: 0.8, color: 'rgba(16,31,44,.42)' },

  card: {
    backgroundColor: 'rgba(255,255,255,.92)',
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: 'rgba(16,31,44,.045)',
    shadowColor: '#102A42',
    shadowOpacity: 0.55,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 5,
    overflow: 'hidden',
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
  input: { flex: 1, fontSize: 16.5, fontWeight: '500', padding: 0, color: '#101F2C', textAlign: 'right' },
  rowValue: { flex: 1, fontSize: 17, fontWeight: '700', color: '#101F2C', textAlign: 'right' },

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
  listContent: { flexGrow: 1, paddingBottom: 40, gap: SPACING.sm },
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
