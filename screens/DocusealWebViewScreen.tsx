import { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { AppText, PrimaryButton, Screen, ScreenHeader } from '../components/ui';
import { useCompany } from '../lib/CompanyContext';
import { finalizeSigningTemplate, syncSigningRequest } from '../lib/docuseal';
import { COLORS, SPACING } from '../lib/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DocusealWebView'>;

function attr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function scriptValue(value: string) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function buildHtml(params: RootStackParamList['DocusealWebView']) {
  const host = params.host || 'cdn.docuseal.com';
  const hostAttribute = host.includes('.eu') ? ` data-host="${host}"` : '';
  const bridge = `<script>
    const send = (type, detail) => window.ReactNativeWebView.postMessage(JSON.stringify({ type, detail }));
    window.addEventListener('error', (event) => send('error', event.message));
  </script>`;
  const base = `<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
    <style>html,body{margin:0;height:100%;background:#f5f5f7}docuseal-form,docuseal-builder{display:block;min-height:100vh}</style>`;

  if (params.mode === 'document') {
    return `${base}
      <style>#pages{padding:8px}canvas{display:block;max-width:100%;height:auto;margin:0 auto 10px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.12)}</style>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>${bridge}</head>
      <body><main id="pages"></main><script>
        (async () => {
          try {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const pdf = await pdfjsLib.getDocument({ url: ${scriptValue(params.src || '')}, withCredentials: false }).promise;
            const root = document.getElementById('pages');
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
              const page = await pdf.getPage(pageNumber);
              const initial = page.getViewport({ scale: 1 });
              const cssScale = Math.max(0.1, (window.innerWidth - 16) / initial.width);
              const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
              const viewport = page.getViewport({ scale: cssScale * pixelRatio });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              canvas.style.width = (viewport.width / pixelRatio) + 'px';
              canvas.style.height = (viewport.height / pixelRatio) + 'px';
              root.appendChild(canvas);
              await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            }
            send('document-ready', { pages: pdf.numPages });
          } catch (error) {
            send('error', error && error.message ? error.message : 'PDF load failed');
          }
        })();
      </script></body></html>`;
  }

  if (params.mode === 'builder') {
    return `${base}<script src="https://${host}/js/builder.js"></script>${bridge}</head><body>
      <docuseal-builder id="builder" data-token="${attr(params.token || '')}"${hostAttribute} data-language="he"
        data-roles="Driver" data-field-types="signature" data-draw-field-type="signature"
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

  if (params.mode === 'image') {
    return (
      <Screen>
        <ScreenHeader title={params.title} onBack={() => navigation.goBack()} />
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: params.src }}
            resizeMode="contain"
            style={styles.image}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError('טעינת התמונה נכשלה');
            }}
          />
          {loading && <View style={styles.loading}><ActivityIndicator color={COLORS.accent} /></View>}
        </View>
        {!!error && <AppText style={styles.error}>{error}</AppText>}
      </Screen>
    );
  }

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

  const onMessage = async (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if ((message.type === 'completed' || message.type === 'declined') && params.requestId) {
        setSaving(true);
        await syncSigningRequest(params.requestId);
        navigation.goBack();
      } else if (message.type === 'error') {
        setError(params.mode === 'document' ? 'טעינת המסמך נכשלה' : 'טעינת DocuSeal נכשלה');
        setLoading(false);
      } else if (message.type === 'document-ready') {
        setLoading(false);
      }
    } catch (err: any) {
      setError(err?.message || 'סנכרון החתימה נכשל');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title={params.title} onBack={() => navigation.goBack()} />
      <View style={styles.webWrap}>
        <WebView
          source={{ html: buildHtml(params), baseUrl: `https://${params.host || 'cdn.docuseal.com'}` }}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          onMessage={onMessage}
          onLoadEnd={() => params.mode !== 'document' && setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(params.mode === 'document' ? 'טעינת המסמך נכשלה' : 'טעינת DocuSeal נכשלה');
          }}
          originWhitelist={['https://*', 'about:*']}
          onShouldStartLoadWithRequest={({ url }) =>
            url === 'about:blank'
            || url.startsWith('data:')
            || url.startsWith('blob:')
            || /^https:\/\/cdnjs\.cloudflare\.com\//i.test(url)
            || /^https:\/\/[a-z0-9-]+\.supabase\.co\//i.test(url)
            || /^https:\/\/([a-z0-9-]+\.)?docuseal\.(com|eu)(\/|$)/i.test(url)
          }
          style={styles.webview}
        />
        {loading && <View style={styles.loading}><ActivityIndicator color={COLORS.accent} /></View>}
      </View>
      {!!error && <AppText style={styles.error}>{error}</AppText>}
      {params.mode === 'builder' && (
        <View style={styles.footer}>
          <PrimaryButton label="אשר ושמור כתבנית" icon="checkmark-circle-outline" loading={saving} onPress={finishBuilder} />
        </View>
      )}
      {params.mode !== 'builder' && saving && (
        <View style={styles.sync}><ActivityIndicator color={COLORS.accent} /><AppText>שומר את המסמך החתום...</AppText></View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  imageWrap: { flex: 1, backgroundColor: COLORS.screen },
  image: { width: '100%', height: '100%' },
  webWrap: { flex: 1, backgroundColor: COLORS.screen },
  webview: { flex: 1, backgroundColor: COLORS.screen },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.screen },
  footer: { padding: SPACING.md, backgroundColor: COLORS.card },
  error: { color: COLORS.dangerText, textAlign: 'center', padding: SPACING.sm },
  sync: { flexDirection: 'row-reverse', gap: SPACING.sm, alignItems: 'center', justifyContent: 'center', padding: SPACING.sm },
});
