import { Linking, Platform } from 'react-native';
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
import { showAlert } from './platformAlert';

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

  showAlert('הוספת מסמך', title, [
    { text: 'צלם מסמך', onPress: () => choose('camera') },
    { text: 'בחר תמונה', onPress: () => choose('gallery') },
    { text: 'בחר קובץ', onPress: () => choose('file') },
    { text: 'ביטול', style: 'cancel' },
  ]);
}

export async function getDocumentViewUrl(doc: DocumentRow): Promise<string | null> {
  const url = await getDocumentUrl(doc);
  if (!url) showAlert('שגיאה', 'לא ניתן לפתוח את המסמך כרגע');
  return url;
}

/**
 * Opens a stored document in a new tab (web) or the system viewer (native).
 * On the web the tab is opened in the click itself, before the signed URL is
 * fetched: browsers block a tab opened after an await (Safari always, Chrome
 * once the click is a few seconds old).
 */
export async function openDocumentExternally(doc: DocumentRow): Promise<void> {
  const tab = Platform.OS === 'web' ? window.open('', '_blank') : null;
  const url = await getDocumentViewUrl(doc);
  if (!url) {
    tab?.close();
    return;
  }
  if (tab) {
    tab.opener = null;
    tab.location.href = url;
    return;
  }
  Linking.openURL(url).catch(() => showAlert('שגיאה', 'לא ניתן לפתוח את המסמך כרגע'));
}

export async function downloadDocumentWithAlert(doc: DocumentRow) {
  try {
    await downloadDocument(doc);
  } catch (err: any) {
    showAlert('ההורדה נכשלה', err?.message ?? 'נסה שוב');
  }
}

export function confirmDeleteDocument(doc: DocumentRow, onDeleted: () => void | Promise<void>) {
  showAlert('מחיקת מסמך', `למחוק את "${documentDisplayName(doc)}"? הפעולה אינה הפיכה.`, [
    { text: 'ביטול', style: 'cancel' },
    {
      text: 'מחק',
      style: 'destructive',
      onPress: async () => {
        try {
          await deleteDocument(doc);
          await onDeleted();
        } catch {
          showAlert('מחיקה נכשלה', 'נסה שוב');
        }
      },
    },
  ]);
}
