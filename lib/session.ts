import { supabase, Profile, UserRole } from './supabase';
import { RootStackParamList } from '../navigation/types';

export const ROLE_ROUTES: Record<UserRole, keyof RootStackParamList> = {
  owner: 'OwnerHome',
  admin: 'AdminHome',
  driver: 'DriverHome',
};

type RouteResult =
  | { ok: true; route: keyof RootStackParamList }
  | { ok: false; error: string };

export async function resolveRouteForUser(userId: string): Promise<RouteResult> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single<Profile>();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { ok: false, error: 'שגיאה בטעינת פרופיל המשתמש' };
  }

  // חשבון חדש שטרם קבע סיסמה קבועה - חייב לעשות זאת לפני כל בדיקה אחרת
  if (profile.must_change_password) {
    return { ok: true, route: 'SetPassword' };
  }

  if (profile.role !== 'owner' && profile.company_id) {
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('status')
      .eq('id', profile.company_id)
      .single();

    if (companyError || !company) {
      await supabase.auth.signOut();
      return { ok: false, error: 'שגיאה בטעינת נתוני החברה' };
    }

    if (company.status === 'disabled') {
      await supabase.auth.signOut();
      return { ok: false, error: 'החשבון מושבת זמנית' };
    }
  }

  return { ok: true, route: ROLE_ROUTES[profile.role] };
}
