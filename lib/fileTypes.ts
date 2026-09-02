const DOCUMENT_MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const LOGO_MIME_TYPES = new Set(Object.keys(DOCUMENT_MIME_TO_EXTENSION).filter((mime) => mime.startsWith('image/')));
const DOCUMENT_MIME_TYPES = new Set(Object.keys(DOCUMENT_MIME_TO_EXTENSION));

export function isAllowedDocumentMimeType(mimeType: string): boolean {
  return DOCUMENT_MIME_TYPES.has(mimeType.toLowerCase());
}

export function isAllowedLogoMimeType(mimeType: string): boolean {
  return LOGO_MIME_TYPES.has(mimeType.toLowerCase());
}

/** Returns a server-safe extension that agrees with an already validated MIME type. */
export function extensionForMimeType(mimeType: string): string {
  return DOCUMENT_MIME_TO_EXTENSION[mimeType.toLowerCase()] ?? 'bin';
}
