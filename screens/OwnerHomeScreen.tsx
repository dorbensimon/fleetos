import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAlert } from '../lib/platformAlert';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { supabase, Company } from '../lib/supabase';
import {
  listCompanies,
  listCompanyProfileRoles,
  updateCompanyStatus,
  deleteOwnedCompany,
  createCompanyAdmin,
} from '../lib/ownerApi';
import { pickAndUploadLogo } from '../lib/uploadLogo';
import { isValidIsraeliPhone } from '../lib/phone';
import { isValidEmail, isValidTemporaryPassword } from '../lib/validation';
import { COLORS } from '../components/owner/ownerTheme';
import { CONTENT_MAX_WIDTH } from '../lib/theme';
import { CompanyCard, CompanyRow } from '../components/owner/CompanyCard';
import { CompanyActionsSheet } from '../components/owner/CompanyActionsSheet';
import { AddCompanySheet, EMPTY_OWNER_COMPANY_FORM, OwnerCompanyForm } from '../components/owner/AddCompanySheet';
import { DeleteCompanyModal, CompanyCreatedModal } from '../components/owner/DeleteCompanyModal';
import { ErrorState } from '../components/ui';
import { functionErrorMessage } from '../lib/functionError';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { DesktopShell } from '../components/desktop/DesktopShell';
import { DesktopInput, DText, HoverPressable, StatusPill } from '../components/desktop/primitives';
import { DESKTOP_AVATAR_COLORS, DESKTOP_COLORS } from '../components/desktop/desktopTheme';

/**
 * The owner (super-admin) home screen: list every company in the system,
 * create new ones (with their first admin), disable/enable, or delete
 * them. Predates lib/theme.ts and uses its own local palette (see
 * components/owner/ownerTheme.ts) rather than the shared design system.
 *
 * Split into components/owner/* by concern (card, actions menu, add-company
 * form, delete/success modals) — this screen only owns data loading and
 * the create/delete/toggle handlers those pieces call back into.
 */

type StatusFilter = 'all' | 'active' | 'disabled';

type Props = NativeStackScreenProps<RootStackParamList, 'OwnerHome'>;

export default function OwnerHomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [menuCompany, setMenuCompany] = useState<CompanyRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [form, setForm] = useState<OwnerCompanyForm>(EMPTY_OWNER_COMPANY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
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

  const [successOpen, setSuccessOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  const loadCompanies = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoadError(null);
    try {
    const [{ data: companiesData, error: companiesError }, { data: profilesData, error: profilesError }] = await Promise.all([
      listCompanies(),
      listCompanyProfileRoles(),
    ]);
    if (companiesError || profilesError) throw companiesError || profilesError;

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

    if (requestId === loadRequest.current) setCompanies(merged);
    } catch (err: any) {
      if (requestId === loadRequest.current) setLoadError(err?.message ?? 'טעינת החברות נכשלה');
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      await loadCompanies();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
      loadRequest.current += 1;
    };
  }, [loadCompanies]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadCompanies();
    } finally {
      setRefreshing(false);
    }
  };

  const closeAll = () => {
    setMenuCompany(null);
    setAddOpen(false);
    setDeleteOpen(false);
    setDeleteConfirmText('');
    setCreateError('');
    setFieldErrors({});
  };

  const toggleActive = async () => {
    if (!menuCompany) return;
    const newStatus = menuCompany.status === 'active' ? 'disabled' : 'active';
    const { error } = await updateCompanyStatus(menuCompany.id, newStatus);
    if (error) {
      showAlert('העדכון נכשל', 'לא הצלחנו לעדכן את סטטוס החברה');
      return;
    }
    setMenuCompany(null);
    await loadCompanies();
  };

  const confirmDelete = async () => {
    if (!menuCompany || deleteConfirmText.trim() !== menuCompany.name) return;
    setDeleting(true);
    const { data, error } = await deleteOwnedCompany(menuCompany.id, deleteConfirmText.trim());
    setDeleting(false);
    if (error || !data?.success) {
      showAlert('מחיקת החברה נכשלה', await functionErrorMessage(error, data, 'נסה שוב', false));
      return;
    }
    closeAll();
    await loadCompanies();
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'שדה חובה';
    if (!form.adminFirstName.trim()) errors.adminFirstName = 'שדה חובה';
    if (!form.adminLastName.trim()) errors.adminLastName = 'שדה חובה';
    if (!form.email.trim()) errors.email = 'שדה חובה';
    else if (!isValidEmail(form.email)) errors.email = 'כתובת מייל לא תקינה';
    if (!form.phone.trim()) errors.phone = 'שדה חובה';
    else if (!isValidIsraeliPhone(form.phone)) errors.phone = 'מספר טלפון לא תקין';
    if (!form.password) errors.password = 'שדה חובה';
    else if (!isValidTemporaryPassword(form.password)) errors.password = 'לפחות 4 ספרות בלבד';
    if (!form.confirmPassword) errors.confirmPassword = 'שדה חובה';
    else if (form.confirmPassword !== form.password) errors.confirmPassword = 'הסיסמאות אינן תואמות';
    return errors;
  };

  const createCompany = async () => {
    setCreateError('');
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setCreating(true);
    try {
      const { data, error } = await createCompanyAdmin({
          companyName: form.name.trim(),
          logoUrl: form.logoUrl.trim() || null,
          companyType: form.companyType || null,
          businessId: form.businessId.trim() || null,
          adminFirstName: form.adminFirstName.trim(),
          adminLastName: form.adminLastName.trim(),
          adminEmail: form.email.trim(),
          adminPhone: form.phone.trim(),
          adminPassword: form.password,
      });

      if (error || !data?.success) {
        setCreateError(await functionErrorMessage(error, data, 'יצירת החברה נכשלה', false));
        return;
      }

      setForm(EMPTY_OWNER_COMPANY_FORM);
      setFieldErrors({});
      setAddOpen(false);
      setSuccessOpen(true);
      await loadCompanies();
    } catch {
      setCreateError('אירעה שגיאה. נסה שוב');
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const activeCount = companies.filter((c) => c.status === 'active').length;

  const filteredCompanies = companies.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const sheets = (
    <>
      <CompanyActionsSheet
        company={menuCompany}
        visible={!!menuCompany && !deleteOpen}
        onClose={closeAll}
        onToggleActive={toggleActive}
        onDelete={() => setDeleteOpen(true)}
      />

      <AddCompanySheet
        visible={addOpen}
        form={form}
        fieldErrors={fieldErrors}
        showPassword={showPassword}
        uploadingLogo={uploadingLogo}
        logoError={logoError}
        createError={createError}
        creating={creating}
        onClose={closeAll}
        onChangeForm={setForm}
        onPickLogo={handlePickLogo}
        onToggleShowPassword={() => setShowPassword((v) => !v)}
        onSubmit={createCompany}
      />

      <DeleteCompanyModal
        visible={deleteOpen}
        company={menuCompany}
        confirmText={deleteConfirmText}
        deleting={deleting}
        onChangeConfirmText={setDeleteConfirmText}
        onClose={closeAll}
        onConfirm={confirmDelete}
      />

      <CompanyCreatedModal visible={successOpen} onClose={() => setSuccessOpen(false)} />
    </>
  );

  if (isDesktop) {
    return (
      <>
        <DesktopShell active="OwnerHome" breadcrumbs={['חברות']}>
          <View style={ds.wrap}>
            <View style={ds.headRow}>
              <DText weight="bold" style={ds.heading}>
                {activeCount} חברות פעילות מתוך {companies.length}
              </DText>
              <HoverPressable style={ds.addButton} hoverStyle={{ backgroundColor: DESKTOP_COLORS.brandHover }} onPress={() => setAddOpen(true)}>
                <Ionicons name="add" size={14} color="#FFFFFF" />
                <DText weight="semiBold" style={ds.addButtonText}>חברה חדשה</DText>
              </HoverPressable>
            </View>

            <View style={ds.toolRow}>
              <View style={ds.searchBox}>
                <DesktopInput value={search} onChangeText={setSearch} placeholder="חיפוש לפי שם חברה" />
              </View>
              <View style={ds.filterChipsRow}>
                {(['all', 'active', 'disabled'] as StatusFilter[]).map((f) => (
                  <HoverPressable
                    key={f}
                    style={[ds.filterChip, statusFilter === f && ds.filterChipActive]}
                    hoverStyle={statusFilter !== f ? { backgroundColor: DESKTOP_COLORS.rowHover } : undefined}
                    onPress={() => setStatusFilter(f)}
                  >
                    <DText weight={statusFilter === f ? 'semiBold' : 'regular'} style={[ds.filterChipText, statusFilter === f && ds.filterChipTextActive]}>
                      {f === 'all' ? 'הכל' : f === 'active' ? 'פעיל' : 'מושבת'}
                    </DText>
                  </HoverPressable>
                ))}
              </View>
              <HoverPressable style={ds.templatesButton} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => navigation.navigate('GlobalSigningTemplates')}>
                <Ionicons name="document-text-outline" size={13} color={DESKTOP_COLORS.brand} />
                <DText weight="semiBold" style={ds.templatesButtonText}>תבניות חתימה</DText>
              </HoverPressable>
            </View>

            {loading ? (
              <View style={ds.centerFill}><ActivityIndicator color={DESKTOP_COLORS.brand} /></View>
            ) : loadError && companies.length === 0 ? (
              <ErrorState message={loadError} onRetry={loadCompanies} />
            ) : filteredCompanies.length === 0 ? (
              <DText style={ds.empty}>לא נמצאו חברות</DText>
            ) : (
              <View style={ds.table}>
                {filteredCompanies.map((item, index) => {
                  const active = item.status === 'active';
                  const avatarColor = active ? DESKTOP_AVATAR_COLORS[index % DESKTOP_AVATAR_COLORS.length] : DESKTOP_COLORS.inkFaint;
                  return (
                    <View key={item.id} style={[ds.row, index === filteredCompanies.length - 1 && ds.rowLast]}>
                      <HoverPressable style={ds.rowMain} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => navigation.navigate('CompanyDetail', { companyId: item.id })}>
                        <View style={[ds.avatar, { backgroundColor: avatarColor }]}>
                          <DText weight="bold" style={ds.avatarText}>{item.name.trim().charAt(0)}</DText>
                        </View>
                        <DText weight="semiBold" style={ds.companyName} numberOfLines={1}>{item.name}</DText>
                        <StatusPill tone={active ? 'ok' : 'neutral'} label={active ? 'פעיל' : 'מושבת'} />
                      </HoverPressable>
                      <View style={ds.rowMeta}>
                        <DText style={ds.metaText}>{item.admins} אדמינים</DText>
                        <DText style={ds.metaText}>{item.drivers} נהגים</DText>
                      </View>
                      <HoverPressable style={ds.menuButton} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => setMenuCompany(item)}>
                        <Ionicons name="ellipsis-vertical" size={14} color={DESKTOP_COLORS.inkFaint} />
                      </HoverPressable>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </DesktopShell>
        {sheets}
      </>
    );
  }

  return (
    <View style={styles.screen}>
     <View style={styles.centeredColumn}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={styles.headerTitle}>Tolvex</Text>
          <Text style={styles.headerSubtitle}>
            {activeCount} חברות פעילות מתוך {companies.length}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setAddOpen(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="חברה חדשה"
        >
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
        <View style={styles.filterChipsRow}>
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
        <View style={styles.headerActionsRow}>
          <TouchableOpacity style={styles.templatesButton} onPress={() => navigation.navigate('GlobalSigningTemplates')} activeOpacity={0.7}>
            <Ionicons name="document-text-outline" size={14} color={COLORS.blue} />
            <Text style={styles.templatesButtonText}>תבניות חתימה</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={14} color={COLORS.red} />
            <Text style={styles.logoutButtonText}>התנתקות</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={COLORS.blue} />
        </View>
      ) : loadError && companies.length === 0 ? (
        <ErrorState message={loadError} onRetry={loadCompanies} />
      ) : (
        <FlatList
          style={styles.scroll}
          data={filteredCompanies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Text style={styles.emptyText}>לא נמצאו חברות</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <CompanyCard
              item={item}
              index={index}
              onPress={() => navigation.navigate('CompanyDetail', { companyId: item.id })}
              onMenuPress={() => setMenuCompany(item)}
            />
          )}
        />
      )}
     </View>

      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.screenBg },
  // Without an explicit flex here, FlatList sizes to its own content on web
  // instead of stretching under the filter/header row above it, so the
  // whole page scrolls instead of just this area.
  scroll: { flex: 1 },
  centeredColumn: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { color: COLORS.gray, fontSize: 14 },
  header: {
    backgroundColor: COLORS.white,
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
  filterRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
  },
  filterChipsRow: { flexDirection: 'row-reverse', gap: 8 },
  headerActionsRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  logoutButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EDD9D6',
    backgroundColor: COLORS.white,
  },
  logoutButtonText: { fontSize: 12, fontWeight: '600', color: COLORS.red },
  templatesButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D6E6ED',
    backgroundColor: COLORS.white,
  },
  templatesButtonText: { fontSize: 12, fontWeight: '600', color: COLORS.blue },
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
});

const ds = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 760, alignSelf: 'center', width: '100%' },
  headRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heading: { fontSize: 15 },
  addButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 14, borderRadius: 7, backgroundColor: DESKTOP_COLORS.brand },
  addButtonText: { fontSize: 12.5, color: '#FFFFFF' },
  toolRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 16 },
  searchBox: { width: 260 },
  filterChipsRow: { flexDirection: 'row-reverse', gap: 6 },
  filterChip: { height: 30, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: DESKTOP_COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: DESKTOP_COLORS.surface },
  filterChipActive: { backgroundColor: DESKTOP_COLORS.brand, borderColor: DESKTOP_COLORS.brand },
  filterChipText: { fontSize: 12, color: DESKTOP_COLORS.inkMuted },
  filterChipTextActive: { color: '#FFFFFF' },
  templatesButton: { marginRight: 'auto' as any, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: DESKTOP_COLORS.border, backgroundColor: DESKTOP_COLORS.surface },
  templatesButtonText: { fontSize: 12, color: DESKTOP_COLORS.brand },
  centerFill: { paddingVertical: 48, alignItems: 'center' },
  empty: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, textAlign: 'center', paddingVertical: 32 },
  table: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, height: 52, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  rowLast: { borderBottomWidth: 0 },
  rowMain: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderRadius: 6 },
  avatar: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, color: '#FFFFFF' },
  companyName: { fontSize: 13, maxWidth: 220 },
  rowMeta: { flexDirection: 'row-reverse', gap: 14 },
  metaText: { fontSize: 12, color: DESKTOP_COLORS.inkFaint },
  menuButton: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
});
