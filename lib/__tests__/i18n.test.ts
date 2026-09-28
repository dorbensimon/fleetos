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
const ts: typeof import('typescript') = require('typescript'); // eslint-disable-line @typescript-eslint/no-require-imports
const HEBREW = /[\u0590-\u05FF]/;

/** The app's own .ts/.tsx files. */
function sourceFiles(): string[] {
  const root = process.cwd();
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.tsx?$/.test(entry.name)) files.push(file);
    }
  };
  ['components', 'screens', 'lib'].forEach((dir) => walk(path.join(root, dir)));
  return [path.join(root, 'App.tsx'), ...files];
}

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
    const used = new Set<string>();
    for (const file of sourceFiles()) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/\bt\('([\w.]+)'/g)) used.add(match[1]);
    }
    const missing = [...used].filter((key) => !(key in flat.he));
    expect(missing).toEqual([]);
  });

  it('no Hebrew is written straight into a screen', () => {
    const found: string[] = [];
    for (const file of sourceFiles().filter((f) => f.endsWith('.tsx') && !f.includes('__tests__'))) {
      const text = fs.readFileSync(file, 'utf8');
      if (!HEBREW.test(text)) continue;
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: import('typescript').Node) => {
        const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node);
        const inJsx = ts.isJsxText(node) || (literal && (ts.isJsxAttribute(node.parent) || ts.isJsxExpression(node.parent)));
        if (inJsx && HEBREW.test(node.getText())) found.push(`${file}: ${node.getText().trim()}`);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(found).toEqual([]);
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
