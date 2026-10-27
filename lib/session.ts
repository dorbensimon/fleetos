// לאן לשלוח משתמש אחרי כניסה לפי התפקיד שלו
import { supabase, Profile, UserRole } from './supabase';
import { RootStackParamList } from '../navigation/types';
import { t } from './i18n';

// המסך הראשי של כל תפקיד
export const ROLE_ROUTES: Record<UserRole, keyof RootStackParamList> = {
  owner: 'OwnerHome',
  admin: 'AdminHome',
  driver: 'DriverHome',
};

type RouteResult =
  | { ok: true; route: keyof RootStackParamList }
  | { ok: false; error: string };

// האם הערך הוא תפקיד חוקי
function isUserRole(role: unknown): role is UserRole {
  return role === 'owner' || role === 'admin' || role === 'driver';
}

// מוצא את המסך הראשי של המשתמש
// freshSignIn: the user has just signed in (not a refresh or a restored
// session). A manager then picks the company to enter, every time, even with
// one company; a refresh keeps them in the company they picked.
export async function resolveRouteForUser(
  userId: string,
  { freshSignIn = false }: { freshSignIn?: boolean } = {},
): Promise<RouteResult> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single<Profile>();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { ok: false, error: t('session.profileLoadError') };
  }

  if (!isUserRole(profile.role)) {
    await supabase.auth.signOut();
    return { ok: false, error: t('session.invalidRole') };
  }

  if (profile.role === 'driver' && !profile.company_id) {
    await supabase.auth.signOut();
    return { ok: false, error: t('session.noCompany') };
  }

  // חשבון חדש שטרם קבע סיסמה קבועה - חייב לעשות זאת לפני כל בדיקה אחרת
  if (profile.must_change_password) {
    return { ok: true, route: 'SetPassword' };
  }

  // A manager with no active company, or whose active company was disabled,
  // chooses again; the picker explains when none of theirs is open.
  if (profile.role === 'admin' && (freshSignIn || !profile.company_id)) {
    return { ok: true, route: 'CompanyPicker' };
  }

  if (profile.role !== 'owner') {
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('status')
      .eq('id', profile.company_id)
      .single();

    if (companyError || !company) {
      await supabase.auth.signOut();
      return { ok: false, error: t('session.companyLoadError') };
    }

    if (company.status !== 'active' && profile.role === 'admin') {
      return { ok: true, route: 'CompanyPicker' };
    }

    if (company.status === 'disabled') {
      await supabase.auth.signOut();
      return { ok: false, error: t('session.accountDisabled') };
    }
  }

  return { ok: true, route: ROLE_ROUTES[profile.role] };
}
