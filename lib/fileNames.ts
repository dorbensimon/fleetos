/** Safe single path segment for files written to the app cache. */
export function safeFileName(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? '').normalize('NFKC')
    .replace(/[\\/\u0000-\u001f\u007f]+/g, '-')
    .replace(/[^\p{L}\p{N}._ -]+/gu, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 120);
  return normalized && normalized !== '.' && normalized !== '..' ? normalized : fallback;
}

export function safeExtension(value: string | null | undefined, fallback = 'bin'): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || fallback;
}
