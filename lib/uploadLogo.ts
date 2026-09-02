import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { extensionForMimeType, isAllowedLogoMimeType } from './fileTypes';

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
  const mimeType = asset.mimeType || 'image/jpeg';
  if (!isAllowedLogoMimeType(mimeType)) {
    throw new Error('סוג הלוגו אינו נתמך. ניתן להעלות JPG, PNG, WEBP או HEIC');
  }
  const base64 = await new File(asset.uri).base64();
  const arrayBuffer = decode(base64);
  if (arrayBuffer.byteLength > MAX_LOGO_BYTES) {
    throw new Error('הלוגו גדול מדי. ניתן להעלות תמונה עד 5MB');
  }
  const fileExt = extensionForMimeType(mimeType);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

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
