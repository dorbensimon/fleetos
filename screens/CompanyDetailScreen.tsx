import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Company } from '../lib/supabase';
import {
  getCompany,
  listCompanyUsers,
  updateCompanyUser,
  updateCompany,
  deleteCompany,
  addCompanyAdmin,
  deleteCompanyUser,
  resetCompanyUserPassword,
} from '../lib/companyApi';
import { pickAndUploadLogo } from '../lib/uploadLogo';
import { isValidIsraeliPhone } from '../lib/phone';
import { isValidEmail } from '../lib/validation';
import { COLORS } from '../components/owner/ownerTheme';
import { sharedStyles as s } from '../components/companyDetail/sharedStyles';
import { CompanyUser } from '../components/companyDetail/types';
import { UserRow } from '../components/companyDetail/UserRow';
import { CompanyInfoCard, CompanyEditableFields } from '../components/companyDetail/CompanyInfoCard';
import { DeleteCompanyModal } from '../components/companyDetail/DeleteCompanyModal';
import { AddAdminModal, EMPTY_NEW_ADMIN_FORM, NewAdminForm } from '../components/companyDetail/AddAdminModal';
import { RemoveUserModal } from '../components/companyDetail/RemoveUserModal';
import {
  ResetPasswordModal,
  EMPTY_RESET_PASSWORD_FORM,
  ResetPasswordForm,
} from '../components/companyDetail/ResetPasswordModal';
import { EditUserModal, EditUserForm } from '../components/companyDetail/EditUserModal';
import { InfoSuccessModal } from '../components/companyDetail/InfoSuccessModal';
import { ErrorState } from '../components/ui';
import { functionErrorMessage } from '../lib/functionError';

/**
 * Owner-only screen: one company's editable details + its admins/drivers
 * list, with add-admin / remove-user / reset-password / edit-user flows.
 * Predates lib/theme.ts — see components/owner/ownerTheme.ts.
 *
 * Split into components/companyDetail/* by concern (info card, user row,
 * and one file per modal) — this screen only owns data loading and the
 * handlers those pieces call back into.
 */

const EMPTY_FIELDS: CompanyEditableFields = {
  name: '',
  logoUrl: '',
  companyType: '',
  businessId: '',
  address: '',
  phone: '',
  safetyOfficerName: '',
  safetyOfficerPhone: '',
};

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyDetail'>;

export default function CompanyDetailScreen({ route, navigation }: Props) {
  const { companyId } = route.params;

  const [company, setCompany] = useState<Company | null>(null);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  const [fields, setFields] = useState<CompanyEditableFields>(EMPTY_FIELDS);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');

  const handlePickLogo = async () => {
    setLogoError('');
    setUploadingLogo(true);
    try {
      const url = await pickAndUploadLogo();
      if (url) setFields((f) => ({ ...f, logoUrl: url }));
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
  const [newAdminForm, setNewAdminForm] = useState<NewAdminForm>(EMPTY_NEW_ADMIN_FORM);
  const [newAdminFieldErrors, setNewAdminFieldErrors] = useState<Record<string, string>>({});
  const [showNewAdminPassword, setShowNewAdminPassword] = useState(false);
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [addAdminError, setAddAdminError] = useState('');

  const [addAdminSuccessOpen, setAddAdminSuccessOpen] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<CompanyUser | null>(null);
  const [removing, setRemoving] = useState(false);

  const [resetTarget, setResetTarget] = useState<CompanyUser | null>(null);
  const [resetForm, setResetForm] = useState<ResetPasswordForm>(EMPTY_RESET_PASSWORD_FORM);
  const [resetFieldErrors, setResetFieldErrors] = useState<Record<string, string>>({});
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccessOpen, setResetSuccessOpen] = useState(false);

  const [editTarget, setEditTarget] = useState<CompanyUser | null>(null);
  const [editForm, setEditForm] = useState<EditUserForm>({ firstName: '', lastName: '', phone: '' });
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');

  const openEdit = (user: CompanyUser) => {
    const [firstName, ...rest] = (user.full_name || '').trim().split(/\s+/);
    setEditForm({
      firstName: user.full_name ? firstName : '',
      lastName: user.full_name ? rest.join(' ') : '',
      phone: user.phone || '',
    });
    setEditFieldErrors({});
    setEditError('');
    setEditTarget(user);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const errors: Record<string, string> = {};
    if (!editForm.firstName.trim()) errors.firstName = 'שדה חובה';
    if (!editForm.lastName.trim()) errors.lastName = 'שדה חובה';
    if (!editForm.phone.trim()) errors.phone = 'שדה חובה';
    else if (!isValidIsraeliPhone(editForm.phone)) errors.phone = 'מספר טלפון לא תקין';
    setEditFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setEditing(true);
    setEditError('');
    const { error } = await updateCompanyUser(editTarget.id, {
        full_name: `${editForm.firstName.trim()} ${editForm.lastName.trim()}`.trim(),
        phone: editForm.phone.trim(),
      });
    setEditing(false);
    if (error) {
      setEditError('שמירת השינויים נכשלה');
      return;
    }
    setEditTarget(null);
    await load();
  };

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoadError(null);
    try {
    const { data: companyData, error: companyError } = await getCompany(companyId);
    if (companyError || !companyData) throw companyError ?? new Error('החברה לא נמצאה');

    if (requestId === loadRequest.current) {
      setCompany(companyData);
      setFields({
        name: companyData.name,
        logoUrl: companyData.logo_url || '',
        companyType: companyData.company_type || '',
        businessId: companyData.business_id || '',
        address: companyData.address || '',
        phone: companyData.phone || '',
        safetyOfficerName: companyData.safety_officer_name || '',
        safetyOfficerPhone: companyData.safety_officer_phone || '',
      });
    }

    const { data: usersData, error } = await listCompanyUsers(companyId);

    if (error || !usersData?.success) {
      throw new Error(await functionErrorMessage(error, usersData, 'טעינת המשתמשים נכשלה', false));
    }
    if (requestId === loadRequest.current) {
      setUsers(usersData.users);
    }
    } catch (err: any) {
      if (requestId === loadRequest.current) setLoadError(err?.message ?? 'טעינת החברה נכשלה');
    }
  }, [companyId]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      await load();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
      loadRequest.current += 1;
    };
  }, [load]);

  const hasChanges =
    !!company &&
    (fields.name.trim() !== company.name ||
      fields.logoUrl.trim() !== (company.logo_url || '') ||
      fields.companyType !== (company.company_type || '') ||
      fields.businessId.trim() !== (company.business_id || '') ||
      fields.address.trim() !== (company.address || '') ||
      fields.phone.trim() !== (company.phone || '') ||
      fields.safetyOfficerName.trim() !== (company.safety_officer_name || '') ||
      fields.safetyOfficerPhone.trim() !== (company.safety_officer_phone || ''));

  const saveChanges = async () => {
    if (!company || !fields.name.trim()) return;
    setSaveError('');
    setSaving(true);
    const { error } = await updateCompany(company.id, {
        name: fields.name.trim(),
        logo_url: fields.logoUrl.trim() || null,
        company_type: fields.companyType || null,
        business_id: fields.businessId.trim() || null,
        address: fields.address.trim() || null,
        phone: fields.phone.trim() || null,
        safety_officer_name: fields.safetyOfficerName.trim() || null,
        safety_officer_phone: fields.safetyOfficerPhone.trim() || null,
      });
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
    const { error } = await updateCompany(company.id, { status: newStatus });
    if (error) {
      Alert.alert('העדכון נכשל', 'לא הצלחנו לעדכן את סטטוס החברה');
      return;
    }
    await load();
  };

  const confirmDeleteCompany = async () => {
    if (!company || deleteConfirmText.trim() !== company.name) return;
    setDeleting(true);
    const { data, error } = await deleteCompany(company.id, deleteConfirmText.trim());
    setDeleting(false);
    if (error || !data?.success) {
      Alert.alert('מחיקת החברה נכשלה', await functionErrorMessage(error, data, 'נסה שוב', false));
      return;
    }
    navigation.goBack();
  };

  const validateNewAdminForm = () => {
    const errors: Record<string, string> = {};
    if (!newAdminForm.firstName.trim()) errors.firstName = 'שדה חובה';
    if (!newAdminForm.lastName.trim()) errors.lastName = 'שדה חובה';
    if (!newAdminForm.email.trim()) errors.email = 'שדה חובה';
    else if (!isValidEmail(newAdminForm.email)) errors.email = 'כתובת מייל לא תקינה';
    if (!newAdminForm.phone.trim()) errors.phone = 'שדה חובה';
    else if (!isValidIsraeliPhone(newAdminForm.phone)) errors.phone = 'מספר טלפון לא תקין';
    if (!newAdminForm.password) errors.password = 'שדה חובה';
    else if (newAdminForm.password.length < 6) errors.password = 'לפחות 6 תווים';
    if (!newAdminForm.confirmPassword) errors.confirmPassword = 'שדה חובה';
    else if (newAdminForm.confirmPassword !== newAdminForm.password)
      errors.confirmPassword = 'הסיסמאות אינן תואמות';
    return errors;
  };

  const addAdmin = async () => {
    setAddAdminError('');
    const errors = validateNewAdminForm();
    setNewAdminFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setAddingAdmin(true);
    try {
      const { data, error } = await addCompanyAdmin({
          companyId,
          adminFirstName: newAdminForm.firstName.trim(),
          adminLastName: newAdminForm.lastName.trim(),
          adminEmail: newAdminForm.email.trim(),
          adminPhone: newAdminForm.phone.trim(),
          adminPassword: newAdminForm.password,
      });
      if (error || !data?.success) {
        setAddAdminError(await functionErrorMessage(error, data, 'הוספת האדמין נכשלה', false));
        return;
      }
      setNewAdminForm(EMPTY_NEW_ADMIN_FORM);
      setNewAdminFieldErrors({});
      setAddAdminOpen(false);
      setAddAdminSuccessOpen(true);
      await load();
    } catch {
      setAddAdminError('אירעה שגיאה. נסה שוב');
    } finally {
      setAddingAdmin(false);
    }
  };

  const removeUser = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    const { data, error } = await deleteCompanyUser(removeTarget.id);
    setRemoving(false);
    if (error || !data?.success) {
      Alert.alert('מחיקת המשתמש נכשלה', await functionErrorMessage(error, data, 'נסה שוב', false));
      return;
    }
    setRemoveTarget(null);
    await load();
  };

  const validateResetForm = () => {
    const errors: Record<string, string> = {};
    if (!resetForm.password) errors.password = 'שדה חובה';
    else if (resetForm.password.length < 6) errors.password = 'לפחות 6 תווים';
    if (!resetForm.confirmPassword) errors.confirmPassword = 'שדה חובה';
    else if (resetForm.confirmPassword !== resetForm.password)
      errors.confirmPassword = 'הסיסמאות אינן תואמות';
    return errors;
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    setResetError('');
    const errors = validateResetForm();
    setResetFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setResetting(true);
    try {
      const { data, error } = await resetCompanyUserPassword(resetTarget.id, resetForm.password, companyId);

      if (error || !data?.success) {
        setResetError(await functionErrorMessage(error, data, 'איפוס הסיסמה נכשל', false));
        return;
      }

      setResetForm(EMPTY_RESET_PASSWORD_FORM);
      setResetFieldErrors({});
      setResetTarget(null);
      setResetSuccessOpen(true);
      await load();
    } catch {
      setResetError('אירעה שגיאה. נסה שוב');
    } finally {
      setResetting(false);
    }
  };

  if (loadError && !company) {
    return (
      <View style={styles.centerFill}>
        <ErrorState message={loadError} onRetry={load} />
      </View>
    );
  }

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
        {!!company.logo_url && <Image source={{ uri: company.logo_url }} style={styles.headerLogo} resizeMode="cover" />}
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
        <CompanyInfoCard
          fields={fields}
          active={active}
          hasChanges={hasChanges}
          saving={saving}
          saveError={saveError}
          uploadingLogo={uploadingLogo}
          logoError={logoError}
          onChangeFields={setFields}
          onPickLogo={handlePickLogo}
          onSave={saveChanges}
          onToggleActive={toggleActive}
          onRequestDelete={() => setDeleteOpen(true)}
        />

        <View style={s.card}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionTitle}>אדמינים ({admins.length})</Text>
            <TouchableOpacity style={s.addSmallButton} onPress={() => setAddAdminOpen(true)}>
              <Ionicons name="add" size={16} color={COLORS.blue} />
              <Text style={s.addSmallButtonText}>הוסף אדמין</Text>
            </TouchableOpacity>
          </View>
          {admins.length === 0 ? (
            <Text style={s.emptyText}>אין אדמינים עדיין</Text>
          ) : (
            admins.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                onRemove={() => setRemoveTarget(u)}
                onResetPassword={() => setResetTarget(u)}
                onEdit={() => openEdit(u)}
              />
            ))
          )}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>נהגים ({drivers.length})</Text>
          {drivers.length === 0 ? (
            <Text style={s.emptyText}>אין נהגים עדיין</Text>
          ) : (
            drivers.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                onRemove={() => setRemoveTarget(u)}
                onResetPassword={() => setResetTarget(u)}
                onEdit={() => openEdit(u)}
              />
            ))
          )}
        </View>
      </ScrollView>

      <DeleteCompanyModal
        visible={deleteOpen}
        companyName={company.name}
        confirmText={deleteConfirmText}
        deleting={deleting}
        onChangeConfirmText={setDeleteConfirmText}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteConfirmText('');
        }}
        onConfirm={confirmDeleteCompany}
      />

      <AddAdminModal
        visible={addAdminOpen}
        form={newAdminForm}
        fieldErrors={newAdminFieldErrors}
        showPassword={showNewAdminPassword}
        submitting={addingAdmin}
        submitError={addAdminError}
        onClose={() => {
          setAddAdminOpen(false);
          setNewAdminFieldErrors({});
        }}
        onChangeForm={setNewAdminForm}
        onToggleShowPassword={() => setShowNewAdminPassword((v) => !v)}
        onSubmit={addAdmin}
      />

      <InfoSuccessModal
        visible={addAdminSuccessOpen}
        title="האדמין נוסף בהצלחה"
        description="האדמין יכול להתחבר עכשיו עם המייל והסיסמה שקבעת, ויתבקש לקבוע סיסמה קבועה משלו בכניסה הראשונה."
        onClose={() => setAddAdminSuccessOpen(false)}
      />

      <RemoveUserModal target={removeTarget} removing={removing} onClose={() => setRemoveTarget(null)} onConfirm={removeUser} />

      <ResetPasswordModal
        target={resetTarget}
        form={resetForm}
        fieldErrors={resetFieldErrors}
        showPassword={showResetPassword}
        submitting={resetting}
        submitError={resetError}
        onClose={() => {
          setResetTarget(null);
          setResetForm(EMPTY_RESET_PASSWORD_FORM);
          setResetFieldErrors({});
          setResetError('');
        }}
        onChangeForm={setResetForm}
        onToggleShowPassword={() => setShowResetPassword((v) => !v)}
        onSubmit={resetPassword}
      />

      <InfoSuccessModal
        visible={resetSuccessOpen}
        title="הסיסמה אופסה בהצלחה"
        description="המשתמש יכול להתחבר עכשיו עם הסיסמה החדשה שקבעת, ויתבקש לקבוע סיסמה קבועה משלו בכניסה הבאה."
        onClose={() => setResetSuccessOpen(false)}
      />

      <EditUserModal
        target={editTarget}
        form={editForm}
        fieldErrors={editFieldErrors}
        submitting={editing}
        submitError={editError}
        onClose={() => setEditTarget(null)}
        onChangeForm={setEditForm}
        onSubmit={saveEdit}
      />
    </View>
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
  headerLogo: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: COLORS.black, textAlign: 'right' },
  content: { padding: 16, gap: 14 },
  badge: { paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 6 },
  badgeActive: { backgroundColor: COLORS.activeBg },
  badgeDisabled: { backgroundColor: COLORS.disabledBg },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextActive: { color: COLORS.activeText },
  badgeTextDisabled: { color: COLORS.disabledText },
});
