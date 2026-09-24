import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { extensionForMimeType, isAllowedLogoMimeType } from './fileTypes';
import { readBlobUrlAsBase64 } from './webDownload';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export async function pickAndUploadLogo(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('נדרשת הרשאת גישה לתמונות כדי להעלות לוגו');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
    allowsEditing: true,
    aspect: [1, 1],
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];
  return uploadCompanyLogoImage(asset.uri, asset.mimeType || 'image/jpeg');
}

/**
 * Uploads a picked image to the `company-logos` bucket and returns its public
 * URL. `folder` scopes it to a company (admins may only write their own
 * company's folder); omitted, it lands at the bucket root (owner-only).
 */
export async function uploadCompanyLogoImage(uri: string, mimeType: string, folder?: string, prefix?: string): Promise<string> {
  if (!isAllowedLogoMimeType(mimeType)) {
    throw new Error('סוג הלוגו אינו נתמך. ניתן להעלות JPG, PNG או WEBP');
  }
  const base64 = Platform.OS === 'web'
    ? await readBlobUrlAsBase64(uri)
    : await new File(uri).base64();
  const arrayBuffer = decode(base64);
  if (arrayBuffer.byteLength > MAX_LOGO_BYTES) {
    throw new Error('הלוגו גדול מדי. ניתן להעלות תמונה עד 5MB');
  }
  const fileExt = extensionForMimeType(mimeType);
  const baseName = `${prefix ? `${prefix}-` : ''}${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
  const fileName = folder ? `${folder}/${baseName}` : baseName;

  const { error } = await supabase.storage.from('company-logos').upload(fileName, arrayBuffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from('company-logos').getPublicUrl(fileName);
  return data.publicUrl;
}
