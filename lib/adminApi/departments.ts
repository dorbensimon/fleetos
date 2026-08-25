import { supabase } from '../supabase';
import { Department } from './types';

export async function listDepartments(companyId: string): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('company_id', companyId)
    .order('name');

  if (error) throw error;
  return (data ?? []) as Department[];
}

export async function createDepartment(companyId: string, name: string) {
  const { data, error } = await supabase
    .from('departments')
    .insert({ company_id: companyId, name })
    .select()
    .single();
  if (error) throw error;
  return data as Department;
}

export async function updateDepartment(departmentId: string, name: string) {
  const { error } = await supabase.from('departments').update({ name }).eq('id', departmentId);
  if (error) throw error;
}

export async function deleteDepartment(departmentId: string) {
  const { error } = await supabase.from('departments').delete().eq('id', departmentId);
  if (error) throw error;
}
