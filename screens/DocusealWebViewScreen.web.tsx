import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, PrimaryButton, Screen, ScreenHeader } from '../components/ui';
import { useCompany } from '../lib/CompanyContext';
import { finalizeSigningTemplate, syncSigningRequest } from '../lib/docuseal';
import { COLORS, SPACING } from '../lib/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DocusealWebView'>;
type IframeMessage = { type?: 'completed' | 'declined' | 'saved' | 'error' };

function attr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function buildHtml(params: RootStackParamList['DocusealWebView']) {
  const host = params.host || 'cdn.docuseal.com';
  const hostAttribute = host.includes('.eu') ? ` data-host="${host}"` : '';
  const bridge = `<script>
    const send = (type, detail) => window.parent.postMessage({ source: 'fleetos-docuseal', type, detail }, window.location.origin);
    window.addEventListener('error', (event) => send('error', event.message));
  </script>`;
  const base = `<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html,body{margin:0;height:100%;background:#f5f5f7}docuseal-form,docuseal-builder{display:block;min-height:100vh}</style>`;

  if (params.mode === 'document') {
    return null;
  }

  // Let the browser render uploaded images inside a constrained viewer.
  // Loading an image URL directly in an iframe makes mobile Safari display
  // it at its original (often very large) pixel dimensions.
  if (params.mode === 'image') {
    return `${base}<style>body{display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}</style></head><body><img src="${attr(params.src || '')}" alt="${attr(params.title)}" /></body></html>`;
  }

  if (params.mode === 'builder') {
    return `${base}<script src="https://${host}/js/builder.js"></script>${bridge}</head><body>
      <docuseal-builder id="builder" data-token="${attr(params.token || '')}"${hostAttribute} data-language="he"
        data-roles="Driver" data-field-types="signature,stamp" data-draw-field-type="signature"
        data-with-send-button="false" data-with-upload-button="false" data-with-sign-yourself-button="false"
        data-with-title="false" data-with-documents-list="false"></docuseal-builder>
      <script>document.getElementById('builder').addEventListener('save', (e) => send('saved', e.detail));</script>
    </body></html>`;
  }

  const source = params.token
    ? `data-token="${attr(params.token)}" data-preview="true"`
    : `data-src="${attr(params.src || '')}"`;
  return `${base}<script src="https://${host}/js/form.js"></script>${bridge}</head><body>
    <docuseal-form id="form" ${source}${hostAttribute} data-language="he" data-send-copy-email="false"
      data-with-send-copy-button="false" data-allow-to-resubmit="false"></docuseal-form>
    <script>
      document.getElementById('form').addEventListener('completed', (e) => send('completed', e.detail));
      document.getElementById('form').addEventListener('declined', (e) => send('declined', e.detail));
    </script>
  </body></html>`;
}

export default function DocusealWebViewScreen({ navigation, route }: Props) {
  const { companyId } = useCompany();
  const params = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const html = useMemo(() => buildHtml(params), [params]);

  useEffect(() => {
    const onMessage = async (event: MessageEvent<IframeMessage & { source?: string }>) => {
      if (event.origin !== window.location.origin || event.data?.source !== 'fleetos-docuseal') return;
      try {
        if ((event.data.type === 'completed' || event.data.type === 'declined') && params.requestId) {
          setSaving(true);
          await syncSigningRequest(params.requestId);
          navigation.goBack();
        } else if (event.data.type === 'error') {
          setError(params.mode === 'document' ? 'טעינת המסמך נכשלה' : 'טעינת DocuSeal נכשלה');
        }
      } catch (err: any) {
        setError(err?.message || 'סנכרון החתימה נכשל');
      } finally {
        setSaving(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigation, params.mode, params.requestId]);

  const finishBuilder = async () => {
    if (!companyId || !params.templateId) return;
    setSaving(true);
    setError('');
    try {
      await finalizeSigningTemplate(companyId, params.templateId);
      navigation.goBack();
    } catch (err: any) {
      setError(err?.message || 'אישור התבנית נכשל');
    } finally {
      setSaving(false);
    }
  };

  const documentUrl = params.src;
  return (
    <Screen>
      <ScreenHeader title={params.title} onBack={() => navigation.goBack()} />
      <View style={styles.webWrap}>
        {documentUrl && !html ? (
          <iframe title={params.title} src={documentUrl} style={iframeStyle} onLoad={() => setLoading(false)} onError={() => { setLoading(false); setError('טעינת המסמך נכשלה'); }} />
        ) : html ? (
          <iframe title={params.title} srcDoc={html} style={iframeStyle} onLoad={() => setLoading(false)} allow="clipboard-read; clipboard-write" />
        ) : null}
        {loading && <View style={styles.loading}><ActivityIndicator color={COLORS.accent} /></View>}
      </View>
      {!!error && <AppText style={styles.error}>{error}</AppText>}
      {params.mode === 'builder' && <View style={styles.footer}><PrimaryButton label="אשר ושמור כתבנית" icon="checkmark-circle-outline" loading={saving} onPress={finishBuilder} /></View>}
      {params.mode !== 'builder' && saving && <View style={styles.sync}><ActivityIndicator color={COLORS.accent} /><AppText>שומר את המסמך החתום...</AppText></View>}
    </Screen>
  );
}

const iframeStyle = { border: 0, width: '100%', height: '100%', display: 'block' } as const;
const styles = StyleSheet.create({
  webWrap: { flex: 1, backgroundColor: COLORS.screen },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.screen },
  footer: { padding: SPACING.md, backgroundColor: COLORS.card },
  error: { color: COLORS.dangerText, textAlign: 'center', padding: SPACING.sm },
  sync: { flexDirection: 'row-reverse', gap: SPACING.sm, alignItems: 'center', justifyContent: 'center', padding: SPACING.sm },
});
