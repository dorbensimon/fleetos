// תמונה קטנה של מסמך (דפדפן)
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DK } from '../../../components/driverKit';
import { getSigningTemplateSourceUrl, type SigningTemplate } from '../../../lib/docuseal';
import { THUMB, thumbStyles } from './templateThumbStyles';

// זיכרון של עמודים שכבר צוירו
/** First pages, cached per document for the session so the list never renders one twice. */
const cache = new Map<string, Promise<string | null>>();

// מצייר את העמוד הראשון
function firstPage(template: SigningTemplate): Promise<string | null> {
  let pending = cache.get(template.id);
  if (!pending) {
    pending = (async () => {
      const url = await getSigningTemplateSourceUrl(template);
      if (!url) return null;
      const { renderPdfThumbnail } = await import('../../../components/desktop/signing/pdf.web');
      return renderPdfThumbnail(url, THUMB.width * 2);
    })().catch(() => null);
    cache.set(template.id, pending);
  }
  return pending;
}

// העמוד הראשון כדף קטן
/** The document's real first page as a small sheet of paper; the document mark until it's drawn. */
export function TemplateThumb({ template }: { template: SigningTemplate }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    if (template.source_file_path) firstPage(template).then((uri) => alive && setSrc(uri));
    return () => {
      alive = false;
    };
    // Keyed by id: a reload hands in new row objects for the same document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);
  return (
    <View style={thumbStyles.paper} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {src ? (
        <Image source={{ uri: src }} style={thumbStyles.page} resizeMode="cover" />
      ) : (
        <Ionicons name="document-text" size={22} color={DK.accent} />
      )}
    </View>
  );
}
