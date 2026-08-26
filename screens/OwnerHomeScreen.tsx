import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
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
import { isValidEmail } from '../lib/validation';
import { COLORS } from '../components/owner/ownerTheme';
import { CompanyCard, CompanyRow } from '../components/owner/CompanyCard';
import { CompanyActionsSheet } from '../components/owner/CompanyActionsSheet';
import { AddCompanySheet, EMPTY_OWNER_COMPANY_FORM, OwnerCompanyForm } from '../components/owner/AddCompanySheet';
import { DeleteCompanyModal, CompanyCreatedModal } from '../components/owner/DeleteCompanyModal';

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

  const loadCompanies = useCallback(async () => {
    const { data: companiesData } = await listCompanies();

    const { data: profilesData } = await listCompanyProfileRoles();

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
    setFieldErrors({});
  };

  const toggleActive = async () => {
    if (!menuCompany) return;
    const newStatus = menuCompany.status === 'active' ? 'disabled' : 'active';
    await updateCompanyStatus(menuCompany.id, newStatus);
    setMenuCompany(null);
    await loadCompanies();
  };

  const confirmDelete = async () => {
    if (!menuCompany || deleteConfirmText.trim() !== menuCompany.name) return;
    setDeleting(true);
    await deleteOwnedCompany(menuCompany.id);
    setDeleting(false);
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
    else if (form.password.length < 6) errors.password = 'לפחות 6 תווים';
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
        let message = data?.error || 'יצירת החברה נכשלה';
        if (error?.context?.json) {
          try {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          } catch {}
        }
        console.log('create-company-admin error:', error, 'message:', message);
        setCreateError(message);
        return;
      }

      setForm(EMPTY_OWNER_COMPANY_FORM);
      setFieldErrors({});
      setAddOpen(false);
      setSuccessOpen(true);
      await loadCompanies();
    } catch (err) {
      console.log('create-company-admin unexpected error:', err);
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
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={14} color={COLORS.red} />
          <Text style={styles.logoutButtonText}>התנתקות</Text>
        </TouchableOpacity>
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
    </View>
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
  filterRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
  },
  filterChipsRow: { flexDirection: 'row-reverse', gap: 8 },
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
