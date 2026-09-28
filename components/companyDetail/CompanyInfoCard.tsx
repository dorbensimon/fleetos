import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { BrandLoader } from '../ui/BrandLoader';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../owner/ownerTheme';
import { formatPhone } from '../../lib/phone';
import { sharedStyles as s } from './sharedStyles';
import { t } from '../../lib/i18n';

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
      <Text style={s.sectionTitle}>{t('company.detailsTitle')}</Text>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>{t('company.name')}</Text>
        <TextInput
          style={s.fieldInput}
          value={fields.name}
          onChangeText={(v) => onChangeFields((f) => ({ ...f, name: v }))}
          textAlign="right"
        />
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>{t('company.logo')}</Text>
        <TouchableOpacity style={s.logoPicker} onPress={onPickLogo} disabled={uploadingLogo}>
          {uploadingLogo ? (
            <BrandLoader color={COLORS.blue} />
          ) : fields.logoUrl ? (
            <>
              <View style={s.logoPreviewWrap}>
                <Image source={{ uri: fields.logoUrl }} accessibilityLabel={t('company.logo')} style={s.logoPreview} resizeMode="cover" />
                <View style={s.logoUploadedBadge}>
                  <Ionicons name="checkmark" size={11} color={COLORS.white} />
                </View>
              </View>
              <Text style={s.logoPickerChangeText}>{t('company.changeImage')}</Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={22} color={COLORS.grayLight} />
              <Text style={s.logoPickerText}>{t('company.uploadLogo')}</Text>
            </>
          )}
        </TouchableOpacity>
        {!!logoError && <Text style={s.errorText}>{logoError}</Text>}
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>{t('company.type')}</Text>
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
        <Text style={s.fieldLabel}>{t('company.businessId')}</Text>
        <TextInput
          style={[s.fieldInput, s.fieldInputLtr]}
          value={fields.businessId}
          onChangeText={(v) => onChangeFields((f) => ({ ...f, businessId: v }))}
          keyboardType="number-pad"
          textAlign="left"
        />
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>{t('company.address')}</Text>
        <TextInput
          style={s.fieldInput}
          value={fields.address}
          onChangeText={(v) => onChangeFields((f) => ({ ...f, address: v }))}
          textAlign="right"
        />
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>{t('company.phone')}</Text>
        <TextInput
          style={[s.fieldInput, s.fieldInputLtr]}
          value={formatPhone(fields.phone)}
          onChangeText={(v) => onChangeFields((f) => ({ ...f, phone: v.replace(/\D/g, '') }))}
          keyboardType="phone-pad"
          textAlign="left"
        />
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>{t('company.vehicleOfficerName')}</Text>
        <TextInput
          style={s.fieldInput}
          value={fields.safetyOfficerName}
          onChangeText={(v) => onChangeFields((f) => ({ ...f, safetyOfficerName: v }))}
          textAlign="right"
        />
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>{t('company.vehicleOfficerMobile')}</Text>
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
          {saving ? <BrandLoader color={COLORS.white} /> : <Text style={s.primaryButtonText}>{t('common.saveChanges')}</Text>}
        </TouchableOpacity>
      )}

      <View style={cardStyles.actionsRow}>
        <TouchableOpacity style={cardStyles.secondaryButton} onPress={onToggleActive}>
          <Ionicons name="power-outline" size={17} color={COLORS.black} />
          <Text style={cardStyles.secondaryButtonText}>{active ? t('company.disable') : t('company.enable')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={cardStyles.dangerButton} onPress={onRequestDelete}>
          <Ionicons name="trash-outline" size={17} color={COLORS.red} />
          <Text style={cardStyles.dangerButtonText}>{t('company.delete')}</Text>
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
