// מחלקות בחברה: רשימה, יצירה, שינוי שם ומחיקה
import { supabase } from '../supabase';
import { Department } from './types';

// רשימת המחלקות של החברה
export async function listDepartments(companyId: string): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('company_id', companyId)
    .order('name');

  if (error) throw error;
  return (data ?? []) as Department[];
}

// יוצר מחלקה חדשה
export async function createDepartment(companyId: string, name: string) {
  const { data, error } = await supabase
    .from('departments')
    .insert({ company_id: companyId, name })
    .select()
    .single();
  if (error) throw error;
  return data as Department;
}

// משנה שם של מחלקה
export async function updateDepartment(departmentId: string, name: string) {
  const { error } = await supabase.from('departments').update({ name }).eq('id', departmentId);
  if (error) throw error;
}

// סופר כמה רכבים ונהגים שייכים למחלקה (לפני מחיקה)
export async function countDepartmentUsage(departmentId: string): Promise<{ vehicles: number; drivers: number }> {
  const [vehicles, drivers] = await Promise.all([
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('department_id', departmentId),
    supabase.from('driver_details').select('id', { count: 'exact', head: true }).eq('department_id', departmentId),
  ]);
  if (vehicles.error) throw vehicles.error;
  if (drivers.error) throw drivers.error;
  return { vehicles: vehicles.count ?? 0, drivers: drivers.count ?? 0 };
}

// מוחק מחלקה
export async function deleteDepartment(companyId: string, departmentId: string) {
  const { error } = await supabase.from('departments').delete().eq('id', departmentId).eq('company_id', companyId);
  if (error) throw error;
}
