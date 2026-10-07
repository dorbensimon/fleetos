import { supabase } from './supabase';
import { callFunction } from './callFunction';
import { t } from './i18n';
import type { EditorBlock, EditorPlacedField } from './companySigningTemplates';
import type { ChecklistForm } from './checklistForms';

/**
 * The platform owner's ready templates (migration 110, form-templates Edge
 * Function). A company may start a new form from one: the template's content
 * opens in the editor (or the checklist builder), the company changes what it
 * wants and saves its own form. Later changes to the template never touch it.
 */

export type FormTemplateKind = 'document' | 'checklist';

/** A document template: the editor's block model and its fields, as the editor saves them. */
export type DocumentTemplateContent = { blocks: EditorBlock[]; fields: EditorPlacedField[] };

export type FormTemplate = {
  id: string;
  title: string;
  kind: FormTemplateKind;
  description: string | null;
  content: DocumentTemplateContent | ChecklistForm;
  sort_order: number;
  hidden_at: string | null;
  created_at: string;
  updated_at: string;
};

/** The owner's view: how many companies have a form made from it. */
export type OwnerFormTemplate = FormTemplate & { companies: number };

export type FormTemplateInput = {
  title: string;
  description: string | null;
  content: DocumentTemplateContent | ChecklistForm;
};

/** The templates a company can start from (RLS returns only visible ones to a manager). */
export async function listFormTemplates(): Promise<FormTemplate[]> {
  const { data, error } = await supabase.from('form_templates')
    .select('id, title, kind, description, content, sort_order, hidden_at, created_at, updated_at')
    .is('hidden_at', null)
    .order('sort_order')
    .order('created_at');
  if (error) throw new Error(t('templates.loadFailed'));
  return (data ?? []) as FormTemplate[];
}

const call = <T>(body: Record<string, unknown>, fallback: string) => callFunction<T>('form-templates', body, fallback);

// ── Owner ────────────────────────────────────────────────────────────

export async function listOwnerFormTemplates(): Promise<OwnerFormTemplate[]> {
  const { templates } = await call<{ templates: OwnerFormTemplate[] }>({ action: 'list' }, t('templates.loadFailed'));
  return templates;
}

export async function createFormTemplate(kind: FormTemplateKind, input: FormTemplateInput): Promise<FormTemplate> {
  const { template } = await call<{ template: FormTemplate }>({ action: 'create', kind, ...input }, t('templates.saveFailed'));
  return template;
}

/** `content` left out keeps the current content (a rename only). */
export async function updateFormTemplate(id: string, input: Omit<FormTemplateInput, 'content'> & { content?: FormTemplateInput['content'] }): Promise<FormTemplate> {
  const { template } = await call<{ template: FormTemplate }>({ action: 'update', id, ...input }, t('templates.saveFailed'));
  return template;
}

export async function setFormTemplateHidden(id: string, hidden: boolean): Promise<void> {
  await call({ action: 'hide', id, hidden }, t('templates.saveFailed'));
}

export async function deleteFormTemplate(id: string): Promise<void> {
  await call({ action: 'delete', id }, t('templates.deleteFailed'));
}

export async function reorderFormTemplates(ids: string[]): Promise<void> {
  await call({ action: 'reorder', ids }, t('templates.saveFailed'));
}
