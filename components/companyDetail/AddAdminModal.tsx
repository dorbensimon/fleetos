import React from 'react';
import { Text, TextInput, TouchableOpacity, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CenterModal } from '../owner/OwnerModals';
import { COLORS } from '../owner/ownerTheme';
import { formatPhone } from '../../lib/phone';
import { sharedStyles as s } from './sharedStyles';

export type NewAdminForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

export const EMPTY_NEW_ADMIN_FORM: NewAdminForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
};

export function AddAdminModal({
  visible,
  form,
  fieldErrors,
  showPassword,
  submitting,
  submitError,
  onClose,
  onChangeForm,
  onToggleShowPassword,
  onSubmit,
}: {
  visible: boolean;
  form: NewAdminForm;
  fieldErrors: Record<string, string>;
  showPassword: boolean;
  submitting: boolean;
  submitError: string;
  onClose: () => void;
  onChangeForm: (updater: (f: NewAdminForm) => NewAdminForm) => void;
  onToggleShowPassword: () => void;
  onSubmit: () => void;
}) {
  return (
    <CenterModal visible={visible} onClose={onClose}>
      <Text style={s.deleteTitle}>הוספת אדמין</Text>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>שם פרטי</Text>
        <TextInput
          style={[s.fieldInput, !!fieldErrors.firstName && s.fieldInputError]}
          placeholder="לדוגמה: דוד"
          placeholderTextColor={COLORS.grayLight}
          value={form.firstName}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, firstName: v }))}
          textAlign="right"
        />
        {!!fieldErrors.firstName && <Text style={s.fieldErrorText}>{fieldErrors.firstName}</Text>}
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>שם משפחה</Text>
        <TextInput
          style={[s.fieldInput, !!fieldErrors.lastName && s.fieldInputError]}
          placeholder="לדוגמה: כהן"
          placeholderTextColor={COLORS.grayLight}
          value={form.lastName}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, lastName: v }))}
          textAlign="right"
        />
        {!!fieldErrors.lastName && <Text style={s.fieldErrorText}>{fieldErrors.lastName}</Text>}
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>מייל האדמין</Text>
        <TextInput
          style={[s.fieldInput, s.fieldInputLtr, !!fieldErrors.email && s.fieldInputError]}
          placeholder="admin@company.co.il"
          placeholderTextColor={COLORS.grayLight}
          value={form.email}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, email: v }))}
          autoCapitalize="none"
          keyboardType="email-address"
          textAlign="left"
        />
        {!!fieldErrors.email && <Text style={s.fieldErrorText}>{fieldErrors.email}</Text>}
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>טלפון</Text>
        <TextInput
          style={[s.fieldInput, s.fieldInputLtr, !!fieldErrors.phone && s.fieldInputError]}
          placeholder="050-0000000"
          placeholderTextColor={COLORS.grayLight}
          value={formatPhone(form.phone)}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, phone: v.replace(/\D/g, '') }))}
          keyboardType="phone-pad"
          textAlign="left"
        />
        {!!fieldErrors.phone && <Text style={s.fieldErrorText}>{fieldErrors.phone}</Text>}
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>סיסמה לאדמין</Text>
        <View style={[s.fieldInputWithIcon, !!fieldErrors.password && s.fieldInputError]}>
          <TextInput
            style={[s.fieldInputInner, s.fieldInputLtr]}
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
        {!!fieldErrors.password && <Text style={s.fieldErrorText}>{fieldErrors.password}</Text>}
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>אימות סיסמה</Text>
        <TextInput
          style={[s.fieldInput, s.fieldInputLtr, !!fieldErrors.confirmPassword && s.fieldInputError]}
          placeholder="הזן שוב את הסיסמה"
          placeholderTextColor={COLORS.grayLight}
          value={form.confirmPassword}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, confirmPassword: v }))}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          textAlign="left"
        />
        {!!fieldErrors.confirmPassword && <Text style={s.fieldErrorText}>{fieldErrors.confirmPassword}</Text>}
      </View>

      {!!submitError && <Text style={s.errorText}>{submitError}</Text>}

      <TouchableOpacity style={[s.primaryButton, submitting && s.buttonDisabled]} onPress={onSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.primaryButtonText}>הוסף</Text>}
      </TouchableOpacity>
    </CenterModal>
  );
}
