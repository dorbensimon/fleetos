import { Alert, Platform } from 'react-native';
import type { DocumentRow } from './adminApi';
import {
  captureImage,
  deleteDocument,
  downloadDocument,
  getDocumentUrl,
  pickFile,
  pickImage,
  type PickedFile,
} from './documents';

export type DocumentSource = 'camera' | 'gallery' | 'file';

export function documentDisplayName(doc: DocumentRow): string {
  return doc.file_name ?? doc.title;
}

export function documentIconName(doc: DocumentRow): 'document-text-outline' | 'image-outline' {
  return doc.mime_type?.includes('pdf') ? 'document-text-outline' : 'image-outline';
}

export function documentViewerMode(doc: DocumentRow): 'image' | 'document' {
  return doc.mime_type?.startsWith('image/') ? 'image' : 'document';
}

export async function pickDocumentSource(source: DocumentSource): Promise<PickedFile | null> {
  if (source === 'camera') return captureImage();
  if (source === 'gallery') return pickImage();
  return pickFile();
}

export function chooseDocumentSource(
  title: string,
  onChoose: (source: DocumentSource) => void | Promise<void>
) {
  const choose = (source: DocumentSource) => {
    void Promise.resolve(onChoose(source));
  };

  if (Platform.OS === 'web') {
    choose('file');
    return;
  }

  Alert.alert('הוספת מסמך', title, [
    { text: 'צלם מסמך', onPress: () => choose('camera') },
    { text: 'בחר תמונה', onPress: () => choose('gallery') },
    { text: 'בחר קובץ', onPress: () => choose('file') },
    { text: 'ביטול', style: 'cancel' },
  ]);
}

export async function getDocumentViewUrl(doc: DocumentRow): Promise<string | null> {
  const url = await getDocumentUrl(doc);
  if (!url) Alert.alert('שגיאה', 'לא ניתן לפתוח את המסמך כרגע');
  return url;
}

export async function downloadDocumentWithAlert(doc: DocumentRow) {
  try {
    await downloadDocument(doc);
  } catch (err: any) {
    Alert.alert('ההורדה נכשלה', err?.message ?? 'נסה שוב');
  }
}

export function confirmDeleteDocument(doc: DocumentRow, onDeleted: () => void | Promise<void>) {
  Alert.alert('מחיקת מסמך', `למחוק את "${documentDisplayName(doc)}"? הפעולה אינה הפיכה.`, [
    { text: 'ביטול', style: 'cancel' },
    {
      text: 'מחק',
      style: 'destructive',
      onPress: async () => {
        try {
          await deleteDocument(doc);
          await onDeleted();
        } catch {
          Alert.alert('מחיקה נכשלה', 'נסה שוב');
        }
      },
    },
  ]);
}
