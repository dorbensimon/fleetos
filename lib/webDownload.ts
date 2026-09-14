import { Platform } from 'react-native';

/**
 * Browser downloads cannot use Expo's native cache/share-sheet flow. Keep the
 * browser-only DOM work here so callers can share one download path on every
 * platform.
 */
export async function downloadRemoteFileOnWeb(url: string, fileName: string): Promise<boolean> {
  if (Platform.OS !== 'web') return false;

  const response = await fetch(url);
  if (!response.ok) throw new Error('הורדת הקובץ נכשלה');

  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  return true;
}

/**
 * expo-file-system's File class is an unimplemented stub on web, so a picker
 * result's blob: URL must be read back into base64 through the DOM instead.
 */
export async function readBlobUrlAsBase64(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('קריאת הקובץ נכשלה'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('קריאת הקובץ נכשלה'));
        return;
      }
      resolve(result.split(',')[1] ?? '');
    };
    reader.readAsDataURL(blob);
  });
}
