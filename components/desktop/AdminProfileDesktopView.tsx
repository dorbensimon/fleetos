import React from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Company } from '../../lib/supabase';
import { formatDate } from '../../lib/theme';
import { formatPhone } from '../../lib/phone';
import { DLtrText, DText, HoverPressable } from './primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, webOnly } from './desktopTheme';

/**
 * Desktop body of the admin's own profile: an identity card plus grouped
 * detail cards (personal/company/security), in a single centered column
 * instead of the phone's glass cards. Purely presentational —
 * AdminProfileScreen owns loading, edit state and saving.
 */
export function AdminProfileDesktopView({
  fullName,
  role,
  email,
  company,
  editing,
  form,
  errors,
  saving,
  onToggleEdit,
  onChangeField,
  onChangePassword,
  createdAt,
}: {
  fullName: string;
  role: string;
  email: string | null;
  company: Company | null;
  editing: boolean;
  form: { fullName: string; phone: string; companyPhone: string };
  errors: Record<string, string>;
  saving: boolean;
  onToggleEdit: () => void;
  onChangeField: (field: 'fullName' | 'phone' | 'companyPhone', value: string) => void;
  onChangePassword: () => void;
  createdAt: string | null;
}) {
  const initial = fullName.trim().charAt(0) || '?';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.identityCard}>
        <View style={styles.avatar}>
          <DText weight="bold" style={styles.avatarText}>{initial}</DText>
        </View>
        <View style={styles.identityText}>
          <DText weight="bold" style={styles.name}>{fullName || '—'}</DText>
          <DText style={styles.role}>{role}</DText>
        </View>
        <HoverPressable style={styles.editButton} hoverStyle={styles.editButtonHover} onPress={onToggleEdit} disabled={saving}>
          <Ionicons name={editing ? 'checkmark' : 'pencil-outline'} size={13} color={DESKTOP_COLORS.brand} />
          <DText weight="semiBold" style={styles.editButtonText}>{editing ? (saving ? 'שומר…' : 'שמירה') : 'עריכת פרטים'}</DText>
        </HoverPressable>
      </View>

      <Group title="פרטים אישיים">
        <StaticRow icon="mail-outline" label="אימייל" value={email} />
        <EditableRow
          icon="call-outline"
          label="טלפון"
          editing={editing}
          value={form.phone ? formatPhone(form.phone) : null}
          inputValue={form.phone}
          onChangeText={(v) => onChangeField('phone', v.replace(/\D/g, ''))}
          error={errors.phone}
          keyboardType="phone-pad"
        />
        <EditableRow
          icon="person-outline"
          label="שם מלא"
          editing={editing}
          value={form.fullName}
          inputValue={form.fullName}
          onChangeText={(v) => onChangeField('fullName', v)}
          error={errors.fullName}
        />
        <StaticRow icon="star-outline" label="תפקיד" value="אדמין" last />
      </Group>

      <Group title="פרטי חברה">
        <StaticRow icon="business-outline" label="שם החברה" value={company?.name} />
        <StaticRow icon="pricetag-outline" label="סוג חברה" value={company?.company_type} />
        <StaticRow icon="card-outline" label="ח.פ / ע.מ" value={company?.business_id} />
        <StaticRow icon="location-outline" label="כתובת החברה" value={company?.address} />
        <EditableRow
          icon="call-outline"
          label="טלפון החברה"
          editing={editing}
          value={form.companyPhone ? formatPhone(form.companyPhone) : company?.phone ? formatPhone(company.phone) : null}
          inputValue={form.companyPhone}
          onChangeText={(v) => onChangeField('companyPhone', v.replace(/\D/g, ''))}
          error={errors.companyPhone}
          keyboardType="phone-pad"
          last
        />
      </Group>

      <Group title="אבטחה">
        <HoverPressable style={styles.row} hoverStyle={styles.rowHover} onPress={onChangePassword}>
          <DText style={styles.rowLabel}>שינוי סיסמה</DText>
          <Ionicons name="chevron-back" size={14} color={DESKTOP_COLORS.inkFaint} />
        </HoverPressable>
      </Group>

      <Group>
        <StaticRow icon="calendar-outline" label="תאריך הצטרפות" value={createdAt ? formatDate(createdAt) : null} last />
      </Group>
    </ScrollView>
  );
}

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      {!!title && <DText weight="bold" style={styles.groupTitle}>{title}</DText>}
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

function StaticRow({
  icon,
  label,
  value,
  last,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string | null;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Ionicons name={icon} size={15} color={DESKTOP_COLORS.inkFaint} />
      <DText style={styles.rowLabel}>{label}</DText>
      <DLtrText style={styles.rowValue} numberOfLines={1}>{value || '—'}</DLtrText>
    </View>
  );
}

function EditableRow({
  icon,
  label,
  editing,
  value,
  inputValue,
  onChangeText,
  error,
  keyboardType,
  last,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  editing: boolean;
  value: string | null;
  inputValue: string;
  onChangeText: (v: string) => void;
  error?: string;
  keyboardType?: TextInput['props']['keyboardType'];
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Ionicons name={icon} size={15} color={DESKTOP_COLORS.inkFaint} />
      <DText style={styles.rowLabel}>{label}</DText>
      {editing ? (
        <View style={styles.inputWrap}>
          <TextInput
            value={inputValue}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            textAlign="right"
            style={[styles.input, error && styles.inputError, webOnly({ outlineStyle: 'none' })]}
          />
          {!!error && <DText style={styles.errorText}>{error}</DText>}
        </View>
      ) : (
        <DLtrText style={styles.rowValue} numberOfLines={1}>{value || '—'}</DLtrText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, paddingBottom: 48, gap: 16, maxWidth: 640, width: '100%', alignSelf: 'center' },

  identityCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 8,
    padding: 18,
  },
  avatar: { width: 48, height: 48, borderRadius: 11, backgroundColor: DESKTOP_COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 18, textAlign: 'center' },
  identityText: { flex: 1, gap: 2 },
  name: { fontSize: 15 },
  role: { fontSize: 12, color: DESKTOP_COLORS.inkFaint },
  editButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
  },
  editButtonHover: { backgroundColor: DESKTOP_COLORS.canvas },
  editButtonText: { fontSize: 12, color: DESKTOP_COLORS.brand },

  group: { gap: 8 },
  groupTitle: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint, letterSpacing: 0.2 },
  groupCard: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 42, paddingVertical: 8 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  rowLabel: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, flex: 1 },
  rowValue: { fontSize: 12.5 },

  inputWrap: { minWidth: 160, alignItems: 'flex-end' },
  input: {
    fontSize: 12.5,
    color: DESKTOP_COLORS.ink,
    borderBottomWidth: 1,
    borderBottomColor: DESKTOP_COLORS.borderInput,
    paddingVertical: 4,
    minWidth: 160,
    textAlign: 'right',
  },
  inputError: { borderBottomColor: DESKTOP_TONES.bad.fg },
  errorText: { fontSize: 11, color: DESKTOP_TONES.bad.fg, marginTop: 2 },
});
