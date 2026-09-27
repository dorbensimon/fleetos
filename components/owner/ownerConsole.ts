import type { CompanyHealth, Tone } from '../../lib/platformOverview';

/** Filters and ordering shared by the owner's desktop and phone control room. */

export type CompanyFilter = 'all' | 'attention' | 'ok' | 'off';
export type CompanySort = 'health' | 'name' | 'activity' | 'size';

export const COMPANY_FILTERS: { value: CompanyFilter; label: string; tone?: Tone }[] = [
  { value: 'all', label: 'כל החברות' },
  { value: 'attention', label: 'דורשות טיפול', tone: 'bad' },
  { value: 'ok', label: 'תקינות', tone: 'ok' },
  { value: 'off', label: 'מושבתות', tone: 'off' },
];

const TONE_ORDER: Record<Tone, number> = { bad: 0, warn: 1, ok: 2, off: 3 };

export function filterCompanies(rows: CompanyHealth[], filter: CompanyFilter, search: string, sort: CompanySort): CompanyHealth[] {
  const q = search.trim().toLowerCase();
  const out = rows.filter((r) => {
    if (filter === 'attention' && r.tone !== 'bad' && r.tone !== 'warn') return false;
    if (filter === 'ok' && r.tone !== 'ok') return false;
    if (filter === 'off' && r.tone !== 'off') return false;
    if (!q) return true;
    return r.company.name.toLowerCase().includes(q) || (r.company.business_id ?? '').includes(q);
  });
  const byName = (a: CompanyHealth, b: CompanyHealth) => a.company.name.localeCompare(b.company.name, 'he');
  return out.sort((a, b) => {
    switch (sort) {
      case 'name':
        return byName(a, b);
      case 'activity':
        return (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '') || byName(a, b);
      case 'size':
        return b.drivers + b.vehicles - (a.drivers + a.vehicles) || byName(a, b);
      default:
        return TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.issues.length - a.issues.length || byName(a, b);
    }
  });
}
