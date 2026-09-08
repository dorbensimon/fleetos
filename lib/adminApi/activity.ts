import { supabase } from '../supabase';
import type { ActivityLogEntry } from './types';

export async function listActivityLog(companyId: string): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase.from('activity_logs')
    .select('id, company_id, actor_id, actor_name, action, entity_type, entity_id, entity_label, created_at, actor:actor_id(full_name)')
    .eq('company_id', companyId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    actor: Array.isArray(row.actor) ? (row.actor[0] ?? null) : row.actor,
  })) as ActivityLogEntry[];
}
