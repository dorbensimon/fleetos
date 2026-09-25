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

    <div class="footnote">${esc(footerNote)}</div>
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
