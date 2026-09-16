// Shared HTML/PDF report shell — an "editorial dossier" treatment: a warm
// paper page, a large serif masthead (Frank Ruhl Libre, one of the few
// distinctive Google fonts with real Hebrew glyphs) paired with Heebo for
// body/label text, and the app's own #0088CC accent used sparingly as a
// single confident thread through rules, section marks and tags. Used by
// driverReport.ts, vehicleReport.ts and driverSnapshotReport.ts so every
// document the app exports for drivers/vehicles shares one header, meta-grid,
// table and footer treatment.

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
  @import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;900&family=Heebo:wght@300;400;500;600;700&display=swap');

  :root {
    --color-paper: #faf8f4;
    --color-backdrop: #e8e4db;
    --color-ink: #1c1a16;
    --color-ink-muted: #6f6a5f;
    --color-ink-faint: #a29c8d;
    --color-accent: #0088cc;
    --color-accent-deep: #045a86;
    --color-accent-soft: rgba(0, 136, 204, 0.09);
    --color-field: #f2efe7;
    --color-rule: #ded8c9;
    --color-ok-bg: #e7f0e6;
    --color-ok-text: #47713f;
    --color-warn-bg: #fbf0dc;
    --color-warn-text: #93630f;
    --color-danger-bg: #f7e6e1;
    --color-danger-text: #a33a24;
    --color-neutral-bg: #ecebe6;
    --color-neutral-text: #6f6a5f;
    --font-display: 'Frank Ruhl Libre', 'Times New Roman', serif;
    --font-body: 'Heebo', -apple-system, 'Segoe UI', Roboto, sans-serif;
  }

  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    color: var(--color-ink);
    font-family: var(--font-body);
    direction: rtl;
    -webkit-font-smoothing: antialiased;
    font-variant-numeric: tabular-nums;
  }
  html { background: var(--color-backdrop); }
  body { background: var(--color-backdrop); }

  .page {
    position: relative;
    max-width: 720px;
    margin: 32px auto;
    padding: 42px 44px 34px;
    background: var(--color-paper);
    box-shadow: 0 1px 2px rgba(28, 26, 22, 0.06), 0 16px 36px rgba(28, 26, 22, 0.14);
    overflow: hidden;
  }
  /* A faint paper grain behind the masthead only — atmosphere, not noise. */
  .page::before {
    content: '';
    position: absolute;
    inset: 0;
    height: 190px;
    background-image: radial-gradient(rgba(28, 26, 22, 0.05) 0.6px, transparent 0.6px);
    background-size: 3px 3px;
    -webkit-mask-image: linear-gradient(to bottom, black, transparent);
    mask-image: linear-gradient(to bottom, black, transparent);
    pointer-events: none;
  }

  @media print {
    html, body { background: var(--color-paper); }
    .page { margin: 0; max-width: none; box-shadow: none; padding: 6px 4px; }
    .page::before { display: none; }
  }

  .masthead {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
  }
  .masthead-heading { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .masthead-kicker {
    font-family: var(--font-body);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-accent-deep);
  }
  .masthead h1 {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 30px;
    margin: 0;
    line-height: 1.18;
    letter-spacing: -0.01em;
    color: var(--color-ink);
  }
  .masthead-date {
    text-align: center;
    flex: none;
    border: 1px solid var(--color-rule);
    padding: 9px 15px 8px;
  }
  .masthead-date .date-label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-ink-faint);
  }
  .masthead-date .date-value {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 15px;
    color: var(--color-ink);
    margin-top: 3px;
    white-space: nowrap;
  }
  .masthead-rule {
    position: relative;
    height: 4px;
    margin-top: 6px;
  }
  .masthead-rule::before {
    content: '';
    position: absolute; inset-inline-start: 0; top: 0;
    width: 46px; height: 3px;
    background: var(--color-accent);
  }
  .masthead-rule::after {
    content: '';
    position: absolute; inset-inline-start: 0; bottom: 0;
    width: 100%; height: 1px;
    background: var(--color-rule);
  }

  .meta-row, .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 20px 22px;
    margin-top: 28px;
  }
  .meta-col { min-width: 0; }
  .meta-col-push { text-align: left; justify-self: end; }
  .meta-label {
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.03em;
    color: var(--color-ink-faint);
    margin-bottom: 5px;
  }
  .meta-value { font-weight: 600; font-size: 14.5px; color: var(--color-ink); }
  .meta-value-big { font-family: var(--font-display); font-size: 26px; font-weight: 700; color: var(--color-accent-deep); }
  .meta-sub { font-size: 11.5px; color: var(--color-ink-faint); margin-top: 2px; }
  .ltr { direction: ltr; text-align: left; unicode-bidi: isolate; }

  .company-logo {
    width: 34px; height: 34px; object-fit: cover;
    margin-bottom: 4px;
  }

  h2.section-title {
    display: flex;
    align-items: baseline;
    gap: 12px;
    font-family: var(--font-body);
    font-weight: 700;
    font-size: 11.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-accent-deep);
    margin: 36px 0 14px;
  }
  h2.section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-rule);
  }

  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    margin-top: 4px;
  }
  .table th {
    text-align: right;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-ink-faint);
    padding: 0 10px 8px;
    border-bottom: 1px solid var(--color-ink);
  }
  .table td {
    padding: 11px 10px;
    border-bottom: 1px solid var(--color-rule);
    text-align: right;
  }
  .table tbody tr:last-child td { border-bottom: none; }
  .text-muted { color: var(--color-ink-muted); }

  .tag {
    display: inline-flex; align-items: center; white-space: nowrap;
    font-size: 10.5px; font-weight: 600; letter-spacing: 0.02em;
    padding: 3px 10px; border-radius: 999px;
  }
  .tag-ok { background: var(--color-ok-bg); color: var(--color-ok-text); }
  .tag-danger { background: var(--color-danger-bg); color: var(--color-danger-text); }
  .tag-neutral { background: var(--color-neutral-bg); color: var(--color-neutral-text); }
  .tag-warn { background: var(--color-warn-bg); color: var(--color-warn-text); }

  .empty-state {
    text-align: center;
    padding: 30px 0;
    color: var(--color-ink-faint);
    font-size: 12.5px;
    border: 1px dashed var(--color-rule);
  }

  .footnote {
    margin-top: 38px;
    padding-top: 16px;
    border-top: 1px solid var(--color-rule);
    font-size: 10.5px;
    color: var(--color-ink-faint);
  }
`;

export interface ReportDocumentOptions {
  title: string;
  generatedAt?: string;
  metaColumns: ReportMetaColumn[];
  bodyHtml: string;
  footerNote?: string;
}

export function buildReportDocument(opts: ReportDocumentOptions): string {
  const generatedAt = opts.generatedAt ?? todayHe();
  const footerNote = opts.footerNote ?? 'מסמך זה הופק אוטומטית על ידי מערכת Tolvex לניהול צי רכב';

  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8" />
<style>${REPORT_STYLES}</style>
</head>
<body>
  <div class="page">
    <div class="masthead">
      <div class="masthead-heading">
        <div class="masthead-kicker">Tolvex · דוח מערכת</div>
        <h1>${esc(opts.title)}</h1>
        <div class="masthead-rule"></div>
      </div>
      <div class="masthead-date">
        <div class="date-label">תאריך הפקה</div>
        <div class="date-value">${esc(generatedAt)}</div>
      </div>
    </div>

    <div class="meta-row">
      ${opts.metaColumns.map(metaColumnHtml).join('')}
    </div>

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
