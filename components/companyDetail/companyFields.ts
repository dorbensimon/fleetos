// שדות טופס החברה אצל הבעלים
/** The company's editable details, as the phone's details form holds them. */
export type CompanyEditableFields = {
  name: string;
  logoUrl: string;
  companyType: '' | 'בע״מ' | 'עוסק מורשה';
  businessId: string;
  address: string;
  phone: string;
  safetyOfficerName: string;
  safetyOfficerPhone: string;
  filesEmail: string;
  email: string;
  /** ISO date or ''. */
  carrierLicenseExpiry: string;
};
