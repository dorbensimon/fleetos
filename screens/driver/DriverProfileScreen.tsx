import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { BrandLoader } from '../../components/ui/BrandLoader';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState, LoadingState, useToast } from '../../components/ui';
import { DK, DKText, DriverPage, EditField, HeroButton, HeroTitle, InfoLine, KitSection as ProfileSection, PrimaryAction, Reveal, StatusChip, Surface, statusOfDate } from '../../components/driverKit';
import { DateField } from '../../components/ui/DateField';
import { Select } from '../../components/ui/Select';
import { formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { signOut as signOutEverywhere } from '../../lib/signOut';
import { getDriver, listDepartments, markNotificationsReadWhere, updateDriver, type Department, type DriverRow } from '../../lib/adminApi';
import { FocusTargetProvider } from '../../components/ui/FocusTarget';
import { formatPhone, isValidIsraeliPhone } from '../../lib/phone';
import { isValidIsraeliNationalId } from '../../lib/driverFormValidation';
import { RootStackParamList } from '../../navigation/types';
import {
  departmentNameById,
  EDUCATION_OPTIONS,
  storedValueLabel,
  joinLicenseClasses,
  LICENSE_CLASS_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  optionsWithCurrent,
  splitLicenseClasses,
} from '../../lib/driverFields';
import { showAlert } from '../../lib/platformAlert';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DesktopFieldRow, DesktopInput, DesktopSelect, DText, HoverPressable } from '../../components/desktop/primitives';
import { DESKTOP_COLORS } from '../../components/desktop/desktopTheme';
import { t, textStart } from '../../lib/i18n';
import { LanguageRows, LanguageSection } from '../../components/LanguagePicker';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverProfile'>;

type DriverPatch = Parameters<typeof updateDriver>[1];

/**
 * Everything a driver may change on their own record. The database enforces
 * the same list (supabase/sql/92_driver_self_edit_allowlist.sql); department,
 * employee number and the rest stay with the company manager.
 */
interface ProfileDraft {
  full_name: string;
  phone: string;
  birth_date: string | null;
  address: string;
  home_phone: string;
  marital_status: string;
  education: string;
  national_id: string;
  license_number: string;
  license_primary: string;
  license_secondary: string;
  license_issue_date: string | null;
  license_expiry: string | null;
}

type DraftErrors = Partial<Record<'full_name' | 'phone' | 'home_phone' | 'national_id', string>>;

// Same short class labels as the manager's inline editor on the driver card.
const LICENSE_CLASS_SELECT = () => LICENSE_CLASS_OPTIONS.map((option) => ({ value: option.value, label: option.label.split(',')[0].trim() }));

function draftFromDriver(driver: DriverRow | null): ProfileDraft {
  const license = splitLicenseClasses(driver?.license_classes);
  return {
    full_name: driver?.full_name ?? '',
    phone: driver?.phone ?? '',
    birth_date: driver?.birth_date ?? null,
    address: driver?.address ?? '',
    home_phone: driver?.home_phone ?? '',
    marital_status: driver?.marital_status ?? '',
    education: driver?.education ?? '',
    national_id: driver?.national_id ?? '',
    license_number: driver?.license_number ?? '',
    license_primary: license.primary,
    license_secondary: license.secondary,
    license_issue_date: driver?.license_issue_date ?? null,
    license_expiry: driver?.license_expiry ?? null,
  };
}

function validateDraft(draft: ProfileDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.full_name.trim()) errors.full_name = t('validation.required');
  if (!draft.phone.trim()) errors.phone = t('validation.required');
  else if (!isValidIsraeliPhone(draft.phone)) errors.phone = t('validation.invalidPhone');
  if (draft.home_phone.trim() && !isValidIsraeliPhone(draft.home_phone)) errors.home_phone = t('validation.invalidPhone');
  if (draft.national_id && !isValidIsraeliNationalId(draft.national_id)) errors.national_id = t('validation.invalidNationalId');
  return errors;
}

/** Only the fields that actually changed, so saving an untouched form writes nothing and notifies no one. */
function changedFields(driver: DriverRow, draft: ProfileDraft): DriverPatch {
  const next: DriverPatch = {
    full_name: draft.full_name.trim(),
    phone: draft.phone.trim(),
    birth_date: draft.birth_date,
    address: draft.address.trim() || null,
    home_phone: draft.home_phone.trim() || null,
    marital_status: draft.marital_status.trim() || null,
    education: draft.education.trim() || null,
    national_id: draft.national_id || null,
    license_number: draft.license_number.trim() || null,
    license_classes: joinLicenseClasses(draft.license_primary, draft.license_secondary) || null,
    license_issue_date: draft.license_issue_date,
    license_expiry: draft.license_expiry,
  };
  const current = driver as unknown as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(next).filter(([key, value]) => (current[key] ?? null) !== value)
  ) as DriverPatch;
}

const onlyDigits = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);

export default function DriverProfileScreen({ navigation, route }: Props) {
  const { profile, company, companyId, loading: profileLoading } = useCompany();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);
  const hasLoadedOnce = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  // From a notification or a task: the fields to land on, and whether to open
  // the form so the driver can fill them in right there.
  const focus = route.params?.focus;
  const openEditor = !!route.params?.edit;

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFromDriver(null));
  const [fieldErrors, setFieldErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));
  const setLicensePrimary = (value: string | null) =>
    setDraft((prev) => ({
      ...prev,
      license_primary: value ?? '',
      license_secondary: !value || value === prev.license_secondary ? '' : prev.license_secondary,
    }));

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    // Only show the full-screen loading state on the very first load — a
    // background refetch on refocus (e.g. returning from a pushed screen)
    // must not remount the ScrollView, or the user's scroll position resets
    // to the top every time they navigate back.
    if (!hasLoadedOnce.current) setLoading(true);
    setError(null);
    if (!profile) {
      // Right after a refresh the profile is still on its way: keep loading.
      if (profileLoading) return;
      setError(t('driver.profileUnavailable'));
      setLoading(false);
      return;
    }
    try {
      const [loadedDriver, { data: auth }, deps] = await Promise.all([
        getDriver(profile.id),
        supabase.auth.getUser(),
        companyId ? listDepartments(companyId) : Promise.resolve([]),
      ]);
      if (requestId !== loadRequest.current) return;
      setDriver(loadedDriver);
      setEmail(auth.user?.email ?? null);
      setDepartments(deps);
      hasLoadedOnce.current = true;
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(err?.message ?? t('profile.loadFailed'));
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [profile, companyId, profileLoading]);

  useFocusEffect(useCallback(() => {
    load();
    return () => { loadRequest.current += 1; };
  }, [load]));

  // Seeing this screen is what "the manager updated your file" asks for.
  const profileId = profile?.id;
  useFocusEffect(useCallback(() => {
    if (!profileId) return;
    markNotificationsReadWhere({
      types: ['driver_profile_updated_by_manager', 'license_update_reviewed'],
      recipientId: profileId,
    }).catch(() => undefined);
  }, [profileId]));

  useEffect(() => {
    if (!openEditor || !driver || editMode) return;
    setDraft(draftFromDriver(driver));
    setFieldErrors({});
    setEditMode(true);
    navigation.setParams({ edit: undefined });
  }, [openEditor, driver, editMode, navigation]);

  const toggleEdit = () => {
    if (editMode) {
      void saveEdit();
      return;
    }
    setDraft(draftFromDriver(driver));
    setFieldErrors({});
    setEditMode(true);
  };

  const saveEdit = async () => {
    if (!profile || !driver) return;
    const errors = validateDraft(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const patch = changedFields(driver, draft);
    if (Object.keys(patch).length === 0) {
      setEditMode(false);
      return;
    }

    setSaving(true);
    try {
      await updateDriver(profile.id, patch);
      setDriver((prev) => (prev ? { ...prev, ...patch } : prev));
      setEditMode(false);
      showToast(t('common.savedSuccessfully'));
    } catch (err: any) {
      showAlert(t('common.saveFailedF'), err?.message ?? t('common.tryAgain'));
    } finally {
      setSaving(false);
    }
  };

  const signOut = () => showAlert(t('auth.signOut'), t('auth.signOutConfirm'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('auth.signOutAction'), style: 'destructive', onPress: () => void signOutEverywhere().catch(() => showAlert(t('auth.signOutFailed'), t('common.tryAgainShortly'))) },
  ]);
  const departmentName = departmentNameById(departments, driver?.department_id);
  const maritalOptions = optionsWithCurrent(MARITAL_STATUS_OPTIONS, driver?.marital_status);
  const educationOptions = optionsWithCurrent(EDUCATION_OPTIONS, driver?.education);

  if (isDesktop) {
    return (
      <FocusTargetProvider focus={focus}>
      <DesktopShell active="DriverProfile" breadcrumbs={[t('nav.account'), t('nav.myDetails')]}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <View style={ds.wrap}>
            <View style={ds.headRow}>
              <DText weight="bold" style={ds.heading}>{driver?.full_name || '—'}</DText>
              <HoverPressable style={ds.editButton} onPress={toggleEdit} disabled={saving}>
                <DText weight="semiBold" style={[ds.editButtonText, saving && { opacity: 0 }]}>{editMode ? t('common.save') : t('common.edit')}</DText>
                {saving && <BrandLoader size="small" color={DESKTOP_COLORS.brand} style={StyleSheet.absoluteFill} />}
              </HoverPressable>
            </View>

            <DText weight="bold" style={ds.sectionTitle}>{t('driver.personalDetails')}</DText>
            <View style={ds.card}>
              <DesktopFieldRow label={t('common.emailAddress')}><DesktopInput value={email ?? ''} editable={false} ltr /></DesktopFieldRow>
              <DesktopFieldRow label={t('common.phone')} focusId="phone" error={fieldErrors.phone}>
                {editMode ? (
                  <DesktopInput value={draft.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" ltr hasError={!!fieldErrors.phone} />
                ) : (
                  <DesktopInput value={driver?.phone ? formatPhone(driver.phone) : ''} editable={false} ltr />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label={t('common.fullName')} focusId="full_name" error={fieldErrors.full_name}>
                {editMode ? (
                  <DesktopInput value={draft.full_name} onChangeText={(v) => set('full_name', v)} hasError={!!fieldErrors.full_name} />
                ) : (
                  <DesktopInput value={driver?.full_name ?? ''} editable={false} />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label={t('common.role')} focusId="job_title"><DesktopInput value={t('role.driver')} editable={false} /></DesktopFieldRow>
              <DesktopFieldRow label={t('driver.birthDate')} focusId="birth_date">
                {editMode ? (
                  <DateField value={draft.birth_date} onChange={(v) => set('birth_date', v)} placeholder={t('common.notEntered')} />
                ) : (
                  <DesktopInput value={driver?.birth_date ? formatDate(driver.birth_date) : ''} editable={false} ltr />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label={t('common.address')} focusId="address">
                <DesktopInput value={editMode ? draft.address : driver?.address ?? ''} onChangeText={(v) => set('address', v)} editable={editMode} />
              </DesktopFieldRow>
              <DesktopFieldRow label={t('driver.homePhone')} focusId="home_phone" error={fieldErrors.home_phone}>
                {editMode ? (
                  <DesktopInput value={draft.home_phone} onChangeText={(v) => set('home_phone', v)} keyboardType="phone-pad" ltr hasError={!!fieldErrors.home_phone} />
                ) : (
                  <DesktopInput value={driver?.home_phone ? formatPhone(driver.home_phone) : ''} editable={false} ltr />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label={t('driver.maritalStatus')} focusId="marital_status">
                {editMode ? (
                  <DesktopSelect value={draft.marital_status || null} options={maritalOptions} onChange={(v) => set('marital_status', v ?? '')} allowClear placeholder={t('common.notSelected')} />
                ) : (
                  <DesktopInput value={storedValueLabel(driver?.marital_status) ?? ''} editable={false} />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label={t('driver.education')} focusId="education" last>
                {editMode ? (
                  <DesktopSelect value={draft.education || null} options={educationOptions} onChange={(v) => set('education', v ?? '')} allowClear placeholder={t('common.notSelectedF')} />
                ) : (
                  <DesktopInput value={storedValueLabel(driver?.education) ?? ''} editable={false} />
                )}
              </DesktopFieldRow>
            </View>

            <DText weight="bold" style={ds.sectionTitle}>{t('driver.workDetails')}</DText>
            <View style={ds.card}>
              <DesktopFieldRow label={t('owner.col.company')}><DesktopInput value={company?.name ?? ''} editable={false} /></DesktopFieldRow>
              <DesktopFieldRow label={t('driver.employeeNumber')} focusId="employee_number"><DesktopInput value={driver?.employee_number ?? ''} editable={false} /></DesktopFieldRow>
              <DesktopFieldRow label={t('common.department')} focusId="department_id" last><DesktopInput value={departmentName ?? ''} editable={false} /></DesktopFieldRow>
            </View>

            <DText weight="bold" style={ds.sectionTitle}>{t('driver.drivingLicense')}</DText>
            <View style={ds.card}>
              <DesktopFieldRow label={t('field.nationalId')} focusId="national_id" error={fieldErrors.national_id}>
                {editMode ? (
                  <DesktopInput value={draft.national_id} onChangeText={(v) => set('national_id', onlyDigits(v, 9))} keyboardType="number-pad" ltr hasError={!!fieldErrors.national_id} />
                ) : (
                  <DesktopInput value={driver?.national_id ?? ''} editable={false} ltr />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label={t('field.licenseNumber')} focusId="license_number">
                <DesktopInput value={editMode ? draft.license_number : driver?.license_number ?? ''} onChangeText={(v) => set('license_number', v)} editable={editMode} ltr />
              </DesktopFieldRow>
              <DesktopFieldRow label={t('driver.licenseClass')} focusId="license_classes">
                {editMode ? (
                  <DesktopSelect value={draft.license_primary || null} options={LICENSE_CLASS_SELECT()} onChange={setLicensePrimary} allowClear placeholder={t('common.notSelectedF')} />
                ) : (
                  <DesktopInput value={driver?.license_classes ?? ''} editable={false} />
                )}
              </DesktopFieldRow>
              {editMode && !!draft.license_primary && (
                <DesktopFieldRow label={t('driver.additionalClass')}>
                  <DesktopSelect
                    value={draft.license_secondary || null}
                    options={LICENSE_CLASS_SELECT().filter((option) => option.value !== draft.license_primary)}
                    onChange={(v) => set('license_secondary', v ?? '')}
                    allowClear
                    placeholder={t('common.none')}
                  />
                </DesktopFieldRow>
              )}
              <DesktopFieldRow label={t('driver.issueDate')} focusId="license_issue_date">
                {editMode ? (
                  <DateField value={draft.license_issue_date} onChange={(v) => set('license_issue_date', v)} placeholder={t('common.notEntered')} />
                ) : (
                  <DesktopInput value={driver?.license_issue_date ? formatDate(driver.license_issue_date) : ''} editable={false} ltr />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label={t('driver.licenseExpiry')} focusId="license_expiry">
                {editMode ? (
                  <DateField value={draft.license_expiry} onChange={(v) => set('license_expiry', v)} placeholder={t('common.notEntered')} />
                ) : (
                  <DesktopInput value={driver?.license_expiry ? formatDate(driver.license_expiry) : ''} editable={false} ltr />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label={t('driver.joinedApp')} last><DesktopInput value={driver?.created_at ? formatDate(driver.created_at) : ''} editable={false} ltr /></DesktopFieldRow>
            </View>

            <DText weight="bold" style={ds.sectionTitle}>{t('settings.language')}</DText>
            <View style={ds.card}>
              <LanguageRows />
            </View>

            <HoverPressable style={ds.signOutButton} onPress={signOut}>
              <DText weight="semiBold" style={ds.signOutText}>{t('auth.signOut')}</DText>
            </HoverPressable>
          </View>
        )}
      </DesktopShell>
      </FocusTargetProvider>
    );
  }

  const initial = (driver?.full_name || profile?.full_name || '?').trim().charAt(0);
  const cancelEdit = () => {
    setEditMode(false);
    setFieldErrors({});
    setDraft(draftFromDriver(driver));
  };

  return (
    <FocusTargetProvider focus={focus} scrollRef={scrollRef}>
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      scrollRef={scrollRef}
      hero={
        <HeroTitle
          title={editMode ? t('profile.editDetailsTitle') : t('nav.myDetails')}
          subtitle={company?.name ? t('driver.roleAt', { name: company.name }) : t('role.driver')}
          onBack={() => (editMode ? cancelEdit() : navigation.goBack())}
          right={!loading && !error && !editMode ? <HeroButton icon="create-outline" label={t('profile.editDetailsTitle')} onPress={toggleEdit} /> : undefined}
        />
      }
      footer={
        editMode ? (
          <View style={styles.footerRow}>
            <PrimaryAction label={t('common.cancel')} tone="ghost" onPress={cancelEdit} style={styles.footerCancel} />
            <PrimaryAction label={t('common.saveChangesAction')} icon="checkmark" onPress={() => void saveEdit()} loading={saving} style={styles.footerSave} />
          </View>
        ) : undefined
      }
    >
      {loading ? (
        <Surface><LoadingState /></Surface>
      ) : error ? (
        <Surface><ErrorState message={error} onRetry={load} /></Surface>
      ) : editMode ? (
        <>
          <Surface style={styles.editNote}>
            <DKText variant="caption" color={DK.inkSoft}>
              {t('driver.profileEditHint')}
            </DKText>
          </Surface>
          <Reveal index={0}>
            <ProfileSection title={t('driver.personalDetails')}>
              <EditField first label={t('common.fullName')} focusId="full_name" value={draft.full_name} onChangeText={(v) => set('full_name', v)} error={fieldErrors.full_name} />
              <EditField label={t('common.phone')} focusId="phone" value={draft.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" ltr error={fieldErrors.phone} />
              <EditField label={t('driver.birthDate')} focusId="birth_date" editor={<DateField value={draft.birth_date} onChange={(v) => set('birth_date', v)} placeholder={t('common.notEntered')} />} />
              <EditField label={t('common.address')} focusId="address" value={draft.address} onChangeText={(v) => set('address', v)} />
              <EditField label={t('driver.homePhone')} focusId="home_phone" value={draft.home_phone} onChangeText={(v) => set('home_phone', v)} keyboardType="phone-pad" ltr error={fieldErrors.home_phone} />
              <EditField label={t('driver.maritalStatus')} focusId="marital_status" editor={<Select value={draft.marital_status || null} options={maritalOptions} onChange={(v) => set('marital_status', v ?? '')} allowClear placeholder={t('common.notSelected')} />} />
              <EditField label={t('driver.education')} focusId="education" editor={<Select value={draft.education || null} options={educationOptions} onChange={(v) => set('education', v ?? '')} allowClear placeholder={t('common.notSelectedF')} />} />
            </ProfileSection>
          </Reveal>
          <Reveal index={1}>
            <ProfileSection title={t('driver.drivingLicense')}>
              <EditField first label={t('field.nationalId')} focusId="national_id" value={draft.national_id} onChangeText={(v) => set('national_id', onlyDigits(v, 9))} keyboardType="number-pad" ltr error={fieldErrors.national_id} hint={t('common.9digits')} />
              <EditField label={t('field.licenseNumber')} focusId="license_number" value={draft.license_number} onChangeText={(v) => set('license_number', v)} ltr />
              <EditField label={t('driver.licenseClass')} focusId="license_classes" editor={<Select value={draft.license_primary || null} options={LICENSE_CLASS_SELECT()} onChange={setLicensePrimary} allowClear placeholder={t('common.notSelectedF')} />} />
              {!!draft.license_primary && (
                <EditField
                  label={t('driver.additionalClass')}
                  editor={<Select value={draft.license_secondary || null} options={LICENSE_CLASS_SELECT().filter((option) => option.value !== draft.license_primary)} onChange={(v) => set('license_secondary', v ?? '')} allowClear placeholder={t('common.none')} />}
                />
              )}
              <EditField label={t('driver.issueDate')} focusId="license_issue_date" editor={<DateField value={draft.license_issue_date} onChange={(v) => set('license_issue_date', v)} placeholder={t('common.notEntered')} />} />
              <EditField label={t('driver.licenseExpiry')} focusId="license_expiry" editor={<DateField value={draft.license_expiry} onChange={(v) => set('license_expiry', v)} placeholder={t('common.notEntered')} />} />
            </ProfileSection>
          </Reveal>
        </>
      ) : (
        <>
          <Reveal index={0}>
            <Surface style={styles.identity}>
              <View style={styles.avatar}>
                <DKText variant="display" color={DK.accent} style={styles.center}>{initial}</DKText>
              </View>
              <View style={styles.identityText}>
                <DKText variant="title" numberOfLines={2}>{driver?.full_name || '—'}</DKText>
                <DKText variant="caption" color={DK.muted} ltr style={styles.alignRight} numberOfLines={1}>{email || ''}</DKText>
                <View style={styles.licenseRow}>
                  <StatusChip status={statusOfDate(driver?.license_expiry)} label={driver?.license_expiry ? t('driver.licenseUntil', { v1: formatDate(driver.license_expiry) }) : t('driver.licenseExpiryMissing')} />
                </View>
              </View>
            </Surface>
          </Reveal>
          <Reveal index={1}>
            <ProfileSection title={t('driver.personalDetails')}>
              <InfoLine first icon="person" label={t('common.fullName')} focusId="full_name" value={driver?.full_name} />
              <InfoLine icon="call" label={t('common.phone')} focusId="phone" value={driver?.phone ? formatPhone(driver.phone) : null} ltr />
              <InfoLine icon="mail" label={t('common.emailAddress')} value={email} ltr locked />
              <InfoLine icon="gift" label={t('driver.birthDate')} focusId="birth_date" value={driver?.birth_date ? formatDate(driver.birth_date) : null} />
              <InfoLine icon="home" label={t('common.address')} focusId="address" value={driver?.address} />
              <InfoLine icon="call-outline" label={t('driver.homePhone')} focusId="home_phone" value={driver?.home_phone ? formatPhone(driver.home_phone) : null} ltr />
              <InfoLine icon="heart" label={t('driver.maritalStatus')} focusId="marital_status" value={storedValueLabel(driver?.marital_status)} />
              <InfoLine icon="school" label={t('driver.education')} focusId="education" value={storedValueLabel(driver?.education)} />
            </ProfileSection>
          </Reveal>
          <Reveal index={2}>
            <ProfileSection title={t('driver.drivingLicense')}>
              <InfoLine first icon="card" label={t('field.nationalId')} focusId="national_id" value={driver?.national_id} ltr />
              <InfoLine icon="document-text" label={t('field.licenseNumber')} focusId="license_number" value={driver?.license_number} ltr />
              <InfoLine icon="ribbon" label={t('driver.licenseClass')} focusId="license_classes" value={driver?.license_classes} />
              <InfoLine icon="calendar" label={t('driver.issueDate')} focusId="license_issue_date" value={driver?.license_issue_date ? formatDate(driver.license_issue_date) : null} />
              <InfoLine icon="calendar-clear" label={t('driver.licenseExpiry')} focusId="license_expiry" value={driver?.license_expiry ? formatDate(driver.license_expiry) : null} />
            </ProfileSection>
          </Reveal>
          <Reveal index={3}>
            <ProfileSection title={t('driver.workDetails')}>
              <InfoLine first icon="business" label={t('owner.col.company')} value={company?.name} locked />
              <InfoLine icon="star" label={t('common.role')} focusId="job_title" value={t('role.driver')} locked />
              <InfoLine icon="briefcase" label={t('driver.employeeNumber')} focusId="employee_number" value={driver?.employee_number} locked />
              <InfoLine icon="people" label={t('common.department')} focusId="department_id" value={departmentName} locked />
              <InfoLine icon="time" label={t('driver.joinedApp')} value={driver?.created_at ? formatDate(driver.created_at) : null} locked />
            </ProfileSection>
          </Reveal>
          <Reveal index={4}>
            <LanguageSection />
          </Reveal>
          <Reveal index={5}>
            <PrimaryAction label={t('auth.signOutOfAccountAction')} icon="log-out-outline" tone="danger" onPress={signOut} />
          </Reveal>
        </>
      )}
    </DriverPage>
    </FocusTargetProvider>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  alignRight: { textAlign: textStart() },
  identity: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16, padding: 18 },
  avatar: { width: 72, height: 72, borderRadius: 24, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1, gap: 3 },
  licenseRow: { flexDirection: 'row-reverse', marginTop: 6 },
  footerRow: { flexDirection: 'row-reverse', gap: 10 },
  editNote: { padding: 16 },
  footerSave: { flex: 2 },
  footerCancel: { flex: 1 },
});

const ds = StyleSheet.create({
  wrap: { padding: 24, maxWidth: 520, alignSelf: 'center', width: '100%', gap: 6 },
  headRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  heading: { fontSize: 16 },
  editButton: { height: 30, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: DESKTOP_COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: DESKTOP_COLORS.surface },
  editButtonText: { fontSize: 12, color: DESKTOP_COLORS.brand },
  sectionTitle: { fontSize: 12, letterSpacing: 0.4, color: DESKTOP_COLORS.inkMuted, marginTop: 10, marginBottom: 6 },
  card: { backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 8, paddingHorizontal: 16 },
  signOutButton: { alignSelf: 'center', marginTop: 20, height: 32, paddingHorizontal: 16, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontSize: 12.5, color: DESKTOP_COLORS.danger },
});
