import { isValidIsraeliPhone } from './phone';
import { isValidEmail, isValidTemporaryPassword } from './validation';
import { emptyAccountForm, validateAccountForm, type AccountForm } from './companyAccount';

/**
 * The owner's "חברה חדשה" form (components/owner/AddCompanySheet): its
 * shape and the checks each of its three steps makes before moving on.
 */

export type OwnerCompanyForm = {
  name: string;
  logoUrl: string;
  companyType: '' | 'בע״מ' | 'עוסק מורשה';
  businessId: string;
  adminFirstName: string;
  adminLastName: string;
  email: string;
  phone: string;
  password: string;
  account: AccountForm;
};

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
  };
}


export type CompanyStep = 0 | 1 | 2;

type FieldErrors = Record<string, string>;

/** The errors that stop a step; empty when it may move on. */
export function validateCompanyStep(step: CompanyStep, form: OwnerCompanyForm): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 0) {
    if (!form.name.trim()) errors.name = 'שם החברה חובה';
    if (form.businessId.trim() && !/^\d{8,9}$/.test(form.businessId.trim())) errors.businessId = '8 או 9 ספרות';
  }
  if (step === 1) {
    if (!form.adminFirstName.trim()) errors.adminFirstName = 'שדה חובה';
    if (!form.adminLastName.trim()) errors.adminLastName = 'שדה חובה';
    if (!form.email.trim()) errors.email = 'שדה חובה';
    else if (!isValidEmail(form.email)) errors.email = 'כתובת מייל לא תקינה';
    if (!form.phone.trim()) errors.phone = 'שדה חובה';
    else if (!isValidIsraeliPhone(form.phone)) errors.phone = 'מספר טלפון לא תקין';
    if (!form.password) errors.password = 'צריך סיסמה זמנית';
    else if (!isValidTemporaryPassword(form.password)) errors.password = 'לפחות 4 ספרות, ספרות בלבד';
  }
  if (step === 2) {
    for (const [key, message] of Object.entries(validateAccountForm(form.account))) errors[`account.${key}`] = message as string;
  }
  return errors;
}
