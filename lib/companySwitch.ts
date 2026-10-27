// בחירת חברה ומעבר בין חברות של מנהל
import { Platform } from 'react-native';
import { supabase } from './supabase';

export interface MyCompany {
  id: string;
  name: string;
  logo_url: string | null;
  status: string;
  vehicles: number;
  drivers: number;
  last_used_at: string | null;
  is_current: boolean;
}

// Other tabs of this browser hear about a switch on this channel.
const CHANNEL = 'icar-company-switch';

// The companies the signed-in manager can enter.
export async function loadMyCompanies(): Promise<MyCompany[]> {
  const { data, error } = await supabase.rpc('my_companies');
  if (error) throw error;
  return (data ?? []) as MyCompany[];
}

// The one picked last, for the "last entered" mark: the current company
// counts only once the manager has used another.
export function lastUsedCompanyId(companies: MyCompany[]): string | null {
  let best: MyCompany | null = null;
  for (const company of companies) {
    if (company.last_used_at && (!best || company.last_used_at > (best.last_used_at ?? ''))) best = company;
  }
  return best?.id ?? null;
}

// Enters a company. The server checks the membership and that it is active.
// Other tabs are told only when the company actually changed.
export async function switchCompany(companyId: string, currentCompanyId: string | null): Promise<void> {
  const { error } = await supabase.rpc('switch_company', { target: companyId });
  if (error) throw error;
  if (companyId !== currentCompanyId && Platform.OS === 'web' && typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(companyId);
    channel.close();
  }
}

// Calls `onSwitched` when another tab of this browser enters a company.
export function onCompanySwitchedElsewhere(onSwitched: (companyId: string) => void): () => void {
  if (Platform.OS !== 'web' || typeof BroadcastChannel === 'undefined') return () => undefined;
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event) => onSwitched(String(event.data));
  return () => channel.close();
}

// Starts the site over on the fleet page of the company now active, so no
// screen keeps showing (or saving to) the previous company. Native reloads
// the data in place; the caller resets its navigation.
export function reopenInActiveCompany(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  window.location.assign('/fleet');
  return true;
}
