import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CenterModal } from '../owner/OwnerModals';
import { COLORS } from '../owner/ownerTheme';
import { formatPhone } from '../../lib/phone';
import { sharedStyles as s } from './sharedStyles';
import { CompanyUser } from './types';

export type EditUserForm = { firstName: string; lastName: string; phone: string };

export function EditUserModal({
  target,
  form,
  fieldErrors,
  submitting,
  submitError,
  onClose,
  onChangeForm,
  onSubmit,
}: {
  target: CompanyUser | null;
  form: EditUserForm;
  fieldErrors: Record<string, string>;
  submitting: boolean;
  submitError: string;
  onClose: () => void;
  onChangeForm: (updater: (f: EditUserForm) => EditUserForm) => void;
  onSubmit: () => void;
}) {
  return (
    <CenterModal visible={!!target} onClose={onClose}>
      <Text style={s.deleteTitle}>עריכת פרטים</Text>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>שם פרטי</Text>
        <TextInput
          style={[s.fieldInput, !!fieldErrors.firstName && s.fieldInputError]}
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
          value={form.lastName}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, lastName: v }))}
          textAlign="right"
        />
        {!!fieldErrors.lastName && <Text style={s.fieldErrorText}>{fieldErrors.lastName}</Text>}
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>טלפון</Text>
        <TextInput
          style={[s.fieldInput, s.fieldInputLtr, !!fieldErrors.phone && s.fieldInputError]}
          value={formatPhone(form.phone)}
          onChangeText={(v) => onChangeForm((f) => ({ ...f, phone: v.replace(/\D/g, '') }))}
          keyboardType="phone-pad"
          textAlign="left"
        />
        {!!fieldErrors.phone && <Text style={s.fieldErrorText}>{fieldErrors.phone}</Text>}
      </View>

      {!!submitError && <Text style={s.errorText}>{submitError}</Text>}

      <TouchableOpacity style={[s.primaryButton, submitting && s.buttonDisabled]} onPress={onSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.primaryButtonText}>שמור</Text>}
      </TouchableOpacity>
    </CenterModal>
  );
}
