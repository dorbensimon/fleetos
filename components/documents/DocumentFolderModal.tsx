import React, { useEffect, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../ui';
import type { DocumentRow } from '../../lib/adminApi';
import { COLORS, RADIUS, SPACING, formatDate } from '../../lib/theme';
import { getDocumentUrl } from '../../lib/documents';
import { confirmDeleteDocument, documentIconName, downloadDocumentWithAlert, openDocumentExternally } from '../../lib/documentActions';

const webOnly = (style: Record<string, unknown>) => (Platform.OS === 'web' ? style : {});

function DocumentThumb({ doc, onDeleted }: { doc: DocumentRow; onDeleted: () => void | Promise<void> }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = doc.mime_type?.startsWith('image/');

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    getDocumentUrl(doc)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Keyed by id: a reload hands in new row objects for the same file, and
    // re-signing its URL each time would flash the thumbnail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, isImage]);

  const open = () => openDocumentExternally(doc);

  return (
    <View style={styles.thumbCard}>
      <TouchableOpacity onPress={open} activeOpacity={0.8}>
        {isImage && url ? (
          <Image source={{ uri: url }} style={styles.thumbImage} resizeMode="cover" />
        ) : (
          <View style={[styles.thumbImage, styles.thumbIconWrap]}>
            <Ionicons name={documentIconName(doc)} size={26} color={COLORS.accent} />
          </View>
        )}
      </TouchableOpacity>
      <AppText style={styles.thumbDate} numberOfLines={1}>{formatDate(doc.created_at)}</AppText>
      <TouchableOpacity style={styles.thumbDelete} hitSlop={8} onPress={() => confirmDeleteDocument(doc, onDeleted)}>
        <Ionicons name="trash-outline" size={13} color={COLORS.dangerText} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.thumbDownload} hitSlop={8} onPress={() => downloadDocumentWithAlert(doc)}>
        <Ionicons name="download-outline" size={13} color={COLORS.accent} />
      </TouchableOpacity>
    </View>
  );
}

/**
 * Centered modal for browsing a document folder's contents — desktop only.
 * Shows every document as a small thumbnail with its upload date, a
 * delete button and a download button, instead of navigating away to a
 * separate list screen. `footer` is a slot for a compact upload control
 * (e.g. a small button next to a desktop date-picker) — kept generic so
 * each caller can lay it out for its own upload flow.
 */
export function DocumentFolderModal({
  visible,
  title,
  docs,
  onClose,
  onDeleted,
  footer,
  children,
}: {
  visible: boolean;
  title: string;
  docs: DocumentRow[];
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const reduceMotion = Platform.OS === 'web' && typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, reduceMotion ? styles.backdropInReduced : styles.backdropIn]} onPress={onClose} />
      <View style={styles.centerWrap} pointerEvents="box-none">
        <View style={[styles.modalCard, reduceMotion ? styles.modalCardInReduced : styles.modalCardIn]}>
          <View style={styles.modalHeader}>
            <AppText weight="bold" style={styles.modalTitle}>{title}</AppText>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={COLORS.textFaint} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBodyContent}>
            {children}

            {docs.length === 0 ? (
              <AppText style={styles.emptyText}>אין עדיין מסמכים בקטגוריה זו</AppText>
            ) : (
              <View style={styles.thumbGrid}>
                {docs.map((doc) => (
                  <DocumentThumb key={doc.id} doc={doc} onDeleted={onDeleted} />
                ))}
              </View>
            )}

            {footer}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,32,0.45)' },
  backdropIn: webOnly({
    animationKeyframes: { from: { opacity: 0 }, to: { opacity: 1 } },
    animationDuration: '180ms',
    animationTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
    animationFillMode: 'backwards',
  }),
  backdropInReduced: webOnly({
    animationKeyframes: { from: { opacity: 0 }, to: { opacity: 1 } },
    animationDuration: '200ms',
    animationTimingFunction: 'ease',
    animationFillMode: 'backwards',
  }),
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 640, maxHeight: '85%', backgroundColor: COLORS.card, borderRadius: RADIUS.lg, overflow: 'hidden' },
  modalCardIn: webOnly({
    animationKeyframes: {
      from: { opacity: 0, transform: [{ scale: 0.96 }, { translateY: 6 }] },
      to: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] },
    },
    animationDuration: '220ms',
    animationTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
    animationFillMode: 'backwards',
  }),
  modalCardInReduced: webOnly({
    animationKeyframes: { from: { opacity: 0 }, to: { opacity: 1 } },
    animationDuration: '200ms',
    animationTimingFunction: 'ease',
    animationFillMode: 'backwards',
  }),
  modalHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  modalTitle: { fontSize: 16 },
  modalBodyContent: { padding: SPACING.lg, gap: SPACING.md },
  emptyText: { fontSize: 13, color: COLORS.textFaint, textAlign: 'center', paddingVertical: SPACING.lg },

  thumbGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  thumbCard: { width: 132, gap: 6 },
  thumbImage: { width: '100%', height: 92, borderRadius: RADIUS.sm, backgroundColor: COLORS.field, alignItems: 'center', justifyContent: 'center' },
  thumbIconWrap: {},
  thumbDate: { fontSize: 11, color: COLORS.textFaint, textAlign: 'center' },
  thumbDelete: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbDownload: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
