import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://lnflftptzrfuzfecmhho.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_4UJaMSQubyVg7h-vD-OwEg_37kBN7Bx';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type UserRole = 'owner' | 'admin' | 'driver';

export interface Profile {
  id: string;
  role: UserRole;
  company_id: string | null;
  job_title: string | null;
  full_name: string | null;
  phone: string | null;
  must_change_password: boolean;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  status: 'active' | 'disabled';
  company_type: 'בע״מ' | 'עוסק מורשה' | null;
  business_id: string | null;
  address: string | null;
  phone: string | null;
  safety_officer_name: string | null;
  safety_officer_phone: string | null;
  created_at: string;
  // Company settings screen (94_company_settings.sql). Optional so older
  // fixtures and partial selects still type-check.
  carrier_license_expiry?: string | null;
  mobile_phone?: string | null;
  fax?: string | null;
  email?: string | null;
  files_email?: string | null;
  files_email_2?: string | null;
  odometer_report_email?: string | null;
  odometer_report_enabled?: boolean;
  contacts?: { name: string; role: string; phone: string; email: string }[];
  safety_officer_2_name?: string | null;
  safety_officer_2_phone?: string | null;
  stamp_url?: string | null;
}
