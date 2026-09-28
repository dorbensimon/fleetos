import he from '../../locales/he.json';
import ar from '../../locales/ar.json';
import ru from '../../locales/ru.json';
import en from '../../locales/en.json';
import { dirIcon, getLanguage, isRTL, layoutDirection, LANGUAGES, t, textStart } from '../i18n';

// Node's fs/path, typed locally: the app's tsconfig only loads React Native and Jest types.
type Dirent = { name: string; isDirectory(): boolean };
const fs: {
  readdirSync(dir: string, options: { withFileTypes: true }): Dirent[];
  readFileSync(file: string, encoding: 'utf8'): string;
  statSync(file: string): { isDirectory(): boolean };
} = require('fs'); // eslint-disable-line @typescript-eslint/no-require-imports
const path: { join(...parts: string[]): string } = require('path'); // eslint-disable-line @typescript-eslint/no-require-imports

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[full] = value;
    else Object.assign(out, flatten(value, full));
  }
  return out;
}

const locales = { he, ar, ru, en } as Record<string, Tree>;
const flat = Object.fromEntries(Object.entries(locales).map(([lang, tree]) => [lang, flatten(tree)]));
const placeholders = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();

describe('translations', () => {
  it('every language has exactly the same keys', () => {
    const keys = Object.keys(flat.he).sort();
    for (const lang of ['ar', 'ru', 'en']) expect(Object.keys(flat[lang]).sort()).toEqual(keys);
  });

  it('no translation is empty and every one keeps the Hebrew placeholders', () => {
    for (const [key, source] of Object.entries(flat.he)) {
      for (const lang of ['he', 'ar', 'ru', 'en']) {
        expect(flat[lang][key].trim()).not.toBe('');
        expect({ key, lang, placeholders: placeholders(flat[lang][key]) }).toEqual({ key, lang, placeholders: placeholders(source) });
      }
    }
  });

  it('every key used in the code exists', () => {
    const root = process.cwd();
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (/\.tsx?$/.test(entry.name)) {
          for (const match of fs.readFileSync(file, 'utf8').matchAll(/\bt\('([\w.]+)'/g)) used.add(match[1]);
        }
      }
    };
    ['App.tsx', 'components', 'screens', 'lib'].forEach((p) => {
      const full = path.join(root, p);
      if (fs.statSync(full).isDirectory()) walk(full);
      else for (const match of fs.readFileSync(full, 'utf8').matchAll(/\bt\('([\w.]+)'/g)) used.add(match[1]);
    });
    const missing = [...used].filter((key) => !(key in flat.he));
    expect(missing).toEqual([]);
  });
});

describe('language and direction', () => {
  it('defaults to Hebrew, right to left', () => {
    expect(getLanguage()).toBe('he');
    expect(isRTL()).toBe(true);
    expect(textStart()).toBe('right');
    expect(t('common.cancel')).toBe('ביטול');
  });

  it('knows which languages read right to left', () => {
    expect(isRTL('ar')).toBe(true);
    expect(isRTL('ru')).toBe(false);
    expect(isRTL('en')).toBe(false);
    // The layout is authored for Hebrew, so an LTR language mirrors it.
    expect(layoutDirection('he')).toBe('ltr');
    expect(layoutDirection('en')).toBe('rtl');
    expect(dirIcon('chevron-back')).toBe('chevron-back');
  });

  it('offers the four languages in their own names', () => {
    expect(LANGUAGES.map((l) => l.nativeName)).toEqual(['עברית', 'العربية', 'Русский', 'English']);
  });
});
