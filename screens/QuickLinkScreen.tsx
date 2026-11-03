// דף פתוח לנהג מקישור בוואטסאפ: עדכון קילומטראז' או העלאת מסמך
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DK, DK_SPACE, DKText, DriverPage, HeroTitle, PrimaryAction, Surface } from '../components/driverKit';
import { BrandLoader } from '../components/ui/BrandLoader';
import { DateField } from '../components/ui/DateField';
import { QuickLinkStatus } from '../components/quickLink/QuickLinkStatus';
import { ShakeNote } from '../components/quickLink/ShakeNote';
import { statusFromCode, type QuickLinkStatusKind } from '../components/quickLink/statusKinds';
import { FunctionActionError } from '../lib/callFunction';
import { DriverOdometerMobile } from './driver/DriverOdometerMobile';
import { pickFile, readPickedFileBase64 } from '../lib/documents';
import { resolveQuickLink, submitQuickOdometer, uploadQuickDocument, type QuickLinkPage } from '../lib/driverQuickLinks';
import { t } from '../lib/i18n';
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

// מצב סיום לפי קוד השגיאה מהשרת
function statusOf(error: unknown): QuickLinkStatusKind | null {
  return statusFromCode(error instanceof FunctionActionError ? error.code : undefined);
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
  // An end state fills the page (sent, used, expired, no internet...); a fixable mistake stays on the form.
  const [status, setStatus] = useState<{ kind: QuickLinkStatusKind; text?: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [expiryDate, setExpiryDate] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    setStatus(null);
    resolveQuickLink(token)
      .then((data) => {
        if (!active) return;
        setPage(data);
        if (data.odometer != null) setValue(String(data.odometer));
      })
      .catch((error) => active && setStatus({ kind: statusOf(error) ?? 'error' }));
    return () => { active = false; };
  }, [token]);
  useEffect(load, [load]);

  const failed = (error: unknown) => {
    const kind = statusOf(error);
    if (kind) setStatus({ kind });
    else setFormError(errorMessage(error, t('common.tryAgain')));
  };

  // Opened by address there is nothing to go back to: the user's home, or the login screen.
  const back = async () => {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    const result = userId ? await resolveRouteForUser(userId) : null;
    navigation.reset({ index: 0, routes: [{ name: result?.ok ? result.route : 'Login' } as never] });
  };

  const saveOdometer = async () => {
    const next = Number(value);
    if (value.trim() === '' || !Number.isSafeInteger(next)) { setFormError(t('quickLink.badNumber')); return; }
    setFormError(null);
    setSaving(true);
    try {
      await submitQuickOdometer(token, next);
      setStatus({ kind: 'done', text: t('quickLink.odometerDone') });
    } catch (error) {
      failed(error);
    } finally {
      setSaving(false);
    }
  };

  const upload = async () => {
    try {
      const file = await pickFile();
      if (!file) return;
      setFormError(null);
      setSaving(true);
      const base64 = await readPickedFileBase64(file);
      await uploadQuickDocument(token, { fileName: file.name, mimeType: uploadMimeType(file.name, file.mimeType), base64, expiryDate });
      setStatus({ kind: 'done', text: t('quickLink.uploadDone') });
    } catch (error) {
      failed(error);
    } finally {
      setSaving(false);
    }
  };

  if (status) {
    // Done or used up on the server: nothing left to press. A passing problem offers a retry:
    // back to the filled form, or the first load again.
    const passing = status.kind === 'offline' || status.kind === 'error' || status.kind === 'wait';
    return (
      <QuickLinkStatus
        kind={status.kind}
        title={status.kind === 'done' ? t('quickLink.doneTitle') : t(`quickLink.status.${status.kind}.title`)}
        text={status.text ?? t(`quickLink.status.${status.kind}.text`)}
        action={passing ? { label: t('quickLink.retry'), onPress: () => (page ? setStatus(null) : load()) } : undefined}
      />
    );
  }

  if (page?.kind === 'odometer') {
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
        error={formError}
        subtitle={t('quickLink.vehicleOf', { plate: page.plate ?? '', company: page.companyName })}
      />
    );
  }

  const isDocument = page?.kind === 'document';
  // The folder's files carry an expiry: the driver sets the new copy's date before uploading.
  const asksExpiry = isDocument && page.expiry !== 'none';
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
      footer={isDocument ? (
        <PrimaryAction label={needsDate ? t('quickLink.expiryFirst') : t('quickLink.pickFile')} icon="camera" onPress={() => void upload()} loading={saving} disabled={needsDate} />
      ) : undefined}
    >
      <Surface style={styles.card}>
        {!page ? (
          <BrandLoader size="small" />
        ) : (
          <View style={styles.lines}>
            <DKText variant="label">{t('quickLink.hello', { name: page.driverFirstName })}</DKText>
            {asksExpiry && (
              <View style={styles.field}>
                <DKText variant="caption" color={DK.muted}>
                  {page.expiry === 'required' ? t('quickLink.expiryLabel') : t('quickLink.expiryOptional')}
                </DKText>
                <DateField value={expiryDate} onChange={setExpiryDate} />
              </View>
            )}
            {!!formError && <ShakeNote text={formError} />}
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
