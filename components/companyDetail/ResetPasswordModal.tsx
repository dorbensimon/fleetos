import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CenterModal } from '../owner/OwnerModals';
import { COLORS } from '../owner/ownerTheme';
import { sharedStyles as s } from './sharedStyles';
import { CompanyUser } from './types';

export type ResetPasswordForm = { password: string; confirmPassword: string };
export const EMPTY_RESET_PASSWORD_FORM: ResetPasswordForm = { password: '', confirmPassword: '' };

export function ResetPasswordModal({
  target,
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
  target: CompanyUser | null;
  form: ResetPasswordForm;
  fieldErrors: Record<string, string>;
  showPassword: boolean;
  submitting: boolean;
  submitError: string;
  onClose: () => void;
  onChangeForm: (updater: (f: ResetPasswordForm) => ResetPasswordForm) => void;
  onToggleShowPassword: () => void;
  onSubmit: () => void;
}) {
  return (
    <CenterModal visible={!!target} onClose={onClose}>
      <Text style={s.deleteTitle}>איפוס סיסמה</Text>
      <Text style={s.deleteDescription}>
        קביעת סיסמה חדשה עבור <Text style={s.deleteBold}>{target?.email || target?.full_name}</Text>. הוא יתבקש
        לקבוע סיסמה קבועה משלו בכניסה הבאה.
      </Text>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>סיסמה חדשה</Text>
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
        {submitting ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.primaryButtonText}>אפס סיסמה</Text>}
      </TouchableOpacity>
    </CenterModal>
  );
}
