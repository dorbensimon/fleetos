// מיון שורות בטבלה לפי ערך (ימים עד הפקיעה, ק"מ עד הטיפול)

export type SortDir = 'asc' | 'desc';
export type TableSort = { key: string; dir: SortDir } | null;

/**
 * 'asc' puts what already expired, then what is closest, first; 'desc' the
 * farthest first. Rows with no value always go last. Stable, so equal rows
 * keep the list's own order.
 */
export function sortRows<T>(rows: T[], value: ((row: T) => number | null) | undefined, dir: SortDir = 'asc'): T[] {
  if (!value) return rows;
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: value(row) }))
    .sort((a, b) => (a.v == null ? (b.v == null ? a.i - b.i : 1) : b.v == null ? -1 : (a.v - b.v) * sign || a.i - b.i))
    .map((x) => x.row);
}

// לחיצה על כותרת: קרוב לרחוק, רחוק לקרוב, ובחזרה לסדר הרגיל
export function nextSort(current: TableSort, key: string): TableSort {
  if (current?.key !== key) return { key, dir: 'asc' };
  return current.dir === 'asc' ? { key, dir: 'desc' } : null;
}
