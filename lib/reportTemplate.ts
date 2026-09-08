// Shared HTML/PDF report shell — Broadsheet design system (newsprint, RTL/Hebrew).
// Used by driverReport.ts, vehicleReport.ts and driverSnapshotReport.ts so every
// document the app exports for drivers/vehicles shares one masthead, meta-row,
// table and footer treatment.

export type TagTone = 'accent' | 'accent2' | 'neutral' | 'outline';

export function esc(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function statusTag(label: string, tone: TagTone): string {
  const cls =
    tone === 'accent'
      ? 'tag tag-accent'
      : tone === 'accent2'
      ? 'tag tag-accent-2'
      : tone === 'outline'
      ? 'tag tag-outline'
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
  @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600;0,700;0,800;1,400&display=swap');

  :root {
    --color-bg: #f3f2f2;
    --color-text: #201e1d;
    --color-accent: #0088b0;
    --color-accent-2: #d6006c;
    --color-accent-100: #e9f8ff;
    --color-accent-700: #006786;
    --color-accent-800: #004961;
    --color-accent-2-100: #fff1f4;
    --color-accent-2-700: #aa0b56;
    --color-accent-2-800: #790e3d;
    --color-neutral-100: #f8f4f4;
    --color-neutral-800: #444141;
    --color-divider: rgba(32, 30, 29, 0.16);
    --font-heading: 'Source Serif 4', Georgia, 'Times New Roman', serif;
    --font-body: 'Source Serif 4', Georgia, 'Times New Roman', serif;
  }

  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    background: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-body);
    direction: rtl;
  }
  body { padding: 34px 32px 30px; }

  .page { display: flex; flex-direction: column; }

  .masthead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    border-bottom: 3px solid var(--color-text);
    padding-bottom: 10px;
  }
  .masthead h1 {
    font-family: var(--font-heading);
    font-weight: 800;
    font-size: 32px;
    margin: 0;
    line-height: 1.05;
    letter-spacing: -0.01em;
  }
  .masthead-date {
    text-align: left;
    font-size: 11px;
    opacity: 0.7;
    white-space: nowrap;
    flex: none;
  }
  .masthead-date .date-value {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 15px;
    color: var(--color-text);
    margin-top: 2px;
  }
  .masthead-rule { height: 1px; background: var(--color-text); opacity: 0.15; margin-top: 1px; }

  .meta-row {
    display: flex;
    gap: 28px;
    margin-top: 18px;
    flex-wrap: wrap;
  }
  .meta-col { min-width: 120px; }
  .meta-col-push { margin-inline-start: auto; text-align: left; }
  .meta-label {
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.55;
    margin-bottom: 3px;
  }
  .meta-value { font-family: var(--font-heading); font-weight: 700; font-size: 15px; }
  .meta-value-big { font-size: 22px; color: var(--color-accent-700); }
  .meta-sub { font-size: 11px; opacity: 0.65; margin-top: 1px; }
  .ltr { direction: ltr; text-align: left; unicode-bidi: isolate; }

  .company-logo {
    width: 34px; height: 34px; border-radius: 6px; object-fit: cover;
    border: 1px solid var(--color-divider);
    margin-bottom: 4px;
  }

  h2.section-title {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 15px;
    color: var(--color-accent-700);
    margin: 22px 0 8px;
    padding-bottom: 5px;
    border-bottom: 1px solid var(--color-divider);
  }

  .table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 6px; }
  .table th {
    text-align: right;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(32, 30, 29, 0.6);
    padding: 8px 8px;
    border-bottom: 1px solid var(--color-divider);
  }
  .table td {
    padding: 7px 8px;
    border-bottom: 1px solid rgba(32, 30, 29, 0.08);
    text-align: right;
  }
  .table tbody tr:nth-child(even) td { background: rgba(32, 30, 29, 0.03); }
  .text-muted { color: rgba(32, 30, 29, 0.55); }

  .tag {
    display: inline-flex; align-items: center; white-space: nowrap;
    font-size: 10.5px; letter-spacing: 0.02em;
    padding: 2px 9px; border-radius: 1.5px;
  }
  .tag-accent { background: var(--color-accent-100); color: var(--color-accent-800); }
  .tag-accent-2 { background: var(--color-accent-2-100); color: var(--color-accent-2-800); }
  .tag-neutral { background: var(--color-neutral-100); color: var(--color-neutral-800); }
  .tag-outline { border: 1px solid var(--color-accent-2); color: var(--color-accent-2-700); }

  .grid { display: flex; flex-wrap: wrap; gap: 14px 26px; }
  .grid .meta-col { min-width: 140px; }

  .empty-state {
    text-align: center;
    padding: 26px 0;
    color: rgba(32, 30, 29, 0.5);
    font-size: 12.5px;
  }

  .footnote {
    margin-top: 26px;
    padding-top: 10px;
    border-top: 1px solid var(--color-divider);
    font-size: 11px;
    opacity: 0.5;
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
      <h1>${esc(opts.title)}</h1>
      <div class="masthead-date">
        <div>תאריך הפקה</div>
        <div class="date-value">${esc(generatedAt)}</div>
      </div>
    </div>
    <div class="masthead-rule"></div>

    <div class="meta-row">
      ${opts.metaColumns.map(metaColumnHtml).join('')}
    </div>

    ${opts.bodyHtml}

    <div class="footnote">${esc(footerNote)}</div>
  </div>
</body>
</html>`;
}
