import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { BrandLoader } from '../components/ui/BrandLoader';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AppText, PrimaryButton, Screen, ScreenHeader } from '../components/ui';
import { useCompany } from '../lib/CompanyContext';
import { downloadSignedRequest, finalizeSigningTemplate, syncSigningRequest } from '../lib/docuseal';
import { COLORS, SPACING } from '../lib/theme';
import { useIsDesktop } from '../lib/useDesktopLayout';
import { DocumentViewer } from '../components/desktop/signing/DocumentViewer.web';
import type { RootStackParamList } from '../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DK, NightBar, HeroButton } from '../components/driverKit';

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
  const base = `<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
    <style>html,body{margin:0;width:100%;height:100%;overflow-x:hidden;background:#f5f5f7}docuseal-form,docuseal-builder{display:block;width:100%;max-width:100%;min-width:0;min-height:100dvh}</style>`;

  if (params.mode === 'document') {
    return `${base}
      <style>
        html,body{background:#c7ced8;overflow-x:hidden;overflow-y:auto}
        #pages{width:100%;min-height:100%;padding:18px 14px 42px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:18px}
        .page{position:relative;width:min(100%,760px);background:#fff;border-radius:5px;overflow:hidden;box-shadow:0 18px 44px rgba(24,35,49,.22),0 3px 10px rgba(24,35,49,.16);animation:page-in 260ms cubic-bezier(.23,1,.32,1) both}
        canvas{display:block;width:100%;height:auto}
        .preview-field{position:absolute;box-sizing:border-box;border:2px dashed #0088cc;background:rgba(0,136,204,.10);color:#075985;display:flex;align-items:center;justify-content:center;font:700 12px sans-serif;pointer-events:none;overflow:hidden}
        .preview-field.stamp{border-color:#7c3aed;background:rgba(124,58,237,.10);color:#6d28d9}
        @keyframes page-in{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion:reduce){.page{animation:none}}
      </style>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>${bridge}</head>
      <body><main id="pages"></main><script>
        (async()=>{try{
          pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          const pdf=await pdfjsLib.getDocument({url:${JSON.stringify(params.src || '')},withCredentials:false}).promise;
          const root=document.getElementById('pages'); const fields=${JSON.stringify(params.previewFields || [])};
          const zeroIndexedPages=fields.some((field)=>field.areas.some((area)=>area.page===0));
          for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber+=1){
            const page=await pdf.getPage(pageNumber); const initial=page.getViewport({scale:1});
            const cssScale=Math.max(.1,Math.min(1.25,(Math.min(window.innerWidth,760)-28)/initial.width)); const pixelRatio=Math.min(window.devicePixelRatio||1,2); const viewport=page.getViewport({scale:cssScale*pixelRatio});
            const pageWrap=document.createElement('section'); pageWrap.className='page'; pageWrap.style.width=(viewport.width/pixelRatio)+'px'; const canvas=document.createElement('canvas'); canvas.width=viewport.width; canvas.height=viewport.height; pageWrap.appendChild(canvas); root.appendChild(pageWrap); await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
            for(const field of fields) for(const area of field.areas){const fieldPage=zeroIndexedPages?area.page+1:area.page;if(fieldPage!==pageNumber)continue;const marker=document.createElement('div');marker.className='preview-field'+(field.type==='stamp'?' stamp':'');marker.style.left=(area.x*100)+'%';marker.style.top=(area.y*100)+'%';marker.style.width=(area.w*100)+'%';marker.style.height=(area.h*100)+'%';marker.textContent=field.type==='stamp'?'חותמת':'חתימה';pageWrap.appendChild(marker)}
          } send('document-ready',{pages:pdf.numPages});
        }catch(error){send('error',error&&error.message?error.message:'PDF load failed')}})();
      </script></body></html>`;
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
  const { companyId, profile } = useCompany();
  const insets = useSafeAreaInsets();
  const isDriver = profile?.role === 'driver';
  const params = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const html = useMemo(() => buildHtml(params), [params]);
  const formRef = useRef<HTMLElement | null>(null);
  const isSigningForm = params.mode === 'sign' || params.mode === 'preview';
  const isDesktop = useIsDesktop();

  const finishSigning = useCallback(async (type: 'completed' | 'declined') => {
    if (!params.requestId) return;
    setSaving(true);
    try {
      await syncSigningRequest(params.requestId);
      if (type === 'completed' && params.returnToDriverDocuments) {
        navigation.reset({
          index: 1,
          routes: [{ name: 'DriverHome' }, { name: 'DriverSigningDocuments' }],
        });
      } else {
        navigation.goBack();
      }
    } catch (err: any) {
      setError(err?.message || 'סנכרון החתימה נכשל');
    } finally {
      setSaving(false);
    }
  }, [navigation, params.requestId, params.returnToDriverDocuments]);

  useEffect(() => {
    const onMessage = async (event: MessageEvent<IframeMessage & { source?: string }>) => {
      if (event.origin !== window.location.origin || event.data?.source !== 'fleetos-docuseal') return;
      try {
        if (event.data.type === 'completed' || event.data.type === 'declined') {
          await finishSigning(event.data.type);
        } else if (event.data.type === 'error') {
          setError(params.mode === 'document' ? 'טעינת המסמך נכשלה' : 'טעינת DocuSeal נכשלה');
        }
      } catch (err: any) {
        setError(err?.message || 'סנכרון החתימה נכשל');
      } finally {
        setSaving(false);
      }
    };
    if (!isSigningForm) window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [finishSigning, isSigningForm, params.mode]);

  // Loading DocuSeal directly into the page keeps iOS Safari's real viewport
  // all the way through to the form. Safari gives an iframe document a wider
  // layout viewport, which is why the signed form was rendered zoomed/cut off.
  useEffect(() => {
    if (!isSigningForm) return;
    const form = formRef.current;
    if (!form) return;
    const host = params.host || 'cdn.docuseal.com';
    const completed = () => { void finishSigning('completed'); };
    const declined = () => { void finishSigning('declined'); };
    form.addEventListener('completed', completed);
    form.addEventListener('declined', declined);

    const scriptId = `fleetos-docuseal-form-${host}`;
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    const ready = () => setLoading(false);
    const failed = () => {
      setLoading(false);
      setError('טעינת DocuSeal נכשלה');
    };
    if (window.customElements?.get('docuseal-form')) {
      ready();
    } else if (script) {
      script.addEventListener('load', ready);
      script.addEventListener('error', failed);
    } else {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://${host}/js/form.js`;
      script.async = true;
      script.addEventListener('load', ready);
      script.addEventListener('error', failed);
      document.head.appendChild(script);
    }
    return () => {
      form.removeEventListener('completed', completed);
      form.removeEventListener('declined', declined);
      script?.removeEventListener('load', ready);
      script?.removeEventListener('error', failed);
    };
  }, [finishSigning, isSigningForm, params.host]);

  // iPhone Safari zooms into any field under 16px when it is focused and
  // stays zoomed, so the document came back too big after typing a name.
  // While a driver signs, the page keeps its own scale (pinch-zoom is still
  // allowed by iOS); the original viewport returns on leaving.
  useEffect(() => {
    if (!isDriver || !isSigningForm) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.content;
    if (!/maximum-scale/.test(original)) meta.content = `${original}, maximum-scale=1`;
    return () => {
      meta.content = original;
    };
  }, [isDriver, isSigningForm]);

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

  const download = async () => {
    if (!params.requestId) return;
    setError('');
    try {
      await downloadSignedRequest({ id: params.requestId, template_title: params.title });
    } catch (err: any) {
      setError(err?.message || 'הורדת המסמך נכשלה');
    }
  };

  const documentUrl = params.src;
  // On a computer a document gets the full-screen viewer; the phone layout
  // below stays for iPhone-size screens.
  if (isDesktop && params.mode === 'document' && documentUrl && !params.previewFields?.length) {
    return <DocumentViewer src={documentUrl} title={params.title} requestId={params.requestId} signedAt={params.signedAt} onClose={() => navigation.goBack()} />;
  }
  const downloadAction = params.allowDownload && params.mode === 'document';
  // Every phone screen wears the night bar; the desktop keeps its header.
  const kit = isDriver || !isDesktop;
  return (
    <Screen style={kit ? styles.driverScreen : undefined}>
      {kit ? (
        <NightBar
          insetTop={insets.top}
          title={params.title}
          subtitle={params.mode === 'builder' ? 'מקמו את שדות החתימה ושמרו' : isSigningForm ? (isDriver ? 'מלא את השדות וחתום' : 'תצוגה מקדימה') : params.mode === 'document' ? 'צפייה במסמך' : undefined}
          onBack={() => navigation.goBack()}
          right={downloadAction ? <HeroButton icon="download-outline" label="הורדת המסמך החתום" onPress={() => void download()} /> : undefined}
        />
      ) : (
        <ScreenHeader
          title={params.title}
          onBack={() => navigation.goBack()}
          right={downloadAction ? (
            <TouchableOpacity style={styles.downloadButton} onPress={() => void download()} accessibilityRole="button" accessibilityLabel="הורדת המסמך החתום">
              <Ionicons name="download-outline" size={20} color={COLORS.accent} />
            </TouchableOpacity>
          ) : undefined}
        />
      )}
      <View style={[styles.webWrap, params.mode === 'document' ? styles.documentSurface : styles.signingSurface]}>
        {isSigningForm ? createElement('docuseal-form', {
          ref: formRef,
          'data-src': params.token ? undefined : params.src,
          'data-token': params.token,
          'data-preview': params.token ? 'true' : undefined,
          'data-host': params.host?.includes('.eu') ? params.host : undefined,
          'data-language': 'he',
          'data-send-copy-email': 'false',
          'data-with-send-copy-button': 'false',
          'data-allow-to-resubmit': 'false',
          'data-custom-css': kit ? DRIVER_FORM_CSS : undefined,
          style: directFormStyle,
        }) : html ? (
          <iframe title={params.title} srcDoc={html} style={iframeStyle} onLoad={() => setLoading(false)} allow="clipboard-read; clipboard-write" />
        ) : null}
        {loading && <View style={styles.loading}><BrandLoader color={COLORS.accent} /></View>}
      </View>
      {!!error && <AppText style={styles.error}>{error}</AppText>}
      {params.mode === 'builder' && <View style={styles.footer}><PrimaryButton label="אשר ושמור כתבנית" icon="checkmark-circle-outline" loading={saving} onPress={finishBuilder} /></View>}
      {params.mode !== 'builder' && saving && <View style={styles.sync}><BrandLoader color={COLORS.accent} /><AppText>שומר את המסמך החתום...</AppText></View>}
    </Screen>
  );
}

const iframeStyle = { border: 0, width: '100%', height: '100%', display: 'block' } as const;
// Pinned to the box under the header. DocuSeal docks its signature pad and
// submit button at the bottom of this element, so it must end exactly where
// the screen does — a 100dvh minimum pushed that button below the fold.
const directFormStyle = { display: 'block', position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, minWidth: 0, overflowY: 'auto' } as const;
// DocuSeal's own inputs at 16px (below that iPhone zooms in on focus), and
// its buttons in the icar blue with thumb-sized height.
const DRIVER_FORM_CSS =
  'input,textarea,select{font-size:16px!important}' +
  '.base-button{background-color:#2F5BFF!important;border-color:#2F5BFF!important;color:#FFFFFF!important;min-height:52px;border-radius:16px!important}';
const styles = StyleSheet.create({
  driverScreen: { backgroundColor: DK.canvas },
  webWrap: { flex: 1, width: '100%', minHeight: 0, overflow: 'hidden' },
  signingSurface: { backgroundColor: COLORS.screen },
  documentSurface: { backgroundColor: '#CDD3DB' },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.screen },
  footer: { padding: SPACING.md, backgroundColor: COLORS.card },
  error: { color: COLORS.dangerText, textAlign: 'center', padding: SPACING.sm },
  sync: { flexDirection: 'row-reverse', gap: SPACING.sm, alignItems: 'center', justifyContent: 'center', padding: SPACING.sm },
  downloadButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: COLORS.accentSoft },
});
