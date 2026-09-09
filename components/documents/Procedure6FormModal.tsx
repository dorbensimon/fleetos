import React, { useState } from 'react';
import { Alert, Image, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Card, Field, Input, InputLtr } from '../ui';
import { AdminGradientBackground } from '../admin/AdminGradientBackground';
import { DateField } from '../ui/DateField';
import { TimeField } from '../ui/TimeField';
import { COLORS, RADIUS, SPACING, SUBTLE_SHADOW, formatDate } from '../../lib/theme';
import { formatPhone, isValidIsraeliPhone } from '../../lib/phone';
import { captureImage, pickImage, type PickedFile } from '../../lib/documents';
import { Procedure6FormValues } from '../../lib/procedure6Report';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (values: Procedure6FormValues, photo: PickedFile | null) => Promise<void>;
};

export function Procedure6FormModal({ visible, onClose, onSubmit }: Props) {
  const insets = useSafeAreaInsets();
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
    Alert.alert('הוספת תיעוד', undefined, [
      { text: 'צלם', onPress: () => void captureImage().then((f) => f && setPhoto(f)).catch(() => undefined) },
      { text: 'בחר מהגלריה', onPress: () => void pickImage().then((f) => f && setPhoto(f)).catch(() => undefined) },
      { text: 'ביטול', style: 'cancel' },
    ]);
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!eventDateIso) e.eventDate = 'שדה חובה';
    if (!eventTime) e.eventTime = 'שדה חובה';
    if (!details.trim()) e.details = 'שדה חובה';
    if (!vehicleNumber.trim()) e.vehicleNumber = 'שדה חובה';
    if (!complainantName.trim()) e.complainantName = 'שדה חובה';
    if (!complainantPhone.trim()) e.complainantPhone = 'שדה חובה';
    else if (!isValidIsraeliPhone(complainantPhone)) e.complainantPhone = 'מספר טלפון לא תקין';
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
      Alert.alert('שמירה נכשלה', err?.message ?? 'נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.container}>
        <AdminGradientBackground />

        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={close} disabled={saving} hitSlop={10}>
            <AppText weight="bold" style={styles.cancelText}>ביטול</AppText>
          </TouchableOpacity>
          <AppText weight="bold" style={styles.title}>הוסף מסמך נוהל 6</AppText>
          <TouchableOpacity onPress={submit} disabled={saving} hitSlop={10}>
            <AppText weight="bold" style={[styles.saveText, saving && styles.saveTextDisabled]}>
              {saving ? 'שומר...' : 'שמור'}
            </AppText>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.formCard}>
            <Field label="תאריך האירוע" error={errors.eventDate}>
              <DateField value={eventDateIso} onChange={setEventDateIso} disabled={saving} />
            </Field>

            <Field label="שעת האירוע" error={errors.eventTime}>
              <TimeField value={eventTime} onChange={setEventTime} disabled={saving} hasError={!!errors.eventTime} />
            </Field>

            <Field label="פרטי האירוע" error={errors.details}>
              <Input
                placeholder="תיאור האירוע"
                value={details}
                onChangeText={setDetails}
                multiline
                numberOfLines={4}
                style={styles.multiline}
                editable={!saving}
                hasError={!!errors.details}
              />
            </Field>

            <Field label="מס' רכב" error={errors.vehicleNumber}>
              <InputLtr
                placeholder="מספר רכב"
                value={vehicleNumber}
                onChangeText={setVehicleNumber}
                editable={!saving}
                hasError={!!errors.vehicleNumber}
              />
            </Field>

            <Field label="שם הנהג המתלונן" error={errors.complainantName}>
              <Input
                placeholder="שם מלא"
                value={complainantName}
                onChangeText={setComplainantName}
                editable={!saving}
                hasError={!!errors.complainantName}
              />
            </Field>

            <Field label="טלפון הנהג המתלונן" error={errors.complainantPhone}>
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

            <Field label="העלאת תיעוד / תמונה" optional>
              {photo ? (
                <View style={styles.photoPreviewWrap}>
                  <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
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
                  <AppText weight="bold" style={styles.photoAddText}>הוסף תמונה</AppText>
                </TouchableOpacity>
              )}
            </Field>
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.screen },
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
  saveTextDisabled: { opacity: 0.5 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
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
    left: -8,
    backgroundColor: COLORS.card,
    borderRadius: 11,
  },
});
