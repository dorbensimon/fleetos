// התיקיות שהבעלים הוסיף לחברה (לרכבים ולתיק הנהג)
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { t } from './i18n';

/**
 * The owner's own folders for a company (migration 112), beside the fixed
 * folders in the code. A file in one is a normal `documents` row whose
 * category is `folder:<id>`, so every screen that lists, uploads or deletes
 * documents treats it like any other folder.
 */

export type FolderOwnerType = 'vehicle' | 'driver';

export type CompanyFolder = {
  id: string;
  company_id: string;
  owner_type: FolderOwnerType;
  title: string;
  tracks_expiry: boolean;
  position: number;
  created_at: string;
};

const COLUMNS = 'id, company_id, owner_type, title, tracks_expiry, position, created_at';
// הקידומת של קטגוריית תיקייה של הבעלים
const PREFIX = 'folder:';

// הקטגוריה של הקבצים בתיקייה
/** The `documents.category` of the files in a folder. */
export const folderCategory = (folder: Pick<CompanyFolder, 'id'>) => `${PREFIX}${folder.id}`;
// האם הקטגוריה שייכת לתיקייה של הבעלים
export const isCompanyFolderCategory = (category: string | null | undefined) => !!category?.startsWith(PREFIX);

// התיקיות של חברה
export async function listCompanyFolders(companyId: string, ownerType?: FolderOwnerType): Promise<CompanyFolder[]> {
  let query = supabase.from('company_document_folders').select(COLUMNS).eq('company_id', companyId);
  if (ownerType) query = query.eq('owner_type', ownerType);
  const { data, error } = await query.order('position').order('created_at');
  if (error) throw error;
  return (data ?? []) as CompanyFolder[];
}

// טקסט שגיאה מוכר
function folderError(error: { code?: string; message?: string } | null): Error {
  if (error?.code === '23505') return new Error(t('companyFolders.titleTaken'));
  if (error?.message?.includes('folder_has_files')) return new Error(t('companyFolders.hasFiles'));
  return new Error(t('common.tryAgainShortly'));
}

// מוסיף תיקייה לחברה, או לכל החברות
/**
 * Adds a folder to one company, or to every company (`allCompanies`); a
 * company that already has a folder by that name is left as it is.
 * Returns how many companies got it.
 */
export async function addCompanyFolder(input: { companyId: string; ownerType: FolderOwnerType; title: string; tracksExpiry: boolean; allCompanies?: boolean }): Promise<number> {
  const title = input.title.trim().replace(/\s+/g, ' ');
  let companyIds = [input.companyId];
  if (input.allCompanies) {
    const { data, error } = await supabase.from('companies').select('id');
    if (error) throw folderError(error);
    companyIds = (data ?? []).map((row: { id: string }) => row.id);
  }
  const { data: existing, error: existingError } = await supabase
    .from('company_document_folders')
    .select('company_id, title, position')
    .eq('owner_type', input.ownerType)
    .in('company_id', companyIds);
  if (existingError) throw folderError(existingError);
  const rows = (existing ?? []) as { company_id: string; title: string; position: number }[];
  const taken = new Set(rows.filter((row) => row.title.trim().toLowerCase() === title.toLowerCase()).map((row) => row.company_id));
  if (!input.allCompanies && taken.has(input.companyId)) throw new Error(t('companyFolders.titleTaken'));
  const next = (companyId: string) => Math.max(-1, ...rows.filter((row) => row.company_id === companyId).map((row) => row.position)) + 1;
  const inserts = companyIds
    .filter((id) => !taken.has(id))
    .map((companyId) => ({ company_id: companyId, owner_type: input.ownerType, title, tracks_expiry: input.tracksExpiry, position: next(companyId) }));
  if (!inserts.length) return 0;
  const { error } = await supabase.from('company_document_folders').insert(inserts);
  if (error) throw folderError(error);
  return inserts.length;
}

// משנה שם או תוקף של תיקייה
export async function updateCompanyFolder(id: string, patch: Partial<Pick<CompanyFolder, 'title' | 'tracks_expiry' | 'position'>>): Promise<void> {
  const clean = patch.title !== undefined ? { ...patch, title: patch.title.trim().replace(/\s+/g, ' ') } : patch;
  const { error } = await supabase.from('company_document_folders').update(clean).eq('id', id);
  if (error) throw folderError(error);
}

// מוחק תיקייה ריקה
/** Removes an empty folder; one with files is refused by the server (`companyFolders.hasFiles`). */
export async function deleteCompanyFolder(id: string): Promise<void> {
  const { error } = await supabase.from('company_document_folders').delete().eq('id', id);
  if (error) throw folderError(error);
}

// כמה קבצים יש בכל תיקייה
export async function countFolderFiles(companyId: string, folders: CompanyFolder[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!folders.length) return counts;
  const { data, error } = await supabase
    .from('documents')
    .select('category')
    .eq('company_id', companyId)
    .in('category', folders.map(folderCategory));
  if (error) throw error;
  for (const row of (data ?? []) as { category: string }[]) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  return counts;
}

// התיקיות של החברה בתוך מסך (רכב או נהג)
/** A screen's view of the company's folders of one kind; an error leaves the list empty (the fixed folders still show). */
export function useCompanyFolders(companyId: string | null | undefined, ownerType: FolderOwnerType) {
  const [folders, setFolders] = useState<CompanyFolder[]>([]);
  const reload = useCallback(async () => {
    if (!companyId) return setFolders([]);
    try {
      setFolders(await listCompanyFolders(companyId, ownerType));
    } catch {
      setFolders([]);
    }
  }, [companyId, ownerType]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { folders, reload };
}
