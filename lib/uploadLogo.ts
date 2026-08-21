import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

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
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  const fileExt = asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

  const { error } = await supabase.storage.from('company-logos').upload(fileName, blob, {
    contentType: asset.mimeType || 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from('company-logos').getPublicUrl(fileName);
  return data.publicUrl;
}
