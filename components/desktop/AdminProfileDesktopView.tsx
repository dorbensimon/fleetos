import React from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { BrandLoader } from '../ui/BrandLoader';
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
  onOpenCompanySettings,
  createdAt,
}: {
  fullName: string;
  role: string;
  email: string | null;
  company: Company | null;
  editing: boolean;
  form: { fullName: string; phone: string };
  errors: Record<string, string>;
  saving: boolean;
  onToggleEdit: () => void;
  onChangeField: (field: 'fullName' | 'phone', value: string) => void;
  onChangePassword: () => void;
  onOpenCompanySettings: () => void;
  createdAt: string | null;
}) {
  const initial = fullName.trim().charAt(0) || '?';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.pageHeading}>
        <View>
          <DText weight="bold" style={styles.pageTitle}>הפרטים שלי</DText>
          <DText style={styles.pageSubtitle}>ניהול פרטי החשבון וההגדרות האישיות שלך</DText>
        </View>
      </View>

      <View style={styles.identityCard}>
        <View style={styles.avatar}>
          <DText weight="bold" style={styles.avatarText}>{initial}</DText>
        </View>
        <View style={styles.identityText}>
          <DText weight="bold" style={styles.name}>{fullName || '—'}</DText>
          <DText style={styles.role}>{role} · {company?.name || 'icar'}</DText>
        </View>
        <View style={styles.identityMeta}>
          <DText style={styles.identityMetaLabel}>חשבון פעיל</DText>
          <View style={styles.activeDot} />
        </View>
        <HoverPressable style={styles.editButton} hoverStyle={styles.editButtonHover} pressMotionStyle={styles.pressDown} onPress={onToggleEdit} disabled={saving}>
          {saving ? <BrandLoader size={13} color="#fff" /> : <Ionicons name={editing ? 'checkmark' : 'pencil-outline'} size={15} color="#fff" />}
          <DText weight="semiBold" style={styles.editButtonText}>{editing ? 'שמור שינויים' : 'עריכת פרטים'}</DText>
        </HoverPressable>
      </View>

      <View style={styles.workspace}>
        <View style={styles.primaryColumn}>
          <Group title="פרטים אישיים" icon="person-outline">
            <View style={styles.detailGrid}>
              <StaticRow icon="mail-outline" label="אימייל" value={email} />
              <EditableRow icon="call-outline" label="טלפון" editing={editing} value={form.phone ? formatPhone(form.phone) : null} inputValue={form.phone} onChangeText={(v) => onChangeField('phone', v.replace(/\D/g, ''))} error={errors.phone} keyboardType="phone-pad" />
              <EditableRow icon="person-outline" label="שם מלא" editing={editing} value={form.fullName} inputValue={form.fullName} onChangeText={(v) => onChangeField('fullName', v)} error={errors.fullName} />
              <StaticRow icon="star-outline" label="תפקיד" value="אדמין" last />
            </View>
          </Group>

          <Group title="החברה שלי" icon="business-outline">
            <View style={styles.detailGrid}>
              <StaticRow icon="business-outline" label="שם החברה" value={company?.name} />
              <StaticRow icon="pricetag-outline" label="סוג חברה" value={company?.company_type} />
              <StaticRow icon="card-outline" label="ח.פ / ע.מ" value={company?.business_id} />
              <StaticRow icon="location-outline" label="כתובת החברה" value={company?.address} />
              <StaticRow icon="call-outline" label="טלפון החברה" value={company?.phone ? formatPhone(company.phone) : null} last />
              <HoverPressable style={[styles.row, styles.settingsRow]} hoverStyle={styles.rowHover} pressMotionStyle={styles.pressDown} onPress={onOpenCompanySettings}>
                <DText weight="semiBold" style={styles.settingsText}>לניהול הגדרות החברה</DText>
                <Ionicons name="arrow-back" size={15} color={DESKTOP_COLORS.brand} />
              </HoverPressable>
            </View>
          </Group>
        </View>

        <View style={styles.sideColumn}>
          <Group title="אבטחה" icon="shield-checkmark-outline">
            <View style={styles.securityState}>
              <View style={styles.securityIcon}><Ionicons name="shield-checkmark-outline" size={20} color={DESKTOP_TONES.ok.fg} /></View>
              <View style={styles.securityCopy}><DText weight="bold" style={styles.securityTitle}>אבטחת החשבון</DText><DText style={styles.securityDescription}>שמרו על סיסמה עדכנית וייחודית.</DText></View>
            </View>
            <HoverPressable style={styles.actionRow} hoverStyle={styles.rowHover} pressMotionStyle={styles.pressDown} onPress={onChangePassword}>
              <Ionicons name="key-outline" size={17} color={DESKTOP_COLORS.brand} />
              <DText weight="semiBold" style={styles.actionText}>שינוי סיסמה</DText>
              <Ionicons name="chevron-back" size={15} color={DESKTOP_COLORS.inkFaint} />
            </HoverPressable>
          </Group>
          <View style={styles.memberCard}>
            <Ionicons name="calendar-outline" size={17} color={DESKTOP_COLORS.inkMuted} />
            <View><DText style={styles.memberLabel}>חבר/ה במערכת מאז</DText><DText weight="semiBold" style={styles.memberValue}>{createdAt ? formatDate(createdAt) : '—'}</DText></View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function Group({ title, icon, children }: { title?: string; icon?: React.ComponentProps<typeof Ionicons>['name']; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      {!!title && <View style={styles.groupHeading}>{icon && <Ionicons name={icon} size={17} color={DESKTOP_COLORS.brand} />}<DText weight="bold" style={styles.groupTitle}>{title}</DText></View>}
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
  content: { paddingHorizontal: 32, paddingTop: 28, paddingBottom: 52, gap: 20, maxWidth: 1440, width: '100%', alignSelf: 'center' },
  pageHeading: { flexDirection: 'row-reverse', justifyContent: 'space-between' },
  pageTitle: { fontSize: 27, color: DESKTOP_COLORS.ink, letterSpacing: -0.45 },
  pageSubtitle: { fontSize: 13, color: DESKTOP_COLORS.inkMuted, marginTop: 4 },

  identityCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 16,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 16,
    padding: 22,
    minHeight: 112,
    ...webOnly({ boxShadow: '0 12px 28px rgba(22,34,46,0.07)', transition: 'transform 180ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 180ms cubic-bezier(0.23, 1, 0.32, 1)' }),
  },
  avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: DESKTOP_COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 24, textAlign: 'center' },
  identityText: { flex: 1, gap: 2 },
  name: { fontSize: 20, color: DESKTOP_COLORS.ink },
  role: { fontSize: 13, color: DESKTOP_COLORS.inkMuted },
  identityMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, paddingHorizontal: 18, borderLeftWidth: 1, borderLeftColor: DESKTOP_COLORS.borderSoft },
  identityMetaLabel: { fontSize: 12, color: DESKTOP_COLORS.inkMuted },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: DESKTOP_TONES.ok.fg },
  editButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: DESKTOP_COLORS.brand,
  },
  editButtonHover: { backgroundColor: DESKTOP_COLORS.brandHover },
  pressDown: webOnly({ transform: 'scale(0.97)' }),
  editButtonText: { fontSize: 13, color: '#fff' },

  workspace: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 20 },
  primaryColumn: { flex: 1, gap: 20 },
  sideColumn: { width: 330, gap: 20 },
  group: { gap: 9 },
  groupHeading: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  groupTitle: { fontSize: 15, color: DESKTOP_COLORS.ink },
  groupCard: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 14, overflow: 'hidden' },
  detailGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 58, paddingVertical: 10, width: '50%', borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  rowLabel: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted, flex: 1 },
  rowValue: { fontSize: 13, color: DESKTOP_COLORS.ink },
  settingsRow: { borderBottomWidth: 0, backgroundColor: 'rgba(0,136,204,0.045)' },
  settingsText: { flex: 1, fontSize: 12.5, color: DESKTOP_COLORS.brand },
  securityState: { flexDirection: 'row-reverse', gap: 11, alignItems: 'center', padding: 16, backgroundColor: DESKTOP_TONES.ok.bg },
  securityIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  securityCopy: { flex: 1 },
  securityTitle: { fontSize: 13, color: DESKTOP_COLORS.ink },
  securityDescription: { fontSize: 11.5, color: DESKTOP_COLORS.inkMuted, marginTop: 2 },
  actionRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 52 },
  actionText: { flex: 1, fontSize: 13, color: DESKTOP_COLORS.ink },
  memberCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11, borderRadius: 14, padding: 16, backgroundColor: DESKTOP_COLORS.surfaceMuted, borderWidth: 1, borderColor: DESKTOP_COLORS.borderSoft },
  memberLabel: { fontSize: 11.5, color: DESKTOP_COLORS.inkMuted },
  memberValue: { fontSize: 13, color: DESKTOP_COLORS.ink, marginTop: 2 },

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
