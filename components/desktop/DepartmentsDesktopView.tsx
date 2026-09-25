import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { BrandLoader } from '../ui/BrandLoader';
import { Ionicons } from '@expo/vector-icons';
import { Department } from '../../lib/adminApi';
import { DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from './desktopTheme';

/** Desktop workspace; its parent owns all persistence and confirmation flows. */
export function DepartmentsDesktopView({ departments, newName, onChangeNewName, onAdd, adding, editingId, editingName, onChangeEditingName, onStartEdit, onSaveEdit, onCancelEdit, onDelete }: {
  departments: Department[]; newName: string; onChangeNewName: (value: string) => void; onAdd: () => void; adding: boolean;
  editingId: string | null; editingName: string; onChangeEditingName: (value: string) => void;
  onStartEdit: (dept: Department) => void; onSaveEdit: (id: string) => void; onCancelEdit: () => void; onDelete: (dept: Department) => void;
}) {
  const [query, setQuery] = useState('');
  const [focusedField, setFocusedField] = useState<'new' | 'search' | string | null>(null);
  const visibleDepartments = useMemo(() => {
    const normalized = query.trim();
    return normalized ? departments.filter((department) => department.name.includes(normalized)) : departments;
  }, [departments, query]);

  return <View style={styles.wrap}>
    <View style={styles.pageHeader}>
      <View style={styles.headerIcon}><Ionicons name="business-outline" size={21} color={DESKTOP_COLORS.brand} /></View>
      <View style={styles.headerCopy}>
        <DText weight="bold" style={styles.title}>מחלקות</DText>
        <DText style={styles.subtitle}>ארגון המחלקות מאפשר שיוך מסודר של נהגים ורכבים.</DText>
      </View>
    </View>

    <View style={styles.createSection}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionIcon}><Ionicons name="add" size={18} color={DESKTOP_COLORS.brand} /></View>
        <View style={styles.sectionCopy}>
          <DText weight="semiBold" style={styles.sectionTitle}>הוספת מחלקה</DText>
          <DText style={styles.sectionHint}>תן שם ברור לצוות או לתחום הפעילות.</DText>
        </View>
      </View>
      <View style={styles.addRow}>
        <TextInput value={newName} onChangeText={onChangeNewName} placeholder="שם המחלקה, למשל: תפעול" placeholderTextColor={DESKTOP_COLORS.inkMuted} textAlign="right" onFocus={() => setFocusedField('new')} onBlur={() => setFocusedField(null)} onSubmitEditing={onAdd} returnKeyType="done" style={[styles.input, focusedField === 'new' && styles.inputFocused, webOnly({ outlineStyle: 'none' })]} />
        <HoverPressable style={[styles.addButton, (!newName.trim() || adding) && styles.addButtonDisabled]} hoverStyle={styles.addButtonHover} pressStyle={styles.addButtonPress} onPress={onAdd} disabled={!newName.trim() || adding}>
          {adding ? <BrandLoader size="small" color="#fff" /> : <Ionicons name="add" size={18} color="#fff" />}
          <DText weight="semiBold" style={styles.addButtonText}>{adding ? 'מוסיף…' : 'הוספת מחלקה'}</DText>
        </HoverPressable>
      </View>
    </View>

    <View style={styles.listSection}>
      <View style={styles.listHeader}>
        <View style={styles.listHeading}>
          <DText weight="semiBold" style={styles.sectionTitle}>מחלקות קיימות</DText>
          <View style={styles.countBadge}><DText weight="semiBold" style={styles.countText}>{departments.length}</DText></View>
        </View>
        <View style={[styles.searchWrap, focusedField === 'search' && styles.searchWrapFocused]}>
          <Ionicons name="search-outline" size={16} color={DESKTOP_COLORS.inkMuted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="חיפוש מחלקה" placeholderTextColor={DESKTOP_COLORS.inkMuted} textAlign="right" onFocus={() => setFocusedField('search')} onBlur={() => setFocusedField(null)} style={[styles.searchInput, webOnly({ outlineStyle: 'none' })]} />
        </View>
      </View>

      <View style={styles.table}>
        {departments.length === 0 ? <View style={styles.empty}>
          <View style={styles.emptyIcon}><Ionicons name="business-outline" size={24} color={DESKTOP_COLORS.brand} /></View>
          <DText weight="semiBold" style={styles.emptyTitle}>עדיין אין מחלקות</DText>
          <DText style={styles.emptyText}>הוסף את המחלקה הראשונה באמצעות השדה למעלה.</DText>
        </View> : visibleDepartments.length === 0 ? <View style={styles.empty}>
          <DText weight="semiBold" style={styles.emptyTitle}>לא נמצאו מחלקות</DText><DText style={styles.emptyText}>נסה לחפש בשם אחר.</DText>
        </View> : visibleDepartments.map((dept, index) => <View key={dept.id} style={[styles.row, index === visibleDepartments.length - 1 && styles.rowLast]}>
          <View style={styles.rowIdentity}>
            <View style={styles.departmentMark}><Ionicons name="business-outline" size={16} color={DESKTOP_COLORS.brand} /></View>
            {editingId === dept.id ? <TextInput value={editingName} onChangeText={onChangeEditingName} textAlign="right" autoFocus onFocus={() => setFocusedField(dept.id)} onBlur={() => setFocusedField(null)} onSubmitEditing={() => onSaveEdit(dept.id)} returnKeyType="done" style={[styles.rowInput, focusedField === dept.id && styles.rowInputFocused, webOnly({ outlineStyle: 'none' })]} /> : <DText weight="semiBold" style={styles.rowName}>{dept.name}</DText>}
          </View>
          <View style={styles.rowActions}>
            <HoverPressable style={styles.editButton} hoverStyle={styles.editButtonHover} pressStyle={styles.iconButtonPress} onPress={() => editingId === dept.id ? onSaveEdit(dept.id) : onStartEdit(dept)} accessibilityLabel={editingId === dept.id ? 'שמירת שם המחלקה' : `עריכת ${dept.name}`}>
              <Ionicons name={editingId === dept.id ? 'checkmark' : 'pencil-outline'} size={16} color={DESKTOP_COLORS.brand} /><DText weight="semiBold" style={styles.editText}>{editingId === dept.id ? 'שמירה' : 'עריכה'}</DText>
            </HoverPressable>
            {editingId === dept.id && <HoverPressable style={styles.cancelButton} hoverStyle={styles.cancelButtonHover} pressStyle={styles.iconButtonPress} onPress={onCancelEdit} accessibilityLabel="ביטול עריכת המחלקה"><Ionicons name="close" size={16} color={DESKTOP_COLORS.inkMuted} /></HoverPressable>}
            <HoverPressable style={styles.deleteButton} hoverStyle={styles.deleteButtonHover} pressStyle={styles.iconButtonPress} onPress={() => onDelete(dept)} accessibilityLabel={`מחיקת ${dept.name}`}><Ionicons name="trash-outline" size={16} color={DESKTOP_TONES.bad.fg} /></HoverPressable>
          </View>
        </View>)}
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 880, alignSelf: 'center', padding: 32, gap: 20 }, pageHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }, headerIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: DESKTOP_COLORS.brandFocusRing, alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1, gap: 2 }, title: { fontSize: 23, lineHeight: 29, color: DESKTOP_COLORS.ink }, subtitle: { fontSize: 13, lineHeight: 19, color: DESKTOP_COLORS.inkMuted },
  createSection: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 14, padding: 20, gap: 16 }, sectionHeading: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }, sectionIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: DESKTOP_COLORS.brandFocusRing, alignItems: 'center', justifyContent: 'center' }, sectionCopy: { flex: 1, gap: 1 }, sectionTitle: { fontSize: 15, color: DESKTOP_COLORS.ink }, sectionHint: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted }, addRow: { flexDirection: 'row-reverse', gap: 10 }, input: { flex: 1, height: 44, borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput, borderRadius: 10, paddingHorizontal: 14, fontSize: 13.5, color: DESKTOP_COLORS.ink, backgroundColor: DESKTOP_COLORS.surface, textAlign: 'right' }, inputFocused: { borderColor: DESKTOP_COLORS.brand, ...webOnly({ boxShadow: '0 0 0 3px rgba(0,136,204,0.14)' }) }, addButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, minWidth: 146, height: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: DESKTOP_COLORS.brandHover }, addButtonHover: { backgroundColor: DESKTOP_COLORS.brand }, addButtonPress: { transform: [{ scale: 0.97 }] }, addButtonDisabled: { backgroundColor: DESKTOP_COLORS.borderInput }, addButtonText: { fontSize: 13, color: '#fff' },
  listSection: { gap: 10 }, listHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 16 }, listHeading: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }, countBadge: { minWidth: 26, height: 22, paddingHorizontal: 7, borderRadius: 11, backgroundColor: DESKTOP_COLORS.brandFocusRing, alignItems: 'center', justifyContent: 'center' }, countText: { fontSize: 12, color: DESKTOP_COLORS.brandHover }, searchWrap: { width: 205, height: 36, paddingHorizontal: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 9, backgroundColor: DESKTOP_COLORS.surface }, searchWrapFocused: { borderColor: DESKTOP_COLORS.brand, ...webOnly({ boxShadow: '0 0 0 3px rgba(0,136,204,0.14)' }) }, searchInput: { flex: 1, height: '100%', fontSize: 12.5, color: DESKTOP_COLORS.ink, textAlign: 'right' },
  table: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 14, overflow: 'hidden' }, row: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', minHeight: 64, paddingHorizontal: 16, gap: 14, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft }, rowLast: { borderBottomWidth: 0 }, rowIdentity: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }, departmentMark: { width: 32, height: 32, borderRadius: 10, backgroundColor: DESKTOP_COLORS.brandFocusRing, alignItems: 'center', justifyContent: 'center' }, rowName: { flex: 1, fontSize: 14, color: DESKTOP_COLORS.ink }, rowInput: { flex: 1, height: 36, borderWidth: 1, borderColor: DESKTOP_COLORS.brand, borderRadius: 8, paddingHorizontal: 9, fontSize: 14, color: DESKTOP_COLORS.ink, textAlign: 'right' }, rowInputFocused: { ...webOnly({ boxShadow: '0 0 0 3px rgba(0,136,204,0.14)' }) }, rowActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 }, editButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5, height: 34, paddingHorizontal: 10, borderRadius: 8 }, editButtonHover: { backgroundColor: DESKTOP_COLORS.brandFocusRing }, editText: { fontSize: 12, color: DESKTOP_COLORS.brand }, deleteButton: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, deleteButtonHover: { backgroundColor: DESKTOP_TONES.bad.bg }, cancelButton: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, cancelButtonHover: { backgroundColor: DESKTOP_COLORS.canvas }, iconButtonPress: { transform: [{ scale: 0.94 }] },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 46, paddingHorizontal: 20 }, emptyIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: DESKTOP_COLORS.brandFocusRing, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }, emptyTitle: { fontSize: 14, color: DESKTOP_COLORS.ink }, emptyText: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, textAlign: 'center' },
});
