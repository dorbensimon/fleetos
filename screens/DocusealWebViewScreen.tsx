import { useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { BrandLoader } from '../components/ui/BrandLoader';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { AppText, PrimaryButton, Screen } from '../components/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DK, HeroButton, NightBar } from '../components/driverKit';
import { useCompany } from '../lib/CompanyContext';
import { downloadSignedRequest, finalizeSigningTemplate, syncSigningRequest } from '../lib/docuseal';
import { docusealEmbedHtml } from '../lib/docusealEmbed';
import { COLORS, SPACING } from '../lib/theme';
import type { RootStackParamList } from '../navigation/types';
import { t, textDirection } from '../lib/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'DocusealWebView'>;

function scriptValue(value: string) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function scriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function buildHtml(params: RootStackParamList['DocusealWebView']) {
  const bridge = `<script>
    const send = (type, detail) => window.ReactNativeWebView.postMessage(JSON.stringify({ type, detail }));
    window.addEventListener('error', (event) => send('error', event.message));
  </script>`;
  const base = `<!doctype html><html dir="${textDirection()}"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
    <style>html,body{margin:0;width:100%;height:100%;overflow-x:hidden;background:#cdd3db}docuseal-form,docuseal-builder{display:block;width:100%;max-width:100%;min-width:0;min-height:100dvh}</style>`;

  if (params.mode === 'document') {
    return `${base}
      <style>#pages{width:100%;padding:12px;box-sizing:border-box}.page{position:relative;max-width:100%;margin:0 auto 14px;background:#fff;box-shadow:0 3px 16px rgba(26,35,48,.22)}canvas{display:block;width:100%;height:auto}.preview-field{position:absolute;box-sizing:border-box;border:2px dashed #0e7490;background:rgba(14,116,144,.10);color:#075985;display:flex;align-items:center;justify-content:center;font:700 12px sans-serif;pointer-events:none;overflow:hidden}.preview-field.stamp{border-color:#7c3aed;background:rgba(124,58,237,.10);color:#6d28d9}</style>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>${bridge}</head>
      <body><main id="pages"></main><script>
        (async () => {
          try {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const pdf = await pdfjsLib.getDocument({ url: ${scriptValue(params.src || '')}, withCredentials: false }).promise;
            const root = document.getElementById('pages');
            const fields = ${scriptJson(params.previewFields || [])};
            const zeroIndexedPages = fields.some((field) => field.areas.some((area) => area.page === 0));
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
              const page = await pdf.getPage(pageNumber);
              const initial = page.getViewport({ scale: 1 });
              const cssScale = Math.max(0.1, (window.innerWidth - 16) / initial.width);
              // Drawn at twice the screen's density (within a memory budget),
              // so text stays sharp when the page is pinched to zoom.
              const pixelRatio = Math.min((window.devicePixelRatio || 1) * 2, 4, Math.sqrt(8e6 / (initial.width * initial.height * cssScale * cssScale)));
              const viewport = page.getViewport({ scale: cssScale * pixelRatio });
              const pageWrap = document.createElement('section');
              pageWrap.className = 'page';
              pageWrap.style.width = (viewport.width / pixelRatio) + 'px';
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              pageWrap.appendChild(canvas);
              root.appendChild(pageWrap);
              await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
              for (const field of fields) {
                for (const area of field.areas) {
                  const fieldPage = zeroIndexedPages ? area.page + 1 : area.page;
                  if (fieldPage !== pageNumber) continue;
                  const marker = document.createElement('div');
                  marker.className = 'preview-field' + (field.type === 'stamp' ? ' stamp' : '');
                  marker.style.left = (area.x * 100) + '%';
                  marker.style.top = (area.y * 100) + '%';
                  marker.style.width = (area.w * 100) + '%';
                  marker.style.height = (area.h * 100) + '%';
                  marker.textContent = field.type === 'stamp' ? ${scriptValue(t('company.stampShort'))} : ${scriptValue(t('field.signature'))};
                  pageWrap.appendChild(marker);
                }
              }
            }
            send('document-ready', { pages: pdf.numPages });
          } catch (error) {
            send('error', error && error.message ? error.message : 'PDF load failed');
          }
        })();
      </script></body></html>`;
  }

  return docusealEmbedHtml(params, base, bridge);
}

export default function DocusealWebViewScreen({ navigation, route }: Props) {
  const { companyId } = useCompany();
  const insets = useSafeAreaInsets();
  const params = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (params.mode === 'image') {
    return (
      <Screen style={styles.kitScreen}>
        <NightBar insetTop={insets.top} title={params.title} subtitle={t('docuseal.viewImage')} onBack={() => navigation.goBack()} />
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: params.src }}
            accessibilityLabel={params.title}
            resizeMode="contain"
            style={styles.image}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(t('docuseal.imageLoadFailed'));
            }}
          />
          {loading && <View style={styles.loading}><BrandLoader color={COLORS.accent} /></View>}
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
      setError(err?.message || t('docuseal.templateApproveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    if (!params.requestId) return;
    setError('');
    try {
      await downloadSignedRequest({ id: params.requestId, template_title: params.title });
    } catch (err: any) {
      setError(err?.message || t('signing.downloadFailed'));
    }
  };

  const onMessage = async (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if ((message.type === 'completed' || message.type === 'declined') && params.requestId) {
        setSaving(true);
        await syncSigningRequest(params.requestId);
        if (message.type === 'completed' && params.returnToDriverDocuments) {
          navigation.reset({
            index: 1,
            routes: [{ name: 'DriverHome' }, { name: 'DriverSigningDocuments' }],
          });
        } else {
          navigation.goBack();
        }
      } else if (message.type === 'error') {
        setError(params.mode === 'document' ? t('docuseal.docLoadFailed') : t('docuseal.templateLoadFailed'));
        setLoading(false);
      } else if (message.type === 'document-ready') {
        setLoading(false);
      }
    } catch (err: any) {
      setError(err?.message || t('docuseal.syncFailed'));
      setSaving(false);
    }
  };

  // iOS draws a PDF itself, as vector text that stays sharp at any zoom, so a
  // plain document opens straight in it. Android's WebView cannot show a PDF,
  // and field markers need the pdf.js page, so those keep the drawn pages.
  const nativePdf = Platform.OS === 'ios' && params.mode === 'document' && !!params.src && !params.previewFields?.length;

  return (
    <Screen style={styles.kitScreen}>
      <NightBar
        insetTop={insets.top}
        title={params.title}
        subtitle={params.mode === 'builder' ? t('docuseal.placeFieldsSave') : params.mode === 'document' ? t('signing.viewDocument') : t('docuseal.fillAndSign')}
        onBack={() => navigation.goBack()}
        right={params.allowDownload && params.mode === 'document' ? <HeroButton icon="download-outline" label={t('signing.downloadSigned')} onPress={() => void download()} /> : undefined}
      />
      <View style={styles.webWrap}>
        <WebView
          source={nativePdf ? { uri: params.src! } : { html: buildHtml(params), baseUrl: `https://${params.host || 'cdn.docuseal.com'}` }}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          onMessage={onMessage}
          onLoadEnd={() => (nativePdf || params.mode !== 'document') && setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(params.mode === 'document' ? t('docuseal.docLoadFailed') : t('docuseal.templateLoadFailed'));
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
        {loading && <View style={styles.loading}><BrandLoader color={COLORS.accent} /></View>}
      </View>
      {!!error && <AppText style={styles.error}>{error}</AppText>}
      {params.mode === 'builder' && (
        <View style={styles.footer}>
          <PrimaryButton label={t('docuseal.approveSaveTemplate')} icon="checkmark-circle-outline" loading={saving} onPress={finishBuilder} />
        </View>
      )}
      {params.mode !== 'builder' && saving && (
        <View style={styles.sync}><BrandLoader color={COLORS.accent} /><AppText>{t('docuseal.savingSigned')}</AppText></View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  kitScreen: { backgroundColor: DK.canvas },
  imageWrap: { flex: 1, backgroundColor: COLORS.screen },
  image: { width: '100%', height: '100%' },
  webWrap: { flex: 1, width: '100%', overflow: 'hidden', backgroundColor: COLORS.screen },
  webview: { flex: 1, backgroundColor: COLORS.screen },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.screen },
  footer: { padding: SPACING.md, backgroundColor: COLORS.card },
  error: { color: COLORS.dangerText, textAlign: 'center', padding: SPACING.sm },
  sync: { flexDirection: 'row-reverse', gap: SPACING.sm, alignItems: 'center', justifyContent: 'center', padding: SPACING.sm },
  downloadButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: COLORS.accentSoft },
});
