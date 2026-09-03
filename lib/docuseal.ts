import { decode } from 'base64-arraybuffer';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Image } from 'react-native';
import { supabase } from './supabase';
import { functionErrorMessage } from './functionError';
import { safeFileName } from './fileNames';

export type SigningTemplate = {
  id: string;
  company_id: string;
  title: string;
  source_file_path: string | null;
  source_file_name: string | null;
  status: 'draft' | 'ready';
  archived_at?: string | null;
  created_at: string;
};

export type SignatureRequest = {
  id: string;
  company_id: string;
  template_id: string;
  driver_id: string;
  status: 'pending' | 'completed' | 'declined' | 'cancelled' | 'failed';
  completed_at: string | null;
  signed_file_path: string | null;
  created_at: string;
  archived_at?: string | null;
  failure_reason?: string | null;
  email_reminder_count?: number;
  last_email_reminder_at?: string | null;
  next_email_reminder_at?: string | null;
  template?: { title: string } | null;
  driverName?: string | null;
};

export type CompanySigningSettings = {
  email_reminders_enabled: boolean;
  initial_reminder_delay_hours: number;
  repeat_reminder_interval_hours: number;
  max_email_reminders: number;
};

export const DEFAULT_COMPANY_SIGNING_SETTINGS: CompanySigningSettings = {
  email_reminders_enabled: true,
  initial_reminder_delay_hours: 72,
  repeat_reminder_interval_hours: 72,
  max_email_reminders: 3,
};

export type SigningFile = { uri: string; name: string; mimeType: string; base64?: string; width?: number; height?: number };
export type DocuSealPreviewField = {
  name: string;
  type: 'signature' | 'stamp';
  areas: Array<{ page: number; x: number; y: number; w: number; h: number }>;
};
export type DocuSealSession =
  | { mode: 'sign'; src: string; host: string }
  | { mode: 'preview'; token: string; host: string }
  | { mode: 'document'; src: string; previewFields?: DocuSealPreviewField[] };

function sanitizeStorageFileName(name: string): string {
  const trimmed = name.trim();
  const normalized = trimmed.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const extMatch = normalized.match(/\.([^.]+)$/);
  const ext = extMatch?.[1]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
  const base = (extMatch ? normalized.slice(0, -extMatch[0].length) : normalized)
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${base || 'document'}.${ext || 'pdf'}`;
}

function rawBase64(value: string): string {
  const separator = value.indexOf(',');
  return value.startsWith('data:') && separator >= 0 ? value.slice(separator + 1) : value;
}

async function readFileBase64(file: SigningFile): Promise<string> {
  return rawBase64(file.base64 || await new File(file.uri).base64());
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error || data?.error) {
    throw new Error(await functionErrorMessage(error, data, 'הפעולה נכשלה'));
  }
  return data as T;
}

async function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => reject(new Error('לא הצלחנו לקרוא את גודל התמונה'))
    );
  });
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

/** The IHDR chunk always follows the 8-byte PNG signature: 4-byte length, "IHDR", 4-byte width, 4-byte height. */
function parsePngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const isPng =
    bytes.length >= 24 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (!isPng) return null;
  return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
}

/** Walks JPEG markers to the first SOFn (start-of-frame) segment, which holds the pixel dimensions. */
function parseJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xff) { offset += 1; continue; } // fill byte between markers
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    const segmentLength = readUint16BE(bytes, offset + 2);
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      return { height: readUint16BE(bytes, offset + 5), width: readUint16BE(bytes, offset + 7) };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

/**
 * Reads pixel dimensions straight from the image bytes we already have
 * in memory, instead of asking RN's `Image.getSize(uri)` to reload the
 * asset from its URI. `Image.getSize` resolves through the native image
 * loader keyed off the URI scheme, which is unreliable for the
 * `content://` URIs Android's `expo-document-picker` returns (unlike the
 * `file://` URIs `expo-image-picker`'s gallery flow returns) — this is
 * what broke "PDF או תמונה" uploads picked via the Files app while
 * "תמונה מהגלריה" kept working. Falls back to `Image.getSize` only for
 * formats we don't parse ourselves (e.g. HEIC).
 */
async function imageDimensions(file: SigningFile, base64: string): Promise<{ width: number; height: number }> {
  // ImagePicker reports display-oriented dimensions, so an iPhone photo whose
  // JPEG pixels are stored sideways still produces a portrait PDF page.
  if (file.width && file.height && file.width > 0 && file.height > 0) {
    return { width: file.width, height: file.height };
  }
  const bytes = new Uint8Array(decode(base64));
  const parsed = parsePngDimensions(bytes) || parseJpegDimensions(bytes);
  if (parsed && parsed.width > 0 && parsed.height > 0) return parsed;
  return getImageSize(file.uri);
}

function imagePageDimensions(imageWidth: number, imageHeight: number): { width: number; height: number } {
  // Keep the PDF page at a reliable print size while making its aspect ratio
  // identical to the selected image. Matching ratios means `contain` can show
  // every pixel without either cropping or adding white bands.
  const longestEdge = 842;
  const scale = longestEdge / Math.max(imageWidth, imageHeight);
  return {
    width: Math.max(72, Math.round(imageWidth * scale)),
    height: Math.max(72, Math.round(imageHeight * scale)),
  };
}

async function imageToPdf(file: SigningFile): Promise<SigningFile> {
  if (!file.mimeType.startsWith('image/')) return file;
  const base64 = await readFileBase64(file);
  const imageSize = await imageDimensions(file, base64);
  const { width, height } = imagePageDimensions(imageSize.width, imageSize.height);
  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=${width}, initial-scale=1">
        <style>
          @page { size: ${width}px ${height}px; margin: 0; }
          html, body {
            width: ${width}px;
            height: ${height}px;
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: #fff;
          }
          img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
        </style>
      </head>
      <body><img src="data:${file.mimeType};base64,${base64}"></body>
    </html>`;
  const result = await Print.printToFileAsync({
    html,
    width,
    height,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  if (result.numberOfPages !== 1) {
    throw new Error('לא ניתן להתאים את התמונה לעמוד יחיד. נסה לבחור את התמונה מחדש.');
  }
  return { uri: result.uri, name: `${file.name.replace(/\.[^.]+$/, '')}.pdf`, mimeType: 'application/pdf' };
}

async function uploadSigningSourceFile(companyId: string, picked: SigningFile): Promise<{ file: SigningFile; path: string }> {
  const file = await imageToPdf(picked);
  const bytes = decode(await readFileBase64(file));
  const localId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storageFileName = sanitizeStorageFileName(file.name);
  const path = `${companyId}/signing-templates/${localId}/${storageFileName}`;
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;
  return { file, path };
}

export async function createTemplateBuilderSession(companyId: string, title: string, picked: SigningFile) {
  const { file, path } = await uploadSigningSourceFile(companyId, picked);
  try {
    return await invoke<{ templateId: string; token: string; host: string }>('create-template-builder-session', {
      companyId, title, filePath: path, fileName: file.name,
    });
  } catch (error) {
    await supabase.storage.from('documents').remove([path]);
    throw error;
  }
}

export async function finalizeSigningTemplate(companyId: string, templateId: string) {
  return invoke<{ success: boolean }>('finalize-signing-template', { companyId, templateId });
}

export async function listSigningTemplates(companyId: string, includeArchived = false): Promise<SigningTemplate[]> {
  let query = supabase.from('signing_templates').select('*')
    .eq('company_id', companyId).eq('status', 'ready').order('created_at', { ascending: false });
  query = includeArchived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as SigningTemplate[];
}

export async function getSigningTemplateSourceUrl(template: SigningTemplate): Promise<string | null> {
  if (!template.source_file_path) return null;
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(template.source_file_path, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}

export async function getSigningTemplatePreviewSession(templateId: string): Promise<Extract<DocuSealSession, { mode: 'document' }>> {
  return invoke<Extract<DocuSealSession, { mode: 'document' }>>('get-template-preview-session', { templateId });
}

export async function downloadSigningTemplate(template: SigningTemplate): Promise<void> {
  const url = await getSigningTemplateSourceUrl(template);
  if (!url) throw new Error('לא ניתן להוריד את התבנית כרגע');

  const response = await fetch(url);
  const buffer = new Uint8Array(await response.arrayBuffer());
  const file = new File(Paths.cache, safeFileName(template.source_file_name ?? `${template.title}.pdf`, 'template.pdf'));
  file.write(buffer);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf' });
  }
}

export async function downloadSignedRequest(request: SignatureRequest): Promise<void> {
  const session = await getSigningSession(request.id);
  if (session.mode !== 'document') {
    throw new Error('המסמך החתום עדיין לא זמין להורדה');
  }

  const response = await fetch(session.src);
  const buffer = new Uint8Array(await response.arrayBuffer());
  const file = new File(Paths.cache, safeFileName(`${request.template?.title || 'signed-document'}.pdf`, 'signed-document.pdf'));
  file.write(buffer);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf' });
  }
}

export async function listSignatureRequests(companyId?: string, includeArchived = false): Promise<SignatureRequest[]> {
  let query = supabase.from('signature_requests').select('*, template:signing_templates(title)');
  if (companyId) query = query.eq('company_id', companyId);
  query = includeArchived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  const requests = (data || []) as unknown as SignatureRequest[];
  if (!companyId || !requests.length) return requests;

  const ids = [...new Set(requests.map((item) => item.driver_id))];
  const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids);
  const names = new Map((profiles || []).map((profile) => [profile.id, profile.full_name]));
  return requests.map((item) => ({ ...item, driverName: names.get(item.driver_id) }));
}

export async function assignSigningTemplate(companyId: string, templateId: string, driverIds: string[]) {
  return invoke<{ success: boolean; created: number; failed: string[]; message?: string }>('assign-signing-template', {
    companyId, templateId, driverIds,
  });
}

export async function getSigningSession(requestId: string): Promise<DocuSealSession> {
  return invoke<DocuSealSession>('get-signing-session', { requestId });
}

export async function syncSigningRequest(requestId: string) {
  return invoke<{ success: boolean; status: SignatureRequest['status'] }>('sync-signing-request', { requestId });
}

export async function resendSigningRequest(requestId: string) {
  return invoke<{ success: boolean; channel: 'email' }>('resend-signing-request', { requestId });
}

export async function getCompanySigningSettings(companyId: string): Promise<CompanySigningSettings> {
  const { data, error } = await supabase
    .from('company_signing_settings')
    .select('email_reminders_enabled, initial_reminder_delay_hours, repeat_reminder_interval_hours, max_email_reminders')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  return (data as CompanySigningSettings | null) || DEFAULT_COMPANY_SIGNING_SETTINGS;
}

export async function updateCompanySigningSettings(companyId: string, settings: CompanySigningSettings) {
  return invoke<{ success: boolean; channel: 'email'; settings: CompanySigningSettings }>('update-company-signing-settings', {
    companyId,
    emailRemindersEnabled: settings.email_reminders_enabled,
    initialReminderDelayHours: settings.initial_reminder_delay_hours,
    repeatReminderIntervalHours: settings.repeat_reminder_interval_hours,
    maxEmailReminders: settings.max_email_reminders,
  });
}

export async function deleteSigningRecord(companyId: string, kind: 'template' | 'request', id: string, action: 'archive' | 'restore' | 'permanent-delete' = 'archive') {
  return invoke<{ success: boolean }>('delete-signing-record', { companyId, kind, id, action });
}
