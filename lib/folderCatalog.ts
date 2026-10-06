import { supabase } from './supabase';
import { t } from './i18n';

/**
 * Folders for every driver's file (migration 107, folder-catalog Edge Function).
 * The platform owner keeps the catalog; a company adds the folders it wants to
 * all its drivers and creates each folder's form from inside it.
 */

export type FolderKind = 'document' | 'checklist';

export type CatalogFolder = {
  id: string;
  title: string;
  kind: FolderKind;
  description: string | null;
  sort_order: number;
  retired_at: string | null;
  default_valid_months: number | null;
  default_lead_days: number;
  default_repeat_months: number | null;
};

/** The owner's view: how many companies use each folder. */
export type OwnerCatalogFolder = CatalogFolder & { companies: number; everAdded: boolean };

/** A company's view of one catalog folder. */
export type CompanyFolder = CatalogFolder & {
  added: boolean;
  form: { id: string; version: number; updatedAt: string } | null;
  /** An own document carrying the folder's name (offered for linking). */
  sameName: { id: string; kind: FolderKind } | null;
  /** Own forms of the same kind that can become the folder's form. */
  linkable: { id: string; title: string }[];
};

export type FolderVersion = {
  version: number;
  replaced_at: string;
  source_file_path: string | null;
  docuseal_template_id: number | null;
};

/** An error from the server, with its machine-readable `code` when it sent one. */
export class FolderActionError extends Error {
  code?: string;
  data?: Record<string, unknown>;
  constructor(message: string, code?: string, data?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

/** Calls an Edge Function and keeps the server's Hebrew message and `code` on failure. */
export async function callFunction<T>(name: string, body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error && !data?.error) return data as T;
  let payload = data as Record<string, unknown> | null;
  const response = (error as { context?: Response } | null)?.context;
  if (!payload && response && typeof response.clone === 'function') {
    try {
      payload = await response.clone().json();
    } catch {
      payload = null;
    }
  }
  const message = typeof payload?.error === 'string' && payload.error ? payload.error : fallback;
  throw new FolderActionError(message, typeof payload?.code === 'string' ? payload.code : undefined, payload ?? undefined);
}

const call = <T>(body: Record<string, unknown>, fallback: string) => callFunction<T>('folder-catalog', body, fallback);

// ── Company ──────────────────────────────────────────────────────────

export async function listCompanyFolders(companyId: string): Promise<{ folders: CompanyFolder[]; driverCount: number }> {
  return call({ action: 'company-list', companyId }, t('folders.loadFailed'));
}

/** Adds a folder to every driver of the company (or links an own form to it). */
export async function addCompanyFolder(companyId: string, catalogId: string, linkTemplateId?: string): Promise<{ templateId: string | null }> {
  return call({ action: 'company-add', companyId, catalogId, linkTemplateId: linkTemplateId ?? null }, t('folders.addFailed'));
}

/** Removes a folder. Returns `pending` (drivers still waiting to sign) instead when it must ask first. */
export async function removeCompanyFolder(companyId: string, catalogId: string, cancelPending = false): Promise<{ success?: boolean; pending?: number }> {
  return call({ action: 'company-remove', companyId, catalogId, cancelPending }, t('folders.removeFailed'));
}

export async function listFormVersions(templateId: string): Promise<FolderVersion[]> {
  const { data, error } = await supabase.from('signing_template_versions')
    .select('version, replaced_at, source_file_path, docuseal_template_id')
    .eq('template_id', templateId)
    .order('version', { ascending: false });
  if (error) throw new Error(t('folders.versionsLoadFailed'));
  return (data ?? []) as FolderVersion[];
}

export async function restoreFormVersion(companyId: string, templateId: string, version: number, expectedVersion: number) {
  return callFunction<{ template: unknown; pendingOld: number }>(
    'company-signing-template',
    { action: 'restore-version', companyId, templateId, version, expectedVersion },
    t('folders.restoreFailed'),
  );
}

// ── Owner ────────────────────────────────────────────────────────────

export type CatalogFolderInput = {
  title: string;
  kind: FolderKind;
  description: string | null;
  defaultValidMonths: number | null;
  defaultLeadDays: number;
  defaultRepeatMonths: number | null;
};

export async function listCatalog(): Promise<OwnerCatalogFolder[]> {
  const { folders } = await call<{ folders: OwnerCatalogFolder[] }>({ action: 'catalog-list' }, t('folders.loadFailed'));
  return folders;
}

export async function createCatalogFolder(input: CatalogFolderInput): Promise<CatalogFolder> {
  const { folder } = await call<{ folder: CatalogFolder }>({ action: 'catalog-create', ...input }, t('folders.saveFailed'));
  return folder;
}

export async function updateCatalogFolder(id: string, input: Omit<CatalogFolderInput, 'kind'>): Promise<CatalogFolder> {
  const { folder } = await call<{ folder: CatalogFolder }>({ action: 'catalog-update', id, ...input }, t('folders.saveFailed'));
  return folder;
}

export async function reorderCatalog(ids: string[]): Promise<void> {
  await call({ action: 'catalog-reorder', ids }, t('folders.saveFailed'));
}

export async function retireCatalogFolder(id: string, retired: boolean): Promise<void> {
  await call({ action: 'catalog-retire', id, retired }, t('folders.saveFailed'));
}

export async function deleteCatalogFolder(id: string): Promise<void> {
  await call({ action: 'catalog-delete', id }, t('folders.deleteFailed'));
}
