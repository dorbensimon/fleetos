import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BrandLoader } from '../components/ui/BrandLoader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAlert } from '../lib/platformAlert';
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
import { isValidEmail, isValidTemporaryPassword } from '../lib/validation';
import { DK } from '../components/driverKit';
import { CompanyUser } from '../components/companyDetail/types';
import type { CompanyEditableFields } from '../components/companyDetail/companyFields';
import { DeleteCompanyModal } from '../components/owner/DeleteCompanyModal';
import {
  AddAdminSheet,
  CredentialsSheet,
  EditUserSheet,
  EMPTY_NEW_ADMIN_FORM,
  RemoveUserSheet,
  ResetPasswordSheet,
  UserActionsSheet,
  type Credentials,
  type EditUserForm,
  type NewAdminForm,
} from '../components/companyDetail/CompanyDetailSheets';
import { CompanyDetailMobile } from '../components/companyDetail/CompanyDetailMobile';
import { CompanyDetailDesktop } from '../components/companyDetail/CompanyDetailDesktop';
import { loadPlatformRows } from '../lib/ownerApi';
import { buildPlatformOverview, type CompanyHealth } from '../lib/platformOverview';
import { CompanyAccountSheet } from '../components/owner/CompanyAccountSheet';
import { getCompanyAccount } from '../lib/companyAccountApi';
import type { CompanyAccount } from '../lib/companyAccount';
import { ErrorState, LoadingState } from '../components/ui';
import { functionErrorMessage } from '../lib/functionError';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { DesktopShell } from '../components/desktop/DesktopShell';
import { t } from '../lib/i18n';
import { errorMessage } from '../lib/requestError';

/**
 * Owner-only screen: one company as a customer — its subscription, its
 * managers and drivers, its editable details — with add-manager / edit /
 * new temporary password / remove flows, disabling and deleting. The phone
 * view is components/companyDetail/CompanyDetailMobile (app kit), the
 * computer's is CompanyDetailDesktop. Every dialog is a kit sheet
 * (components/companyDetail/CompanyDetailSheets). This screen owns data
 * loading and the handlers those pieces call back into.
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
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();

  const [company, setCompany] = useState<Company | null>(null);
  const [account, setAccount] = useState<CompanyAccount | null>(null);
  const [health, setHealth] = useState<CompanyHealth | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionsUser, setActionsUser] = useState<CompanyUser | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
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
      setLogoError(errorMessage(err, t('company.logoUploadFailed')));
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
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [addAdminError, setAddAdminError] = useState('');

  const [removeTarget, setRemoveTarget] = useState<CompanyUser | null>(null);
  const [removing, setRemoving] = useState(false);

  const [resetTarget, setResetTarget] = useState<CompanyUser | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetFieldError, setResetFieldError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');

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
    if (!editForm.firstName.trim()) errors.firstName = t('validation.required');
    if (!editForm.lastName.trim()) errors.lastName = t('validation.required');
    if (!editForm.phone.trim()) errors.phone = t('validation.required');
    else if (!isValidIsraeliPhone(editForm.phone)) errors.phone = t('validation.invalidPhone');
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
      setEditError(t('common.saveChangesFailed'));
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
    if (companyError || !companyData) throw companyError ?? new Error(t('company.notFound'));

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

    // The subscription is decoration on this page: a failure leaves it empty.
    const accountData = await getCompanyAccount(companyId).catch(() => null);
    if (requestId === loadRequest.current) setAccount(accountData);
    // The control room's numbers and checks for this company (computer only); extra, so a failure leaves them out.
    // ponytail: loads every company's rows; a per-company query if the platform grows large.
    if (isDesktop) {
      void loadPlatformRows()
        .then((rows) => buildPlatformOverview(rows).companies.find((row) => row.company.id === companyId) ?? null)
        .catch(() => null)
        .then((row) => { if (requestId === loadRequest.current) setHealth(row); });
    }

    const { data: usersData, error } = await listCompanyUsers(companyId);

    if (error || !usersData?.success) {
      throw new Error(await functionErrorMessage(error, usersData, t('company.usersLoadFailed'), false));
    }
    if (requestId === loadRequest.current) {
      setUsers(usersData.users);
    }
    } catch (err: any) {
      if (requestId === loadRequest.current) setLoadError(errorMessage(err, t('company.loadFailedShort')));
    }
  }, [companyId, isDesktop]);

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
      setSaveError(t('common.saveChangesFailed'));
      return;
    }
    await load();
  };

  /** The computer's in-place edits: one field at a time. */
  const saveField = async (patch: Partial<Company>) => {
    if (!company) return null;
    const { error } = await updateCompany(company.id, patch);
    if (error) return t('common.saveChangesFailed');
    await load();
    return null;
  };

  const replaceLogo = async () => {
    if (!company) return;
    setLogoError('');
    setUploadingLogo(true);
    try {
      const url = await pickAndUploadLogo();
      if (url) setLogoError((await saveField({ logo_url: url })) ?? '');
    } catch (err: any) {
      setLogoError(errorMessage(err, t('company.logoUploadFailed')));
    } finally {
      setUploadingLogo(false);
    }
  };

  const setStatus = async (status: Company['status']) => {
    if (!company) return;
    const { error } = await updateCompany(company.id, { status });
    if (error) {
      showAlert(t('common.updateFailed'), t('company.statusUpdateFailed'));
      return;
    }
    await load();
  };

  // Disabling locks every user of the company out, so it asks first.
  const toggleActive = () => {
    if (!company) return;
    if (company.status !== 'active') {
      void setStatus('active');
      return;
    }
    showAlert(t('owner.disableCompany'), t('company.disableConfirm', { name: company.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('company.disableAction'), style: 'destructive', onPress: () => void setStatus('disabled') },
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const confirmDeleteCompany = async () => {
    if (!company || deleteConfirmText.trim() !== company.name) return;
    setDeleting(true);
    const { data, error } = await deleteCompany(company.id, deleteConfirmText.trim());
    setDeleting(false);
    if (error || !data?.success) {
      showAlert(t('company.deleteFailed'), await functionErrorMessage(error, data, t('common.tryAgain'), false));
      return;
    }
    navigation.goBack();
  };

  const validateNewAdminForm = () => {
    const errors: Record<string, string> = {};
    if (!newAdminForm.firstName.trim()) errors.firstName = t('validation.required');
    if (!newAdminForm.lastName.trim()) errors.lastName = t('validation.required');
    if (!newAdminForm.email.trim()) errors.email = t('validation.required');
    else if (!isValidEmail(newAdminForm.email)) errors.email = t('validation.invalidEmail');
    if (!newAdminForm.phone.trim()) errors.phone = t('validation.required');
    else if (!isValidIsraeliPhone(newAdminForm.phone)) errors.phone = t('validation.invalidPhone');
    if (!newAdminForm.password) errors.password = t('validation.tempPasswordRequired');
    else if (!isValidTemporaryPassword(newAdminForm.password)) errors.password = t('validation.min4Digits');
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
        setAddAdminError(await functionErrorMessage(error, data, t('company.addAdminFailed'), false));
        return;
      }
      setCredentials({
        title: t('company.managerAdded'),
        subtitle: t('company.managerAddedHint'),
        name: newAdminForm.firstName.trim(),
        email: newAdminForm.email.trim(),
        password: newAdminForm.password,
        phone: newAdminForm.phone,
      });
      setNewAdminForm(EMPTY_NEW_ADMIN_FORM);
      setNewAdminFieldErrors({});
      setAddAdminOpen(false);
      await load();
    } catch {
      setAddAdminError(t('common.errorTryAgain'));
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
      showAlert(t('company.deleteUserFailed'), await functionErrorMessage(error, data, t('common.tryAgain'), false));
      return;
    }
    setRemoveTarget(null);
    await load();
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    setResetError('');
    const fieldError = !resetPasswordValue ? t('validation.tempPasswordRequired') : !isValidTemporaryPassword(resetPasswordValue) ? t('validation.min4Digits') : '';
    setResetFieldError(fieldError);
    if (fieldError) return;

    setResetting(true);
    try {
      const { data, error } = await resetCompanyUserPassword(resetTarget.id, resetPasswordValue, companyId);

      if (error || !data?.success) {
        setResetError(await functionErrorMessage(error, data, t('driver.resetPasswordFailed'), false));
        return;
      }

      setCredentials({
        title: t('password.replaced'),
        subtitle: t('password.replacedHint'),
        name: (resetTarget.full_name || '').trim().split(/\s+/)[0] || '',
        email: resetTarget.email || '',
        password: resetPasswordValue,
        phone: resetTarget.phone,
      });
      setResetPasswordValue('');
      setResetFieldError('');
      setResetTarget(null);
      await load();
    } catch {
      setResetError(t('common.errorTryAgain'));
    } finally {
      setResetting(false);
    }
  };

  const openUser = (user: CompanyUser) => setActionsUser(user);

  if (loadError && !company) {
    if (isDesktop) {
      return (
        <DesktopShell active="OwnerHome" breadcrumbs={[t('nav.controlCenter'), t('common.error')]}>
          <ErrorState message={loadError} onRetry={load} />
        </DesktopShell>
      );
    }
    return (
      <View style={styles.centerFill}>
        <ErrorState message={loadError} onRetry={load} />
      </View>
    );
  }

  if (loading || !company) {
    if (isDesktop) {
      return (
        <DesktopShell active="OwnerHome" breadcrumbs={[t('nav.controlCenter'), '…']}>
          <LoadingState />
        </DesktopShell>
      );
    }
    return (
      <View style={styles.centerFill}>
        <BrandLoader color={DK.accent} />
      </View>
    );
  }

  const admins = users.filter((u) => u.role === 'admin');
  const drivers = users.filter((u) => u.role === 'driver');
  const active = company.status === 'active';

  const modals = (
    <>
      <DeleteCompanyModal
        visible={deleteOpen}
        company={{ ...company, admins: admins.length, drivers: drivers.length }}
        confirmText={deleteConfirmText}
        deleting={deleting}
        onChangeConfirmText={setDeleteConfirmText}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteConfirmText('');
        }}
        onConfirm={confirmDeleteCompany}
      />

      <CompanyAccountSheet
        visible={accountOpen}
        companyId={company.id}
        companyName={company.name}
        account={account}
        onClose={() => setAccountOpen(false)}
        onSaved={() => void load()}
      />

      <UserActionsSheet
        user={actionsUser}
        onClose={() => setActionsUser(null)}
        onEdit={() => {
          const u = actionsUser;
          setActionsUser(null);
          if (u) openEdit(u);
        }}
        onReset={() => {
          const u = actionsUser;
          setActionsUser(null);
          setResetPasswordValue('');
          setResetFieldError('');
          setResetError('');
          setResetTarget(u);
        }}
        onRemove={() => {
          const u = actionsUser;
          setActionsUser(null);
          setRemoveTarget(u);
        }}
      />

      <AddAdminSheet
        visible={addAdminOpen}
        companyName={company.name}
        form={newAdminForm}
        fieldErrors={newAdminFieldErrors}
        submitting={addingAdmin}
        submitError={addAdminError}
        onClose={() => {
          setAddAdminOpen(false);
          setNewAdminFieldErrors({});
          setAddAdminError('');
        }}
        onChangeForm={setNewAdminForm}
        onSubmit={addAdmin}
      />

      <RemoveUserSheet target={removeTarget} removing={removing} onClose={() => setRemoveTarget(null)} onConfirm={removeUser} />

      <ResetPasswordSheet
        target={resetTarget}
        password={resetPasswordValue}
        error={resetFieldError}
        submitting={resetting}
        submitError={resetError}
        onClose={() => setResetTarget(null)}
        onChange={(v) => {
          setResetPasswordValue(v);
          setResetFieldError('');
        }}
        onSubmit={resetPassword}
      />

      <EditUserSheet
        target={editTarget}
        form={editForm}
        fieldErrors={editFieldErrors}
        submitting={editing}
        submitError={editError}
        onClose={() => setEditTarget(null)}
        onChangeForm={setEditForm}
        onSubmit={saveEdit}
      />

      <CredentialsSheet details={credentials} onClose={() => setCredentials(null)} />
    </>
  );

  if (isDesktop) {
    return (
      <>
        <DesktopShell active="OwnerHome" breadcrumbs={[t('nav.controlCenter'), company.name]}>
          <CompanyDetailDesktop
            company={company}
            account={account}
            health={health}
            admins={admins}
            drivers={drivers}
            onSaveField={saveField}
            onPickLogo={() => void replaceLogo()}
            uploadingLogo={uploadingLogo}
            logoError={logoError}
            onToggleActive={toggleActive}
            onDelete={() => setDeleteOpen(true)}
            onEditAccount={() => setAccountOpen(true)}
            onAddAdmin={() => setAddAdminOpen(true)}
            onEditUser={openEdit}
            onResetUser={(user) => {
              setResetPasswordValue('');
              setResetFieldError('');
              setResetError('');
              setResetTarget(user);
            }}
            onRemoveUser={setRemoveTarget}
          />
        </DesktopShell>
        {modals}
      </>
    );
  }

  return (
    <>
      <CompanyDetailMobile
        insetTop={insets.top}
        insetBottom={insets.bottom}
        company={company}
        account={account}
        fields={fields}
        hasChanges={hasChanges}
        saving={saving}
        saveError={saveError}
        uploadingLogo={uploadingLogo}
        logoError={logoError}
        admins={admins}
        drivers={drivers}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
        onBack={() => navigation.goBack()}
        onChangeFields={setFields}
        onPickLogo={handlePickLogo}
        onSave={saveChanges}
        onEditAccount={() => setAccountOpen(true)}
        onAddAdmin={() => setAddAdminOpen(true)}
        onUser={openUser}
        onToggleActive={toggleActive}
        onDelete={() => setDeleteOpen(true)}
      />
      {modals}
    </>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DK.canvas },
});
