/**
 * Supabase limits an unbounded select response. List screens must therefore
 * fetch deterministic pages instead of silently treating the first page as
 * the full company dataset.
 */
export const ADMIN_LIST_PAGE_SIZE = 200;

export function chunkIds(ids: string[], size = ADMIN_LIST_PAGE_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = ADMIN_LIST_PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;

    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
