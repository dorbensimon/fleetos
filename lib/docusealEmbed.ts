import type { RootStackParamList } from '../navigation/types';

/** Escapes a value for an HTML attribute. */
export function attr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * The DocuSeal template builder or signing form page, inside the page head
 * (`base`) and the message bridge of the platform that shows it.
 */
export function docusealEmbedHtml(params: RootStackParamList['DocusealWebView'], base: string, bridge: string): string {
  const host = params.host || 'cdn.docuseal.com';
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
