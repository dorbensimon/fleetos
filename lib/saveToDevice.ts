import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

/**
 * Saving a remote file onto the user's own device — "ייצוא".
 *
 * There is no single API that works everywhere, so each platform gets the
 * route its users expect:
 *   • native + image  → straight into the phone's gallery (MediaLibrary)
 *   • native + other  → the share sheet, so it can go to Files/Drive/WhatsApp
 *   • web             → a normal browser download
 *
 * The gallery route falls back to the share sheet whenever it is not
 * possible (permission denied, or a build without the native module),
 * so the export never dead-ends on any device.
 */

export type SaveOutcome = 'gallery' | 'shared' | 'downloaded';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const UTI_BY_MIME: Record<string, string> = {
  'image/jpeg': 'public.jpeg',
  'image/jpg': 'public.jpeg',
  'image/png': 'public.png',
  'image/heic': 'public.heic',
  'image/webp': 'org.webmproject.webp',
  'application/pdf': 'com.adobe.pdf',
};

/**
 * MediaLibrary refuses URIs without an extension, and Android derives the
 * gallery entry's name from the file name — so the temp file has to carry
 * a clean, extension-bearing name rather than the storage path.
 */
function safeFileName(name: string, mimeType?: string | null): string {
  const base = (name || 'file').split(/[\\/]/).pop()!.replace(/[^\w.\-֐-׿ ]+/g, '_');
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(base);
  if (hasExt) return base;
  const ext = (mimeType && EXT_BY_MIME[mimeType.toLowerCase()]) || 'bin';
  return `${base}.${ext}`;
}

function isImage(mimeType?: string | null, fileName?: string | null): boolean {
  if (mimeType?.startsWith('image/')) return true;
  return /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(fileName ?? '');
}

/** Browser download, without navigating away from the app. */
async function saveOnWeb(url: string, fileName: string): Promise<SaveOutcome> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked late: Safari cancels the download if the blob dies too soon.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    // CORS or an offline blob read — the signed URL itself still downloads.
    window.open(url, '_blank', 'noopener');
  }
  return 'downloaded';
}

/**
 * Downloads `url` and hands it to the device.
 * Returns which route was actually taken, so the caller can word its
 * confirmation correctly ("נשמר בגלריה" vs "נשמר במכשיר").
 */
export async function saveFileToDevice(params: {
  url: string;
  fileName: string;
  mimeType?: string | null;
}): Promise<SaveOutcome> {
  const fileName = safeFileName(params.fileName, params.mimeType);

  if (Platform.OS === 'web') {
    return saveOnWeb(params.url, fileName);
  }

  const target = new File(Paths.cache, fileName);
  if (target.exists) target.delete();

  const downloaded = await File.downloadFileAsync(params.url, target);

  if (isImage(params.mimeType, fileName)) {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (permission.granted) {
        await MediaLibrary.saveToLibraryAsync(downloaded.uri);
        // The gallery holds its own copy now; the cache copy is dead weight.
        try {
          downloaded.delete();
        } catch {
          /* best effort */
        }
        return 'gallery';
      }
    } catch {
      // Fall through to the share sheet below.
    }
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(downloaded.uri, {
      mimeType: params.mimeType ?? undefined,
      UTI: (params.mimeType && UTI_BY_MIME[params.mimeType.toLowerCase()]) || undefined,
      dialogTitle: fileName,
    });
    // Left in cache on purpose: on Android the receiving app reads the file
    // after shareAsync has already resolved.
    return 'shared';
  }

  throw new Error('לא ניתן לשמור את הקובץ במכשיר זה');
}
