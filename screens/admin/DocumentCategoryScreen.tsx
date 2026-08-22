import React, { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, ScreenHeader, AppText, Card, LoadingState, EmptyState } from '../../components/ui';
import { COLORS, RADIUS, SPACING, formatDate } from '../../lib/theme';
import { useCompany } from '../../lib/CompanyContext';
import { DocumentRow } from '../../lib/adminApi';
import {
  listDocuments,
  uploadDocument,
  deleteDocument,
  getDocumentUrl,
  pickImage,
  captureImage,
  pickFile,
} from '../../lib/documents';
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

  const load = useCallback(async () => {
    setDocs(await listDocuments(ownerType, ownerId, category));
  }, [ownerType, ownerId, category]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        try {
          await load();
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [load])
  );

  const addDocument = async () => {
    if (!companyId) return;

    const choose = async (source: 'camera' | 'gallery' | 'file') => {
      setUploading(true);
      try {
        const file =
          source === 'camera' ? await captureImage() : source === 'gallery' ? await pickImage() : await pickFile();
        if (!file) return;

        await uploadDocument({ companyId, ownerType, ownerId, category, title, file });
        await load();
      } catch (err: any) {
        Alert.alert('העלאה נכשלה', err?.message ?? 'נסה שוב');
      } finally {
        setUploading(false);
      }
    };

    if (Platform.OS === 'web') {
      await choose('file');
      return;
    }

    Alert.alert('הוספת מסמך', title, [
      { text: 'צלם מסמך', onPress: () => choose('camera') },
      { text: 'בחר תמונה', onPress: () => choose('gallery') },
      { text: 'בחר קובץ', onPress: () => choose('file') },
      { text: 'ביטול', style: 'cancel' },
    ]);
  };

  const openDocument = async (doc: DocumentRow) => {
    const url = await getDocumentUrl(doc);
    if (!url) {
      Alert.alert('שגיאה', 'לא ניתן לפתוח את המסמך כרגע');
      return;
    }
    Linking.openURL(url);
  };

  const removeDocument = (doc: DocumentRow) => {
    Alert.alert('מחיקת מסמך', `למחוק את "${doc.file_name ?? doc.title}"? הפעולה אינה הפיכה.`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDocument(doc);
            await load();
          } catch {
            Alert.alert('מחיקה נכשלה', 'נסה שוב');
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />

      {loading ? (
        <LoadingState />
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
              <Card key={doc.id} style={styles.docCard}>
                <TouchableOpacity onPress={() => removeDocument(doc)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={17} color={COLORS.dangerText} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.docInfo} onPress={() => openDocument(doc)} activeOpacity={0.7}>
                  <View style={styles.docIcon}>
                    <Ionicons
                      name={doc.mime_type?.includes('pdf') ? 'document-text-outline' : 'image-outline'}
                      size={18}
                      color={COLORS.accent}
                    />
                  </View>
                  <View style={styles.docTextWrap}>
                    <AppText weight="bold" style={styles.docName} numberOfLines={1}>
                      {doc.file_name ?? doc.title}
                    </AppText>
                    <AppText style={styles.docDate}>{formatDate(doc.created_at)}</AppText>
                  </View>
                </TouchableOpacity>
              </Card>
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
  docCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
  },
  docInfo: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md },
  docIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docTextWrap: { flex: 1, gap: 1 },
  docName: { fontSize: 14 },
  docDate: { fontSize: 11.5, color: COLORS.textFaint },

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
