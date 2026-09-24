import { supabase } from './supabase';
import { functionErrorMessage } from './functionError';
import type { SigningTemplate } from './docuseal';

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
  | { field: SigningFieldKind; label?: string };

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
  { px: 13, label: 'קטן' },
  { px: 16, label: 'רגיל' },
  { px: 20, label: 'גדול' },
  { px: 24, label: 'גדול מאוד' },
] as const;
export const EDITOR_TEXT_COLORS = [
  { hex: '#111111', label: 'שחור' },
  { hex: '#5C6773', label: 'אפור' },
  { hex: '#0088CC', label: 'כחול' },
  { hex: '#D92D20', label: 'אדום' },
  { hex: '#12805C', label: 'ירוק' },
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
  if (!ext) throw new Error('אפשר להעלות קובץ PDF, וורד (docx) או תמונה');
  const folder = `${companyId}/signing-templates/${draftId}`;
  const uploadName = ext === 'pdf' ? 'document.pdf' : `original.${ext}`;
  const { error } = await supabase.storage.from('documents').upload(`${folder}/${uploadName}`, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: true,
  });
  if (error) throw new Error('העלאת הקובץ נכשלה. בדקו את החיבור ונסו שוב.');
  if (ext === 'pdf') return `${folder}/document.pdf`;
  const { pdfPath } = await invoke<{ pdfPath: string }>({ action: 'prepare', companyId, draftId, uploadName }, 'הכנת הקובץ נכשלה');
  return pdfPath;
}

export async function signedDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 60 * 30);
  if (error || !data?.signedUrl) throw new Error('לא הצלחנו לפתוח את הקובץ');
  return data.signedUrl;
}

export async function createTemplateFromFields(companyId: string, draftId: string, title: string, fields: PlacedSigningField[]) {
  const payload = fields.map(({ kind, label, page, x, y, w, h }) => ({ kind, label, page, x, y, w, h }));
  const { template } = await invoke<{ template: SigningTemplate }>(
    { action: 'create', kind: 'pdf', companyId, draftId, title, fields: payload },
    'שמירת המסמך נכשלה',
  );
  return template;
}

export async function createTemplateFromEditor(companyId: string, draftId: string, title: string, blocks: EditorBlock[], fields: EditorPlacedField[]) {
  const payload = fields.map(({ kind, label, x, y, w, h }) => ({ kind, label, x, y, w, h }));
  const { template } = await invoke<{ template: SigningTemplate }>(
    { action: 'create', kind: 'editor', companyId, draftId, title, blocks, fields: payload },
    'שמירת המסמך נכשלה',
  );
  return template;
}
