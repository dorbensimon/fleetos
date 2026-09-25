import { loaderCss, loaderSplashHtml } from '../BrandLoader';

/**
 * public/index.html shows the loader before any JS runs, so it carries a
 * static copy of the loader's CSS and markup. This keeps that copy equal to
 * BrandLoader. After changing the loader, regenerate it with:
 *   UPDATE_SPLASH=1 npx jest brandLoaderSplash
 */

// The app's tsconfig has no Node types; this test runs under Node in Jest.
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */

const root = path.resolve(__dirname, '../../..');
const htmlPath = path.join(root, 'public/index.html');
const ring = fs.readFileSync(path.join(root, 'images/icar-loader-ring.png')).toString('base64');

// Same size and background as App.tsx's boot screen, so the handoff is seamless.
const regions = {
  css: `<style data-icar-loader-css>${loaderCss()}</style>`,
  splash:
    '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#F5F5F7">' +
    loaderSplashHtml(83, `data:image/png;base64,${ring}`) +
    '</div>',
};

function region(html: string, name: string) {
  const re = new RegExp(`(<!-- icar-loader-${name}:start -->)([\\s\\S]*?)(<!-- icar-loader-${name}:end -->)`);
  const m = html.match(re);
  if (!m) throw new Error(`public/index.html is missing the icar-loader-${name} markers`);
  return { re, body: m[2] };
}

test('the pre-JS splash in public/index.html matches BrandLoader', () => {
  let html = fs.readFileSync(htmlPath, 'utf8');
  for (const [name, expected] of Object.entries(regions)) {
    const { re, body } = region(html, name);
    if (process.env.UPDATE_SPLASH) html = html.replace(re, `$1${expected}$3`);
    else expect(body).toBe(expected);
  }
  if (process.env.UPDATE_SPLASH) fs.writeFileSync(htmlPath, html);
});
