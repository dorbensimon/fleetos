import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../owner/ownerTheme';
import { formatPhone } from '../../lib/phone';
import { sharedStyles as s } from './sharedStyles';

export type CompanyEditableFields = {
  name: string;
  logoUrl: string;
  companyType: '' | 'בע״מ' | 'עוסק מורשה';
  businessId: string;
  address: string;
  phone: string;
  safetyOfficerName: string;
  safetyOfficerPhone: string;
};

/** The "פרטי חברה" card: editable company fields + save/status/delete actions. */
export function CompanyInfoCard({
  fields,
  active,
  hasChanges,
  saving,
  saveError,
  uploadingLogo,
  logoError,
  onChangeFields,
  onPickLogo,
  onSave,
  onToggleActive,
  onRequestDelete,
}: {
  fields: CompanyEditableFields;
  active: boolean;
  hasChanges: boolean;
  saving: boolean;
  saveError: string;
  uploadingLogo: boolean;
  logoError: string;
  onChangeFields: (updater: (f: CompanyEditableFields) => CompanyEditableFields) => void;
  onPickLogo: () => void;
  onSave: () => void;
  onToggleActive: () => void;
  onRequestDelete: () => void;
}) {
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>פרטי חברה</Text>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>שם החברה</Text>
        <TextInput
          style={s.fieldInput}
          value={fields.name}
          onChangeText={(v) => onChangeFields((f) => ({ ...f, name: v }))}
          textAlign="right"
        />
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>לוגו החברה</Text>
        <TouchableOpacity style={s.logoPicker} onPress={onPickLogo} disabled={uploadingLogo}>
          {uploadingLogo ? (
            <ActivityIndicator color={COLORS.blue} />
          ) : fields.logoUrl ? (
            <>
              <View style={s.logoPreviewWrap}>
                <Image source={{ uri: fields.logoUrl }} style={s.logoPreview} resizeMode="cover" />
                <View style={s.logoUploadedBadge}>
                  <Ionicons name="checkmark" size={11} color={COLORS.white} />
                </View>
              </View>
              <Text style={s.logoPickerChangeText}>שנה תמונה</Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={22} color={COLORS.grayLight} />
              <Text style={s.logoPickerText}>העלאת לוגו</Text>
            </>
          )}
        </TouchableOpacity>
        {!!logoError && <Text style={s.errorText}>{logoError}</Text>}
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>סוג חברה</Text>
        <View style={s.companyTypeRow}>
          {(['בע״מ', 'עוסק מורשה'] as const).map((type) => {
            const typeActive = fields.companyType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[s.companyTypeChip, typeActive && s.companyTypeChipActive]}
                onPress={() => onChangeFields((f) => ({ ...f, companyType: typeActive ? '' : type }))}
              >
                <Text style={[s.companyTypeChipText, typeActive && s.companyTypeChipTextActive]}>{type}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>ח.פ / ע.מ</Text>
        <TextInput
          style={[s.fieldInput, s.fieldInputLtr]}
          value={fields.businessId}
          onChangeText={(v) => onChangeFields((f) => ({ ...f, businessId: v }))}
          keyboardType="number-pad"
          textAlign="left"
        />
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>כתובת החברה</Text>
        <TextInput
          style={s.fieldInput}
          value={fields.address}
          onChangeText={(v) => onChangeFields((f) => ({ ...f, address: v }))}
          textAlign="right"
        />
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>טלפון החברה</Text>
        <TextInput
          style={[s.fieldInput, s.fieldInputLtr]}
          value={formatPhone(fields.phone)}
          onChangeText={(v) => onChangeFields((f) => ({ ...f, phone: v.replace(/\D/g, '') }))}
          keyboardType="phone-pad"
          textAlign="left"
        />
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>שם קצין הרכב</Text>
        <TextInput
          style={s.fieldInput}
          value={fields.safetyOfficerName}
          onChangeText={(v) => onChangeFields((f) => ({ ...f, safetyOfficerName: v }))}
          textAlign="right"
        />
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>נייד קצין הרכב</Text>
        <TextInput
          style={[s.fieldInput, s.fieldInputLtr]}
          value={formatPhone(fields.safetyOfficerPhone)}
          onChangeText={(v) => onChangeFields((f) => ({ ...f, safetyOfficerPhone: v.replace(/\D/g, '') }))}
          keyboardType="phone-pad"
          textAlign="left"
        />
      </View>

      {!!saveError && <Text style={s.errorText}>{saveError}</Text>}

      {hasChanges && (
        <TouchableOpacity style={[s.primaryButton, saving && s.buttonDisabled]} onPress={onSave} disabled={saving}>
          {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.primaryButtonText}>שמור שינויים</Text>}
        </TouchableOpacity>
      )}

      <View style={cardStyles.actionsRow}>
        <TouchableOpacity style={cardStyles.secondaryButton} onPress={onToggleActive}>
          <Ionicons name="power-outline" size={17} color={COLORS.black} />
          <Text style={cardStyles.secondaryButtonText}>{active ? 'השבת חברה' : 'הפעל חברה'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={cardStyles.dangerButton} onPress={onRequestDelete}>
          <Ionicons name="trash-outline" size={17} color={COLORS.red} />
          <Text style={cardStyles.dangerButtonText}>מחק חברה</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
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
});
