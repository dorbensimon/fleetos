// קריאה וציור של PDF בדפדפן (pdf.js)
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// גרסת pdf.js
/**
 * pdf.js for the desktop signed-documents screens (web only). The worker is
 * served from the CDN at the exact installed version, since Metro doesn't
 * bundle a module worker.
 */
const PDFJS_VERSION = (pdfjs as unknown as { version: string }).version;
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build/pdf.worker.min.mjs`;

// דפדפני אפל מציגים גופנים מוטמעים בצורה שבורה
/**
 * Safari (every browser on iPhone/iPad is Safari underneath) can reject the
 * fonts pdf.js rebuilds from a PDF's embedded fonts and silently falls back to
 * a system font: Hebrew letters come out the wrong shape and spread apart.
 * There pdf.js draws each glyph itself instead of loading the font.
 */
function needsDrawnGlyphs(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const appleMobile = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const desktopSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua);
  return appleMobile || desktopSafari;
}

// פתיחת קובץ PDF
function openPdf(url: string) {
  return pdfjs.getDocument({ url, disableFontFace: needsDrawnGlyphs() });
}

export type LoadedPdf = {
  doc: PDFDocumentProxy;
  /** Page sizes in PDF points, 1-based page N at index N-1. */
  pages: { width: number; height: number }[];
};

// טוען PDF מכתובת
export async function loadPdf(url: string): Promise<LoadedPdf> {
  const doc = await openPdf(url).promise;
  const pages = await Promise.all(
    Array.from({ length: doc.numPages }, async (_, i) => {
      const page = await doc.getPage(i + 1);
      const { width, height } = page.getViewport({ scale: 1 });
      return { width, height };
    }),
  );
  return { doc, pages };
}

// מצייר עמוד
/** Draws one page into `canvas` at `cssWidth`, sharp on high-density screens. */
export async function renderPage(doc: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) return;
  await page.render({ canvas, canvasContext: context, viewport }).promise;
}

// תמונה קטנה של העמוד הראשון
/**
 * First page of a PDF as a PNG data URL, `cssWidth` wide — small previews in
 * document folders. Loads only page 1, never the whole file's page list.
 */
export async function renderPdfThumbnail(url: string, cssWidth: number): Promise<string | null> {
  const task = openPdf(url);
  try {
    const doc = await task.promise;
    const canvas = document.createElement('canvas');
    await renderPage(doc, 1, canvas, cssWidth);
    return canvas.toDataURL('image/png');
  } finally {
    void task.destroy();
  }
}
