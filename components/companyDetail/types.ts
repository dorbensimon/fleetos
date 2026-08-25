export interface CompanyUser {
  id: string;
  role: 'admin' | 'driver';
  full_name: string | null;
  phone: string | null;
  must_change_password: boolean;
  created_at: string;
  email: string | null;
}
