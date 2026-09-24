import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DocumentRow } from '../../../lib/adminApi';
import { getDocumentUrl } from '../../../lib/documents';
import { documentIconName } from '../../../lib/documentActions';
import { DESKTOP_COLORS, webOnly } from '../desktopTheme';

/**
 * A miniature of a document's first page — the photo itself for images, the
 * rendered first page for PDFs — drawn as a small sheet of paper. Previews
 * are cached per document for the session, so reopening a folder (or the
 * same file appearing twice) doesn't render it again.
 */
const previewCache = new Map<string, Promise<string | null>>();

async function loadPreview(doc: DocumentRow): Promise<string | null> {
  const url = await getDocumentUrl(doc);
  if (!url) return null;
  if (doc.mime_type?.startsWith('image/')) return url;
  if (doc.mime_type?.includes('pdf')) {
    const { renderPdfThumbnail } = await import('../signing/pdf.web');
    return renderPdfThumbnail(url, 160);
  }
  return null;
}

function previewOf(doc: DocumentRow): Promise<string | null> {
  let pending = previewCache.get(doc.id);
  if (!pending) {
    pending = loadPreview(doc).catch(() => null);
    previewCache.set(doc.id, pending);
  }
  return pending;
}

export function DocumentPreview({ doc, width, height }: { doc: DocumentRow; width: number; height: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setLoaded(false);
    previewOf(doc).then((uri) => {
      if (!cancelled) setSrc(uri);
    });
    return () => {
      cancelled = true;
    };
    // Keyed by id: a reload hands in new row objects for the same file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  return (
    <View style={[styles.paper, { width, height }]}>
      {!loaded && (
        <View style={styles.placeholder}>
          <Ionicons name={documentIconName(doc)} size={Math.round(width * 0.36)} color={DESKTOP_COLORS.inkFaint} />
        </View>
      )}
      {src && (
        <Image
          source={{ uri: src }}
          style={[styles.image as ImageStyle, loaded && styles.imageLoaded]}
          resizeMode="cover"
          onLoad={() => setLoaded(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    backgroundColor: DESKTOP_COLORS.surface,
    overflow: 'hidden',
    ...webOnly({ boxShadow: '0 1px 3px rgba(22,34,46,0.10)' }),
  },
  placeholder: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: DESKTOP_COLORS.surfaceMuted },
  image: { width: '100%', height: '100%', opacity: 0, ...webOnly({ objectPosition: 'top', transition: 'opacity 200ms ease-out' }) },
  imageLoaded: { opacity: 1 },
});
