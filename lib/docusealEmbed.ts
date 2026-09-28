import type { RootStackParamList } from '../navigation/types';
import { getLanguage } from './i18n';

/** Escapes a value for an HTML attribute. */
export function attr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** A value as a script literal, safe inside an HTML <script> (no "</script>" can end it early). */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * The DocuSeal host whose scripts the page loads. It arrives in the screen's
 * params, which a link can set, so only DocuSeal's own hosts are accepted.
 */
export function docusealHost(host: string | null | undefined): string {
  return host && DOCUSEAL_HOST.test(host) ? host : 'cdn.docuseal.com';
}

const DOCUSEAL_HOST = /^([a-z0-9-]+\.)*docuseal\.(com|eu)$/i;

/**
 * The screen's params with a document address the page may open: a link can
 * set it, so only https, blob and data addresses are kept (never javascript:).
 */
export function withSafeSrc<T extends { src?: string }>(params: T): T {
  if (!params.src) return params;
  try {
    return ['https:', 'blob:', 'data:'].includes(new URL(params.src).protocol) ? params : { ...params, src: undefined };
  } catch {
    return { ...params, src: undefined };
  }
}

/** A signing form's address, only when it is on DocuSeal: it too can come from a link. */
export function docusealFormSrc(src: string | null | undefined): string {
  try {
    const url = new URL(src ?? '');
    return url.protocol === 'https:' && DOCUSEAL_HOST.test(url.hostname) ? url.href : '';
  } catch {
    return '';
  }
}

/**
 * Documents with more than a signature to fill stay in DocuSeal's form; its
 * signature box is drawn like the app's own pad (components/checklist/
 * SignaturePad): white, a dashed blue frame, round corners. Together with
 * `data-allow-typed-signature="false"` it is drawing only, as in the app.
 */
export const SIGNATURE_PAD_CSS =
  'canvas{background:#fff!important;border:2px dashed rgba(47,91,255,.28)!important;border-radius:20px!important;min-height:190px;touch-action:none}';

/**
 * DocuSeal's own words on the signing form, in the app's language. It has
 * Hebrew, Arabic and English but no Russian, so Russian gets English. The
 * form reads in the direction of the page it is on.
 */
export function docusealFormLanguage(): string {
  const language = getLanguage();
  return language === 'ru' ? 'en' : language;
}

/**
 * The DocuSeal template builder or signing form page, inside the page head
 * (`base`) and the message bridge of the platform that shows it.
 */
export function docusealEmbedHtml(params: RootStackParamList['DocusealWebView'], base: string, bridge: string): string {
  const host = docusealHost(params.host);
  const hostAttribute = host.includes('.eu') ? ` data-host="${host}"` : '';

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
    : `data-src="${attr(docusealFormSrc(params.src))}"`;
  return `${base}<script src="https://${host}/js/form.js"></script>${bridge}</head><body>
    <docuseal-form id="form" ${source}${hostAttribute} data-language="${docusealFormLanguage()}" data-send-copy-email="false"
      data-with-send-copy-button="false" data-allow-to-resubmit="false"
      data-allow-typed-signature="false" data-reuse-signature="true" data-remember-signature="false"
      data-custom-css="${attr(SIGNATURE_PAD_CSS)}"></docuseal-form>
    <script>
      document.getElementById('form').addEventListener('completed', (e) => send('completed', e.detail));
      document.getElementById('form').addEventListener('declined', (e) => send('declined', e.detail));
    </script>
  </body></html>`;
}
