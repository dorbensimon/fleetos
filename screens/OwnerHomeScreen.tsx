import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAlert } from '../lib/platformAlert';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import {
  loadPlatformRows,
  updateCompanyStatus,
  deleteOwnedCompany,
  createCompanyAdmin,
} from '../lib/ownerApi';
import { pickAndUploadLogo } from '../lib/uploadLogo';
import { isValidIsraeliPhone } from '../lib/phone';
import { isValidEmail, isValidTemporaryPassword } from '../lib/validation';
import { CompanyRow } from '../components/owner/CompanyCard';
import { CompanyActionsSheet } from '../components/owner/CompanyActionsSheet';
import { AddCompanySheet, EMPTY_OWNER_COMPANY_FORM, OwnerCompanyForm } from '../components/owner/AddCompanySheet';
import { DeleteCompanyModal, CompanyCreatedModal } from '../components/owner/DeleteCompanyModal';
import { functionErrorMessage } from '../lib/functionError';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { useCompany } from '../lib/CompanyContext';
import { buildPlatformOverview, type CompanyHealth, type PlatformOverview } from '../lib/platformOverview';
import { DesktopShell } from '../components/desktop/DesktopShell';
import { OwnerConsoleDesktop } from '../components/owner/OwnerConsoleDesktop';
import { OwnerConsoleMobile } from '../components/owner/OwnerConsoleMobile';

/**
 * The owner's (super-admin) control room: the health of every company on the
 * platform, what needs the owner, how the system is used and its security
 * state — plus creating, disabling and deleting companies. The views live in
 * components/owner/OwnerConsole{Desktop,Mobile}; the numbers come from
 * lib/platformOverview. This screen owns loading and the create/delete/toggle
 * handlers the views and sheets call back into.
 */

function toCompanyRow(h: CompanyHealth): CompanyRow {
  return { ...h.company, admins: h.admins, drivers: h.drivers };
}

type Props = NativeStackScreenProps<RootStackParamList, 'OwnerHome'>;

export default function OwnerHomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const { profile } = useCompany();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? '';
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      const rows = await loadPlatformRows();
      if (requestId === loadRequest.current) setOverview(buildPlatformOverview(rows));
    } catch (err: any) {
      if (requestId === loadRequest.current) setLoadError(err?.message ?? 'טעינת נתוני המערכת נכשלה');
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

  const setStatus = async (company: CompanyRow, status: CompanyRow['status']) => {
    const { error } = await updateCompanyStatus(company.id, status);
    if (error) {
      showAlert('העדכון נכשל', 'לא הצלחנו לעדכן את סטטוס החברה. נסה שוב.');
      return;
    }
    await loadCompanies();
  };

  // Disabling locks every user of the company out, so it asks first; turning back on doesn't.
  const requestToggle = (company: CompanyRow) => {
    setMenuCompany(null);
    if (company.status !== 'active') {
      void setStatus(company, 'active');
      return;
    }
    showAlert('השבתת החברה', `המנהלים והנהגים של ${company.name} לא יוכלו להיכנס עד שתפעיל אותה מחדש. הנתונים נשמרים.`, [
      { text: 'ביטול', style: 'cancel' },
      { text: 'השבתה', style: 'destructive', onPress: () => void setStatus(company, 'disabled') },
    ]);
  };

  const toggleActive = async () => {
    if (menuCompany) requestToggle(menuCompany);
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

  const openCompany = (id: string) => navigation.navigate('CompanyDetail', { companyId: id });

  if (isDesktop) {
    return (
      <>
        <DesktopShell active="OwnerHome" breadcrumbs={['מרכז הבקרה']}>
          <OwnerConsoleDesktop
            firstName={firstName}
            overview={overview}
            loading={loading}
            error={loadError}
            onRetry={loadCompanies}
            onOpenCompany={openCompany}
            onAddCompany={() => setAddOpen(true)}
            onTemplates={() => navigation.navigate('GlobalSigningTemplates')}
            onToggleActive={(h) => requestToggle(toCompanyRow(h))}
            onDelete={(h) => {
              setMenuCompany(toCompanyRow(h));
              setDeleteOpen(true);
            }}
          />
        </DesktopShell>
        {sheets}
      </>
    );
  }

  return (
    <>
      <OwnerConsoleMobile
        insetTop={insets.top}
        insetBottom={insets.bottom}
        firstName={firstName}
        overview={overview}
        loading={loading}
        error={loadError}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onRetry={loadCompanies}
        onOpenCompany={openCompany}
        onCompanyMenu={(h) => setMenuCompany(toCompanyRow(h))}
        onAddCompany={() => setAddOpen(true)}
        onTemplates={() => navigation.navigate('GlobalSigningTemplates')}
      />
      {sheets}
    </>
  );
}
