import { DRIVER_COMPLIANCE, VEHICLE_COMPLIANCE } from '../compliance';
import { applyLanguage, t } from '../i18n';
import { withoutValidity } from '../notificationPreferencesApi';
import { COMPANY_TYPES, companyTypeLabel } from '../companyType';
import { docusealFormLanguage } from '../docusealEmbed';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock') // eslint-disable-line @typescript-eslint/no-require-imports
);
jest.mock('../supabase', () => ({ supabase: {} }));

const catalog = [...VEHICLE_COMPLIANCE, ...DRIVER_COMPLIANCE];

afterEach(() => applyLanguage('he'));

describe('stored document titles', () => {
  it('match the Hebrew labels', () => {
    for (const def of catalog) expect(def.storedTitle).toBe(def.label);
  });

  it('stay the same when the UI language changes', async () => {
    const stored = catalog.map((def) => def.storedTitle);
    await applyLanguage('en');
    expect(catalog.map((def) => def.storedTitle)).toEqual(stored);
    expect(catalog.map((def) => def.label)).not.toEqual(stored);
  });
});

describe('withoutValidity', () => {
  it('drops the validity wording in Hebrew', () => {
    expect(withoutValidity('תוקף ביטוח חובה')).toBe('ביטוח חובה');
    expect(withoutValidity('ביטוח חובה')).toBe('ביטוח חובה');
  });

  it('drops the validity wording in other languages', async () => {
    await applyLanguage('en');
    expect(withoutValidity(t('prefs.validityOf', { label: 'Mandatory insurance' }))).toBe('Mandatory insurance');
    await applyLanguage('ar');
    expect(withoutValidity(t('prefs.validityOf', { label: 'X' }))).toBe('X');
  });
});

describe('company type', () => {
  it('is stored in Hebrew and shown in the UI language', async () => {
    expect(COMPANY_TYPES.map(companyTypeLabel)).toEqual(['בע״מ', 'עוסק מורשה']);
    await applyLanguage('en');
    expect(COMPANY_TYPES.map(companyTypeLabel)).toEqual(['Ltd.', 'Licensed dealer']);
    expect(companyTypeLabel(null)).toBe('');
  });
});

describe('DocuSeal signing form language', () => {
  it('follows the app, with English for Russian, which DocuSeal lacks', async () => {
    expect(docusealFormLanguage()).toBe('he');
    await applyLanguage('ar');
    expect(docusealFormLanguage()).toBe('ar');
    await applyLanguage('ru');
    expect(docusealFormLanguage()).toBe('en');
  });
});
