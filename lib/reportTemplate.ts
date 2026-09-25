// Shared HTML/PDF report shell — a clean white card on a light slate page:
// the system font stack (SF on Apple devices), a header with the title, the
// company line and the issue date over a dark rule, blue section titles with
// a hairline underneath, a three-column field grid (two on phones), pill
// status badges and a centered footer. Used by driverReport.ts,
// vehicleReport.ts, driverSnapshotReport.ts and procedure6Report.ts so every
// document the app exports shares one look.

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export type TagTone = 'accent' | 'accent2' | 'neutral' | 'outline';

export function esc(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function statusTag(label: string, tone: TagTone): string {
  const cls =
    tone === 'accent'
      ? 'tag tag-ok'
      : tone === 'accent2'
      ? 'tag tag-danger'
      : tone === 'outline'
      ? 'tag tag-warn'
      : 'tag tag-neutral';
  return `<span class="${cls}">${esc(label)}</span>`;
}

export function emptyState(text: string): string {
  return `<div class="empty-state">${esc(text)}</div>`;
}

export interface ReportMetaColumn {
  label: string;
  value: string;
  sub?: string;
  ltr?: boolean;
  /** Large accent number, pushed to the far side — e.g. total row count. */
  big?: boolean;
  /** Pushes this column to the opposite edge of the row (margin-inline-start: auto). */
  pushEnd?: boolean;
}

function metaColumnHtml(col: ReportMetaColumn): string {
  const valueClass = col.big ? 'meta-value meta-value-big' : col.ltr ? 'meta-value ltr' : 'meta-value';
  return `
    <div class="meta-col${col.pushEnd ? ' meta-col-push' : ''}">
      <div class="meta-label">${esc(col.label)}</div>
      <div class="${valueClass}">${esc(col.value) || '—'}</div>
      ${col.sub ? `<div class="meta-sub${col.ltr ? ' ltr' : ''}">${esc(col.sub)}</div>` : ''}
    </div>`;
}

export function todayHe(): string {
  return new Date().toLocaleDateString('he-IL');
}

const REPORT_STYLES = `
  :root {
    --primary: #2563eb;
    --text-main: #0f172a;
    --text-muted: #64748b;
    --border: #e2e8f0;
    --bg: #f8fafc;
    --card-bg: #ffffff;
    --ok-bg: #d1fae5;
    --ok-text: #047857;
    --warn-bg: #fef3c7;
    --warn-text: #b45309;
    --danger-bg: #fee2e2;
    --danger-text: #b91c1c;
    --neutral-bg: #f1f5f9;
    --neutral-text: #475569;
  }

  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    direction: rtl;
    color: var(--text-main);
    background-color: var(--bg);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Heebo', sans-serif;
    -webkit-font-smoothing: antialiased;
    -webkit-text-size-adjust: 100%;
  }
  body { padding: 2rem; display: flex; justify-content: center; }

  .page {
    background: var(--card-bg);
    width: 100%;
    max-width: 800px;
    border-radius: 16px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
    padding: 2.5rem;
    border: 1px solid var(--border);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
    border-bottom: 2px solid var(--text-main);
    padding-bottom: 1.5rem;
    margin-bottom: 2.5rem;
  }
  .header-title h1 { margin: 0; font-size: 1.5rem; font-weight: 700; line-height: 1.3; }
  .company-info { margin-top: 0.5rem; color: var(--text-muted); font-size: 0.875rem; }
  .company-info strong { color: var(--text-main); }
  .header-meta { text-align: left; font-size: 0.875rem; color: var(--text-muted); flex: none; }
  .header-meta strong { color: var(--text-main); font-variant-numeric: tabular-nums; }

  h2.section-title {
    color: var(--primary);
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0 0 1.5rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.5rem;
  }

  .grid, .meta-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    row-gap: 1.5rem;
    column-gap: 2rem;
    margin-bottom: 2.5rem;
  }
  .meta-col { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
  .meta-col-push { text-align: left; }
  .meta-label { font-size: 0.875rem; color: var(--text-muted); font-weight: 500; }
  .meta-value { font-size: 1rem; font-weight: 600; color: var(--text-main); font-variant-numeric: tabular-nums; overflow-wrap: break-word; }
  .meta-value-big { font-size: 1.5rem; font-weight: 700; color: var(--primary); }
  .meta-sub { font-size: 0.8125rem; color: var(--text-muted); }
  .ltr { direction: ltr; unicode-bidi: isolate; text-align: right; }

  .link { color: var(--primary); text-decoration: none; }

  .table { width: 100%; border-collapse: collapse; font-size: 0.875rem; margin-bottom: 2.5rem; }
  .table th {
    text-align: right;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-muted);
    padding: 0 0.75rem 0.625rem;
    border-bottom: 1px solid var(--border);
  }
  .table td {
    text-align: right;
    padding: 0.75rem;
    border-bottom: 1px solid var(--border);
    font-variant-numeric: tabular-nums;
  }
  .table tbody tr:last-child td { border-bottom: none; }
  .table .group-row td {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-muted);
    background: var(--bg);
  }
  .text-muted { color: var(--text-muted); }

  .tag {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    white-space: nowrap;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.875rem;
    font-weight: 600;
  }
  .tag-ok { background-color: var(--ok-bg); color: var(--ok-text); }
  .tag-warn { background-color: var(--warn-bg); color: var(--warn-text); }
  .tag-danger { background-color: var(--danger-bg); color: var(--danger-text); }
  .tag-neutral { background-color: var(--neutral-bg); color: var(--neutral-text); }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--text-muted);
    background: #f1f5f9;
    border-radius: 8px;
    font-size: 0.875rem;
    margin-bottom: 2.5rem;
  }

  .footnote-mark { margin-bottom: 0.4rem; line-height: 0; }
  .footnote-mark svg { display: inline-block; }
  .footnote {
    text-align: center;
    margin-top: 3.5rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    border-top: 1px solid var(--border);
    padding-top: 1.5rem;
  }

  @media (max-width: 600px) {
    body { padding: 1rem; }
    .page { padding: 1.5rem; }
    .grid, .meta-row { grid-template-columns: 1fr 1fr; }
    .header { flex-direction: column; align-items: flex-start; gap: 1rem; }
    .header-meta { text-align: right; }
  }

  @media print {
    html, body { background: #ffffff; }
    body { padding: 0; display: block; }
    .page { max-width: none; border: none; box-shadow: none; border-radius: 0; padding: 0; }
    h2.section-title, .grid, .table tr { break-inside: avoid; }
  }
`;

export interface ReportDocumentOptions {
  title: string;
  generatedAt?: string;
  /** Shown under the title as "חברה: <name> | ח.פ: <id>". */
  company?: { name: string; businessId?: string | null };
  /** Extra header facts, rendered as a field grid under the header. */
  metaColumns?: ReportMetaColumn[];
  bodyHtml: string;
  footerNote?: string;
}

/** icar lockup (deliverables/branding/icar-logo-v2/prod/logo-on-light.svg), inlined so it prints everywhere. */
const ICAR_REPORT_MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10.6 7.5 311.9 87.5" width="64" height="18" role="img" aria-label="icar"><defs><linearGradient id="icar-g" x1="0.15" y1="0.2" x2="0.9" y2="0.95"><stop offset="0" stop-color="#19C6F0"/><stop offset="1" stop-color="#2F5BFF"/></linearGradient></defs><path d="M82.99 55.82 L82.80 56.84 L82.59 57.87 L82.35 58.88 L82.07 59.89 L81.77 60.90 L81.44 61.89 L81.08 62.87 L80.69 63.85 L80.27 64.81 L79.82 65.76 L79.34 66.70 L78.83 67.62 L78.30 68.53 L77.73 69.42 L77.14 70.30 L76.53 71.15 L75.88 71.99 L75.21 72.81 L74.52 73.62 L73.79 74.40 L73.05 75.15 L72.28 75.89 L71.49 76.60 L70.67 77.29 L69.84 77.96 L68.98 78.60 L68.10 79.21 L67.21 79.80 L66.29 80.36 L65.36 80.89 L64.40 81.40 L63.44 81.87 L62.45 82.32 L61.46 82.74 L60.44 83.12 L59.42 83.48 L58.38 83.80 L57.34 84.10 L56.28 84.36 L55.21 84.58 L54.14 84.78 L53.06 84.94 L51.97 85.07 L50.88 85.17 L49.78 85.23 L48.68 85.26 L47.58 85.25 L46.48 85.21 L45.37 85.14 L44.27 85.03 L43.17 84.89 L42.08 84.71 L40.99 84.50 L39.90 84.25 L38.82 83.97 L37.75 83.66 L36.68 83.32 L35.63 82.94 L34.59 82.52 L33.55 82.08 L32.53 81.60 L31.53 81.09 L30.54 80.55 L29.56 79.98 L28.60 79.37 L27.66 78.74 L26.74 78.07 L25.84 77.38 L24.95 76.66 L24.09 75.91 L23.25 75.13 L22.44 74.32 L21.65 73.49 L20.88 72.63 L20.14 71.75 L19.42 70.85 L18.74 69.92 L18.08 68.97 L17.45 67.99 L16.84 67.00 L16.27 65.98 L15.73 64.95 L15.22 63.90 L14.75 62.83 L14.30 61.75 L13.89 60.65 L13.52 59.53 L13.17 58.41 L12.86 57.27 L12.59 56.12 L12.35 54.96 L12.15 53.79 L11.98 52.61 L11.85 51.43 L11.76 50.24 L11.70 49.04 L11.69 47.85 L11.70 46.65 L11.76 45.45 L11.85 44.25 L11.98 43.05 L12.15 41.86 L12.35 40.66 L12.60 39.48 L12.88 38.29 L13.19 37.12 L13.55 35.95 L13.94 34.80 L14.36 33.65 L14.83 32.52 L15.33 31.40 L15.86 30.29 L16.43 29.20 L17.04 28.12 L17.68 27.06 L18.35 26.03 L19.05 25.01 L19.79 24.01 L20.56 23.03 L21.37 22.07 L22.20 21.14 L23.06 20.23 L23.96 19.35 L24.88 18.50 L25.83 17.67 L26.80 16.87 L27.81 16.11 L28.84 15.37 L29.89 14.66 L30.96 13.98 L32.06 13.34 L33.18 12.73 L34.32 12.15 L35.48 11.61 L36.66 11.11 L37.86 10.64 L39.07 10.20 L40.30 9.81 L41.54 9.45 L42.79 9.13 L46.44 29.81 L45.80 29.86 L45.15 29.92 L44.51 30.01 L43.87 30.12 L43.23 30.25 L42.59 30.40 L41.95 30.57 L41.32 30.76 L40.69 30.97 L40.07 31.20 L39.45 31.46 L38.84 31.73 L38.23 32.02 L37.63 32.34 L37.04 32.67 L36.46 33.03 L35.89 33.40 L35.33 33.79 L34.79 34.21 L34.25 34.64 L33.72 35.09 L33.21 35.55 L32.71 36.04 L32.23 36.54 L31.76 37.06 L31.30 37.59 L30.87 38.14 L30.44 38.71 L30.04 39.29 L29.65 39.89 L29.28 40.50 L28.93 41.12 L28.60 41.75 L28.29 42.40 L27.99 43.06 L27.72 43.73 L27.47 44.41 L27.24 45.10 L27.03 45.80 L26.84 46.51 L26.68 47.22 L26.53 47.95 L26.41 48.68 L26.31 49.41 L26.24 50.15 L26.19 50.89 L26.16 51.64 L26.16 52.39 L26.18 53.14 L26.22 53.89 L26.29 54.64 L26.38 55.39 L26.50 56.14 L26.64 56.89 L26.80 57.63 L26.99 58.37 L27.20 59.11 L27.44 59.84 L27.70 60.57 L27.98 61.29 L28.29 62.00 L28.62 62.70 L28.97 63.40 L29.35 64.08 L29.75 64.75 L30.17 65.41 L30.61 66.06 L31.08 66.70 L31.56 67.32 L32.07 67.93 L32.59 68.53 L33.14 69.11 L33.70 69.67 L34.29 70.21 L34.89 70.74 L35.51 71.25 L36.15 71.74 L36.80 72.21 L37.47 72.66 L38.16 73.09 L38.86 73.50 L39.58 73.89 L40.31 74.26 L41.05 74.60 L41.80 74.92 L42.56 75.22 L43.34 75.49 L44.13 75.74 L44.92 75.96 L45.72 76.16 L46.53 76.33 L47.35 76.48 L48.17 76.60 L49.00 76.70 L49.83 76.77 L50.67 76.81 L51.51 76.83 L52.35 76.82 L53.19 76.79 L54.03 76.72 L54.87 76.63 L55.71 76.52 L56.54 76.37 L57.37 76.20 L58.20 76.01 L59.02 75.78 L59.84 75.53 L60.65 75.26 L61.45 74.95 L62.24 74.63 L63.02 74.27 L63.79 73.89 L64.56 73.49 L65.30 73.06 L66.04 72.61 L66.76 72.13 L67.47 71.63 L68.16 71.10 L68.84 70.56 L69.50 69.99 L70.14 69.40 L70.76 68.79 L71.36 68.15 L71.95 67.50 L72.51 66.83 L73.05 66.14 L73.57 65.43 L74.07 64.71 L74.55 63.97 L75.00 63.21 L75.42 62.44 L75.82 61.65 L76.20 60.85 L76.55 60.04 L76.87 59.22 L77.17 58.38 L77.44 57.54 L77.68 56.68 L77.89 55.82 L78.07 54.95Z" fill="url(#icar-g)"/><circle cx="44.62" cy="19.47" r="10.5" fill="url(#icar-g)"/><circle cx="80.53" cy="55.38" r="2.5" fill="url(#icar-g)"/><circle cx="73.73" cy="30.05" r="10.5" fill="#2EE6A8"/><g transform="translate(124 4)"><g fill="none" stroke="#0A1626" stroke-width="13" stroke-linecap="round"> <path d="M6.5 37 V83.5"/><path d="M72.46 44.28 A23.5 23.5 0 1 0 72.46 75.72"/><circle cx="118" cy="60" r="23.5"/><path d="M141.5 37 V83.5"/><path d="M168 83.5 V60 A23 23 0 0 1 191 37"/></g> <circle cx="6.5" cy="12.5" r="8" fill="#2EE6A8"/></g></svg>';

export function buildReportDocument(opts: ReportDocumentOptions): string {
  const generatedAt = opts.generatedAt ?? todayHe();
  const footerNote = opts.footerNote ?? 'מסמך זה הופק אוטומטית על ידי מערכת icar לניהול צי רכב';

  const metaColumns = opts.metaColumns ?? [];
  const companyLine = opts.company
    ? `<div class="company-info">חברה: <strong>${esc(opts.company.name)}</strong>${
        opts.company.businessId ? ` | ח.פ: <span class="ltr">${esc(opts.company.businessId)}</span>` : ''
      }</div>`
    : '';

  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>icar - ${esc(opts.title)}</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-title">
        <h1>${esc(opts.title)}</h1>
        ${companyLine}
      </div>
      <div class="header-meta">
        תאריך הפקה<br>
        <strong>${esc(generatedAt)}</strong>
      </div>
    </div>

    ${metaColumns.length ? `<div class="meta-row">${metaColumns.map(metaColumnHtml).join('')}</div>` : ''}

    ${opts.bodyHtml}

    <div class="footnote">
      <div class="footnote-mark">${ICAR_REPORT_MARK}</div>
      ${esc(footerNote)}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Turns a full report HTML document into a PDF the user can share (native) or
 * print (web). expo-print's web shim ignores the `html` it's given and just
 * calls `window.print()` on whatever page is currently open — so on web we
 * open the report in its own window and print that instead, rather than
 * printing a screenshot of the screen the user pressed the button from.
 */
export async function printOrShareReport(html: string, dialogTitle: string): Promise<void> {
  if (Platform.OS === 'web') {
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) throw new Error('חסימת חלונות קופצים מנעה את פתיחת הדוח');
    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
    return;
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle,
      UTI: 'com.adobe.pdf',
    });
  }
}
