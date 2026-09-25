import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { showAlert } from '../../lib/platformAlert';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LoadingState, useToast } from '../../components/ui';
import { DK, DKText, DriverPage, EditField, HeroTitle, InfoLine, KitInput, KitSection, LoadingPanel, PrimaryAction, Pressy, Reveal, STATUS } from '../../components/driverKit';
import { DateField } from '../../components/ui/DateField';
import { Select } from '../../components/ui/Select';
import { useCompany } from '../../lib/CompanyContext';
import { supabase } from '../../lib/supabase';
import { getDriver, updateDriver, createDriverAccount, listDepartments, getUserEmail, type Department } from '../../lib/adminApi';
import { formatPhone } from '../../lib/phone';
import { RootStackParamList } from '../../navigation/types';
import { departmentOptions, driverEditableFieldsFromRow, isStaleDepartmentError, LICENSE_CLASS_OPTIONS } from '../../lib/driverFields';
import { countFilledRequiredDriverFields, getRequiredDriverFields, validateDriverForm } from '../../lib/driverFormValidation';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DesktopShell } from '../../components/desktop/DesktopShell';
import { DriverFormDesktopView, type FormState } from '../../components/desktop/DriverFormDesktopView';
import { ConsentCheck } from '../../components/legal/ConsentCheck';
import { DRIVER_DATA_NOTICE } from '../../lib/legal/documents';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverForm'>;

const NEW_DRIVER_LICENSE_OPTIONS = [
  { value: 'B', label: 'B', description: 'רכב פרטי' },
  { value: 'C1', label: 'C1', description: 'משא עד 12 טון' },
  { value: 'C', label: 'C', description: 'משא כבד' },
  { value: 'D', label: 'D', description: 'אוטובוס' },
  { value: 'E', label: 'E', description: 'נגרר' },
  { value: 'A', label: 'A', description: 'דו-גלגלי' },
  { value: '1', label: '1', description: 'טרקטור' },
] as const;

const EMPTY: FormState = {
  full_name: '',
  phone: '',
  email: '',
  password: '',
  national_id: '',
  employee_number: '',
  license_classes: '',
  license_classes_2: '',
  license_expiry: '',
  department_id: null,
  dataNotice: false,
  showPassword: false,
};

export default function DriverFormScreen({ route, navigation }: Props) {
  const driverId = route.params?.driverId;
  const isEdit = !!driverId;
  const { companyId, profile } = useCompany();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);


  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const load = useCallback(async () => {
    if (companyId) {
      const deps = await listDepartments(companyId);
      setDepartments(departmentOptions(deps as Department[]));
    }
    if (driverId) {
      const emailPromise = profile?.id === driverId
        ? supabase.auth.getUser().then(({ data }) => data.user?.email ?? null)
        : companyId
          ? getUserEmail(driverId, companyId)
          : Promise.resolve(null);
      const [d, email] = await Promise.all([
        getDriver(driverId),
        emailPromise,
      ]);
      if (d) {
        const editable = driverEditableFieldsFromRow(d);
        setForm({
          full_name: d.full_name ?? '',
          phone: editable.phone,
          email: email ?? '',
          password: '',
          national_id: editable.national_id,
          employee_number: editable.employee_number,
          license_classes: editable.license_classes,
          license_classes_2: editable.license_classes_2,
          license_expiry: editable.license_expiry,
          department_id: editable.department_id,
                  dataNotice: false,
          showPassword: false,
        });
      }
    }
  }, [driverId, companyId, profile]);

  // Unlike `load`, this never touches `form` — safe to call after a failed
  // save without wiping the user's unsaved edits.
  const refreshDepartments = useCallback(async () => {
    if (!companyId) return;
    const deps = await listDepartments(companyId);
    setDepartments(departmentOptions(deps as Department[]));
  }, [companyId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const save = async () => {
    const e = validateDriverForm(form, isEdit);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      showAlert('לא ניתן לשמור', 'יש לתקן את השדות המסומנים באדום ולנסות שוב.');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await updateDriver(driverId!, {
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          national_id: form.national_id.trim(),
          employee_number: form.employee_number.trim(),
          license_classes: [form.license_classes, form.license_classes_2].filter(Boolean).join(', '),
          license_expiry: form.license_expiry.trim(),
          department_id: form.department_id,
        });
      } else {
        let activeCompanyId = companyId;
        if (!activeCompanyId) {
          const { data: auth } = await supabase.auth.getUser();
          if (auth.user) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('company_id')
              .eq('id', auth.user.id)
              .single();
            activeCompanyId = prof?.company_id ?? null;
          }
        }
        if (!activeCompanyId) {
          showAlert('שמירה נכשלה', 'לא נמצאה חברה משויכת לחשבון שלך. נסה להתחבר מחדש');
          return;
        }
        const result = await createDriverAccount({
          companyId: activeCompanyId,
          email: form.email.trim(),
          password: form.password,
          fullName: form.full_name.trim(),
          phone: form.phone.trim(),
          details: {
            national_id: form.national_id.trim(),
            employee_number: form.employee_number.trim(),
            license_classes: [form.license_classes, form.license_classes_2].filter(Boolean).join(', '),
            license_expiry: form.license_expiry.trim(),
            department_id: form.department_id,
          },
        });
        if (!result.ok) {
          if (isStaleDepartmentError(result.error)) {
            setForm((current) => ({ ...current, department_id: null }));
            void refreshDepartments().catch(() => {});
            showAlert('שמירה נכשלה', 'המחלקה שנבחרה נמחקה בינתיים. בחר מחלקה אחרת ונסה שוב.');
            return;
          }
          showAlert('יצירת הנהג נכשלה', result.error);
          return;
        }
      }
      showToast(isEdit ? 'השינויים נשמרו' : 'הנהג נוצר בהצלחה');
      if (!isEdit) navigation.goBack();
    } catch (err: any) {
      const message = String(err?.message ?? '');
      if (isStaleDepartmentError(message)) {
        setForm((current) => ({ ...current, department_id: null }));
        void refreshDepartments().catch(() => {});
        showAlert('שמירה נכשלה', 'המחלקה שנבחרה נמחקה בינתיים. בחר מחלקה אחרת ונסה שוב.');
        return;
      }
      showAlert('שמירה נכשלה', message || 'נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    if (isDesktop) {
      return (
        <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'נהגים', driverId ? 'עריכת נהג' : 'נהג חדש']}>
          <LoadingState />
        </DesktopShell>
      );
    }
    return (
      <DriverPage insetTop={insets.top} insetBottom={insets.bottom} hero={<HeroTitle title={isEdit ? 'עריכת נהג' : 'נהג חדש'} onBack={() => navigation.goBack()} />}>
        <LoadingPanel />
      </DriverPage>
    );
  }

  const requiredFields = getRequiredDriverFields(isEdit);
  const filledCount = countFilledRequiredDriverFields(form, isEdit);
  const progress = filledCount / requiredFields.length;
  const remainingCount = requiredFields.length - filledCount;

  const fieldsDone = filledCount === requiredFields.length;
  const canSubmit = fieldsDone && (isEdit || form.dataNotice);
  const liveErrors = validateDriverForm(form, isEdit);
  const screenTitle = isEdit ? 'עריכת נהג' : 'נהג חדש';
  const isDriverSelfEdit = isEdit && profile?.role === 'driver';
  const displayTitle = isDriverSelfEdit ? 'הפרטים שלי' : screenTitle;
  const ctaLabel = isEdit ? 'שמור שינויים' : 'צור נהג';
  const selectedLicense =
    NEW_DRIVER_LICENSE_OPTIONS.find((option) => option.value === form.license_classes) ??
    LICENSE_CLASS_OPTIONS.map((option) => {
      const [label, description = ''] = option.label.split(' — ');
      return { value: option.value, label, description };
    }).find((option) => option.value === form.license_classes);
  const licenseOptions = isEdit
    ? LICENSE_CLASS_OPTIONS.map((option) => {
        const [label, description = ''] = option.label.split(' — ');
        return { value: option.value, label, description };
      })
    : [...NEW_DRIVER_LICENSE_OPTIONS];

  const remainingText = canSubmit
    ? (isEdit ? 'השינויים יישמרו בפרטי הנהג' : 'הנהג יתווסף לצי ויקבל הרשאות מיד')
    : fieldsDone
      ? 'נותר לאשר שהנהג יודע על שמירת הפרטים'
      : remainingCount === 1
      ? 'נותר שדה חובה אחד'
      : `נותרו ${remainingCount} שדות חובה`;

  if (isDesktop) {
    return (
      <DesktopShell active="AdminHome" breadcrumbs={['ניהול', 'נהגים', displayTitle]}>
        <DriverFormDesktopView
          isEdit={isEdit}
          form={form}
          set={set}
          errors={errors}
          liveErrors={liveErrors}
          departments={departments}
          licenseOptions={licenseOptions as { value: string; label: string; description: string }[]}
          selectedLicenseLabel={selectedLicense?.label ?? null}
          canSubmit={canSubmit}
          saving={saving}
          ctaLabel={ctaLabel}
          remainingText={remainingText}
          onSave={() => void save()}
        />
      </DesktopShell>
    );
  }

  const licenseSelectOptions = licenseOptions.map((option) => ({ value: option.value, label: `${option.label}${option.description ? ` — ${option.description}` : ''}` }));
  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={
        <View>
          <HeroTitle title={displayTitle} subtitle={form.full_name.trim() || (isEdit ? 'עדכון פרטי הנהג' : 'שלושה צעדים והנהג בצי')} onBack={() => navigation.goBack()} />
          <View style={styles.progress} accessible accessibilityLabel={`${filledCount} מתוך ${requiredFields.length} שדות חובה מולאו`}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(4, progress * 100)}%` }]} />
            </View>
            <DKText variant="micro" color={DK.onNightMuted} ltr>
              {`${filledCount}/${requiredFields.length}`}
            </DKText>
          </View>
        </View>
      }
      footer={
        <View style={styles.footer}>
          <PrimaryAction label={canSubmit ? ctaLabel : fieldsDone ? 'נותר לסמן את האישור' : 'השלמת שדות החובה'} icon={isEdit ? 'checkmark' : 'person-add'} onPress={() => void save()} loading={saving} disabled={!canSubmit} />
          <DKText variant="caption" color={canSubmit ? STATUS.ok.fg : DK.muted} style={styles.center}>
            {remainingText}
          </DKText>
        </View>
      }
    >
      <Reveal index={0}>
        <KitSection>
          <EditField first label="שם מלא" required value={form.full_name} onChangeText={(v) => set('full_name', v)} error={errors.full_name} placeholder="לדוגמה: דני לוי" />
          <EditField label="טלפון" required value={formatPhone(form.phone)} onChangeText={(v) => set('phone', v.replace(/\D/g, ''))} error={errors.phone} placeholder="052-7898655" keyboardType="phone-pad" ltr />
          <EditField label="תעודת זהות" required value={form.national_id} onChangeText={(v) => set('national_id', v.replace(/\D/g, '').slice(0, 9))} error={errors.national_id} placeholder="9 ספרות" keyboardType="number-pad" maxLength={9} ltr />
          <EditField label="מספר עובד" value={form.employee_number} onChangeText={(v) => set('employee_number', v)} placeholder="לא חובה" ltr />
          <EditField
            label="מחלקה"
            editor={<Select value={form.department_id} onChange={(v) => set('department_id', v)} options={departments} placeholder={departments.length ? 'בחירת מחלקה' : 'לא הוגדרו מחלקות'} allowClear />}
          />
        </KitSection>
      </Reveal>

      <Reveal index={1}>
        <KitSection title="רישיון נהיגה">
          <EditField
            first
            label="דרגת רישיון"
            required
            error={errors.license_classes}
            editor={
              <Select
                value={form.license_classes || null}
                onChange={(value) => {
                  set('license_classes', value ?? '');
                  if (!value || value === form.license_classes_2) set('license_classes_2', '');
                }}
                options={licenseSelectOptions}
                placeholder="בחירת דרגה"
                hasError={!!errors.license_classes}
              />
            }
          />
          {!!form.license_classes && (
            <EditField
              label="דרגה נוספת"
              editor={
                <Select
                  value={form.license_classes_2 || null}
                  onChange={(value) => set('license_classes_2', value ?? '')}
                  options={licenseSelectOptions.filter((option) => option.value !== form.license_classes)}
                  placeholder="אם יש"
                  allowClear
                />
              }
            />
          )}
          <EditField
            label="תוקף רישיון"
            required
            error={errors.license_expiry}
            hint={form.license_expiry ? 'תקבל התראה לפני שהתוקף פג.' : undefined}
            editor={<DateField value={form.license_expiry || null} onChange={(v) => set('license_expiry', v ?? '')} placeholder="בחירת תאריך" hasError={!!errors.license_expiry} />}
          />
        </KitSection>
      </Reveal>

      <Reveal index={2}>
        <KitSection title="גישה לאפליקציה">
          {isEdit ? (
            <InfoLine first icon="mail" label="מייל להתחברות" value={form.email || null} ltr locked />
          ) : (
            <>
              <EditField first label="מייל" required value={form.email} onChangeText={(v) => set('email', v)} error={errors.email} placeholder="name@company.com" keyboardType="email-address" ltr autoComplete="off" />
              <EditField
                label="סיסמה זמנית"
                required
                error={errors.password}
                hint="לפחות 4 ספרות. בכניסה הראשונה הנהג יקבע סיסמה משלו."
                editor={
                  <View style={styles.password}>
                    <KitInput
                      value={form.password}
                      onChangeText={(v) => set('password', v)}
                      secureTextEntry={!form.showPassword}
                      placeholder="••••"
                      keyboardType="number-pad"
                      ltr
                      hasError={!!errors.password}
                      accessibilityLabel="סיסמה זמנית"
                      style={styles.flex}
                    />
                    <Pressy onPress={() => set('showPassword', !form.showPassword)} accessibilityLabel={form.showPassword ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'} style={styles.eye} pressScale={0.92}>
                      <Ionicons name={form.showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={DK.accent} />
                    </Pressy>
                  </View>
                }
              />
              <View style={styles.noticeRule} />
              <ConsentCheck value={form.dataNotice} onChange={(v) => set('dataNotice', v)} label={DRIVER_DATA_NOTICE} />
              <DKText variant="caption" color={DK.accent} accessibilityRole="link" onPress={() => navigation.navigate('Legal', { doc: 'privacy' })} style={styles.noticeLink}>
                מדיניות הפרטיות
              </DKText>
            </>
          )}
        </KitSection>
      </Reveal>
      {isEdit && (
        <DKText variant="caption" color={DK.muted} style={styles.center}>
          המייל משמש להתחברות. לשינוי — מתוך תיק הנהג.
        </DKText>
      )}
    </DriverPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  progress: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginTop: 16 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden', flexDirection: 'row-reverse' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: DK.mint },
  footer: { gap: 6 },
  noticeRule: { height: StyleSheet.hairlineWidth, backgroundColor: DK.hairline, marginHorizontal: 16 },
  noticeLink: { paddingHorizontal: 16, paddingBottom: 14, marginTop: -6, textDecorationLine: 'underline' },
  password: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  eye: { width: 52, height: 52, borderRadius: 16, backgroundColor: DK.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
