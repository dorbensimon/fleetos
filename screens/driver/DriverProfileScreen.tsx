import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BrandLoader } from '../../components/ui/BrandLoader';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState, LoadingState, useToast } from '../../components/ui';
import { DK, DKText, DriverPage, HeroButton, HeroTitle, PrimaryAction, Reveal, StatusChip, Surface, statusOfDate } from '../../components/driverKit';
import { EditField, InfoLine, ProfileSection } from './DriverProfileParts';
import { DateField } from '../../components/ui/DateField';
import { Select } from '../../components/ui/Select';
import { formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { getDriver, listDepartments, updateDriver, type Department, type DriverRow } from '../../lib/adminApi';
import { formatPhone, isValidIsraeliPhone } from '../../lib/phone';
import { isValidIsraeliNationalId } from '../../lib/driverFormValidation';
import { RootStackParamList } from '../../navigation/types';
import {
  departmentNameById,
  EDUCATION_OPTIONS,
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
const LICENSE_CLASS_SELECT = LICENSE_CLASS_OPTIONS.map((option) => ({ value: option.value, label: option.label.split(',')[0].trim() }));

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
  if (!draft.full_name.trim()) errors.full_name = 'שדה חובה';
  if (!draft.phone.trim()) errors.phone = 'שדה חובה';
  else if (!isValidIsraeliPhone(draft.phone)) errors.phone = 'מספר טלפון לא תקין';
  if (draft.home_phone.trim() && !isValidIsraeliPhone(draft.home_phone)) errors.home_phone = 'מספר טלפון לא תקין';
  if (draft.national_id && !isValidIsraeliNationalId(draft.national_id)) errors.national_id = 'תעודת זהות לא תקינה';
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

export default function DriverProfileScreen({ navigation }: Props) {
  const { profile, company, companyId } = useCompany();
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
      setError('פרופיל הנהג אינו זמין');
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
      if (requestId === loadRequest.current) setError(err?.message ?? 'טעינת הפרטים נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [profile, companyId]);

  useFocusEffect(useCallback(() => {
    load();
    return () => { loadRequest.current += 1; };
  }, [load]));

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
      showToast('נשמר בהצלחה');
    } catch (err: any) {
      showAlert('השמירה נכשלה', err?.message ?? 'נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  const signOut = () => showAlert('התנתקות', 'להתנתק מהחשבון?', [
    { text: 'ביטול', style: 'cancel' },
    { text: 'התנתק', style: 'destructive', onPress: () => supabase.auth.signOut() },
  ]);
  const departmentName = departmentNameById(departments, driver?.department_id);
  const maritalOptions = optionsWithCurrent(MARITAL_STATUS_OPTIONS, driver?.marital_status);
  const educationOptions = optionsWithCurrent(EDUCATION_OPTIONS, driver?.education);

  if (isDesktop) {
    return (
      <DesktopShell active="DriverProfile" breadcrumbs={['חשבון', 'הפרטים שלי']}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <View style={ds.wrap}>
            <View style={ds.headRow}>
              <DText weight="bold" style={ds.heading}>{driver?.full_name || '—'}</DText>
              <HoverPressable style={ds.editButton} onPress={toggleEdit} disabled={saving}>
                <DText weight="semiBold" style={[ds.editButtonText, saving && { opacity: 0 }]}>{editMode ? 'שמירה' : 'עריכה'}</DText>
                {saving && <BrandLoader size="small" color={DESKTOP_COLORS.brand} style={StyleSheet.absoluteFill} />}
              </HoverPressable>
            </View>

            <DText weight="bold" style={ds.sectionTitle}>פרטים אישיים</DText>
            <View style={ds.card}>
              <DesktopFieldRow label="אימייל"><DesktopInput value={email ?? ''} editable={false} ltr /></DesktopFieldRow>
              <DesktopFieldRow label="טלפון" error={fieldErrors.phone}>
                {editMode ? (
                  <DesktopInput value={draft.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" ltr hasError={!!fieldErrors.phone} />
                ) : (
                  <DesktopInput value={driver?.phone ? formatPhone(driver.phone) : ''} editable={false} ltr />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label="שם מלא" error={fieldErrors.full_name}>
                {editMode ? (
                  <DesktopInput value={draft.full_name} onChangeText={(v) => set('full_name', v)} hasError={!!fieldErrors.full_name} />
                ) : (
                  <DesktopInput value={driver?.full_name ?? ''} editable={false} />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label="תפקיד"><DesktopInput value="נהג" editable={false} /></DesktopFieldRow>
              <DesktopFieldRow label="תאריך לידה">
                {editMode ? (
                  <DateField value={draft.birth_date} onChange={(v) => set('birth_date', v)} placeholder="לא הוזן" />
                ) : (
                  <DesktopInput value={driver?.birth_date ? formatDate(driver.birth_date) : ''} editable={false} ltr />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label="כתובת">
                <DesktopInput value={editMode ? draft.address : driver?.address ?? ''} onChangeText={(v) => set('address', v)} editable={editMode} />
              </DesktopFieldRow>
              <DesktopFieldRow label="טלפון בבית" error={fieldErrors.home_phone}>
                {editMode ? (
                  <DesktopInput value={draft.home_phone} onChangeText={(v) => set('home_phone', v)} keyboardType="phone-pad" ltr hasError={!!fieldErrors.home_phone} />
                ) : (
                  <DesktopInput value={driver?.home_phone ? formatPhone(driver.home_phone) : ''} editable={false} ltr />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label="מצב משפחתי">
                {editMode ? (
                  <DesktopSelect value={draft.marital_status || null} options={maritalOptions} onChange={(v) => set('marital_status', v ?? '')} allowClear placeholder="לא נבחר" />
                ) : (
                  <DesktopInput value={driver?.marital_status ?? ''} editable={false} />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label="השכלה" last>
                {editMode ? (
                  <DesktopSelect value={draft.education || null} options={educationOptions} onChange={(v) => set('education', v ?? '')} allowClear placeholder="לא נבחרה" />
                ) : (
                  <DesktopInput value={driver?.education ?? ''} editable={false} />
                )}
              </DesktopFieldRow>
            </View>

            <DText weight="bold" style={ds.sectionTitle}>פרטי עבודה</DText>
            <View style={ds.card}>
              <DesktopFieldRow label="חברה"><DesktopInput value={company?.name ?? ''} editable={false} /></DesktopFieldRow>
              <DesktopFieldRow label="מספר עובד"><DesktopInput value={driver?.employee_number ?? ''} editable={false} /></DesktopFieldRow>
              <DesktopFieldRow label="מחלקה" last><DesktopInput value={departmentName ?? ''} editable={false} /></DesktopFieldRow>
            </View>

            <DText weight="bold" style={ds.sectionTitle}>רישיון נהיגה</DText>
            <View style={ds.card}>
              <DesktopFieldRow label="תעודת זהות" error={fieldErrors.national_id}>
                {editMode ? (
                  <DesktopInput value={draft.national_id} onChangeText={(v) => set('national_id', onlyDigits(v, 9))} keyboardType="number-pad" ltr hasError={!!fieldErrors.national_id} />
                ) : (
                  <DesktopInput value={driver?.national_id ?? ''} editable={false} ltr />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label="מספר רישיון">
                <DesktopInput value={editMode ? draft.license_number : driver?.license_number ?? ''} onChangeText={(v) => set('license_number', v)} editable={editMode} ltr />
              </DesktopFieldRow>
              <DesktopFieldRow label="דרגת רישיון">
                {editMode ? (
                  <DesktopSelect value={draft.license_primary || null} options={LICENSE_CLASS_SELECT} onChange={setLicensePrimary} allowClear placeholder="לא נבחרה" />
                ) : (
                  <DesktopInput value={driver?.license_classes ?? ''} editable={false} />
                )}
              </DesktopFieldRow>
              {editMode && !!draft.license_primary && (
                <DesktopFieldRow label="דרגה נוספת">
                  <DesktopSelect
                    value={draft.license_secondary || null}
                    options={LICENSE_CLASS_SELECT.filter((option) => option.value !== draft.license_primary)}
                    onChange={(v) => set('license_secondary', v ?? '')}
                    allowClear
                    placeholder="ללא"
                  />
                </DesktopFieldRow>
              )}
              <DesktopFieldRow label="תאריך הנפקה">
                {editMode ? (
                  <DateField value={draft.license_issue_date} onChange={(v) => set('license_issue_date', v)} placeholder="לא הוזן" />
                ) : (
                  <DesktopInput value={driver?.license_issue_date ? formatDate(driver.license_issue_date) : ''} editable={false} ltr />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label="תוקף רישיון">
                {editMode ? (
                  <DateField value={draft.license_expiry} onChange={(v) => set('license_expiry', v)} placeholder="לא הוזן" />
                ) : (
                  <DesktopInput value={driver?.license_expiry ? formatDate(driver.license_expiry) : ''} editable={false} ltr />
                )}
              </DesktopFieldRow>
              <DesktopFieldRow label="הצטרפות לאפליקציה" last><DesktopInput value={driver?.created_at ? formatDate(driver.created_at) : ''} editable={false} ltr /></DesktopFieldRow>
            </View>

            <HoverPressable style={ds.signOutButton} onPress={signOut}>
              <DText weight="semiBold" style={ds.signOutText}>התנתקות</DText>
            </HoverPressable>
          </View>
        )}
      </DesktopShell>
    );
  }

  const initial = (driver?.full_name || profile?.full_name || '?').trim().charAt(0);
  const cancelEdit = () => {
    setEditMode(false);
    setFieldErrors({});
    setDraft(draftFromDriver(driver));
  };

  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={
        <HeroTitle
          title={editMode ? 'עריכת הפרטים' : 'הפרטים שלי'}
          subtitle={company?.name ? `נהג · ${company.name}` : 'נהג'}
          onBack={() => (editMode ? cancelEdit() : navigation.goBack())}
          right={!loading && !error && !editMode ? <HeroButton icon="create-outline" label="עריכת הפרטים" onPress={toggleEdit} /> : undefined}
        />
      }
      footer={
        editMode ? (
          <View style={styles.footerRow}>
            <PrimaryAction label="ביטול" tone="ghost" onPress={cancelEdit} style={styles.footerCancel} />
            <PrimaryAction label="שמירת השינויים" icon="checkmark" onPress={() => void saveEdit()} loading={saving} style={styles.footerSave} />
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
              עדכן את מה שצריך ולחץ על ״שמירת השינויים״. חברה, מספר עובד ומחלקה מנוהלים על ידי מנהל הצי.
            </DKText>
          </Surface>
          <Reveal index={0}>
            <ProfileSection title="פרטים אישיים">
              <EditField first label="שם מלא" value={draft.full_name} onChangeText={(v) => set('full_name', v)} error={fieldErrors.full_name} />
              <EditField label="טלפון" value={draft.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" ltr error={fieldErrors.phone} />
              <EditField label="תאריך לידה" editor={<DateField value={draft.birth_date} onChange={(v) => set('birth_date', v)} placeholder="לא הוזן" />} />
              <EditField label="כתובת" value={draft.address} onChangeText={(v) => set('address', v)} />
              <EditField label="טלפון בבית" value={draft.home_phone} onChangeText={(v) => set('home_phone', v)} keyboardType="phone-pad" ltr error={fieldErrors.home_phone} />
              <EditField label="מצב משפחתי" editor={<Select value={draft.marital_status || null} options={maritalOptions} onChange={(v) => set('marital_status', v ?? '')} allowClear placeholder="לא נבחר" />} />
              <EditField label="השכלה" editor={<Select value={draft.education || null} options={educationOptions} onChange={(v) => set('education', v ?? '')} allowClear placeholder="לא נבחרה" />} />
            </ProfileSection>
          </Reveal>
          <Reveal index={1}>
            <ProfileSection title="רישיון נהיגה">
              <EditField first label="תעודת זהות" value={draft.national_id} onChangeText={(v) => set('national_id', onlyDigits(v, 9))} keyboardType="number-pad" ltr error={fieldErrors.national_id} hint="9 ספרות" />
              <EditField label="מספר רישיון" value={draft.license_number} onChangeText={(v) => set('license_number', v)} ltr />
              <EditField label="דרגת רישיון" editor={<Select value={draft.license_primary || null} options={LICENSE_CLASS_SELECT} onChange={setLicensePrimary} allowClear placeholder="לא נבחרה" />} />
              {!!draft.license_primary && (
                <EditField
                  label="דרגה נוספת"
                  editor={<Select value={draft.license_secondary || null} options={LICENSE_CLASS_SELECT.filter((option) => option.value !== draft.license_primary)} onChange={(v) => set('license_secondary', v ?? '')} allowClear placeholder="ללא" />}
                />
              )}
              <EditField label="תאריך הנפקה" editor={<DateField value={draft.license_issue_date} onChange={(v) => set('license_issue_date', v)} placeholder="לא הוזן" />} />
              <EditField label="תוקף רישיון" editor={<DateField value={draft.license_expiry} onChange={(v) => set('license_expiry', v)} placeholder="לא הוזן" />} />
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
                  <StatusChip status={statusOfDate(driver?.license_expiry)} label={driver?.license_expiry ? `רישיון עד ${formatDate(driver.license_expiry)}` : 'תוקף רישיון חסר'} />
                </View>
              </View>
            </Surface>
          </Reveal>
          <Reveal index={1}>
            <ProfileSection title="פרטים אישיים">
              <InfoLine first icon="person" label="שם מלא" value={driver?.full_name} />
              <InfoLine icon="call" label="טלפון" value={driver?.phone ? formatPhone(driver.phone) : null} ltr />
              <InfoLine icon="mail" label="אימייל" value={email} ltr locked />
              <InfoLine icon="gift" label="תאריך לידה" value={driver?.birth_date ? formatDate(driver.birth_date) : null} />
              <InfoLine icon="home" label="כתובת" value={driver?.address} />
              <InfoLine icon="call-outline" label="טלפון בבית" value={driver?.home_phone ? formatPhone(driver.home_phone) : null} ltr />
              <InfoLine icon="heart" label="מצב משפחתי" value={driver?.marital_status} />
              <InfoLine icon="school" label="השכלה" value={driver?.education} />
            </ProfileSection>
          </Reveal>
          <Reveal index={2}>
            <ProfileSection title="רישיון נהיגה">
              <InfoLine first icon="card" label="תעודת זהות" value={driver?.national_id} ltr />
              <InfoLine icon="document-text" label="מספר רישיון" value={driver?.license_number} ltr />
              <InfoLine icon="ribbon" label="דרגת רישיון" value={driver?.license_classes} />
              <InfoLine icon="calendar" label="תאריך הנפקה" value={driver?.license_issue_date ? formatDate(driver.license_issue_date) : null} />
              <InfoLine icon="calendar-clear" label="תוקף רישיון" value={driver?.license_expiry ? formatDate(driver.license_expiry) : null} />
            </ProfileSection>
          </Reveal>
          <Reveal index={3}>
            <ProfileSection title="פרטי עבודה">
              <InfoLine first icon="business" label="חברה" value={company?.name} locked />
              <InfoLine icon="star" label="תפקיד" value="נהג" locked />
              <InfoLine icon="briefcase" label="מספר עובד" value={driver?.employee_number} locked />
              <InfoLine icon="people" label="מחלקה" value={departmentName} locked />
              <InfoLine icon="time" label="הצטרפות לאפליקציה" value={driver?.created_at ? formatDate(driver.created_at) : null} locked />
            </ProfileSection>
          </Reveal>
          <Reveal index={4}>
            <PrimaryAction label="התנתקות מהחשבון" icon="log-out-outline" tone="danger" onPress={signOut} />
          </Reveal>
        </>
      )}
    </DriverPage>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  alignRight: { textAlign: 'right' },
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
