// פעולות על מסמך שמור: שם, אייקון, פתיחה, הורדה ומחיקה
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
import { t } from './i18n';
import { errorMessage } from './requestError';

export type DocumentSource = 'camera' | 'gallery' | 'file';

// השם שמוצג למסמך
export function documentDisplayName(doc: DocumentRow): string {
  return doc.file_name ?? doc.title;
}

// אייקון לפי סוג המסמך (תמונה או קובץ)
export function documentIconName(doc: DocumentRow): 'document-text-outline' | 'image-outline' {
  return doc.mime_type?.includes('pdf') ? 'document-text-outline' : 'image-outline';
}

// איך להציג את המסמך: כתמונה או כקובץ
export function documentViewerMode(doc: DocumentRow): 'image' | 'document' {
  return doc.mime_type?.startsWith('image/') ? 'image' : 'document';
}

// פותח את המקור שנבחר (מצלמה, גלריה או קבצים)
export async function pickDocumentSource(source: DocumentSource): Promise<PickedFile | null> {
  if (source === 'camera') return captureImage();
  if (source === 'gallery') return pickImage();
  return pickFile();
}

// שואל את המשתמש מאיפה להעלות מסמך
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

  showAlert(t('documents.addDocument'), title, [
    { text: t('documents.scanDocument'), onPress: () => choose('camera') },
    { text: t('documents.choosePhoto'), onPress: () => choose('gallery') },
    { text: t('documents.chooseFile'), onPress: () => choose('file') },
    { text: t('common.cancel'), style: 'cancel' },
  ]);
}

// קישור זמני לצפייה במסמך
export async function getDocumentViewUrl(doc: DocumentRow): Promise<string | null> {
  const url = await getDocumentUrl(doc);
  if (!url) showAlert(t('common.error'), t('documents.cannotOpen'));
  return url;
}

// פותח מסמך בלשונית חדשה או במציג של המכשיר
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
  Linking.openURL(url).catch(() => showAlert(t('common.error'), t('documents.cannotOpen')));
}

// מוריד מסמך ומציג הודעה אם נכשל
export async function downloadDocumentWithAlert(doc: DocumentRow) {
  try {
    await downloadDocument(doc);
  } catch (err: any) {
    showAlert(t('common.downloadFailed'), errorMessage(err, t('common.tryAgain')));
  }
}

// שואל לאישור ומוחק מסמך
export function confirmDeleteDocument(doc: DocumentRow, onDeleted: () => void | Promise<void>) {
  showAlert(t('documents.deleteTitle'), t('documents.deleteConfirm', { doc: documentDisplayName(doc) }), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('common.deleteAction'),
      style: 'destructive',
      onPress: async () => {
        try {
          await deleteDocument(doc);
          await onDeleted();
        } catch {
          showAlert(t('common.deleteFailed'), t('common.tryAgain'));
        }
      },
    },
  ]);
}
