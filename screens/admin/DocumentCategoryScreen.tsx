import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, ScreenHeader, AppText, LoadingState, EmptyState, ErrorState } from '../../components/ui';
import { AdminGradientBackground } from '../../components/admin/AdminGradientBackground';
import { DocumentFileRow } from '../../components/documents/DocumentFileRow';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { DocumentRow } from '../../lib/adminApi';
import { listDocuments, uploadDocument } from '../../lib/documents';
import {
  chooseDocumentSource,
  confirmDeleteDocument,
  documentDisplayName,
  documentViewerMode,
  downloadDocumentWithAlert,
  getDocumentViewUrl,
  pickDocumentSource,
  type DocumentSource,
} from '../../lib/documentActions';
import { RootStackParamList } from '../../navigation/types';

/**
 * A generic "one category, one screen" document list — reused by every
 * row on the driver card (A5 menu): license scans, notes, procedure 6,
 * hazmat certs, etc. all follow the same shape (upload → list → view/
 * delete), so one screen serves all of them instead of duplicating it
 * eleven times.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'DocumentCategory'>;

export default function DocumentCategoryScreen({ route, navigation }: Props) {
  const { ownerType, ownerId, category, title } = route.params;
  const { companyId } = useCompany();

  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await listDocuments(ownerType, ownerId, category);
      if (requestId === loadRequest.current) setDocs(rows);
    } catch (err: any) {
      if (requestId === loadRequest.current) setError(err?.message ?? 'טעינת המסמכים נכשלה');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [ownerType, ownerId, category]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        loadRequest.current += 1;
      };
    }, [load])
  );

  const addDocument = async () => {
    if (!companyId) return;

    chooseDocumentSource(title, async (source: DocumentSource) => {
      setUploading(true);
      try {
        const file = await pickDocumentSource(source);
        if (!file) return;

        await uploadDocument({ companyId, ownerType, ownerId, category, title, file });
        await load();
      } catch (err: any) {
        Alert.alert('העלאה נכשלה', err?.message ?? 'נסה שוב');
      } finally {
        setUploading(false);
      }
    });
  };

  const openDocument = async (doc: DocumentRow) => {
    const url = await getDocumentViewUrl(doc);
    if (!url) return;

    navigation.navigate('DocusealWebView', {
      mode: documentViewerMode(doc),
      title: documentDisplayName(doc),
      src: url,
    });
  };

  return (
    <Screen>
      <AdminGradientBackground />
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <View style={styles.content}>
          {docs.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title="אין עדיין מסמכים"
              hint="הנהג עדיין לא צילם או העלה מסמכים בקטגוריה זו"
            />
          ) : (
            docs.map((doc) => (
              <DocumentFileRow
                key={doc.id}
                doc={doc}
                variant="card"
                showDate
                onOpen={openDocument}
                onDownload={downloadDocumentWithAlert}
                onDelete={(item) => confirmDeleteDocument(item, load)}
              />
            ))
          )}

          <TouchableOpacity style={styles.uploadBtn} activeOpacity={0.85} onPress={addDocument} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={17} color={COLORS.textInverse} />
                <AppText weight="bold" style={styles.uploadText}>
                  הוסף מסמך
                </AppText>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.sm, flex: 1 },
  uploadBtn: {
    marginTop: SPACING.sm,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.text,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadText: { fontSize: 14.5, color: COLORS.textInverse },
});
