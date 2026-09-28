import { buildReportDocument, emptyState, esc, printOrShareReport, statusTag, type TagTone } from './reportTemplate';
import { formatDate } from './theme';
import { accountNextStep, formatMoney, planLabel, statusLabel, statusTone, type AccountTone } from './companyAccount';
import { lastSeenLabel, type PlatformOverview } from './platformOverview';

/**
 * "דוח לקוחות": every company on the platform as the owner's customer, one
 * row each, in the same printed look as every other report in the app.
 * Counts, dates and money only. No driver is named.
 */

const TAG: Record<AccountTone, TagTone> = { ok: 'accent', warn: 'outline', bad: 'accent2', off: 'neutral' };

export function buildPlatformReport(overview: PlatformOverview): string {
  const rows = [...overview.companies]
    .sort((a, b) => b.mrr - a.mrr || a.company.name.localeCompare(b.company.name, 'he'))
    .map((c) => {
      const a = c.account;
      const next = accountNextStep(a);
      return `
        <tr>
          <td><strong>${esc(c.company.name)}</strong>${c.company.business_id ? `<div class="ltr">${esc(c.company.business_id)}</div>` : ''}</td>
          <td>${c.active ? statusTag(statusLabel(a?.status), TAG[statusTone(a?.status)]) : statusTag('מושבתת', 'neutral')}</td>
          <td>${esc(planLabel(a?.plan))}</td>
          <td>${esc(formatMoney(a?.monthly_price))}</td>
          <td>${next ? esc(next.label) : '—'}</td>
          <td>${c.vehicles}${a?.vehicle_limit ? ` / ${a.vehicle_limit}` : ''}</td>
          <td>${c.drivers}</td>
          <td>${esc(lastSeenLabel(c.lastActivity))}</td>
          <td>${esc(formatDate(c.company.created_at))}</td>
        </tr>`;
    })
    .join('');

  const t = overview.totals;
  const bodyHtml = overview.companies.length
    ? `<table class="table" dir="rtl">
        <thead>
          <tr>
            <th>חברה</th>
            <th>מצב</th>
            <th>מסלול</th>
            <th>לחודש</th>
            <th>הצעד הבא</th>
            <th>רכבים</th>
            <th>נהגים</th>
            <th>פעילות אחרונה</th>
            <th>הצטרפה</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
    : emptyState('אין עדיין חברות במערכת');

  return buildReportDocument({
    title: 'דוח לקוחות',
    metaColumns: [
      { label: 'הכנסה חודשית', value: formatMoney(t.mrr), sub: 'לפני מע״מ' },
      { label: 'לקוחות משלמים', value: String(t.paying) },
      { label: 'בתקופת ניסיון', value: String(t.trials) },
      { label: 'בפיגור', value: String(t.overdue) },
      { label: 'סה״כ חברות', value: String(t.companies), big: true, pushEnd: true },
    ],
    bodyHtml,
    footerNote: 'דוח פנימי לבעל המערכת. מופקים בו רק מספרים, תאריכים ופרטי מנוי, בלי פרטים אישיים של נהגים.',
  });
}

export function exportPlatformReport(overview: PlatformOverview): Promise<void> {
  return printOrShareReport(buildPlatformReport(overview), 'דוח לקוחות');
}
