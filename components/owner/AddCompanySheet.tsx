import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { BrandLoader } from '../ui/BrandLoader';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, styles as sheetStyles } from './OwnerModals';
import { COLORS } from './ownerTheme';
import { sharedStyles } from '../companyDetail/sharedStyles';
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

      <View style={sharedStyles.fieldGroup}>
        <Text style={sharedStyles.fieldLabel}>שם החברה</Text>
        <TextInput
          style={[styles.fieldInput, !!fieldErrors.name && sharedStyles.fieldInputError]}
          placeholder="לדוגמה: אלמוג הובלות"
          placeholderTextColor={COLORS.grayLight}
          value={form.name}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, name: v }))}
          textAlign="right"
        />
        {!!fieldErrors.name && <Text style={sharedStyles.fieldErrorText}>{fieldErrors.name}</Text>}
      </View>

      <View style={sharedStyles.fieldGroup}>
        <Text style={sharedStyles.fieldLabel}>לוגו החברה (אופציונלי)</Text>
        <TouchableOpacity style={styles.logoPicker} onPress={onPickLogo} disabled={uploadingLogo}>
          {uploadingLogo ? (
            <BrandLoader color={COLORS.blue} />
          ) : form.logoUrl ? (
            <>
              <View style={sharedStyles.logoPreviewWrap}>
                <Image source={{ uri: form.logoUrl }} accessibilityLabel="לוגו החברה" style={sharedStyles.logoPreview} resizeMode="cover" />
                <View style={sharedStyles.logoUploadedBadge}>
                  <Ionicons name="checkmark" size={11} color={COLORS.white} />
                </View>
              </View>
              <Text style={sharedStyles.logoPickerChangeText}>שנה תמונה</Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={22} color={COLORS.grayLight} />
              <Text style={sharedStyles.logoPickerText}>העלאת לוגו</Text>
              <Text style={styles.logoPickerHint}>PNG או JPG</Text>
            </>
          )}
        </TouchableOpacity>
        {!!logoError && <Text style={sharedStyles.errorText}>{logoError}</Text>}
      </View>

      <View style={sharedStyles.fieldGroup}>
        <Text style={sharedStyles.fieldLabel}>סוג חברה (אופציונלי)</Text>
        <View style={sharedStyles.companyTypeRow}>
          {(['בע״מ', 'עוסק מורשה'] as const).map((type) => {
            const active = form.companyType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[sharedStyles.companyTypeChip, active && sharedStyles.companyTypeChipActive]}
                onPress={() => onChangeForm((f) => ({ ...f, companyType: active ? '' : type }))}
              >
                <Text style={[sharedStyles.companyTypeChipText, active && sharedStyles.companyTypeChipTextActive]}>{type}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={sharedStyles.fieldGroup}>
        <Text style={sharedStyles.fieldLabel}>ח.פ / ע.מ (אופציונלי)</Text>
        <TextInput
          style={[styles.fieldInput, sharedStyles.fieldInputLtr]}
          placeholder="512345678"
          placeholderTextColor={COLORS.grayLight}
          value={form.businessId}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, businessId: v }))}
          keyboardType="number-pad"
          textAlign="left"
        />
      </View>

      <View style={sharedStyles.fieldGroup}>
        <Text style={sharedStyles.fieldLabel}>שם פרטי של האדמין</Text>
        <TextInput
          style={[styles.fieldInput, !!fieldErrors.adminFirstName && sharedStyles.fieldInputError]}
          placeholder="לדוגמה: דוד"
          placeholderTextColor={COLORS.grayLight}
          value={form.adminFirstName}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, adminFirstName: v }))}
          textAlign="right"
        />
        {!!fieldErrors.adminFirstName && <Text style={sharedStyles.fieldErrorText}>{fieldErrors.adminFirstName}</Text>}
      </View>

      <View style={sharedStyles.fieldGroup}>
        <Text style={sharedStyles.fieldLabel}>שם משפחה של האדמין</Text>
        <TextInput
          style={[styles.fieldInput, !!fieldErrors.adminLastName && sharedStyles.fieldInputError]}
          placeholder="לדוגמה: כהן"
          placeholderTextColor={COLORS.grayLight}
          value={form.adminLastName}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, adminLastName: v }))}
          textAlign="right"
        />
        {!!fieldErrors.adminLastName && <Text style={sharedStyles.fieldErrorText}>{fieldErrors.adminLastName}</Text>}
      </View>

      <View style={sharedStyles.fieldGroup}>
        <Text style={sharedStyles.fieldLabel}>מייל אדמין</Text>
        <TextInput
          style={[styles.fieldInput, sharedStyles.fieldInputLtr, !!fieldErrors.email && sharedStyles.fieldInputError]}
          placeholder="admin@company.co.il"
          placeholderTextColor={COLORS.grayLight}
          value={form.email}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, email: v }))}
          autoCapitalize="none"
          keyboardType="email-address"
          textAlign="left"
        />
        {!!fieldErrors.email && <Text style={sharedStyles.fieldErrorText}>{fieldErrors.email}</Text>}
      </View>

      <View style={sharedStyles.fieldGroup}>
        <Text style={sharedStyles.fieldLabel}>טלפון</Text>
        <TextInput
          style={[styles.fieldInput, sharedStyles.fieldInputLtr, !!fieldErrors.phone && sharedStyles.fieldInputError]}
          placeholder="050-0000000"
          placeholderTextColor={COLORS.grayLight}
          value={formatPhone(form.phone)}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, phone: v.replace(/\D/g, '') }))}
          keyboardType="phone-pad"
          textAlign="left"
        />
        {!!fieldErrors.phone && <Text style={sharedStyles.fieldErrorText}>{fieldErrors.phone}</Text>}
      </View>

      <View style={sharedStyles.fieldGroup}>
        <Text style={sharedStyles.fieldLabel}>סיסמה לאדמין</Text>
        <View style={[styles.fieldInputWithIcon, !!fieldErrors.password && sharedStyles.fieldInputError]}>
          <TextInput
            style={[sharedStyles.fieldInputInner, sharedStyles.fieldInputLtr]}
            placeholder="לפחות 4 ספרות"
            keyboardType="number-pad"
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
        {!!fieldErrors.password && <Text style={sharedStyles.fieldErrorText}>{fieldErrors.password}</Text>}
      </View>

      <View style={sharedStyles.fieldGroup}>
        <Text style={sharedStyles.fieldLabel}>אימות סיסמה</Text>
        <TextInput
          style={[styles.fieldInput, sharedStyles.fieldInputLtr, !!fieldErrors.confirmPassword && sharedStyles.fieldInputError]}
          placeholder="הזן שוב את הסיסמה"
          keyboardType="number-pad"
          placeholderTextColor={COLORS.grayLight}
          value={form.confirmPassword}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, confirmPassword: v }))}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          textAlign="left"
        />
        {!!fieldErrors.confirmPassword && <Text style={sharedStyles.fieldErrorText}>{fieldErrors.confirmPassword}</Text>}
      </View>

      {!!createError && <Text style={sharedStyles.errorText}>{createError}</Text>}

      <TouchableOpacity
        style={[styles.createButton, creating && styles.createButtonDisabled]}
        onPress={onSubmit}
        disabled={creating}
        activeOpacity={0.85}
      >
        {creating ? <BrandLoader color={COLORS.white} /> : <Text style={styles.createButtonText}>צור חברה</Text>}
      </TouchableOpacity>
      <Text style={styles.hintText}>
        האדמין יוכל להתחבר עם המייל והסיסמה שקבעת, ויתבקש לקבוע סיסמה קבועה משלו בכניסה הראשונה
      </Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
  logoPickerHint: { fontSize: 11.5, color: COLORS.grayLight },
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
