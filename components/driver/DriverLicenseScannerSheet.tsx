import React, { useState, useRef } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Image, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, Field, Input, PrimaryButton } from '../ui';
import { COLORS, SPACING, CONTENT_MAX_WIDTH } from '../../lib/theme';
import { pickImage } from '../../lib/documents';
import { scanLicenseImage, extractExpiryDate, type ScanResult } from '../../lib/documentScanner';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { licenseNumber: string; licenseExpiry: string; licenseClasses: string }) => Promise<void>;
};

type ScanPhase = 'idle' | 'photo-front' | 'photo-back' | 'extracting' | 'editing';

export function DriverLicenseScannerSheet({ visible, onClose, onSubmit }: Props) {
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [frontPhoto, setFrontPhoto] = useState<string | null>(null);
  const [backPhoto, setBackPhoto] = useState<string | null>(null);
  const [frontScan, setFrontScan] = useState<ScanResult | null>(null);
  const [backScan, setBackScan] = useState<ScanResult | null>(null);

  // Manual edit fields
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [licenseClasses, setLicenseClasses] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Bumped on every close/reset so an in-flight pick/scan started before a
  // cancel can't land its result into the sheet after the fact.
  const sessionRef = useRef(0);

  const reset = () => {
    sessionRef.current += 1;
    setPhase('idle');
    setFrontPhoto(null);
    setBackPhoto(null);
    setFrontScan(null);
    setBackScan(null);
    setLicenseNumber('');
    setLicenseExpiry('');
    setLicenseClasses('');
    setErrors({});
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const pickPhotoFront = async () => {
    const session = sessionRef.current;
    try {
      const file = await pickImage();
      if (file && sessionRef.current === session) {
        setFrontPhoto(file.uri);
        setPhase('extracting');
        const result = await scanLicenseImage(file);
        if (sessionRef.current !== session) return;
        setFrontScan(result);
        setLicenseExpiry(result.extractedDate || '');
        setPhase('photo-back');
      }
    } catch (err: any) {
      if (sessionRef.current === session) {
        setErrors({ front: err?.message || 'צילום קדימה נכשל' });
      }
    }
  };

  const pickPhotoBack = async () => {
    const session = sessionRef.current;
    try {
      const file = await pickImage();
      if (file && sessionRef.current === session) {
        setBackPhoto(file.uri);
        setPhase('extracting');
        const result = await scanLicenseImage(file);
        if (sessionRef.current !== session) return;
        setBackScan(result);
        // If back side has better data, use it
        if (!licenseNumber && result.rawText) {
          // Try to extract license number from back
          const numberMatch = result.rawText.match(/\d{7,9}/);
          if (numberMatch) setLicenseNumber(numberMatch[0]);
        }
        if (!licenseExpiry && result.extractedDate) {
          setLicenseExpiry(result.extractedDate);
        }
        setPhase('editing');
      }
    } catch (err: any) {
      if (sessionRef.current === session) {
        setErrors({ back: err?.message || 'צילום אחורה נכשל' });
      }
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!licenseNumber.trim()) e.licenseNumber = 'שדה חובה';
    if (!licenseExpiry.trim()) e.licenseExpiry = 'שדה חובה';
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(licenseExpiry.trim())) e.licenseExpiry = 'פורמט תאריך שגוי, יש להזין YYYY-MM-DD';
    if (!licenseClasses.trim()) e.licenseClasses = 'שדה חובה';
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    try {
      await onSubmit({
        licenseNumber: licenseNumber.trim(),
        licenseExpiry: licenseExpiry.trim(),
        licenseClasses: licenseClasses.trim(),
      });
      close();
    } catch (err: any) {
      setErrors({ general: err?.message || 'שמירה נכשלה' });
    } finally {
      setSaving(false);
    }
  };

  const scanPhaseContent = () => {
    if (phase === 'idle') {
      return (
        <View style={styles.centerContent}>
          <Ionicons name="card-outline" size={60} color={COLORS.accent} />
          <AppText weight="bold" style={styles.title}>סריקת רישיון נהיגה</AppText>
          <AppText style={styles.subtitle}>
            צלם או בחר תמונה של קדימה ואחורה של הרישיון שלך. המערכת תחלץ בעצמה את תאריך התוקף.
          </AppText>
          <PrimaryButton
            label="התחל סריקה"
            icon="camera-outline"
            onPress={pickPhotoFront}
            style={styles.button}
          />
          {errors.front && <AppText style={styles.error}>{errors.front}</AppText>}
        </View>
      );
    }

    if (phase === 'extracting') {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <AppText style={styles.subtitle}>מחליץ נתונים...</AppText>
        </View>
      );
    }

    if (phase === 'photo-front' || phase === 'photo-back') {
      return (
        <View style={styles.centerContent}>
          <AppText weight="bold" style={styles.title}>
            {phase === 'photo-front' ? 'בחר תמונת קדימה' : 'בחר תמונת אחורה'}
          </AppText>
          <PrimaryButton
            label="בחר תמונה"
            icon="image-outline"
            onPress={phase === 'photo-front' ? pickPhotoFront : pickPhotoBack}
            style={styles.button}
          />
          {(errors.front || errors.back) && (
            <AppText style={styles.error}>{errors.front || errors.back}</AppText>
          )}
        </View>
      );
    }

    if (phase === 'editing') {
      return (
        <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollPadding}>
          <AppText weight="bold" style={styles.sectionTitle}>תמונות שנסרקו</AppText>
          <View style={styles.photosRow}>
            {frontPhoto && <Image source={{ uri: frontPhoto }} style={styles.photo} />}
            {backPhoto && <Image source={{ uri: backPhoto }} style={styles.photo} />}
          </View>

          {frontScan && (
            <Card style={styles.scanCard}>
              <AppText weight="bold" style={styles.label}>טקסט שחולץ (קדימה)</AppText>
              <AppText style={styles.extractedText} numberOfLines={6}>
                {frontScan.rawText}
              </AppText>
            </Card>
          )}

          {backScan && (
            <Card style={styles.scanCard}>
              <AppText weight="bold" style={styles.label}>טקסט שחולץ (אחורה)</AppText>
              <AppText style={styles.extractedText} numberOfLines={6}>
                {backScan.rawText}
              </AppText>
            </Card>
          )}

          <AppText weight="bold" style={styles.sectionTitle}>עריכה ידנית</AppText>

          <Field label="מספר רישיון" error={errors.licenseNumber}>
            <Input
              placeholder="מספר הרישיון"
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              editable={!saving}
              hasError={!!errors.licenseNumber}
              keyboardType="number-pad"
            />
          </Field>

          <Field label="תוקף עד" error={errors.licenseExpiry}>
            <Input
              placeholder="YYYY-MM-DD"
              value={licenseExpiry}
              onChangeText={setLicenseExpiry}
              editable={!saving}
              hasError={!!errors.licenseExpiry}
            />
          </Field>

          <Field label="דרגות רישיון" error={errors.licenseClasses}>
            <Input
              placeholder="B, C1, D"
              value={licenseClasses}
              onChangeText={setLicenseClasses}
              editable={!saving}
              hasError={!!errors.licenseClasses}
            />
          </Field>

          {errors.general && <AppText style={styles.error}>{errors.general}</AppText>}

          <PrimaryButton
            label={saving ? 'שומר...' : 'שמור'}
            icon="checkmark-circle-outline"
            onPress={submit}
            loading={saving}
            style={styles.submitButton}
          />
        </ScrollView>
      );
    }

    return null;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={close} disabled={saving}>
            <AppText weight="bold" style={styles.cancelText}>ביטול</AppText>
          </TouchableOpacity>
          <AppText weight="bold" style={styles.headerTitle}>רישיון נהיגה</AppText>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
          {scanPhaseContent()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7' },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: { fontSize: 16, flex: 1, textAlign: 'center' },
  cancelText: { fontSize: 14, color: COLORS.textMuted },
  placeholder: { width: 60 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACING.lg },
  centerContent: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  scrollContent: { flex: 1 },
  scrollPadding: { paddingVertical: SPACING.lg, paddingHorizontal: SPACING.lg },
  title: { fontSize: 18, marginTop: SPACING.lg, marginBottom: SPACING.sm, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.lg, maxWidth: 280 },
  sectionTitle: { fontSize: 15, marginTop: SPACING.lg, marginBottom: SPACING.md },
  button: { marginTop: SPACING.lg, width: '100%', maxWidth: 200 },
  photosRow: { flexDirection: 'row-reverse', gap: SPACING.md, marginBottom: SPACING.lg },
  photo: { width: 120, height: 80, borderRadius: 8, backgroundColor: COLORS.field },
  scanCard: { marginBottom: SPACING.md, backgroundColor: '#F9F9FB' },
  label: { fontSize: 13, marginBottom: SPACING.sm },
  extractedText: { fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  error: { color: COLORS.dangerText, fontSize: 13, marginTop: SPACING.md, textAlign: 'center' },
  submitButton: { marginTop: SPACING.xl, marginBottom: SPACING.xl },
});
