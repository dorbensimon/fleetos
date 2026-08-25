import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, styles as sheetStyles } from './OwnerModals';
import { COLORS } from './ownerTheme';
import { formatPhone } from '../../lib/phone';

export type OwnerCompanyForm = {
  name: string;
  logoUrl: string;
  companyType: '' | 'בע״מ' | 'עוסק מורשה';
  businessId: string;
  adminFirstName: string;
  adminLastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

export const EMPTY_OWNER_COMPANY_FORM: OwnerCompanyForm = {
  name: '',
  logoUrl: '',
  companyType: '',
  businessId: '',
  adminFirstName: '',
  adminLastName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
};

/** The full "add company + its first admin" form, opened as a bottom sheet. */
export function AddCompanySheet({
  visible,
  form,
  fieldErrors,
  showPassword,
  uploadingLogo,
  logoError,
  createError,
  creating,
  onClose,
  onChangeForm,
  onPickLogo,
  onToggleShowPassword,
  onSubmit,
}: {
  visible: boolean;
  form: OwnerCompanyForm;
  fieldErrors: Record<string, string>;
  showPassword: boolean;
  uploadingLogo: boolean;
  logoError: string;
  createError: string;
  creating: boolean;
  onClose: () => void;
  onChangeForm: (updater: (f: OwnerCompanyForm) => OwnerCompanyForm) => void;
  onPickLogo: () => void;
  onToggleShowPassword: () => void;
  onSubmit: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={sheetStyles.sheetHeaderRow}>
        <Text style={sheetStyles.sheetTitle}>הוספת חברה חדשה</Text>
        <TouchableOpacity style={sheetStyles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={16} color={COLORS.gray} />
        </TouchableOpacity>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>שם החברה</Text>
        <TextInput
          style={[styles.fieldInput, !!fieldErrors.name && styles.fieldInputError]}
          placeholder="לדוגמה: אלמוג הובלות"
          placeholderTextColor={COLORS.grayLight}
          value={form.name}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, name: v }))}
          textAlign="right"
        />
        {!!fieldErrors.name && <Text style={styles.fieldErrorText}>{fieldErrors.name}</Text>}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>לוגו החברה (אופציונלי)</Text>
        <TouchableOpacity style={styles.logoPicker} onPress={onPickLogo} disabled={uploadingLogo}>
          {uploadingLogo ? (
            <ActivityIndicator color={COLORS.blue} />
          ) : form.logoUrl ? (
            <>
              <View style={styles.logoPreviewWrap}>
                <Image source={{ uri: form.logoUrl }} style={styles.logoPreview} resizeMode="cover" />
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
              <Text style={styles.logoPickerHint}>PNG או JPG</Text>
            </>
          )}
        </TouchableOpacity>
        {!!logoError && <Text style={styles.errorText}>{logoError}</Text>}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>סוג חברה (אופציונלי)</Text>
        <View style={styles.companyTypeRow}>
          {(['בע״מ', 'עוסק מורשה'] as const).map((type) => {
            const active = form.companyType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[styles.companyTypeChip, active && styles.companyTypeChipActive]}
                onPress={() => onChangeForm((f) => ({ ...f, companyType: active ? '' : type }))}
              >
                <Text style={[styles.companyTypeChipText, active && styles.companyTypeChipTextActive]}>{type}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>ח.פ / ע.מ (אופציונלי)</Text>
        <TextInput
          style={[styles.fieldInput, styles.fieldInputLtr]}
          placeholder="512345678"
          placeholderTextColor={COLORS.grayLight}
          value={form.businessId}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, businessId: v }))}
          keyboardType="number-pad"
          textAlign="left"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>שם פרטי של האדמין</Text>
        <TextInput
          style={[styles.fieldInput, !!fieldErrors.adminFirstName && styles.fieldInputError]}
          placeholder="לדוגמה: דוד"
          placeholderTextColor={COLORS.grayLight}
          value={form.adminFirstName}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, adminFirstName: v }))}
          textAlign="right"
        />
        {!!fieldErrors.adminFirstName && <Text style={styles.fieldErrorText}>{fieldErrors.adminFirstName}</Text>}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>שם משפחה של האדמין</Text>
        <TextInput
          style={[styles.fieldInput, !!fieldErrors.adminLastName && styles.fieldInputError]}
          placeholder="לדוגמה: כהן"
          placeholderTextColor={COLORS.grayLight}
          value={form.adminLastName}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, adminLastName: v }))}
          textAlign="right"
        />
        {!!fieldErrors.adminLastName && <Text style={styles.fieldErrorText}>{fieldErrors.adminLastName}</Text>}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>מייל אדמין</Text>
        <TextInput
          style={[styles.fieldInput, styles.fieldInputLtr, !!fieldErrors.email && styles.fieldInputError]}
          placeholder="admin@company.co.il"
          placeholderTextColor={COLORS.grayLight}
          value={form.email}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, email: v }))}
          autoCapitalize="none"
          keyboardType="email-address"
          textAlign="left"
        />
        {!!fieldErrors.email && <Text style={styles.fieldErrorText}>{fieldErrors.email}</Text>}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>טלפון</Text>
        <TextInput
          style={[styles.fieldInput, styles.fieldInputLtr, !!fieldErrors.phone && styles.fieldInputError]}
          placeholder="050-0000000"
          placeholderTextColor={COLORS.grayLight}
          value={formatPhone(form.phone)}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, phone: v.replace(/\D/g, '') }))}
          keyboardType="phone-pad"
          textAlign="left"
        />
        {!!fieldErrors.phone && <Text style={styles.fieldErrorText}>{fieldErrors.phone}</Text>}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>סיסמה לאדמין</Text>
        <View style={[styles.fieldInputWithIcon, !!fieldErrors.password && styles.fieldInputError]}>
          <TextInput
            style={[styles.fieldInputInner, styles.fieldInputLtr]}
            placeholder="לפחות 6 תווים"
            placeholderTextColor={COLORS.grayLight}
            value={form.password}
            onChangeText={(v) => onChangeForm((f) => ({ ...f, password: v }))}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            textAlign="left"
          />
          <TouchableOpacity onPress={onToggleShowPassword}>
            <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color={COLORS.grayLight} />
          </TouchableOpacity>
        </View>
        {!!fieldErrors.password && <Text style={styles.fieldErrorText}>{fieldErrors.password}</Text>}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>אימות סיסמה</Text>
        <TextInput
          style={[styles.fieldInput, styles.fieldInputLtr, !!fieldErrors.confirmPassword && styles.fieldInputError]}
          placeholder="הזן שוב את הסיסמה"
          placeholderTextColor={COLORS.grayLight}
          value={form.confirmPassword}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, confirmPassword: v }))}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          textAlign="left"
        />
        {!!fieldErrors.confirmPassword && <Text style={styles.fieldErrorText}>{fieldErrors.confirmPassword}</Text>}
      </View>

      {!!createError && <Text style={styles.errorText}>{createError}</Text>}

      <TouchableOpacity
        style={[styles.createButton, creating && styles.createButtonDisabled]}
        onPress={onSubmit}
        disabled={creating}
        activeOpacity={0.85}
      >
        {creating ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.createButtonText}>צור חברה</Text>}
      </TouchableOpacity>
      <Text style={styles.hintText}>
        האדמין יוכל להתחבר עם המייל והסיסמה שקבעת, ויתבקש לקבוע סיסמה קבועה משלו בכניסה הראשונה
      </Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fieldGroup: { gap: 7 },
  fieldLabel: { fontSize: 12.5, fontWeight: '600', color: COLORS.gray, textAlign: 'right' },
  fieldInput: {
    height: 48,
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
    height: 48,
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
    height: 100,
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
  logoPickerHint: { fontSize: 11.5, color: COLORS.grayLight },
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
  errorText: { color: COLORS.red, fontSize: 13, textAlign: 'center' },
  createButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: { opacity: 0.7 },
  createButtonText: { color: COLORS.white, fontSize: 15.5, fontWeight: '600' },
  hintText: { fontSize: 11.5, color: COLORS.grayLight, textAlign: 'center', lineHeight: 17 },
});
