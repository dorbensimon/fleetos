import React, { useCallback, useRef, useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, ScreenHeader, AppText, Card, LoadingState, EmptyState, ErrorState, useToast } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { COLORS, RADIUS, SPACING, CARD_SHADOW } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { listDepartments, createDepartment, updateDepartment, deleteDepartment, Department } from '../../lib/adminApi';
import { RootStackParamList } from '../../navigation/types';

/**
 * Manages the company's internal org units ("תפעול", "הסעות" ...) that
 * vehicles can be tagged with. Reached from the hamburger menu, not a
 * tab — this is a rarely-touched setup screen, not daily-use.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'Departments'>;

export default function DepartmentsScreen({ navigation }: Props) {
  const { companyId } = useCompany();
  const { showToast } = useToast();
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
    <Screen>
      <AdminGradientBackground />
      <ScreenHeader title="מחלקות" subtitle="יחידות ארגוניות לשיוך רכבים" onBack={() => navigation.goBack()} />

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          value={newName}
          onChangeText={setNewName}
          placeholder="שם מחלקה חדשה, למשל תפעול"
          placeholderTextColor={COLORS.textFaint}
          textAlign="right"
          onSubmitEditing={addDepartment}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addButton, (!newName.trim() || adding) && styles.addButtonDisabled]}
          onPress={addDepartment}
          disabled={!newName.trim() || adding}
        >
          <Ionicons name="add" size={20} color={COLORS.textInverse} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FlatList
          data={departments}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="business-outline" title="עדיין אין מחלקות" hint="הוסף מחלקה ראשונה למעלה" />
          }
          renderItem={({ item }) => (
            <Card style={styles.row}>
              {editingId === item.id ? (
                <TextInput
                  style={styles.editInput}
                  value={editingName}
                  onChangeText={setEditingName}
                  textAlign="right"
                  autoFocus
                  onSubmitEditing={() => saveRename(item.id)}
                  onBlur={() => saveRename(item.id)}
                  returnKeyType="done"
                />
              ) : (
                <AppText weight="bold" style={styles.rowText}>
                  {item.name}
                </AppText>
              )}

              <View style={styles.rowActions}>
                <TouchableOpacity
                  style={styles.rowButton}
                  onPress={() => {
                    setEditingId(item.id);
                    setEditingName(item.name);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="pencil-outline" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.rowButton} onPress={() => confirmDelete(item)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color={COLORS.dangerText} />
                </TouchableOpacity>
              </View>
            </Card>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addRow: {
    flexDirection: 'row-reverse',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  addInput: {
    flex: 1,
    height: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.field,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
    paddingHorizontal: 14,
    fontSize: 15,
    color: COLORS.text,
  },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { opacity: 0.4 },

  list: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: 48 },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
    ...CARD_SHADOW,
  },
  rowText: { flex: 1, fontSize: 15 },
  editInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    padding: 0,
  },
  rowActions: { flexDirection: 'row-reverse', gap: SPACING.sm },
  rowButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
