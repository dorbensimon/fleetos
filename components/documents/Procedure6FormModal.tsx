import React, { useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { BrandLoader } from '../ui/BrandLoader';
import { showAlert } from '../../lib/platformAlert';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Card, Field, Input, InputLtr } from '../ui';
import { AdminGradientBackground } from '../admin/AdminGradientBackground';
import { DateField } from '../ui/DateField';
import { TimeField } from '../ui/TimeField';
import { COLORS, CONTENT_MAX_WIDTH, RADIUS, SPACING, SUBTLE_SHADOW, formatDate } from '../../lib/theme';
import { formatPhone, isValidIsraeliPhone } from '../../lib/phone';
import { captureImage, pickImage, type PickedFile } from '../../lib/documents';
import { Procedure6FormValues } from '../../lib/procedure6Report';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { DK, HeroButton, NightBar, PrimaryAction } from '../driverKit';
import { t } from '../../lib/i18n';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (values: Procedure6FormValues, photo: PickedFile | null) => Promise<void>;
};

export function Procedure6FormModal({ visible, onClose, onSubmit }: Props) {
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const [eventDateIso, setEventDateIso] = useState<string | null>(null);
  const [eventTime, setEventTime] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [complainantName, setComplainantName] = useState('');
  const [complainantPhone, setComplainantPhone] = useState('');
  const [photo, setPhoto] = useState<PickedFile | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setEventDateIso(null);
    setEventTime(null);
    setDetails('');
    setVehicleNumber('');
    setComplainantName('');
    setComplainantPhone('');
    setPhoto(null);
    setErrors({});
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const addPhoto = () => {
    showAlert(t('procedure6.addDocumentation'), undefined, [
      { text: t('common.takePhoto'), onPress: () => void captureImage().then((f) => f && setPhoto(f)).catch(() => undefined) },
      { text: t('common.chooseFromGallery'), onPress: () => void pickImage().then((f) => f && setPhoto(f)).catch(() => undefined) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!eventDateIso) e.eventDate = t('validation.required');
    if (!eventTime) e.eventTime = t('validation.required');
    if (!details.trim()) e.details = t('validation.required');
    if (!vehicleNumber.trim()) e.vehicleNumber = t('validation.required');
    if (!complainantName.trim()) e.complainantName = t('validation.required');
    if (!complainantPhone.trim()) e.complainantPhone = t('validation.required');
    else if (!isValidIsraeliPhone(complainantPhone)) e.complainantPhone = t('validation.invalidPhone');
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    try {
      await onSubmit(
        {
          eventDate: formatDate(eventDateIso!),
          eventTime: eventTime!,
          details: details.trim(),
          vehicleNumber: vehicleNumber.trim(),
          complainantName: complainantName.trim(),
          complainantPhone: formatPhone(complainantPhone),
        },
        photo
      );
      reset();
    } catch (err: any) {
      showAlert(t('common.saveFailed'), err?.message ?? t('common.tryAgain'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={[styles.container, !desktop && styles.containerKit]}>
        {desktop && <AdminGradientBackground />}

        {!desktop ? (
          <NightBar
            insetTop={insets.top}
            title={t('procedure6.report')}
            subtitle={t('procedure6.savedAsPdf')}
            onBack={close}
            right={saving ? undefined : <HeroButton icon="checkmark" label={t('procedure6.save')} onPress={() => void submit()} />}
          />
        ) : (
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={close} disabled={saving} hitSlop={10}>
            <AppText weight="bold" style={styles.cancelText}>{t('common.cancel')}</AppText>
          </TouchableOpacity>
          <AppText weight="bold" style={styles.title}>{t('procedure6.addDocument')}</AppText>
          <TouchableOpacity onPress={submit} disabled={saving} hitSlop={10}>
            <AppText weight="bold" style={[styles.saveText, saving && { opacity: 0 }]}>{t('common.saveShort')}</AppText>
            {saving && <BrandLoader size="small" color={COLORS.accent} style={StyleSheet.absoluteFill} />}
          </TouchableOpacity>
        </View>
        )}

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.formCard}>
            <Field label={t('procedure6.eventDate')} error={errors.eventDate}>
              <DateField value={eventDateIso} onChange={setEventDateIso} disabled={saving} />
            </Field>

            <Field label={t('procedure6.eventTime')} error={errors.eventTime}>
              <TimeField value={eventTime} onChange={setEventTime} disabled={saving} hasError={!!errors.eventTime} />
            </Field>

            <Field label={t('procedure6.eventDetails')} error={errors.details}>
              <Input
                placeholder={t('procedure6.eventDescription')}
                value={details}
                onChangeText={setDetails}
                multiline
                numberOfLines={4}
                style={styles.multiline}
                editable={!saving}
                hasError={!!errors.details}
              />
            </Field>

            <Field label={t('vehicle.numberShort')} error={errors.vehicleNumber}>
              <InputLtr
                placeholder={t('vehicle.number')}
                value={vehicleNumber}
                onChangeText={setVehicleNumber}
                editable={!saving}
                hasError={!!errors.vehicleNumber}
              />
            </Field>

            <Field label={t('procedure6.complainantName')} error={errors.complainantName}>
              <Input
                placeholder={t('common.fullName')}
                value={complainantName}
                onChangeText={setComplainantName}
                editable={!saving}
                hasError={!!errors.complainantName}
              />
            </Field>

            <Field label={t('procedure6.complainantPhone')} error={errors.complainantPhone}>
              <InputLtr
                placeholder="050-0000000"
                value={formatPhone(complainantPhone)}
                onChangeText={(v) => setComplainantPhone(v.replace(/\D/g, ''))}
                keyboardType="phone-pad"
                maxLength={11}
                editable={!saving}
                hasError={!!errors.complainantPhone}
              />
            </Field>

            <Field label={t('procedure6.uploadPhoto')} optional>
              {photo ? (
                <View style={styles.photoPreviewWrap}>
                  <Image source={{ uri: photo.uri }} accessibilityLabel={t('procedure6.attachedPhoto')} style={styles.photoPreview} />
                  <TouchableOpacity
                    style={styles.photoRemove}
                    onPress={() => setPhoto(null)}
                    disabled={saving}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={22} color={COLORS.dangerText} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.photoAddBtn} onPress={addPhoto} disabled={saving} activeOpacity={0.7}>
                  <Ionicons name="camera-outline" size={20} color={COLORS.accent} />
                  <AppText weight="bold" style={styles.photoAddText}>{t('common.addPhoto')}</AppText>
                </TouchableOpacity>
              )}
            </Field>
          </Card>
          {!desktop && <PrimaryAction label={t('procedure6.save')} icon="document-text-outline" onPress={() => void submit()} loading={saving} style={styles.kitSave} />}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.screen },
  containerKit: { backgroundColor: DK.canvas },
  kitSave: { marginTop: SPACING.lg },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.card,
    ...SUBTLE_SHADOW,
  },
  title: { fontSize: 16 },
  cancelText: { fontSize: 14.5, color: COLORS.textMuted },
  saveText: { fontSize: 14.5, color: COLORS.accent },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  formCard: { gap: SPACING.md },
  multiline: { height: 96, paddingTop: 12, textAlignVertical: 'top' },
  photoAddBtn: {
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.field,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
    borderStyle: 'dashed',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoAddText: { fontSize: 14, color: COLORS.accent },
  photoPreviewWrap: { alignSelf: 'flex-start' },
  photoPreview: { width: 96, height: 96, borderRadius: RADIUS.md, backgroundColor: COLORS.field },
  photoRemove: {
    position: 'absolute',
    top: -8,
    start: -8,
    backgroundColor: COLORS.card,
    borderRadius: 11,
  },
});
