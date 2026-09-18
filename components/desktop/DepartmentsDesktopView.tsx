import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Department } from '../../lib/adminApi';
import { DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from './desktopTheme';

/**
 * Desktop body of the departments screen: an inline add row plus a dense
 * table of existing departments, instead of a scrolling card stack.
 * Purely presentational — DepartmentsScreen owns data and edit state.
 */
export function DepartmentsDesktopView({
  departments,
  newName,
  onChangeNewName,
  onAdd,
  adding,
  editingId,
  editingName,
  onChangeEditingName,
  onStartEdit,
  onSaveEdit,
  onDelete,
}: {
  departments: Department[];
  newName: string;
  onChangeNewName: (value: string) => void;
  onAdd: () => void;
  adding: boolean;
  editingId: string | null;
  editingName: string;
  onChangeEditingName: (value: string) => void;
  onStartEdit: (dept: Department) => void;
  onSaveEdit: (id: string) => void;
  onDelete: (dept: Department) => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.addRow}>
        <TextInput
          value={newName}
          onChangeText={onChangeNewName}
          placeholder="שם מחלקה חדשה, למשל: תפעול"
          placeholderTextColor={DESKTOP_COLORS.inkFaint}
          textAlign="right"
          onSubmitEditing={onAdd}
          returnKeyType="done"
          style={[styles.input, webOnly({ outlineStyle: 'none' })]}
        />
        <HoverPressable
          style={[styles.addButton, (!newName.trim() || adding) && styles.addButtonDisabled]}
          hoverStyle={styles.addButtonHover}
          onPress={onAdd}
          disabled={!newName.trim() || adding}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <DText weight="semiBold" style={styles.addButtonText}>הוסף מחלקה</DText>
        </HoverPressable>
      </View>

      <View style={styles.table}>
        {departments.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="business-outline" size={22} color={DESKTOP_COLORS.inkFaint} />
            <DText style={styles.emptyText}>עדיין אין מחלקות</DText>
          </View>
        ) : (
          departments.map((dept, index) => (
            <View key={dept.id} style={[styles.row, index === departments.length - 1 && styles.rowLast]}>
              {editingId === dept.id ? (
                <TextInput
                  value={editingName}
                  onChangeText={onChangeEditingName}
                  textAlign="right"
                  autoFocus
                  onSubmitEditing={() => onSaveEdit(dept.id)}
                  onBlur={() => onSaveEdit(dept.id)}
                  returnKeyType="done"
                  style={[styles.rowInput, webOnly({ outlineStyle: 'none' })]}
                />
              ) : (
                <DText weight="semiBold" style={styles.rowName}>{dept.name}</DText>
              )}
              <View style={styles.rowActions}>
                <HoverPressable style={styles.iconButton} hoverStyle={styles.iconButtonHover} onPress={() => onStartEdit(dept)}>
                  <Ionicons name="pencil-outline" size={14} color={DESKTOP_COLORS.brand} />
                </HoverPressable>
                <HoverPressable
                  style={styles.iconButton}
                  hoverStyle={[styles.iconButtonHover, { backgroundColor: DESKTOP_TONES.bad.bg }]}
                  onPress={() => onDelete(dept)}
                >
                  <Ionicons name="trash-outline" size={14} color={DESKTOP_TONES.bad.fg} />
                </HoverPressable>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, gap: 16, maxWidth: 640 },
  addRow: { flexDirection: 'row-reverse', gap: 10 },
  input: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    borderRadius: 7,
    paddingHorizontal: 12,
    fontSize: 13,
    color: DESKTOP_COLORS.ink,
    backgroundColor: DESKTOP_COLORS.surface,
    textAlign: 'right',
  },
  addButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 7,
    backgroundColor: DESKTOP_COLORS.brand,
  },
  addButtonHover: { backgroundColor: DESKTOP_COLORS.brandHover },
  addButtonDisabled: { backgroundColor: DESKTOP_COLORS.borderInput },
  addButtonText: { fontSize: 12.5, color: '#fff' },

  table: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    height: 44,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.borderSoft,
  },
  rowLast: { borderBottomWidth: 0 },
  rowName: { fontSize: 13 },
  rowInput: {
    flex: 1,
    fontSize: 13,
    color: DESKTOP_COLORS.ink,
    padding: 0,
    textAlign: 'right',
  },
  rowActions: { flexDirection: 'row-reverse', gap: 6 },
  iconButton: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonHover: { backgroundColor: DESKTOP_COLORS.brandFocusRing },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint },
});
