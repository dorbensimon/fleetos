import { supabase } from './supabase';
import { requestErrorDetails } from './requestError';
import { functionErrorMessage } from './functionError';
import type { SigningTemplate } from './docuseal';
import { t } from './i18n';

/**
 * A company admin's own signing templates, created on desktop ("מסמכים חתומים").
 * Files go to `<companyId>/signing-templates/<draftId>/`; the
 * company-signing-template Edge Function turns them into a DocuSeal template.
 */

export type SigningFieldKind =
  | 'signature'
  | 'date'
  | 'checkbox'
  | 'text'
  | 'driver_full_name'
  | 'driver_national_id'
  | 'driver_phone'
  | 'driver_license_number'
  | 'company_name';

/** A field placed on an uploaded PDF. Position and size are fractions of the page. */
export type PlacedSigningField = {
  id: string;
  kind: SigningFieldKind;
  label?: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type EditorInline =
  | { text: string; bold?: boolean; italic?: boolean; underline?: boolean; size?: number; color?: string; highlight?: boolean }
  | { field: SigningFieldKind; label?: string }
  /** A field set into the line of text (the id of an EditorPlacedField with the same `slot`). */
  | { slot: string };

/**
 * The editor's page is an A4 sheet at 96dpi. The server renders the same page
 * size, margins and type sizes, so a field dropped on the editor lands on the
 * same spot of the signing PDF.
 */
/**
 * The editor's A4 page at 96dpi. The company letterhead (logo, name, date)
 * takes `headerH` pixels at the top of the first page, then `headerGap`
 * before the text; the server draws the same header at the same size.
 */
/** Text sizes, colours and the marker the editor offers. The server accepts only these. */
export const EDITOR_TEXT_SIZES = [
  { px: 13, get label() { return t('editor.size.small'); } },
  { px: 16, get label() { return t('editor.size.normal'); } },
  { px: 20, get label() { return t('editor.size.large'); } },
  { px: 24, get label() { return t('editor.size.xlarge'); } },
] as const;
export const EDITOR_TEXT_COLORS = [
  { hex: '#111111', get label() { return t('editor.color.black'); } },
  { hex: '#5C6773', get label() { return t('editor.color.gray'); } },
  { hex: '#0088CC', get label() { return t('editor.color.blue'); } },
  { hex: '#D92D20', get label() { return t('editor.color.red'); } },
  { hex: '#12805C', get label() { return t('editor.color.green'); } },
] as const;
export const EDITOR_HIGHLIGHT = '#FFF1A8';

export const EDITOR_PAGE = { width: 794, height: 1123, padX: 72, padY: 64, headerH: 72, headerGap: 32 } as const;

/** A field dropped freely on an editor page. Pixels from the page's top-left corner. */
export type EditorPlacedField = {
  kind: SigningFieldKind;
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Set when the field sits inside a line of text: the server draws it there, in the flow, instead of at x/y. */
  slot?: string;
};

/** A document written in the in-app editor, as sent to the server. */
export type EditorBlock = {
  type: 'h1' | 'h2' | 'p' | 'ul' | 'ol' | 'hr';
  align?: 'right' | 'center' | 'left' | 'justify';
  /** One line for headings and paragraphs; one entry per item for lists; empty for a divider line. */
  content: EditorInline[][];
};

export function newDraftId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;
}

async function invoke<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('company-signing-template', { body });
  // Transport errors come back in English; show the Hebrew fallback instead.
  if (error || data?.error) throw new Error(await functionErrorMessage(error, data, fallback, false));
  return data as T;
}

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export function uploadExtension(file: File): string | null {
  const byType = EXTENSIONS[file.type];
  if (byType) return byType;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'jpeg') return 'jpg';
  return ext && ['pdf', 'png', 'jpg', 'docx'].includes(ext) ? ext : null;
}

/** Uploads the picked file and returns the path of the draft's PDF (Word and images are converted on the server). */
export async function uploadSigningDraft(companyId: string, draftId: string, file: File): Promise<string> {
  const ext = uploadExtension(file);
  if (!ext) throw new Error(t('signing.uploadTypes'));
  const folder = `${companyId}/signing-templates/${draftId}`;
  const uploadName = ext === 'pdf' ? 'document.pdf' : `original.${ext}`;
  const { error } = await supabase.storage.from('documents').upload(`${folder}/${uploadName}`, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: true,
  });
  if (error) {
    const details = requestErrorDetails(error, t('common.uploadFailed'));
    throw new Error([details.message, details.hint].filter(Boolean).join(' '));
  }
  if (ext === 'pdf') return `${folder}/document.pdf`;
  const { pdfPath } = await invoke<{ pdfPath: string }>({ action: 'prepare', companyId, draftId, uploadName }, t('signing.prepareFailed'));
  return pdfPath;
}

export async function signedDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 60 * 30);
  if (error || !data?.signedUrl) throw new Error(t('common.openFileFailed'));
  return data.signedUrl;
}

export async function createTemplateFromFields(companyId: string, draftId: string, title: string, fields: PlacedSigningField[]) {
  const payload = fields.map(({ kind, label, page, x, y, w, h }) => ({ kind, label, page, x, y, w, h }));
  const { template } = await invoke<{ template: SigningTemplate }>(
    { action: 'create', kind: 'pdf', companyId, draftId, title, fields: payload },
    t('signing.saveDocumentFailed'),
  );
  return template;
}

export async function createTemplateFromEditor(companyId: string, draftId: string, title: string, blocks: EditorBlock[], fields: EditorPlacedField[]) {
  const payload = fields.map(({ kind, label, x, y, w, h }) => ({ kind, label, x, y, w, h }));
  const { template } = await invoke<{ template: SigningTemplate }>(
    { action: 'create', kind: 'editor', companyId, draftId, title, blocks, fields: payload },
    t('signing.saveDocumentFailed'),
  );
  return template;
}
