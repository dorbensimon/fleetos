import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  Animated,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
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

const AVATAR_PALETTE = ['#0088CC', '#000000', '#666666', '#979797'];

type CompanyRow = Company & { admins: number; drivers: number };
type StatusFilter = 'all' | 'active' | 'disabled';

type Props = NativeStackScreenProps<RootStackParamList, 'OwnerHome'>;

export default function OwnerHomeScreen({ navigation }: Props) {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [menuCompany, setMenuCompany] = useState<CompanyRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [form, setForm] = useState({ name: '', logoUrl: '', email: '', phone: '' });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');

  const handlePickLogo = async () => {
    setLogoError('');
    setUploadingLogo(true);
    try {
      const url = await pickAndUploadLogo();
      if (url) {
        setForm((f) => ({ ...f, logoUrl: url }));
      }
    } catch (err: any) {
      setLogoError(err?.message || 'העלאת הלוגו נכשלה');
    } finally {
      setUploadingLogo(false);
    }
  };
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadCompanies = useCallback(async () => {
    const { data: companiesData } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('company_id, role')
      .not('company_id', 'is', null);

    const counts: Record<string, { admins: number; drivers: number }> = {};
    (profilesData || []).forEach((p: any) => {
      if (!counts[p.company_id]) counts[p.company_id] = { admins: 0, drivers: 0 };
      if (p.role === 'admin') counts[p.company_id].admins += 1;
      if (p.role === 'driver') counts[p.company_id].drivers += 1;
    });

    const merged: CompanyRow[] = (companiesData || []).map((c: Company) => ({
      ...c,
      admins: counts[c.id]?.admins || 0,
      drivers: counts[c.id]?.drivers || 0,
    }));

    setCompanies(merged);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadCompanies();
      setLoading(false);
    })();
  }, [loadCompanies]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCompanies();
    setRefreshing(false);
  };

  const closeAll = () => {
    setMenuCompany(null);
    setAddOpen(false);
    setDeleteOpen(false);
    setDeleteConfirmText('');
    setCreateError('');
  };

  const toggleActive = async () => {
    if (!menuCompany) return;
    const newStatus = menuCompany.status === 'active' ? 'disabled' : 'active';
    await supabase.from('companies').update({ status: newStatus }).eq('id', menuCompany.id);
    setMenuCompany(null);
    await loadCompanies();
  };

  const openDeleteFromMenu = () => {
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!menuCompany || deleteConfirmText.trim() !== menuCompany.name) return;
    setDeleting(true);
    await supabase.from('companies').delete().eq('id', menuCompany.id);
    setDeleting(false);
    closeAll();
    await loadCompanies();
  };

  const createCompany = async () => {
    setCreateError('');
    if (!form.name.trim() || !form.email.trim()) {
      setCreateError('נא למלא שם חברה ומייל אדמין');
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-company-admin', {
        body: {
          companyName: form.name.trim(),
          logoUrl: form.logoUrl.trim() || null,
          adminEmail: form.email.trim(),
        },
      });

      if (error || !data?.success) {
        setCreateError(data?.error || 'יצירת החברה נכשלה');
        return;
      }

      setTempPassword({ email: form.email.trim(), password: data.tempPassword });
      setForm({ name: '', logoUrl: '', email: '', phone: '' });
      setAddOpen(false);
      await loadCompanies();
    } catch {
      setCreateError('אירעה שגיאה. נסה שוב');
    } finally {
      setCreating(false);
    }
  };

  const copyPassword = async () => {
    if (!tempPassword) return;
    await Clipboard.setStringAsync(tempPassword.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const activeCount = companies.filter((c) => c.status === 'active').length;
  const deleteMatches = !!menuCompany && deleteConfirmText.trim() === menuCompany.name;

  const filteredCompanies = companies.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Tolvex</Text>
          <Text style={styles.headerSubtitle}>
            {activeCount} חברות פעילות מתוך {companies.length}
          </Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => setAddOpen(true)} activeOpacity={0.85}>
          <Ionicons name="add" size={17} color={COLORS.white} />
          <Text style={styles.addButtonText}>חברה חדשה</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={COLORS.grayLight} />
        <TextInput
          style={styles.searchInput}
          placeholder="חיפוש לפי שם חברה"
          placeholderTextColor={COLORS.grayLight}
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
      </View>

      <View style={styles.filterRow}>
        {(['all', 'active', 'disabled'] as StatusFilter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, statusFilter === f && styles.filterChipActive]}
            onPress={() => setStatusFilter(f)}
          >
            <Text style={[styles.filterChipText, statusFilter === f && styles.filterChipTextActive]}>
              {f === 'all' ? 'הכל' : f === 'active' ? 'פעיל' : 'מושבת'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={COLORS.blue} />
        </View>
      ) : (
        <FlatList
          data={filteredCompanies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Text style={styles.emptyText}>לא נמצאו חברות</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const active = item.status === 'active';
            const avatarColor = active ? AVATAR_PALETTE[index % AVATAR_PALETTE.length] : '#E6E6E6';
            const avatarTextColor = active ? COLORS.white : COLORS.grayLight;
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('CompanyDetail', { companyId: item.id })}
              >
                <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                  <Text style={[styles.avatarText, { color: avatarTextColor }]}>
                    {item.name.trim().charAt(0)}
                  </Text>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={[styles.badge, active ? styles.badgeActive : styles.badgeDisabled]}>
                      <Text style={[styles.badgeText, active ? styles.badgeTextActive : styles.badgeTextDisabled]}>
                        {active ? 'פעיל' : 'מושבת'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardMetaRow}>
                    <View style={styles.metaItem}>
                      <Ionicons name="shield-outline" size={13} color={COLORS.grayLight} />
                      <Text style={styles.metaText}>{item.admins} אדמינים</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="car-outline" size={13} color={COLORS.grayLight} />
                      <Text style={styles.metaText}>{item.drivers} נהגים</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity style={styles.menuButton} onPress={() => setMenuCompany(item)}>
                  <Ionicons name="ellipsis-vertical" size={18} color={COLORS.grayLight} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* בוטום שיט: תפריט פעולות לחברה */}
      <BottomSheet visible={!!menuCompany && !deleteOpen} onClose={closeAll}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetCompanyName}>{menuCompany?.name}</Text>
        <TouchableOpacity style={styles.sheetAction} onPress={toggleActive}>
          <Ionicons name="power-outline" size={19} color={COLORS.gray} />
          <Text style={styles.sheetActionText}>
            {menuCompany?.status === 'active' ? 'השבת חברה' : 'הפעל חברה'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sheetAction} onPress={openDeleteFromMenu}>
          <Ionicons name="trash-outline" size={19} color={COLORS.red} />
          <Text style={[styles.sheetActionText, { color: COLORS.red }]}>מחק חברה</Text>
        </TouchableOpacity>
      </BottomSheet>

      {/* בוטום שיט: הוספת חברה */}
      <BottomSheet visible={addOpen} onClose={closeAll}>
        <View style={styles.sheetHeaderRow}>
          <Text style={styles.sheetTitle}>הוספת חברה חדשה</Text>
          <TouchableOpacity style={styles.closeButton} onPress={closeAll}>
            <Ionicons name="close" size={16} color={COLORS.gray} />
          </TouchableOpacity>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>שם החברה</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="לדוגמה: אלמוג הובלות"
            placeholderTextColor={COLORS.grayLight}
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            textAlign="right"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>לוגו החברה (אופציונלי)</Text>
          <TouchableOpacity style={styles.logoPicker} onPress={handlePickLogo} disabled={uploadingLogo}>
            {uploadingLogo ? (
              <ActivityIndicator color={COLORS.blue} />
            ) : form.logoUrl ? (
              <>
                <Image source={{ uri: form.logoUrl }} style={styles.logoPreview} />
                <Text style={styles.logoPickerChangeText}>שנה תמונה</Text>
              </>
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={22} color={COLORS.grayLight} />
                <Text style={styles.logoPickerText}>העלאת לוגו</Text>
                <Text style={styles.logoPickerHint}>PNG או JPG</Text>
              </>
            )}
          </TouchableOpacity>
          {!!logoError && <Text style={styles.errorText}>{logoError}</Text>}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>מייל האדמין הראשון</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldInputLtr]}
            placeholder="admin@company.co.il"
            placeholderTextColor={COLORS.grayLight}
            value={form.email}
            onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
            autoCapitalize="none"
            keyboardType="email-address"
            textAlign="left"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>
            טלפון <Text style={styles.fieldLabelOptional}>(אופציונלי)</Text>
          </Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldInputLtr]}
            placeholder="050-0000000"
            placeholderTextColor={COLORS.grayLight}
            value={form.phone}
            onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
            keyboardType="phone-pad"
            textAlign="left"
          />
        </View>

        {!!createError && <Text style={styles.errorText}>{createError}</Text>}

        <TouchableOpacity
          style={[styles.createButton, creating && styles.createButtonDisabled]}
          onPress={createCompany}
          disabled={creating}
          activeOpacity={0.85}
        >
          {creating ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.createButtonText}>צור חברה</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.hintText}>ייווצר משתמש אדמין עם סיסמה זמנית שתוצג לך להעתקה</Text>
      </BottomSheet>

      {/* מודאל: אישור מחיקה */}
      <CenterModal visible={deleteOpen} onClose={closeAll}>
        <View style={styles.deleteHeaderRow}>
          <View style={styles.deleteIconBox}>
            <Ionicons name="warning-outline" size={20} color={COLORS.red} />
          </View>
          <Text style={styles.deleteTitle}>מחיקת חברה</Text>
        </View>
        <Text style={styles.deleteDescription}>
          מחיקת <Text style={styles.deleteCompanyNameBold}>{menuCompany?.name}</Text> תסיר את כל
          האדמינים והנהגים המשויכים אליה. הפעולה אינה ניתנת לשחזור.
        </Text>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>להמשך, הקלד את שם החברה:</Text>
          <TextInput
            style={[styles.fieldInput, deleteMatches && styles.fieldInputMatch]}
            placeholder={menuCompany?.name}
            placeholderTextColor={COLORS.grayLight}
            value={deleteConfirmText}
            onChangeText={setDeleteConfirmText}
            textAlign="right"
          />
        </View>
        <View style={styles.deleteButtonsRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={closeAll}>
            <Text style={styles.cancelButtonText}>ביטול</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteButton, !deleteMatches && styles.deleteButtonDisabled]}
            onPress={confirmDelete}
            disabled={!deleteMatches || deleting}
          >
            {deleting ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text
                style={[styles.deleteButtonText, !deleteMatches && styles.deleteButtonTextDisabled]}
              >
                מחק לצמיתות
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </CenterModal>

      {/* מודאל: סיסמה זמנית */}
      <CenterModal visible={!!tempPassword} onClose={() => setTempPassword(null)}>
        <View style={styles.deleteHeaderRow}>
          <View style={[styles.deleteIconBox, { backgroundColor: COLORS.activeBg }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.activeText} />
          </View>
          <Text style={styles.deleteTitle}>החברה נוצרה בהצלחה</Text>
        </View>
        <Text style={styles.deleteDescription}>
          סיסמה זמנית עבור <Text style={styles.deleteCompanyNameBold}>{tempPassword?.email}</Text>{' '}
          — האדמין יתבקש לקבוע סיסמה קבועה בכניסה הראשונה. העתק ושלח לו את הפרטים בדרך בטוחה.
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
        <TouchableOpacity style={styles.createButton} onPress={() => setTempPassword(null)}>
          <Text style={styles.createButtonText}>סגור</Text>
        </TouchableOpacity>
      </CenterModal>
    </View>
  );
}

function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const translateY = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : 300,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.overlay} onPress={onClose}>
          <Animated.View
            style={[styles.sheetContainer, { transform: [{ translateY }], maxHeight: '85%' }]}
            onStartShouldSetResponder={() => true}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetContentContainer}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
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
        <View style={styles.centerModal} onStartShouldSetResponder={() => true}>
          {children}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.screenBg },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { color: COLORS.gray, fontSize: 14 },
  header: {
    backgroundColor: COLORS.white,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 23, fontWeight: '700', color: COLORS.black, textAlign: 'right' },
  headerSubtitle: { fontSize: 13, color: COLORS.gray, marginTop: 3, textAlign: 'right' },
  addButton: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.blue,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  addButtonText: { color: COLORS.white, fontSize: 13.5, fontWeight: '600' },
  listContent: { padding: 16, gap: 10 },
  searchBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    height: 42,
    borderRadius: 11,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.black },
  filterRow: { flexDirection: 'row-reverse', gap: 8, marginHorizontal: 16, marginTop: 10 },
  filterChip: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  filterChipText: { fontSize: 12.5, fontWeight: '600', color: COLORS.gray },
  filterChipTextActive: { color: COLORS.white },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '600' },
  cardBody: { flex: 1, gap: 5 },
  cardTopRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 15.5, fontWeight: '600', color: COLORS.black, flexShrink: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 6 },
  badgeActive: { backgroundColor: COLORS.activeBg },
  badgeDisabled: { backgroundColor: COLORS.disabledBg },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextActive: { color: COLORS.activeText },
  badgeTextDisabled: { color: COLORS.disabledText },
  cardMetaRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12.5, color: COLORS.gray },
  menuButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetContentContainer: {
    padding: 20,
    paddingBottom: 34,
    gap: 14,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDDDDD',
    alignSelf: 'center',
    marginBottom: 6,
  },
  sheetCompanyName: { fontSize: 14, fontWeight: '600', color: COLORS.black, textAlign: 'right' },
  sheetAction: {
    height: 52,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  sheetActionText: { fontSize: 15, color: COLORS.black },
  sheetHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: COLORS.black },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldGroup: { gap: 7 },
  fieldLabel: { fontSize: 12.5, fontWeight: '600', color: COLORS.gray, textAlign: 'right' },
  fieldLabelOptional: { color: COLORS.grayLight, fontWeight: '400' },
  fieldInput: {
    height: 48,
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
    height: 100,
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
  logoPickerHint: { fontSize: 11.5, color: COLORS.grayLight },
  logoPreview: { width: 56, height: 56, borderRadius: 12 },
  logoPickerChangeText: { fontSize: 12, color: COLORS.blue, fontWeight: '600', marginTop: 4 },
  fieldInputMatch: { borderColor: COLORS.activeText },
  errorText: { color: COLORS.red, fontSize: 13, textAlign: 'center' },
  createButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: { opacity: 0.7 },
  createButtonText: { color: COLORS.white, fontSize: 15.5, fontWeight: '600' },
  hintText: { fontSize: 11.5, color: COLORS.grayLight, textAlign: 'center', lineHeight: 17 },
  centerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerModal: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 22,
    width: '100%',
    gap: 14,
  },
  deleteHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11 },
  deleteIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.disabledBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteTitle: { fontSize: 17, fontWeight: '700', color: COLORS.black },
  deleteDescription: { fontSize: 13.5, color: COLORS.gray, lineHeight: 21, textAlign: 'right' },
  deleteCompanyNameBold: { color: COLORS.black, fontWeight: '600' },
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
