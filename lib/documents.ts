import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { DocumentRow, OwnerType } from './adminApi';

/**
 * Documents live in a PRIVATE storage bucket, unlike company logos.
 * They contain ID numbers, licences and insurance papers, so they are
 * never served from a public URL — the app asks for a short-lived
 * signed URL each time one needs to be opened.
 */
const BUCKET = 'documents';
const SIGNED_URL_TTL_SECONDS = 60 * 10;

interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

/** Opens the photo library, for scans and photographed paperwork. */
export async function pickImage(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('נדרשת הרשאת גישה לתמונות');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.85,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const ext = asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
  return {
    uri: asset.uri,
    name: asset.fileName || `scan-${Date.now()}.${ext}`,
    mimeType: asset.mimeType || 'image/jpeg',
  };
}

/** Opens the camera directly. */
export async function captureImage(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('נדרשת הרשאת גישה למצלמה');
  }

  const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: `photo-${Date.now()}.jpg`,
    mimeType: asset.mimeType || 'image/jpeg',
  };
}

/** Opens the system file picker, for PDFs already on the device. */
export async function pickFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name || `file-${Date.now()}`,
    mimeType: asset.mimeType || 'application/octet-stream',
  };
}

/**
 * Uploads a picked file and records it in the `documents` table.
 *
 * The bytes are read as base64 rather than through fetch().blob(),
 * because on React Native the fetch route silently produces empty
 * files for local URIs.
 */
export async function uploadDocument(params: {
  companyId: string;
  ownerType: OwnerType;
  ownerId: string;
  category: string;
  title: string;
  file: PickedFile;
  complianceItemId?: string | null;
  expiryDate?: string | null;
}): Promise<DocumentRow> {
  const { file } = params;

  const base64 = await new File(file.uri).base64();
  const bytes = decode(base64);

  const ext = file.name.split('.').pop() || 'bin';
  const path = `${params.companyId}/${params.ownerType}/${params.ownerId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.mimeType, upsert: false });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('documents')
    .insert({
      company_id: params.companyId,
      owner_type: params.ownerType,
      owner_id: params.ownerId,
      compliance_item_id: params.complianceItemId ?? null,
      category: params.category,
      title: params.title,
      file_path: path,
      file_name: file.name,
      mime_type: file.mimeType,
      file_size: bytes.byteLength,
      expiry_date: params.expiryDate ?? null,
    })
    .select()
    .single();

  if (error) {
    // Do not leave an orphaned file behind if the row could not be written.
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }

  return data as DocumentRow;
}

export async function listDocuments(
  ownerType: OwnerType,
  ownerId: string,
  category?: string
): Promise<DocumentRow[]> {
  let query = supabase
    .from('documents')
    .select('*')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId);

  if (category) query = query.eq('category', category);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as DocumentRow[];
}

/** Removes both the row and the underlying file. */
export async function deleteDocument(doc: DocumentRow) {
  const { error } = await supabase.from('documents').delete().eq('id', doc.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([doc.file_path]);
}

/** Short-lived URL for viewing or downloading a document. */
export async function getDocumentUrl(doc: DocumentRow): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS);

  if (error) return null;
  return data.signedUrl;
}
