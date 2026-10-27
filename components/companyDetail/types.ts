// טיפוסים של דף החברה
export interface CompanyUser {
  id: string;
  role: 'admin' | 'driver';
  full_name: string | null;
  phone: string | null;
  must_change_password: boolean;
  created_at: string;
  email: string | null;
  /** How many companies a manager manages (1 for drivers). */
  company_count?: number;
}
