import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Pressable,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { supabase, Company } from '../lib/supabase';
import { pickAndUploadLogo } from '../lib/uploadLogo';

const COLORS = {
  screenBg: '#EEEEEE',
  white: '#FFFFFF',
  black: '#000000',
  gray: '#666666',
  grayLight: '#979797',
  border: '#E2E2E2',
  blue: '#0088CC',
  red: '#C0392B',
  activeBg: '#E6F6EF',
  activeText: '#1E8E63',
  disabledBg: '#F0EAEA',
  disabledText: '#B4685F',
  fieldBg: '#FAFAFA',
};

interface CompanyUser {
  id: string;
  role: 'admin' | 'driver';
  full_name: string | null;
  must_change_password: boolean;
  created_at: string;
  email: string | null;
}

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyDetail'>;

export default function CompanyDetailScreen({ route, navigation }: Props) {
  const { companyId } = route.params;

  const [company, setCompany] = useState<Company | null>(null);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');

  const handlePickLogo = async () => {
    setLogoError('');
    setUploadingLogo(true);
    try {
      const url = await pickAndUploadLogo();
      if (url) {
        setLogoUrl(url);
      }
    } catch (err: any) {
      setLogoError(err?.message || 'העלאת הלוגו נכשלה');
    } finally {
      setUploadingLogo(false);
    }
  };
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [addAdminError, setAddAdminError] = useState('');

  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<CompanyUser | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    const { data: companyData } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single<Company>();

    if (companyData) {
      setCompany(companyData);
      setName(companyData.name);
      setLogoUrl(companyData.logo_url || '');
    }

    const { data: usersData, error } = await supabase.functions.invoke('list-company-users', {
      body: { companyId },
    });

    if (!error && usersData?.success) {
      setUsers(usersData.users);
    }
  }, [companyId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const hasChanges = company && (name.trim() !== company.name || logoUrl.trim() !== (company.logo_url || ''));

  const saveChanges = async () => {
    if (!company || !name.trim()) return;
    setSaveError('');
    setSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({ name: name.trim(), logo_url: logoUrl.trim() || null })
      .eq('id', company.id);
    setSaving(false);
    if (error) {
      setSaveError('שמירת השינויים נכשלה');
      return;
    }
    await load();
  };

  const toggleActive = async () => {
    if (!company) return;
    const newStatus = company.status === 'active' ? 'disabled' : 'active';
    await supabase.from('companies').update({ status: newStatus }).eq('id', company.id);
    await load();
  };

  const deleteMatches = !!company && deleteConfirmText.trim() === company.name;

  const confirmDeleteCompany = async () => {
    if (!company || !deleteMatches) return;
    setDeleting(true);
    await supabase.from('companies').delete().eq('id', company.id);
    setDeleting(false);
    navigation.goBack();
  };

  const addAdmin = async () => {
    setAddAdminError('');
    if (!newAdminEmail.trim()) {
      setAddAdminError('נא להזין מייל');
      return;
    }
    setAddingAdmin(true);
    try {
      const { data, error } = await supabase.functions.invoke('add-company-admin', {
        body: { companyId, adminEmail: newAdminEmail.trim() },
      });
      if (error || !data?.success) {
        setAddAdminError(data?.error || 'הוספת האדמין נכשלה');
        return;
      }
      setTempPassword({ email: newAdminEmail.trim(), password: data.tempPassword });
      setNewAdminEmail('');
      setAddAdminOpen(false);
      await load();
    } catch {
      setAddAdminError('אירעה שגיאה. נסה שוב');
    } finally {
      setAddingAdmin(false);
    }
  };

  const copyPassword = async () => {
    if (!tempPassword) return;
    await Clipboard.setStringAsync(tempPassword.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const removeUser = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    await supabase.functions.invoke('delete-company-user', { body: { userId: removeTarget.id } });
    setRemoving(false);
    setRemoveTarget(null);
    await load();
  };

  if (loading || !company) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator color={COLORS.blue} />
      </View>
    );
  }

  const admins = users.filter((u) => u.role === 'admin');
  const drivers = users.filter((u) => u.role === 'driver');
  const active = company.status === 'active';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-forward" size={20} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {company.name}
        </Text>
        <View style={[styles.badge, active ? styles.badgeActive : styles.badgeDisabled]}>
          <Text style={[styles.badgeText, active ? styles.badgeTextActive : styles.badgeTextDisabled]}>
            {active ? 'פעיל' : 'מושבת'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>פרטי חברה</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>שם החברה</Text>
            <TextInput style={styles.fieldInput} value={name} onChangeText={setName} textAlign="right" />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>לוגו החברה</Text>
            <TouchableOpacity style={styles.logoPicker} onPress={handlePickLogo} disabled={uploadingLogo}>
              {uploadingLogo ? (
                <ActivityIndicator color={COLORS.blue} />
              ) : logoUrl ? (
                <>
                  <View style={styles.logoPreviewWrap}>
                    <Image source={{ uri: logoUrl }} style={styles.logoPreview} resizeMode="cover" />
                    <View style={styles.logoUploadedBadge}>
                      <Ionicons name="checkmark" size={11} color={COLORS.white} />
                    </View>
                  </View>
                  <Text style={styles.logoPickerChangeText}>שנה תמונה</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={22} color={COLORS.grayLight} />
                  <Text style={styles.logoPickerText}>העלאת לוגו</Text>
                </>
              )}
            </TouchableOpacity>
            {!!logoError && <Text style={styles.errorText}>{logoError}</Text>}
          </View>

          {!!saveError && <Text style={styles.errorText}>{saveError}</Text>}

          {hasChanges && (
            <TouchableOpacity
              style={[styles.primaryButton, saving && styles.buttonDisabled]}
              onPress={saveChanges}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryButtonText}>שמור שינויים</Text>}
            </TouchableOpacity>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={toggleActive}>
              <Ionicons name="power-outline" size={17} color={COLORS.black} />
              <Text style={styles.secondaryButtonText}>{active ? 'השבת חברה' : 'הפעל חברה'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dangerButton} onPress={() => setDeleteOpen(true)}>
              <Ionicons name="trash-outline" size={17} color={COLORS.red} />
              <Text style={styles.dangerButtonText}>מחק חברה</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>אדמינים ({admins.length})</Text>
            <TouchableOpacity style={styles.addSmallButton} onPress={() => setAddAdminOpen(true)}>
              <Ionicons name="add" size={16} color={COLORS.blue} />
              <Text style={styles.addSmallButtonText}>הוסף אדמין</Text>
            </TouchableOpacity>
          </View>
          {admins.length === 0 ? (
            <Text style={styles.emptyText}>אין אדמינים עדיין</Text>
          ) : (
            admins.map((u) => <UserRow key={u.id} user={u} onRemove={() => setRemoveTarget(u)} />)
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>נהגים ({drivers.length})</Text>
          {drivers.length === 0 ? (
            <Text style={styles.emptyText}>אין נהגים עדיין</Text>
          ) : (
            drivers.map((u) => <UserRow key={u.id} user={u} onRemove={() => setRemoveTarget(u)} />)
          )}
        </View>
      </ScrollView>

      {/* מודאל: אישור מחיקת חברה */}
      <CenterModal visible={deleteOpen} onClose={() => { setDeleteOpen(false); setDeleteConfirmText(''); }}>
        <View style={styles.deleteHeaderRow}>
          <View style={styles.deleteIconBox}>
            <Ionicons name="warning-outline" size={20} color={COLORS.red} />
          </View>
          <Text style={styles.deleteTitle}>מחיקת חברה</Text>
        </View>
        <Text style={styles.deleteDescription}>
          מחיקת <Text style={styles.deleteBold}>{company.name}</Text> תסיר את כל האדמינים והנהגים
          המשויכים אליה. הפעולה אינה ניתנת לשחזור.
        </Text>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>להמשך, הקלד את שם החברה:</Text>
          <TextInput
            style={[styles.fieldInput, deleteMatches && styles.fieldInputMatch]}
            placeholder={company.name}
            placeholderTextColor={COLORS.grayLight}
            value={deleteConfirmText}
            onChangeText={setDeleteConfirmText}
            textAlign="right"
          />
        </View>
        <View style={styles.deleteButtonsRow}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => { setDeleteOpen(false); setDeleteConfirmText(''); }}
          >
            <Text style={styles.cancelButtonText}>ביטול</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteButton, !deleteMatches && styles.deleteButtonDisabled]}
            onPress={confirmDeleteCompany}
            disabled={!deleteMatches || deleting}
          >
            {deleting ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={[styles.deleteButtonText, !deleteMatches && styles.deleteButtonTextDisabled]}>
                מחק לצמיתות
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </CenterModal>

      {/* מודאל: הוספת אדמין */}
      <CenterModal visible={addAdminOpen} onClose={() => setAddAdminOpen(false)}>
        <Text style={styles.deleteTitle}>הוספת אדמין</Text>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>מייל האדמין</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldInputLtr]}
            placeholder="admin@company.co.il"
            placeholderTextColor={COLORS.grayLight}
            value={newAdminEmail}
            onChangeText={setNewAdminEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textAlign="left"
          />
        </View>
        {!!addAdminError && <Text style={styles.errorText}>{addAdminError}</Text>}
        <TouchableOpacity
          style={[styles.primaryButton, addingAdmin && styles.buttonDisabled]}
          onPress={addAdmin}
          disabled={addingAdmin}
        >
          {addingAdmin ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryButtonText}>הוסף</Text>}
        </TouchableOpacity>
      </CenterModal>

      {/* מודאל: סיסמה זמנית */}
      <CenterModal visible={!!tempPassword} onClose={() => setTempPassword(null)}>
        <View style={styles.deleteHeaderRow}>
          <View style={[styles.deleteIconBox, { backgroundColor: COLORS.activeBg }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.activeText} />
          </View>
          <Text style={styles.deleteTitle}>האדמין נוסף בהצלחה</Text>
        </View>
        <Text style={styles.deleteDescription}>
          סיסמה זמנית עבור <Text style={styles.deleteBold}>{tempPassword?.email}</Text> — האדמין
          יתבקש לקבוע סיסמה קבועה בכניסה הראשונה. העתק ושלח לו את הפרטים בדרך בטוחה.
        </Text>
        <View style={styles.passwordBox}>
          <Text style={styles.passwordText}>{tempPassword?.password}</Text>
          <TouchableOpacity onPress={copyPassword}>
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={19}
              color={copied ? COLORS.activeText : COLORS.gray}
            />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setTempPassword(null)}>
          <Text style={styles.primaryButtonText}>סגור</Text>
        </TouchableOpacity>
      </CenterModal>

      {/* מודאל: אישור הסרת משתמש */}
      <CenterModal visible={!!removeTarget} onClose={() => setRemoveTarget(null)}>
        <View style={styles.deleteHeaderRow}>
          <View style={styles.deleteIconBox}>
            <Ionicons name="warning-outline" size={20} color={COLORS.red} />
          </View>
          <Text style={styles.deleteTitle}>
            {removeTarget?.role === 'admin' ? 'הסרת אדמין' : 'הסרת נהג'}
          </Text>
        </View>
        <Text style={styles.deleteDescription}>
          הסרת <Text style={styles.deleteBold}>{removeTarget?.email || removeTarget?.full_name}</Text>{' '}
          תמחק את המשתמש לצמיתות, כולל גישתו למערכת. הפעולה אינה ניתנת לשחזור.
        </Text>
        <View style={styles.deleteButtonsRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setRemoveTarget(null)}>
            <Text style={styles.cancelButtonText}>ביטול</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={removeUser} disabled={removing}>
            {removing ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.deleteButtonText}>הסר לצמיתות</Text>}
          </TouchableOpacity>
        </View>
      </CenterModal>
    </View>
  );
}

function UserRow({ user, onRemove }: { user: CompanyUser; onRemove: () => void }) {
  return (
    <View style={styles.userRow}>
      <TouchableOpacity onPress={onRemove} style={styles.userRemoveButton}>
        <Ionicons name="trash-outline" size={16} color={COLORS.red} />
      </TouchableOpacity>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{user.full_name || 'ללא שם'}</Text>
        <Text style={styles.userEmail}>{user.email || '—'}</Text>
      </View>
      {user.must_change_password && (
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>ממתין לקביעת סיסמה</Text>
        </View>
      )}
    </View>
  );
}

function CenterModal({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.centerOverlay} onPress={onClose}>
        <Pressable style={styles.centerModal} onPress={(e) => e.stopPropagation()}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.screenBg },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.screenBg },
  header: {
    backgroundColor: COLORS.white,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: COLORS.black, textAlign: 'right' },
  content: { padding: 16, gap: 14 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  sectionTitle: { fontSize: 15.5, fontWeight: '700', color: COLORS.black, textAlign: 'right' },
  sectionHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  fieldGroup: { gap: 7 },
  fieldLabel: { fontSize: 12.5, fontWeight: '600', color: COLORS.gray, textAlign: 'right' },
  fieldInput: {
    height: 46,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.fieldBg,
    fontSize: 15,
    color: COLORS.black,
    paddingHorizontal: 14,
  },
  fieldInputLtr: { textAlign: 'left' },
  logoPicker: {
    height: 90,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    backgroundColor: COLORS.fieldBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  logoPickerText: { fontSize: 13, color: COLORS.gray },
  logoPreviewWrap: { width: 52, height: 52 },
  logoPreview: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoUploadedBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.activeText,
    borderWidth: 2,
    borderColor: COLORS.fieldBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPickerChangeText: { fontSize: 12, color: COLORS.blue, fontWeight: '600', marginTop: 6 },
  fieldInputMatch: { borderColor: COLORS.activeText },
  errorText: { color: COLORS.red, fontSize: 13, textAlign: 'center' },
  primaryButton: {
    height: 46,
    borderRadius: 11,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: COLORS.white, fontSize: 14.5, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: 9 },
  secondaryButton: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryButtonText: { fontSize: 13.5, fontWeight: '600', color: COLORS.black },
  dangerButton: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#EDD9D6',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dangerButtonText: { fontSize: 13.5, fontWeight: '600', color: COLORS.red },
  addSmallButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  addSmallButtonText: { fontSize: 13, fontWeight: '600', color: COLORS.blue },
  emptyText: { fontSize: 13, color: COLORS.grayLight, textAlign: 'center', paddingVertical: 8 },
  userRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontSize: 14, fontWeight: '600', color: COLORS.black, textAlign: 'right' },
  userEmail: { fontSize: 12.5, color: COLORS.gray, textAlign: 'right' },
  userRemoveButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  pendingBadge: { backgroundColor: COLORS.disabledBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  pendingBadgeText: { fontSize: 10.5, fontWeight: '600', color: COLORS.disabledText },
  badge: { paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 6 },
  badgeActive: { backgroundColor: COLORS.activeBg },
  badgeDisabled: { backgroundColor: COLORS.disabledBg },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextActive: { color: COLORS.activeText },
  badgeTextDisabled: { color: COLORS.disabledText },
  centerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerModal: { backgroundColor: COLORS.white, borderRadius: 18, padding: 22, width: '100%', gap: 14 },
  deleteHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11 },
  deleteIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.disabledBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteTitle: { fontSize: 17, fontWeight: '700', color: COLORS.black, textAlign: 'right' },
  deleteDescription: { fontSize: 13.5, color: COLORS.gray, lineHeight: 21, textAlign: 'right' },
  deleteBold: { color: COLORS.black, fontWeight: '600' },
  deleteButtonsRow: { flexDirection: 'row', gap: 9 },
  cancelButton: {
    flex: 1,
    height: 46,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: { color: COLORS.black, fontSize: 14.5, fontWeight: '600' },
  deleteButton: {
    flex: 1.3,
    height: 46,
    borderRadius: 11,
    backgroundColor: COLORS.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonDisabled: { backgroundColor: '#EDD9D6' },
  deleteButtonText: { color: COLORS.white, fontSize: 14.5, fontWeight: '600' },
  deleteButtonTextDisabled: { color: '#C39B95' },
  passwordBox: {
    height: 48,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.fieldBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  passwordText: { fontSize: 15, fontWeight: '600', color: COLORS.black, letterSpacing: 0.5 },
});
