import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Pressable,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { supabase, Company } from '../lib/supabase';
import { pickAndUploadLogo } from '../lib/uploadLogo';

const COLORS = {
  screenBg: '#EEEEEE',
  white: '#FFFFFF',
  black: '#000000',
  gray: '#666666',
  grayLight: '#979797',
  border: '#E2E2E2',
  blue: '#0088CC',
  red: '#C0392B',
  activeBg: '#E6F6EF',
  activeText: '#1E8E63',
  disabledBg: '#F0EAEA',
  disabledText: '#B4685F',
  fieldBg: '#FAFAFA',
};

interface CompanyUser {
  id: string;
  role: 'admin' | 'driver';
  full_name: string | null;
  phone: string | null;
  must_change_password: boolean;
  created_at: string;
  email: string | null;
}

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyDetail'>;

export default function CompanyDetailScreen({ route, navigation }: Props) {
  const { companyId } = route.params;

  const [company, setCompany] = useState<Company | null>(null);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [companyType, setCompanyType] = useState<'' | 'בע״מ' | 'עוסק מורשה'>('');
  const [businessId, setBusinessId] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [safetyOfficerName, setSafetyOfficerName] = useState('');
  const [safetyOfficerPhone, setSafetyOfficerPhone] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');

  const handlePickLogo = async () => {
    setLogoError('');
    setUploadingLogo(true);
    try {
      const url = await pickAndUploadLogo();
      if (url) {
        setLogoUrl(url);
      }
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
  const [newAdminForm, setNewAdminForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [newAdminFieldErrors, setNewAdminFieldErrors] = useState<Record<string, string>>({});
  const [showNewAdminPassword, setShowNewAdminPassword] = useState(false);
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [addAdminError, setAddAdminError] = useState('');

  const [addAdminSuccessOpen, setAddAdminSuccessOpen] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<CompanyUser | null>(null);
  const [removing, setRemoving] = useState(false);

  const [resetTarget, setResetTarget] = useState<CompanyUser | null>(null);
  const [resetForm, setResetForm] = useState({ password: '', confirmPassword: '' });
  const [resetFieldErrors, setResetFieldErrors] = useState<Record<string, string>>({});
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccessOpen, setResetSuccessOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: companyData } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single<Company>();

    if (companyData) {
      setCompany(companyData);
      setName(companyData.name);
      setLogoUrl(companyData.logo_url || '');
      setCompanyType(companyData.company_type || '');
      setBusinessId(companyData.business_id || '');
      setAddress(companyData.address || '');
      setPhone(companyData.phone || '');
      setSafetyOfficerName(companyData.safety_officer_name || '');
      setSafetyOfficerPhone(companyData.safety_officer_phone || '');
    }

    const { data: usersData, error } = await supabase.functions.invoke('list-company-users', {
      body: { companyId },
    });

    if (!error && usersData?.success) {
      setUsers(usersData.users);
    }
  }, [companyId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const hasChanges =
    company &&
    (name.trim() !== company.name ||
      logoUrl.trim() !== (company.logo_url || '') ||
      companyType !== (company.company_type || '') ||
      businessId.trim() !== (company.business_id || '') ||
      address.trim() !== (company.address || '') ||
      phone.trim() !== (company.phone || '') ||
      safetyOfficerName.trim() !== (company.safety_officer_name || '') ||
      safetyOfficerPhone.trim() !== (company.safety_officer_phone || ''));

  const saveChanges = async () => {
    if (!company || !name.trim()) return;
    setSaveError('');
    setSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({
        name: name.trim(),
        logo_url: logoUrl.trim() || null,
        company_type: companyType || null,
        business_id: businessId.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        safety_officer_name: safetyOfficerName.trim() || null,
        safety_officer_phone: safetyOfficerPhone.trim() || null,
      })
      .eq('id', company.id);
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
    await supabase.from('companies').update({ status: newStatus }).eq('id', company.id);
    await load();
  };

  const deleteMatches = !!company && deleteConfirmText.trim() === company.name;

  const confirmDeleteCompany = async () => {
    if (!company || !deleteMatches) return;
    setDeleting(true);
    await supabase.from('companies').delete().eq('id', company.id);
    setDeleting(false);
    navigation.goBack();
  };

  const validateNewAdminForm = () => {
    const errors: Record<string, string> = {};
    if (!newAdminForm.firstName.trim()) errors.firstName = 'שדה חובה';
    if (!newAdminForm.lastName.trim()) errors.lastName = 'שדה חובה';
    if (!newAdminForm.email.trim()) errors.email = 'שדה חובה';
    if (!newAdminForm.phone.trim()) errors.phone = 'שדה חובה';
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
      const { data, error } = await supabase.functions.invoke('add-company-admin', {
        body: {
          companyId,
          adminFirstName: newAdminForm.firstName.trim(),
          adminLastName: newAdminForm.lastName.trim(),
          adminEmail: newAdminForm.email.trim(),
          adminPhone: newAdminForm.phone.trim(),
          adminPassword: newAdminForm.password,
        },
      });
      if (error || !data?.success) {
        let message = data?.error || 'הוספת האדמין נכשלה';
        if (error?.context?.json) {
          try {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          } catch {}
        }
        console.log('add-company-admin error:', error, 'message:', message);
        setAddAdminError(message);
        return;
      }
      setNewAdminForm({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' });
      setNewAdminFieldErrors({});
      setAddAdminOpen(false);
      setAddAdminSuccessOpen(true);
      await load();
    } catch (err) {
      console.log('add-company-admin unexpected error:', err);
      setAddAdminError('אירעה שגיאה. נסה שוב');
    } finally {
      setAddingAdmin(false);
    }
  };

  const removeUser = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    await supabase.functions.invoke('delete-company-user', { body: { userId: removeTarget.id } });
    setRemoving(false);
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
      const { data, error } = await supabase.functions.invoke('reset-user-password', {
        body: { userId: resetTarget.id, newPassword: resetForm.password },
      });

      if (error || !data?.success) {
        let message = data?.error || 'איפוס הסיסמה נכשל';
        if (error?.context?.json) {
          try {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          } catch {}
        }
        console.log('reset-user-password error:', error, 'message:', message);
        setResetError(message);
        return;
      }

      setResetForm({ password: '', confirmPassword: '' });
      setResetFieldErrors({});
      setResetTarget(null);
      setResetSuccessOpen(true);
      await load();
    } catch (err) {
      console.log('reset-user-password unexpected error:', err);
      setResetError('אירעה שגיאה. נסה שוב');
    } finally {
      setResetting(false);
    }
  };

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
        {!!company.logo_url && (
          <Image source={{ uri: company.logo_url }} style={styles.headerLogo} resizeMode="cover" />
        )}
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
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>פרטי חברה</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>שם החברה</Text>
            <TextInput style={styles.fieldInput} value={name} onChangeText={setName} textAlign="right" />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>לוגו החברה</Text>
            <TouchableOpacity style={styles.logoPicker} onPress={handlePickLogo} disabled={uploadingLogo}>
              {uploadingLogo ? (
                <ActivityIndicator color={COLORS.blue} />
              ) : logoUrl ? (
                <>
                  <View style={styles.logoPreviewWrap}>
                    <Image source={{ uri: logoUrl }} style={styles.logoPreview} resizeMode="cover" />
                    <View style={styles.logoUploadedBadge}>
                      <Ionicons name="checkmark" size={11} color={COLORS.white} />
                    </View>
                  </View>
                  <Text style={styles.logoPickerChangeText}>שנה תמונה</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={22} color={COLORS.grayLight} />
                  <Text style={styles.logoPickerText}>העלאת לוגו</Text>
                </>
              )}
            </TouchableOpacity>
            {!!logoError && <Text style={styles.errorText}>{logoError}</Text>}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>סוג חברה</Text>
            <View style={styles.companyTypeRow}>
              {(['בע״מ', 'עוסק מורשה'] as const).map((type) => {
                const active = companyType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[styles.companyTypeChip, active && styles.companyTypeChipActive]}
                    onPress={() => setCompanyType(active ? '' : type)}
                  >
                    <Text style={[styles.companyTypeChipText, active && styles.companyTypeChipTextActive]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>ח.פ / ע.מ</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputLtr]}
              value={businessId}
              onChangeText={setBusinessId}
              keyboardType="number-pad"
              textAlign="left"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>כתובת החברה</Text>
            <TextInput style={styles.fieldInput} value={address} onChangeText={setAddress} textAlign="right" />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>טלפון החברה</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputLtr]}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              textAlign="left"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>שם קצין הרכב</Text>
            <TextInput
              style={styles.fieldInput}
              value={safetyOfficerName}
              onChangeText={setSafetyOfficerName}
              textAlign="right"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>נייד קצין הרכב</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputLtr]}
              value={safetyOfficerPhone}
              onChangeText={setSafetyOfficerPhone}
              keyboardType="phone-pad"
              textAlign="left"
            />
          </View>

          {!!saveError && <Text style={styles.errorText}>{saveError}</Text>}

          {hasChanges && (
            <TouchableOpacity
              style={[styles.primaryButton, saving && styles.buttonDisabled]}
              onPress={saveChanges}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryButtonText}>שמור שינויים</Text>}
            </TouchableOpacity>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={toggleActive}>
              <Ionicons name="power-outline" size={17} color={COLORS.black} />
              <Text style={styles.secondaryButtonText}>{active ? 'השבת חברה' : 'הפעל חברה'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dangerButton} onPress={() => setDeleteOpen(true)}>
              <Ionicons name="trash-outline" size={17} color={COLORS.red} />
              <Text style={styles.dangerButtonText}>מחק חברה</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>אדמינים ({admins.length})</Text>
            <TouchableOpacity style={styles.addSmallButton} onPress={() => setAddAdminOpen(true)}>
              <Ionicons name="add" size={16} color={COLORS.blue} />
              <Text style={styles.addSmallButtonText}>הוסף אדמין</Text>
            </TouchableOpacity>
          </View>
          {admins.length === 0 ? (
            <Text style={styles.emptyText}>אין אדמינים עדיין</Text>
          ) : (
            admins.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                onRemove={() => setRemoveTarget(u)}
                onResetPassword={() => setResetTarget(u)}
              />
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>נהגים ({drivers.length})</Text>
          {drivers.length === 0 ? (
            <Text style={styles.emptyText}>אין נהגים עדיין</Text>
          ) : (
            drivers.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                onRemove={() => setRemoveTarget(u)}
                onResetPassword={() => setResetTarget(u)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* מודאל: אישור מחיקת חברה */}
      <CenterModal visible={deleteOpen} onClose={() => { setDeleteOpen(false); setDeleteConfirmText(''); }}>
        <View style={styles.deleteHeaderRow}>
          <View style={styles.deleteIconBox}>
            <Ionicons name="warning-outline" size={20} color={COLORS.red} />
          </View>
          <Text style={styles.deleteTitle}>מחיקת חברה</Text>
        </View>
        <Text style={styles.deleteDescription}>
          מחיקת <Text style={styles.deleteBold}>{company.name}</Text> תסיר את כל האדמינים והנהגים
          המשויכים אליה. הפעולה אינה ניתנת לשחזור.
        </Text>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>להמשך, הקלד את שם החברה:</Text>
          <TextInput
            style={[styles.fieldInput, deleteMatches && styles.fieldInputMatch]}
            placeholder={company.name}
            placeholderTextColor={COLORS.grayLight}
            value={deleteConfirmText}
            onChangeText={setDeleteConfirmText}
            textAlign="right"
          />
        </View>
        <View style={styles.deleteButtonsRow}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => { setDeleteOpen(false); setDeleteConfirmText(''); }}
          >
            <Text style={styles.cancelButtonText}>ביטול</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteButton, !deleteMatches && styles.deleteButtonDisabled]}
            onPress={confirmDeleteCompany}
            disabled={!deleteMatches || deleting}
          >
            {deleting ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={[styles.deleteButtonText, !deleteMatches && styles.deleteButtonTextDisabled]}>
                מחק לצמיתות
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </CenterModal>

      {/* מודאל: הוספת אדמין */}
      <CenterModal
        visible={addAdminOpen}
        onClose={() => {
          setAddAdminOpen(false);
          setNewAdminFieldErrors({});
        }}
      >
        <Text style={styles.deleteTitle}>הוספת אדמין</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>שם פרטי</Text>
          <TextInput
            style={[styles.fieldInput, !!newAdminFieldErrors.firstName && styles.fieldInputError]}
            placeholder="לדוגמה: דוד"
            placeholderTextColor={COLORS.grayLight}
            value={newAdminForm.firstName}
            onChangeText={(v) => setNewAdminForm((f) => ({ ...f, firstName: v }))}
            textAlign="right"
          />
          {!!newAdminFieldErrors.firstName && (
            <Text style={styles.fieldErrorText}>{newAdminFieldErrors.firstName}</Text>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>שם משפחה</Text>
          <TextInput
            style={[styles.fieldInput, !!newAdminFieldErrors.lastName && styles.fieldInputError]}
            placeholder="לדוגמה: כהן"
            placeholderTextColor={COLORS.grayLight}
            value={newAdminForm.lastName}
            onChangeText={(v) => setNewAdminForm((f) => ({ ...f, lastName: v }))}
            textAlign="right"
          />
          {!!newAdminFieldErrors.lastName && (
            <Text style={styles.fieldErrorText}>{newAdminFieldErrors.lastName}</Text>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>מייל האדמין</Text>
          <TextInput
            style={[
              styles.fieldInput,
              styles.fieldInputLtr,
              !!newAdminFieldErrors.email && styles.fieldInputError,
            ]}
            placeholder="admin@company.co.il"
            placeholderTextColor={COLORS.grayLight}
            value={newAdminForm.email}
            onChangeText={(v) => setNewAdminForm((f) => ({ ...f, email: v }))}
            autoCapitalize="none"
            keyboardType="email-address"
            textAlign="left"
          />
          {!!newAdminFieldErrors.email && (
            <Text style={styles.fieldErrorText}>{newAdminFieldErrors.email}</Text>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>טלפון</Text>
          <TextInput
            style={[
              styles.fieldInput,
              styles.fieldInputLtr,
              !!newAdminFieldErrors.phone && styles.fieldInputError,
            ]}
            placeholder="050-0000000"
            placeholderTextColor={COLORS.grayLight}
            value={newAdminForm.phone}
            onChangeText={(v) => setNewAdminForm((f) => ({ ...f, phone: v }))}
            keyboardType="phone-pad"
            textAlign="left"
          />
          {!!newAdminFieldErrors.phone && (
            <Text style={styles.fieldErrorText}>{newAdminFieldErrors.phone}</Text>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>סיסמה לאדמין</Text>
          <View style={[styles.fieldInputWithIcon, !!newAdminFieldErrors.password && styles.fieldInputError]}>
            <TextInput
              style={[styles.fieldInputInner, styles.fieldInputLtr]}
              placeholder="לפחות 6 תווים"
              placeholderTextColor={COLORS.grayLight}
              value={newAdminForm.password}
              onChangeText={(v) => setNewAdminForm((f) => ({ ...f, password: v }))}
              secureTextEntry={!showNewAdminPassword}
              autoCapitalize="none"
              textAlign="left"
            />
            <TouchableOpacity onPress={() => setShowNewAdminPassword(!showNewAdminPassword)}>
              <Ionicons
                name={showNewAdminPassword ? 'eye-outline' : 'eye-off-outline'}
                size={18}
                color={COLORS.grayLight}
              />
            </TouchableOpacity>
          </View>
          {!!newAdminFieldErrors.password && (
            <Text style={styles.fieldErrorText}>{newAdminFieldErrors.password}</Text>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>אימות סיסמה</Text>
          <TextInput
            style={[
              styles.fieldInput,
              styles.fieldInputLtr,
              !!newAdminFieldErrors.confirmPassword && styles.fieldInputError,
            ]}
            placeholder="הזן שוב את הסיסמה"
            placeholderTextColor={COLORS.grayLight}
            value={newAdminForm.confirmPassword}
            onChangeText={(v) => setNewAdminForm((f) => ({ ...f, confirmPassword: v }))}
            secureTextEntry={!showNewAdminPassword}
            autoCapitalize="none"
            textAlign="left"
          />
          {!!newAdminFieldErrors.confirmPassword && (
            <Text style={styles.fieldErrorText}>{newAdminFieldErrors.confirmPassword}</Text>
          )}
        </View>

        {!!addAdminError && <Text style={styles.errorText}>{addAdminError}</Text>}

        <TouchableOpacity
          style={[styles.primaryButton, addingAdmin && styles.buttonDisabled]}
          onPress={addAdmin}
          disabled={addingAdmin}
        >
          {addingAdmin ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryButtonText}>הוסף</Text>}
        </TouchableOpacity>
      </CenterModal>

      {/* מודאל: הצלחה */}
      <CenterModal visible={addAdminSuccessOpen} onClose={() => setAddAdminSuccessOpen(false)}>
        <View style={styles.deleteHeaderRow}>
          <View style={[styles.deleteIconBox, { backgroundColor: COLORS.activeBg }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.activeText} />
          </View>
          <Text style={styles.deleteTitle}>האדמין נוסף בהצלחה</Text>
        </View>
        <Text style={styles.deleteDescription}>
          האדמין יכול להתחבר עכשיו עם המייל והסיסמה שקבעת, ויתבקש לקבוע סיסמה קבועה משלו בכניסה
          הראשונה.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setAddAdminSuccessOpen(false)}>
          <Text style={styles.primaryButtonText}>סגור</Text>
        </TouchableOpacity>
      </CenterModal>

      {/* מודאל: אישור הסרת משתמש */}
      <CenterModal visible={!!removeTarget} onClose={() => setRemoveTarget(null)}>
        <View style={styles.deleteHeaderRow}>
          <View style={styles.deleteIconBox}>
            <Ionicons name="warning-outline" size={20} color={COLORS.red} />
          </View>
          <Text style={styles.deleteTitle}>
            {removeTarget?.role === 'admin' ? 'הסרת אדמין' : 'הסרת נהג'}
          </Text>
        </View>
        <Text style={styles.deleteDescription}>
          הסרת <Text style={styles.deleteBold}>{removeTarget?.email || removeTarget?.full_name}</Text>{' '}
          תמחק את המשתמש לצמיתות, כולל גישתו למערכת.
          {removeTarget?.role === 'admin'
            ? ' כל הנהגים של החברה הזו יימחקו לצמיתות יחד איתו.'
            : ''}{' '}
          הפעולה אינה ניתנת לשחזור.
        </Text>
        <View style={styles.deleteButtonsRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setRemoveTarget(null)}>
            <Text style={styles.cancelButtonText}>ביטול</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={removeUser} disabled={removing}>
            {removing ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.deleteButtonText}>הסר לצמיתות</Text>}
          </TouchableOpacity>
        </View>
      </CenterModal>

      {/* מודאל: איפוס סיסמה */}
      <CenterModal
        visible={!!resetTarget}
        onClose={() => {
          setResetTarget(null);
          setResetForm({ password: '', confirmPassword: '' });
          setResetFieldErrors({});
          setResetError('');
        }}
      >
        <Text style={styles.deleteTitle}>איפוס סיסמה</Text>
        <Text style={styles.deleteDescription}>
          קביעת סיסמה חדשה עבור{' '}
          <Text style={styles.deleteBold}>{resetTarget?.email || resetTarget?.full_name}</Text>. הוא
          יתבקש לקבוע סיסמה קבועה משלו בכניסה הבאה.
        </Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>סיסמה חדשה</Text>
          <View style={[styles.fieldInputWithIcon, !!resetFieldErrors.password && styles.fieldInputError]}>
            <TextInput
              style={[styles.fieldInputInner, styles.fieldInputLtr]}
              placeholder="לפחות 6 תווים"
              placeholderTextColor={COLORS.grayLight}
              value={resetForm.password}
              onChangeText={(v) => setResetForm((f) => ({ ...f, password: v }))}
              secureTextEntry={!showResetPassword}
              autoCapitalize="none"
              textAlign="left"
            />
            <TouchableOpacity onPress={() => setShowResetPassword(!showResetPassword)}>
              <Ionicons
                name={showResetPassword ? 'eye-outline' : 'eye-off-outline'}
                size={18}
                color={COLORS.grayLight}
              />
            </TouchableOpacity>
          </View>
          {!!resetFieldErrors.password && (
            <Text style={styles.fieldErrorText}>{resetFieldErrors.password}</Text>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>אימות סיסמה</Text>
          <TextInput
            style={[
              styles.fieldInput,
              styles.fieldInputLtr,
              !!resetFieldErrors.confirmPassword && styles.fieldInputError,
            ]}
            placeholder="הזן שוב את הסיסמה"
            placeholderTextColor={COLORS.grayLight}
            value={resetForm.confirmPassword}
            onChangeText={(v) => setResetForm((f) => ({ ...f, confirmPassword: v }))}
            secureTextEntry={!showResetPassword}
            autoCapitalize="none"
            textAlign="left"
          />
          {!!resetFieldErrors.confirmPassword && (
            <Text style={styles.fieldErrorText}>{resetFieldErrors.confirmPassword}</Text>
          )}
        </View>

        {!!resetError && <Text style={styles.errorText}>{resetError}</Text>}

        <TouchableOpacity
          style={[styles.primaryButton, resetting && styles.buttonDisabled]}
          onPress={resetPassword}
          disabled={resetting}
        >
          {resetting ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.primaryButtonText}>אפס סיסמה</Text>
          )}
        </TouchableOpacity>
      </CenterModal>

      {/* מודאל: הצלחת איפוס */}
      <CenterModal visible={resetSuccessOpen} onClose={() => setResetSuccessOpen(false)}>
        <View style={styles.deleteHeaderRow}>
          <View style={[styles.deleteIconBox, { backgroundColor: COLORS.activeBg }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.activeText} />
          </View>
          <Text style={styles.deleteTitle}>הסיסמה אופסה בהצלחה</Text>
        </View>
        <Text style={styles.deleteDescription}>
          המשתמש יכול להתחבר עכשיו עם הסיסמה החדשה שקבעת, ויתבקש לקבוע סיסמה קבועה משלו בכניסה
          הבאה.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setResetSuccessOpen(false)}>
          <Text style={styles.primaryButtonText}>סגור</Text>
        </TouchableOpacity>
      </CenterModal>
    </View>
  );
}

function UserRow({
  user,
  onRemove,
  onResetPassword,
}: {
  user: CompanyUser;
  onRemove: () => void;
  onResetPassword: () => void;
}) {
  return (
    <View style={styles.userRow}>
      <TouchableOpacity onPress={onRemove} style={styles.userRemoveButton}>
        <Ionicons name="trash-outline" size={16} color={COLORS.red} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onResetPassword} style={styles.userRemoveButton}>
        <Ionicons name="key-outline" size={16} color={COLORS.blue} />
      </TouchableOpacity>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{user.full_name || 'ללא שם'}</Text>
        <Text style={styles.userEmail}>{user.email || '—'}</Text>
        {!!user.phone && <Text style={styles.userEmail}>{user.phone}</Text>}
      </View>
      {user.must_change_password && (
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>ממתין לקביעת סיסמה</Text>
        </View>
      )}
    </View>
  );
}

function CenterModal({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.centerOverlay} onPress={onClose}>
        <Pressable style={styles.centerModal} onPress={(e) => e.stopPropagation()}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
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
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  sectionTitle: { fontSize: 15.5, fontWeight: '700', color: COLORS.black, textAlign: 'right' },
  sectionHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  fieldGroup: { gap: 7 },
  fieldLabel: { fontSize: 12.5, fontWeight: '600', color: COLORS.gray, textAlign: 'right' },
  fieldInput: {
    height: 46,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.fieldBg,
    fontSize: 15,
    color: COLORS.black,
    paddingHorizontal: 14,
  },
  fieldInputLtr: { textAlign: 'left' },
  fieldInputError: { borderColor: COLORS.red },
  fieldErrorText: { fontSize: 11.5, color: COLORS.red, textAlign: 'right' },
  companyTypeRow: { flexDirection: 'row-reverse', gap: 9 },
  companyTypeChip: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.fieldBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyTypeChipActive: { borderColor: COLORS.blue, backgroundColor: COLORS.blue },
  companyTypeChipText: { fontSize: 13.5, fontWeight: '600', color: COLORS.gray },
  companyTypeChipTextActive: { color: COLORS.white },
  fieldInputWithIcon: {
    height: 46,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.fieldBg,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldInputInner: {
    flex: 1,
    fontSize: 15,
    color: COLORS.black,
  },
  logoPicker: {
    height: 90,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    backgroundColor: COLORS.fieldBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  logoPickerText: { fontSize: 13, color: COLORS.gray },
  logoPreviewWrap: { width: 52, height: 52 },
  logoPreview: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoUploadedBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.activeText,
    borderWidth: 2,
    borderColor: COLORS.fieldBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPickerChangeText: { fontSize: 12, color: COLORS.blue, fontWeight: '600', marginTop: 6 },
  fieldInputMatch: { borderColor: COLORS.activeText },
  errorText: { color: COLORS.red, fontSize: 13, textAlign: 'center' },
  primaryButton: {
    height: 46,
    borderRadius: 11,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: COLORS.white, fontSize: 14.5, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: 9 },
  secondaryButton: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryButtonText: { fontSize: 13.5, fontWeight: '600', color: COLORS.black },
  dangerButton: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#EDD9D6',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dangerButtonText: { fontSize: 13.5, fontWeight: '600', color: COLORS.red },
  addSmallButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  addSmallButtonText: { fontSize: 13, fontWeight: '600', color: COLORS.blue },
  emptyText: { fontSize: 13, color: COLORS.grayLight, textAlign: 'center', paddingVertical: 8 },
  userRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontSize: 14, fontWeight: '600', color: COLORS.black, textAlign: 'right' },
  userEmail: { fontSize: 12.5, color: COLORS.gray, textAlign: 'right' },
  userRemoveButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  pendingBadge: { backgroundColor: COLORS.disabledBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  pendingBadgeText: { fontSize: 10.5, fontWeight: '600', color: COLORS.disabledText },
  badge: { paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 6 },
  badgeActive: { backgroundColor: COLORS.activeBg },
  badgeDisabled: { backgroundColor: COLORS.disabledBg },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextActive: { color: COLORS.activeText },
  badgeTextDisabled: { color: COLORS.disabledText },
  centerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerModal: { backgroundColor: COLORS.white, borderRadius: 18, padding: 22, width: '100%', gap: 14 },
  deleteHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11 },
  deleteIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.disabledBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteTitle: { fontSize: 17, fontWeight: '700', color: COLORS.black, textAlign: 'right' },
  deleteDescription: { fontSize: 13.5, color: COLORS.gray, lineHeight: 21, textAlign: 'right' },
  deleteBold: { color: COLORS.black, fontWeight: '600' },
  deleteButtonsRow: { flexDirection: 'row', gap: 9 },
  cancelButton: {
    flex: 1,
    height: 46,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: { color: COLORS.black, fontSize: 14.5, fontWeight: '600' },
  deleteButton: {
    flex: 1.3,
    height: 46,
    borderRadius: 11,
    backgroundColor: COLORS.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonDisabled: { backgroundColor: '#EDD9D6' },
  deleteButtonText: { color: COLORS.white, fontSize: 14.5, fontWeight: '600' },
  deleteButtonTextDisabled: { color: '#C39B95' },
});
