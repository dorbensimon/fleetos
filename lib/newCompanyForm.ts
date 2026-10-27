// טופס יצירת חברה חדשה (בעלים)
import { isValidIsraeliPhone } from './phone';
import { isValidEmail, isValidTemporaryPassword } from './validation';
import { emptyAccountForm, validateAccountForm, type AccountForm } from './companyAccount';
import { t } from './i18n';
import type { CompanyType } from './companyType';

/**
 * The owner's "חברה חדשה" form (components/owner/AddCompanySheet): its
 * shape and the checks each of its three steps makes before moving on.
 */

export type OwnerCompanyForm = {
  name: string;
  logoUrl: string;
  companyType: '' | CompanyType;
  businessId: string;
  adminFirstName: string;
  adminLastName: string;
  email: string;
  phone: string;
  password: string;
  account: AccountForm;
  /** The email already belongs to an account: a manager to link (block null), or why it cannot be. */
  existingManager: { fullName: string | null; block: string | null } | null;
};

// טופס ריק
export function emptyOwnerCompanyForm(): OwnerCompanyForm {
  return {
    name: '',
    logoUrl: '',
    companyType: '',
    businessId: '',
    adminFirstName: '',
    adminLastName: '',
    email: '',
    phone: '',
    password: '',
    account: emptyAccountForm(),
    existingManager: null,
  };
}


export type CompanyStep = 0 | 1 | 2;

type FieldErrors = Record<string, string>;

// בודק שלב בטופס ומחזיר שגיאות
/** The errors that stop a step; empty when it may move on. */
export function validateCompanyStep(step: CompanyStep, form: OwnerCompanyForm): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 0) {
    if (!form.name.trim()) errors.name = t('validation.companyNameRequired');
    if (form.businessId.trim() && !/^\d{8,9}$/.test(form.businessId.trim())) errors.businessId = t('validation.8or9Digits');
  }
  if (step === 1 && form.existingManager) {
    // An existing manager keeps their name, phone and password.
    if (form.existingManager.block) errors.email = form.existingManager.block;
    return errors;
  }
  if (step === 1) {
    if (!form.adminFirstName.trim()) errors.adminFirstName = t('validation.required');
    if (!form.adminLastName.trim()) errors.adminLastName = t('validation.required');
    if (!form.email.trim()) errors.email = t('validation.required');
    else if (!isValidEmail(form.email)) errors.email = t('validation.invalidEmail');
    if (!form.phone.trim()) errors.phone = t('validation.required');
    else if (!isValidIsraeliPhone(form.phone)) errors.phone = t('validation.invalidPhone');
    if (!form.password) errors.password = t('validation.tempPasswordRequired');
    else if (!isValidTemporaryPassword(form.password)) errors.password = t('validation.min4Digits');
  }
  if (step === 2) {
    for (const [key, message] of Object.entries(validateAccountForm(form.account))) errors[`account.${key}`] = message as string;
  }
  return errors;
}
