import { decode } from 'base64-arraybuffer';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Image } from 'react-native';
import { supabase } from './supabase';

export type SigningTemplate = {
  id: string;
  company_id: string;
  title: string;
  source_file_path: string;
  source_file_name: string | null;
  status: 'draft' | 'ready';
  created_at: string;
};

export type SignatureRequest = {
  id: string;
  company_id: string;
  template_id: string;
  driver_id: string;
  status: 'pending' | 'completed' | 'declined';
  completed_at: string | null;
  signed_file_path: string | null;
  created_at: string;
  template?: { title: string } | null;
  driverName?: string | null;
};

export type SigningFile = { uri: string; name: string; mimeType: string; base64?: string };

export type DocuSealSession =
  | { mode: 'sign'; src: string; host: string }
  | { mode: 'preview'; token: string; host: string }
  | { mode: 'document'; src: string };

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
    let message = data?.error || error?.message || 'הפעולה נכשלה';
    const context = (error as any)?.context;
    if (context?.json) {
      try { message = (await context.json())?.error || message; } catch { /* keep message */ }
    }
    throw new Error(message);
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

async function imageToPdf(file: SigningFile): Promise<SigningFile> {
  if (!file.mimeType.startsWith('image/')) return file;
  const base64 = await readFileBase64(file);
  const { width, height } = await getImageSize(file.uri);
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
          }
          img {
            position: absolute;
            inset: 0;
            display: block;
            width: ${width}px;
            height: ${height}px;
            object-fit: fill;
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

export async function createTemplateBuilderSession(companyId: string, title: string, picked: SigningFile) {
  const file = await imageToPdf(picked);
  const bytes = decode(await readFileBase64(file));
  const localId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storageFileName = sanitizeStorageFileName(file.name);
  const path = `${companyId}/signing-templates/${localId}/${storageFileName}`;
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;

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

export async function listSigningTemplates(companyId: string): Promise<SigningTemplate[]> {
  const { data, error } = await supabase.from('signing_templates').select('*')
    .eq('company_id', companyId).eq('status', 'ready').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as SigningTemplate[];
}

export async function getSigningTemplateSourceUrl(template: SigningTemplate): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(template.source_file_path, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}

export async function downloadSigningTemplate(template: SigningTemplate): Promise<void> {
  const url = await getSigningTemplateSourceUrl(template);
  if (!url) throw new Error('לא ניתן להוריד את התבנית כרגע');

  const response = await fetch(url);
  const buffer = new Uint8Array(await response.arrayBuffer());
  const file = new File(Paths.cache, template.source_file_name ?? `${template.title}.pdf`);
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
  const file = new File(Paths.cache, `${request.template?.title || 'signed-document'}.pdf`);
  file.write(buffer);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf' });
  }
}

export async function listSignatureRequests(companyId?: string): Promise<SignatureRequest[]> {
  let query = supabase.from('signature_requests').select('*, template:signing_templates(title)');
  if (companyId) query = query.eq('company_id', companyId);
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
  return invoke<{ success: boolean; created: number; failed: string[] }>('assign-signing-template', {
    companyId, templateId, driverIds,
  });
}

export async function getSigningSession(requestId: string): Promise<DocuSealSession> {
  return invoke<DocuSealSession>('get-signing-session', { requestId });
}

export async function syncSigningRequest(requestId: string) {
  return invoke<{ success: boolean; status: SignatureRequest['status'] }>('sync-signing-request', { requestId });
}

export async function deleteSigningRecord(companyId: string, kind: 'template' | 'request', id: string) {
  return invoke<{ success: boolean }>('delete-signing-record', { companyId, kind, id });
}
