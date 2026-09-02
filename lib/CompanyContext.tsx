import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, Company, Profile } from './supabase';

/**
 * Supplies the admin screens with the company they are operating on.
 *
 * For an admin that is simply their own `company_id`. The provider takes
 * an optional override so that later the owner can "enter" a company
 * (screen O1 in the spec) and reuse these exact screens without any of
 * them needing to change.
 */

interface CompanyContextValue {
  companyId: string | null;
  company: Company | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

export function CompanyProvider({
  children,
  companyIdOverride,
}: {
  children: React.ReactNode;
  companyIdOverride?: string;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    const isCurrent = () => version === loadVersion.current;
    setError(null);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      if (!isCurrent()) return;

      const userId = auth.user?.id;
      if (!userId) {
        setProfile(null);
        setCompany(null);
        setLoading(false);
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single<Profile>();
      if (profileError) throw profileError;

      if (!isCurrent()) return;

      setProfile(profileRow ?? null);

      const activeId = companyIdOverride ?? profileRow?.company_id ?? null;
      if (!activeId) {
        setCompany(null);
        setLoading(false);
        return;
      }

      const { data: companyRow, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', activeId)
        .single<Company>();
      if (companyError) throw companyError;

      if (!isCurrent()) return;

      setCompany(companyRow ?? null);
      setLoading(false);
    } catch (err: any) {
      if (!isCurrent()) return;
      setError(err?.message ?? 'טעינת פרטי החברה נכשלה');
      setLoading(false);
    }
  }, [companyIdOverride]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        loadVersion.current += 1;
        setProfile(null);
        setCompany(null);
        setError(null);
        setLoading(false);
        return;
      }
      // Never carry the previous account's cached company/profile through an
      // account switch while the new session is still loading.
      loadVersion.current += 1;
      setProfile(null);
      setCompany(null);
      setError(null);
      setLoading(true);
      load();
    });

    return () => subscription.unsubscribe();
  }, [load]);

  const value = useMemo<CompanyContextValue>(
    () => ({
      companyId: companyIdOverride ?? profile?.company_id ?? null,
      company,
      profile,
      loading,
      error,
      refresh: load,
    }),
    [companyIdOverride, profile, company, loading, error, load]
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used inside a CompanyProvider');
  return ctx;
}

/**
 * Convenience for screens that cannot render without a company — they
 * are only mounted under an admin session, so the id is guaranteed by
 * the time the provider has finished loading.
 */
export function useCompanyId(): string {
  const { companyId } = useCompany();
  return companyId ?? '';
}
