import { t } from './i18n';

/** A company's legal form, as stored in companies.company_type. Stored data, so it stays Hebrew in every UI language. */
export type CompanyType = 'בע״מ' | 'עוסק מורשה';

export const COMPANY_TYPES: readonly CompanyType[] = ['בע״מ', 'עוסק מורשה'];

/** The short name shown for a stored company type ("בע״מ" → "Ltd."), in the UI language. */
export function companyTypeLabel(type: string | null | undefined): string {
  if (type === 'בע״מ') return t('company.typeLtdShort');
  if (type === 'עוסק מורשה') return t('company.typeLicensedDealer');
  return type ?? '';
}
