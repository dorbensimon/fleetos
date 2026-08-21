import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lnflftptzrfuzfecmhho.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4UJaMSQubyVg7h-vD-OwEg_37kBN7Bx';

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
  created_at: string;
}
