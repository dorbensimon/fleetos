import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCompany } from '../../lib/CompanyContext';
import type { Company } from '../../lib/supabase';
import { updateCompanySettings } from '../../lib/companyApi';
import { uploadCompanyLogoImage } from '../../lib/uploadLogo';
import { isValidEmail } from '../../lib/validation';
import { isValidIsraeliPhone } from '../../lib/phone';
import { showAlert } from '../../lib/platformAlert';
import { functionErrorMessage } from '../../lib/functionError';
import { RootStackParamList } from '../../navigation/types';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import {
  CompanySettingsDesktopView,
  CompanySettingsForm,
  CompanyContactForm,
  SafetyOfficerForm,
} from '../../components/desktop/CompanySettingsDesktopView';
import { DText } from '../../components/desktop/primitives';
import { DESKTOP_COLORS } from '../../components/desktop/desktopTheme';

/**
 * Company-wide settings, desktop only (reached from the sidebar).
 * Saved in one go through the update-company-settings Edge Function, since
 * admins can't write `companies` directly. New logo/stamp images are uploaded
 * to the company's storage folder first, then saved as URLs.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'CompanySettings'>;

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

function formFromCompany(company: Company | null): CompanySettingsForm {
  return {
    name: company?.name ?? '',
    businessId: company?.business_id ?? '',
    companyType: company?.company_type ?? null,
    address: company?.address ?? '',
    carrierLicenseExpiry: company?.carrier_license_expiry ?? null,
    landline: digits(company?.phone),
    mobile: digits(company?.mobile_phone),
    fax: digits(company?.fax),
    email: company?.email ?? '',
    filesEmail: company?.files_email ?? '',
    filesEmail2: company?.files_email_2 ?? '',
    reportEmail: company?.odometer_report_email ?? '',
    reportAuto: company?.odometer_report_enabled ?? false,
    contacts: [0, 1].map((i) => {
      const c = company?.contacts?.[i];
      return { name: c?.name ?? '', role: c?.role ?? '', phone: digits(c?.phone), email: c?.email ?? '' };
    }),
    officers: [
      { name: company?.safety_officer_name ?? '', phone: digits(company?.safety_officer_phone) },
      { name: company?.safety_officer_2_name ?? '', phone: digits(company?.safety_officer_2_phone) },
    ],
    logoUri: company?.logo_url ?? null,
    stampUri: company?.stamp_url ?? null,
  };
}

function validate(form: CompanySettingsForm): Record<string, string> {
  const e: Record<string, string> = {};
  const phone = (key: string, v: string) => {
    if (v && !isValidIsraeliPhone(v)) e[key] = 'מספר טלפון לא תקין';
  };
  const email = (key: string, v: string) => {
    if (v && !isValidEmail(v)) e[key] = 'כתובת מייל לא תקינה';
  };

  if (!form.name.trim()) e.name = 'שדה חובה';
  if (!form.businessId.trim()) e.businessId = 'שדה חובה';
  else if (form.businessId.length !== 9) e.businessId = 'ח.פ / ע.מ צריך להכיל 9 ספרות';

  phone('landline', form.landline);
  phone('mobile', form.mobile);
  phone('fax', form.fax);
  email('email', form.email);
  email('filesEmail', form.filesEmail);
  email('filesEmail2', form.filesEmail2);

  if (form.reportAuto && !form.reportEmail) e.reportEmail = 'כדי להפעיל שליחה צריך מייל';
  else email('reportEmail', form.reportEmail);

  form.contacts.forEach((c, i) => {
    phone(`contact${i}Phone`, c.phone);
    email(`contact${i}Email`, c.email);
  });
  form.officers.forEach((o, i) => phone(`officer${i}Phone`, o.phone));
  return e;
}

export default function CompanySettingsScreen(_props: Props) {
  const { company, refresh } = useCompany();
  const isDesktop = useIsDesktop();

  // Keyed on the company id only: the post-save refresh() must not reset a
  // form the admin may already be editing again. After a save the baseline
  // is taken from the server's reply instead.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => formFromCompany(company), [company?.id]);
  // Picked-but-not-yet-uploaded images: local uri -> mime type.
  const pendingImages = useRef(new Map<string, string>());
  const [baseline, setBaseline] = useState<CompanySettingsForm>(initial);
  const [form, setForm] = useState<CompanySettingsForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedNonce, setSavedNonce] = useState(0);

  // The company may load after mount (or the admin may switch company).
  useEffect(() => {
    setBaseline(initial);
    setForm(initial);
    setErrors({});
  }, [initial]);

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  // Fields already flagged are re-checked as you type, so their error clears the moment it's fixed.
  const update = (next: CompanySettingsForm) => {
    setForm(next);
    if (Object.keys(errors).length === 0) return;
    const fresh = validate(next);
    setErrors((prev) => {
      const kept: Record<string, string> = {};
      for (const key of Object.keys(prev)) if (fresh[key]) kept[key] = fresh[key];
      return kept;
    });
  };

  const onFieldBlur = (key: string) => {
    const message = validate(form)[key];
    setErrors((prev) => {
      if (prev[key] === message) return prev;
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  };

  const onChange = <K extends keyof CompanySettingsForm>(field: K, value: CompanySettingsForm[K]) =>
    update({ ...form, [field]: value });

  const onChangeContact = (index: number, field: keyof CompanyContactForm, value: string) =>
    update({ ...form, contacts: form.contacts.map((c, i) => (i === index ? { ...c, [field]: value } : c)) });

  const onChangeOfficer = (index: number, field: keyof SafetyOfficerForm, value: string) =>
    update({ ...form, officers: form.officers.map((o, i) => (i === index ? { ...o, [field]: value } : o)) });

  const onPickImage = async (kind: 'logo' | 'stamp') => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    pendingImages.current.set(asset.uri, asset.mimeType || 'image/jpeg');
    update({ ...form, [kind === 'logo' ? 'logoUri' : 'stampUri']: asset.uri });
  };

  const onClearImage = (kind: 'logo' | 'stamp') =>
    update({ ...form, [kind === 'logo' ? 'logoUri' : 'stampUri']: null });

  const onSave = async () => {
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length > 0 || !company) return;

    setSaving(true);
    try {
      const upload = async (kind: 'logo' | 'stamp', uri: string | null) => {
        const mime = uri ? pendingImages.current.get(uri) : undefined;
        return uri && mime ? uploadCompanyLogoImage(uri, mime, company.id, kind) : uri;
      };
      const [logoUrl, stampUrl] = await Promise.all([upload('logo', form.logoUri), upload('stamp', form.stampUri)]);

      const { data, error } = await updateCompanySettings(company.id, { ...form, logoUrl, stampUrl });
      if (error || !data?.company) throw new Error(await functionErrorMessage(error, data, 'שמירת הגדרות החברה נכשלה', false));

      pendingImages.current.clear();
      const saved = formFromCompany(data.company);
      setBaseline(saved);
      setForm(saved);
      setSavedNonce((n) => n + 1);
      void refresh();
    } catch (err) {
      showAlert('שמירה נכשלה', err instanceof Error && err.message ? err.message : 'שמירת הגדרות החברה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  if (!isDesktop) {
    return (
      <View style={styles.mobileOnly}>
        <DText weight="semiBold" style={styles.mobileOnlyText}>הגדרות החברה זמינות במחשב בלבד</DText>
      </View>
    );
  }

  return (
    <DesktopShell active="CompanySettings" breadcrumbs={['חשבון', 'הגדרות החברה']}>
      <CompanySettingsDesktopView
        form={form}
        errors={errors}
        joinedAt={company?.created_at ?? null}
        dirty={dirty}
        saving={saving}
        savedNonce={savedNonce}
        onChange={onChange}
        onChangeContact={onChangeContact}
        onChangeOfficer={onChangeOfficer}
        onFieldBlur={onFieldBlur}
        onPickImage={(kind) => void onPickImage(kind)}
        onClearImage={onClearImage}
        onSave={() => void onSave()}
        onDiscard={() => {
          setForm(baseline);
          setErrors({});
        }}
      />
    </DesktopShell>
  );
}

const styles = StyleSheet.create({
  mobileOnly: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: DESKTOP_COLORS.canvas },
  mobileOnlyText: { fontSize: 15, textAlign: 'center' },
});
