// דף פתוח לנהג מקישור בוואטסאפ: עדכון קילומטראז' או העלאת מסמך
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DK, DK_SPACE, DKText, DriverPage, HeroTitle, PrimaryAction, Surface } from '../components/driverKit';
import { BrandLoader } from '../components/ui/BrandLoader';
import { DateField } from '../components/ui/DateField';
import { DriverOdometerMobile } from './driver/DriverOdometerMobile';
import { pickFile, readPickedFileBase64 } from '../lib/documents';
import { resolveQuickLink, submitQuickOdometer, uploadQuickDocument, type QuickLinkPage } from '../lib/driverQuickLinks';
import { t } from '../lib/i18n';
import { showAlert } from '../lib/platformAlert';
import { errorMessage } from '../lib/requestError';
import { resolveRouteForUser } from '../lib/session';
import { supabase } from '../lib/supabase';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'QuickLink'>;

const TYPE_BY_EXTENSION: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heic' };

// סוג הקובץ: חלק מהטלפונים לא מוסרים אותו, אז לפי הסיומת
/** Some phone pickers report no type (octet-stream) or image/heif; the server takes the types it knows. */
export function uploadMimeType(fileName: string, reported: string): string {
  if (reported === 'image/heif') return 'image/heic';
  if (reported && reported !== 'application/octet-stream') return reported;
  return TYPE_BY_EXTENSION[fileName.split('.').pop()?.toLowerCase() ?? ''] ?? reported;
}

// המסך
/**
 * Opened from the personal link a manager sent on WhatsApp, without
 * signing in (driver-quick-link). It does one thing: the odometer of one
 * vehicle, or a new copy of one document.
 */
export default function QuickLinkScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const token = route.params?.token ?? '';
  const [page, setPage] = useState<QuickLinkPage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploads, setUploads] = useState(0);
  const [expiryDate, setExpiryDate] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resolveQuickLink(token)
      .then((data) => {
        if (!active) return;
        setPage(data);
        setUploads(data.uploads);
        if (data.odometer != null) setValue(String(data.odometer));
      })
      .catch((error) => active && setMessage(errorMessage(error, t('quickLink.invalid'))));
    return () => { active = false; };
  }, [token]);

  // Opened by address there is nothing to go back to: the user's home, or the login screen.
  const back = async () => {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    const result = userId ? await resolveRouteForUser(userId) : null;
    navigation.reset({ index: 0, routes: [{ name: result?.ok ? result.route : 'Login' } as never] });
  };

  const saveOdometer = async () => {
    const next = Number(value);
    if (value.trim() === '' || !Number.isSafeInteger(next)) { showAlert(t('quickLink.badNumber')); return; }
    setSaving(true);
    try {
      await submitQuickOdometer(token, next);
      setPage(null);
      setMessage(t('quickLink.odometerDone'));
    } catch (error) {
      showAlert(t('common.updateFailed'), errorMessage(error, t('common.tryAgain')));
    } finally {
      setSaving(false);
    }
  };

  const upload = async () => {
    try {
      const file = await pickFile();
      if (!file) return;
      setSaving(true);
      const base64 = await readPickedFileBase64(file);
      const result = await uploadQuickDocument(token, { fileName: file.name, mimeType: uploadMimeType(file.name, file.mimeType), base64, expiryDate });
      setUploads(result.uploads);
    } catch (error) {
      showAlert(t('common.updateFailed'), errorMessage(error, t('common.tryAgain')));
    } finally {
      setSaving(false);
    }
  };

  if (page?.kind === 'odometer' && !message) {
    return (
      <DriverOdometerMobile
        insetTop={insets.top}
        insetBottom={insets.bottom}
        current={page.odometer ?? 0}
        value={value}
        onChange={setValue}
        saving={saving}
        onSave={() => void saveOdometer()}
        onBack={() => void back()}
        subtitle={t('quickLink.vehicleOf', { plate: page.plate ?? '', company: page.companyName })}
      />
    );
  }

  const isDocument = page?.kind === 'document';
  const full = isDocument && uploads >= page.maxUploads;
  // The folder's files carry an expiry: the driver sets the new copy's date before uploading.
  const asksExpiry = isDocument && page.expiry !== 'none' && !full;
  const needsDate = isDocument && page.expiry === 'required' && !expiryDate;
  return (
    <DriverPage
      insetTop={insets.top}
      insetBottom={insets.bottom}
      hero={
        <HeroTitle
          title={isDocument ? t('quickLink.documentTitle') : 'iCar'}
          subtitle={isDocument ? `${page.title ?? ''} · ${page.companyName}` : undefined}
          onBack={() => void back()}
        />
      }
      footer={isDocument && !full ? (
        <PrimaryAction label={needsDate ? t('quickLink.expiryFirst') : t('quickLink.pickFile')} icon="camera" onPress={() => void upload()} loading={saving} disabled={needsDate} />
      ) : undefined}
    >
      <Surface style={styles.card}>
        {!page && !message ? (
          <BrandLoader size="small" />
        ) : (
          <View style={styles.lines}>
            {!!page && <DKText variant="label">{t('quickLink.hello', { name: page.driverFirstName })}</DKText>}
            {asksExpiry && (
              <View style={styles.field}>
                <DKText variant="caption" color={DK.muted}>
                  {page.expiry === 'required' ? t('quickLink.expiryLabel') : t('quickLink.expiryOptional')}
                </DKText>
                <DateField value={expiryDate} onChange={setExpiryDate} />
              </View>
            )}
            {isDocument && uploads > 0 && (
              <DKText variant="caption" color={DK.muted}>
                {t('quickLink.uploaded', { count: uploads, max: page.maxUploads })}
              </DKText>
            )}
            {!!message && <DKText variant="caption" color={DK.muted}>{message}</DKText>}
          </View>
        )}
      </Surface>
    </DriverPage>
  );
}

// עיצוב
const styles = StyleSheet.create({
  card: { paddingVertical: 22, paddingHorizontal: DK_SPACE.lg },
  lines: { gap: 10 },
  field: { gap: 6 },
});
