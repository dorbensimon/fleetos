import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * pdf.js for the desktop signed-documents screens (web only). The worker is
 * served from the CDN at the exact installed version, since Metro doesn't
 * bundle a module worker.
 */
const PDFJS_VERSION = (pdfjs as unknown as { version: string }).version;
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build/pdf.worker.min.mjs`;

export type LoadedPdf = {
  doc: PDFDocumentProxy;
  /** Page sizes in PDF points, 1-based page N at index N-1. */
  pages: { width: number; height: number }[];
};

export async function loadPdf(url: string): Promise<LoadedPdf> {
  const doc = await pdfjs.getDocument({ url }).promise;
  const pages = await Promise.all(
    Array.from({ length: doc.numPages }, async (_, i) => {
      const page = await doc.getPage(i + 1);
      const { width, height } = page.getViewport({ scale: 1 });
      return { width, height };
    }),
  );
  return { doc, pages };
}

/** Draws one page into `canvas` at `cssWidth`, sharp on high-density screens. */
export async function renderPage(doc: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) return;
  await page.render({ canvas, canvasContext: context, viewport }).promise;
}

/**
 * First page of a PDF as a PNG data URL, `cssWidth` wide — small previews in
 * document folders. Loads only page 1, never the whole file's page list.
 */
export async function renderPdfThumbnail(url: string, cssWidth: number): Promise<string | null> {
  const task = pdfjs.getDocument({ url });
  try {
    const doc = await task.promise;
    const canvas = document.createElement('canvas');
    await renderPage(doc, 1, canvas, cssWidth);
    return canvas.toDataURL('image/png');
  } finally {
    void task.destroy();
  }
}
