import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
import { CompanyRow } from '../components/owner/CompanyCard';
import { CompanyActionsSheet } from '../components/owner/CompanyActionsSheet';
import { AddCompanySheet, CompanyCreatedSheet, emptyOwnerCompanyForm, OwnerCompanyForm } from '../components/owner/AddCompanySheet';
import { DeleteCompanyModal } from '../components/owner/DeleteCompanyModal';
import { CompanyAccountSheet } from '../components/owner/CompanyAccountSheet';
import { formToAccountInput, type CompanyAccount } from '../lib/companyAccount';
import { saveCompanyAccount } from '../lib/companyAccountApi';
import { countUnreadOwnerNotifications } from '../lib/ownerNotifications';
import { exportPlatformReport } from '../lib/platformReport';
import { functionErrorMessage } from '../lib/functionError';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { useCompany } from '../lib/CompanyContext';
import { buildPlatformOverview, type CompanyHealth, type PlatformOverview } from '../lib/platformOverview';
import { DesktopShell } from '../components/desktop/DesktopShell';
import { OwnerConsoleDesktop } from '../components/owner/OwnerConsoleDesktop';
import { OwnerConsoleMobile } from '../components/owner/OwnerConsoleMobile';

/**
 * The owner's (super-admin) control room: every company as a customer — its
 * health, its subscription and revenue, what needs the owner, how the system
 * is used and its security state — plus opening, billing, disabling and
 * deleting companies. The views live in components/owner/OwnerConsole
 * {Desktop,Mobile}; the numbers come from lib/platformOverview. This screen
 * owns loading and the handlers the views and sheets call back into.
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
  const [accountTarget, setAccountTarget] = useState<{ id: string; name: string; account: CompanyAccount | null } | null>(null);
  const [unread, setUnread] = useState(0);

  const [form, setForm] = useState<OwnerCompanyForm>(emptyOwnerCompanyForm);
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

  const [created, setCreated] = useState<{ companyId: string | null; companyName: string; email: string; password: string } | null>(null);
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

  // The bell's count follows the owner back from the notifications screen.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      countUnreadOwnerNotifications()
        .then((n) => alive && setUnread(n))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []),
  );

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

  const openCompany = (id: string) => navigation.navigate('CompanyDetail', { companyId: id });

  const closeAll = () => {
    setMenuCompany(null);
    setAddOpen(false);
    setDeleteOpen(false);
    setDeleteConfirmText('');
    setCreateError('');
  };

  const openAccount = (companyId: string) => {
    const health = overview?.companies.find((c) => c.company.id === companyId);
    if (!health) return;
    setMenuCompany(null);
    setAccountTarget({ id: companyId, name: health.company.name, account: health.account });
  };

  const exportReport = async () => {
    if (!overview) return;
    try {
      await exportPlatformReport(overview);
    } catch {
      showAlert('הפקת הדוח נכשלה', 'נסה שוב בעוד רגע.');
    }
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

  // AddCompanySheet validates each step before it calls this.
  const createCompany = async () => {
    setCreateError('');
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

      const companyId: string | null = data.companyId ?? null;
      // The subscription is the owner's own record; a failure here leaves the
      // default trial in place and is fixable from the company's page.
      if (companyId) await saveCompanyAccount(companyId, formToAccountInput(form.account)).catch(() => {});
      setCreated({ companyId, companyName: form.name.trim(), email: form.email.trim(), password: form.password });
      setForm(emptyOwnerCompanyForm());
      setAddOpen(false);
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
        onOpen={() => {
          const id = menuCompany?.id;
          setMenuCompany(null);
          if (id) openCompany(id);
        }}
        onAccount={() => menuCompany && openAccount(menuCompany.id)}
        onToggleActive={toggleActive}
        onDelete={() => setDeleteOpen(true)}
      />

      <AddCompanySheet
        visible={addOpen}
        form={form}
        uploadingLogo={uploadingLogo}
        logoError={logoError}
        createError={createError}
        creating={creating}
        onClose={closeAll}
        onChangeForm={setForm}
        onPickLogo={handlePickLogo}
        onSubmit={createCompany}
      />

      <CompanyAccountSheet
        visible={!!accountTarget}
        companyId={accountTarget?.id ?? null}
        companyName={accountTarget?.name ?? ''}
        account={accountTarget?.account ?? null}
        onClose={() => setAccountTarget(null)}
        onSaved={() => void loadCompanies()}
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

      <CompanyCreatedSheet visible={!!created} details={created} onClose={() => setCreated(null)} onOpenCompany={(id) => openCompany(id)} />
    </>
  );

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
            onExport={() => void exportReport()}
            onAccount={(h) => openAccount(h.company.id)}
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
        unread={unread}
        onNotifications={() => navigation.navigate('Notifications')}
        onExport={() => void exportReport()}
      />
      {sheets}
    </>
  );
}
