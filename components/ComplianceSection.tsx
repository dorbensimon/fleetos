import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, ExpiryBadge, PrimaryButton } from './ui';
import { DateField } from './ui/DateField';
import { COLORS, RADIUS, SPACING, expiryState, formatDate } from '../lib/theme';
import {
  ComplianceItem,
  DocumentRow,
  OwnerType,
  listCompliance,
  upsertCompliance,
} from '../lib/adminApi';
import {
  ComplianceItemDef,
  complianceCatalog,
  groupByCategory,
} from '../lib/compliance';
import {
  listDocuments,
  uploadDocument,
  deleteDocument,
  downloadDocument,
  getDocumentUrl,
  pickImage,
  captureImage,
  pickFile,
} from '../lib/documents';

/**
 * The grouped compliance + documents block used by both the vehicle
 * file (A3) and the driver file (A5).
 *
 * The grouping is the point: "ביטוחים" is a single section holding the
 * mandatory and comprehensive policies as two separate items, each with
 * its own expiry date and its own attached files — rather than a flat,
 * endless list of unrelated entries.
 */

export function ComplianceSection({
  companyId,
  ownerType,
  ownerId,
}: {
  companyId: string;
  ownerType: OwnerType;
  ownerId: string;
}) {
  const [items, setItems] = useState<Map<string, ComplianceItem>>(new Map());
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);

  // Date edits are staged here and only sent to the server when the admin
  // taps "אישור" — picking a date used to save instantly, which meant one
  // slip of the finger silently overwrote the real date.
  const [drafts, setDrafts] = useState<Record<string, { last_date?: string | null; expiry_date?: string | null }>>(
    {}
  );
  const [savingItem, setSavingItem] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [complianceRows, documentRows] = await Promise.all([
      listCompliance(ownerType, ownerId),
      listDocuments(ownerType, ownerId),
    ]);
    setItems(new Map(complianceRows.map((c) => [c.item_type, c])));
    setDocs(documentRows);
  }, [ownerType, ownerId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const setDraftDate = (def: ComplianceItemDef, field: 'expiry_date' | 'last_date', iso: string | null) => {
    setDrafts((prev) => ({ ...prev, [def.itemType]: { ...prev[def.itemType], [field]: iso } }));
  };

  const confirmDates = async (def: ComplianceItemDef) => {
    const draft = drafts[def.itemType];
    if (!draft) return;
    const existing = items.get(def.itemType);
    const lastDate = draft.last_date !== undefined ? draft.last_date : existing?.last_date ?? null;
    const expiryDate = draft.expiry_date !== undefined ? draft.expiry_date : existing?.expiry_date ?? null;

    setSavingItem(def.itemType);
    try {
      await upsertCompliance({
        companyId,
        ownerType,
        ownerId,
        category: def.category,
        itemType: def.itemType,
        lastDate,
        expiryDate,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[def.itemType];
        return next;
      });
      await load();
    } catch {
      Alert.alert('שמירה נכשלה', 'לא הצלחנו לשמור את התאריך. נסה שוב.');
    } finally {
      setSavingItem(null);
    }
  };

  const addDocument = async (def: ComplianceItemDef) => {
    const choose = async (source: 'camera' | 'gallery' | 'file') => {
      setBusyItem(def.itemType);
      try {
        const file =
          source === 'camera'
            ? await captureImage()
            : source === 'gallery'
            ? await pickImage()
            : await pickFile();

        if (!file) return;

        await uploadDocument({
          companyId,
          ownerType,
          ownerId,
          category: def.category,
          title: def.label,
          file,
          complianceItemId: items.get(def.itemType)?.id ?? null,
          expiryDate: items.get(def.itemType)?.expiry_date ?? null,
        });
        await load();
      } catch (err: any) {
        Alert.alert('העלאה נכשלה', err?.message ?? 'נסה שוב');
      } finally {
        setBusyItem(null);
      }
    };

    if (Platform.OS === 'web') {
      // No native action sheet on web — the file picker covers both cases.
      await choose('file');
      return;
    }

    Alert.alert('הוספת מסמך', def.label, [
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

  const downloadDoc = async (doc: DocumentRow) => {
    try {
      await downloadDocument(doc);
    } catch (err: any) {
      Alert.alert('ההורדה נכשלה', err?.message ?? 'נסה שוב');
    }
  };

  const removeDocument = (doc: DocumentRow) => {
    const run = async () => {
      try {
        await deleteDocument(doc);
        await load();
      } catch {
        Alert.alert('מחיקה נכשלה', 'נסה שוב');
      }
    };

    Alert.alert('מחיקת מסמך', `למחוק את "${doc.file_name ?? doc.title}"? הפעולה אינה הפיכה.`, [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: run },
    ]);
  };

  if (loading) {
    return (
      <Card>
        <ActivityIndicator color={COLORS.accent} />
      </Card>
    );
  }

  const groups = groupByCategory(complianceCatalog(ownerType));

  return (
    <>
      {groups.map((group) => (
        <Card key={group.category} style={styles.card}>
          <View style={styles.groupHead}>
            <Ionicons name={group.icon as any} size={18} color={COLORS.accent} />
            <AppText weight="bold" style={styles.groupTitle}>
              {group.label}
            </AppText>
          </View>

          {group.items.map((def) => {
            const item = items.get(def.itemType);
            const itemDocs = docs.filter((d) => d.title === def.label);
            const isOpen = expanded === def.itemType;
            const draft = drafts[def.itemType];
            const currentLastDate = draft?.last_date !== undefined ? draft.last_date : item?.last_date ?? null;
            const currentExpiryDate =
              draft?.expiry_date !== undefined ? draft.expiry_date : item?.expiry_date ?? null;
            const isDirty =
              !!draft &&
              ((draft.last_date !== undefined && draft.last_date !== (item?.last_date ?? null)) ||
                (draft.expiry_date !== undefined && draft.expiry_date !== (item?.expiry_date ?? null)));

            return (
              <View key={def.itemType} style={styles.item}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.itemHead}
                  onPress={() => setExpanded(isOpen ? null : def.itemType)}
                >
                  <Ionicons
                    name={isOpen ? 'chevron-down' : 'chevron-back'}
                    size={15}
                    color={COLORS.textFaint}
                  />
                  <View style={styles.itemLabelWrap}>
                    <AppText weight="bold" style={styles.itemLabel}>
                      {def.label}
                    </AppText>
                    {itemDocs.length > 0 && (
                      <AppText style={styles.itemDocCount}>
                        {itemDocs.length} מסמכים
                      </AppText>
                    )}
                  </View>
                  <ExpiryBadge
                    state={expiryState(item?.expiry_date)}
                    label={item?.expiry_date ? formatDate(item.expiry_date) : 'חסר'}
                  />
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.itemBody}>
                    {def.tracksLastDate && (
                      <View style={styles.dateRow}>
                        <AppText style={styles.dateLabel}>בדיקה אחרונה</AppText>
                        <View style={styles.dateInput}>
                          <DateField
                            value={currentLastDate}
                            onChange={(iso) => setDraftDate(def, 'last_date', iso)}
                          />
                        </View>
                      </View>
                    )}

                    <View style={styles.dateRow}>
                      <AppText style={styles.dateLabel}>
                        {def.tracksLastDate ? 'בדיקה הבאה' : 'תוקף'}
                      </AppText>
                      <View style={styles.dateInput}>
                        <DateField
                          value={currentExpiryDate}
                          onChange={(iso) => setDraftDate(def, 'expiry_date', iso)}
                        />
                      </View>
                    </View>

                    {isDirty && (
                      <PrimaryButton
                        label="אישור"
                        icon="checkmark-outline"
                        style={styles.confirmBtn}
                        loading={savingItem === def.itemType}
                        onPress={() => confirmDates(def)}
                      />
                    )}

                    {itemDocs.map((doc) => (
                      <View key={doc.id} style={styles.docRow}>
                        <TouchableOpacity
                          style={styles.docNameWrap}
                          onPress={() => openDocument(doc)}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={
                              doc.mime_type?.includes('pdf')
                                ? 'document-text-outline'
                                : 'image-outline'
                            }
                            size={16}
                            color={COLORS.textFaint}
                          />
                          <AppText style={styles.docName} numberOfLines={1}>
                            {doc.file_name ?? doc.title}
                          </AppText>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => downloadDoc(doc)} hitSlop={8}>
                          <Ionicons name="download-outline" size={16} color={COLORS.accent} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeDocument(doc)} hitSlop={8}>
                          <Ionicons name="trash-outline" size={16} color={COLORS.dangerText} />
                        </TouchableOpacity>
                      </View>
                    ))}

                    <TouchableOpacity
                      style={styles.uploadBtn}
                      activeOpacity={0.8}
                      onPress={() => addDocument(def)}
                      disabled={busyItem === def.itemType}
                    >
                      {busyItem === def.itemType ? (
                        <ActivityIndicator size="small" color={COLORS.accent} />
                      ) : (
                        <>
                          <Ionicons name="cloud-upload-outline" size={16} color={COLORS.accent} />
                          <AppText weight="bold" style={styles.uploadText}>
                            העלה מסמך
                          </AppText>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      ))}

      <GeneralDocuments
        companyId={companyId}
        ownerType={ownerType}
        ownerId={ownerId}
        docs={docs.filter((d) => d.category === 'general')}
        onChanged={load}
      />
    </>
  );
}

/** Free-form documents that don't belong to a tracked expiry item. */
function GeneralDocuments({
  companyId,
  ownerType,
  ownerId,
  docs,
  onChanged,
}: {
  companyId: string;
  ownerType: OwnerType;
  ownerId: string;
  docs: DocumentRow[];
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const choose = async (source: 'camera' | 'gallery' | 'file') => {
      setBusy(true);
      try {
        const file =
          source === 'camera'
            ? await captureImage()
            : source === 'gallery'
            ? await pickImage()
            : await pickFile();
        if (!file) return;
        await uploadDocument({
          companyId,
          ownerType,
          ownerId,
          category: 'general',
          title: 'מסמך כללי',
          file,
        });
        await onChanged();
      } catch (err: any) {
        Alert.alert('העלאה נכשלה', err?.message ?? 'נסה שוב');
      } finally {
        setBusy(false);
      }
    };

    if (Platform.OS === 'web') {
      await choose('file');
      return;
    }

    Alert.alert('הוספת מסמך', 'מסמך כללי', [
      { text: 'צלם מסמך', onPress: () => choose('camera') },
      { text: 'בחר תמונה', onPress: () => choose('gallery') },
      { text: 'בחר קובץ', onPress: () => choose('file') },
      { text: 'ביטול', style: 'cancel' },
    ]);
  };

  const remove = (doc: DocumentRow) => {
    Alert.alert('מחיקת מסמך', `למחוק את "${doc.file_name ?? doc.title}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDocument(doc);
            await onChanged();
          } catch {
            Alert.alert('מחיקה נכשלה', 'נסה שוב');
          }
        },
      },
    ]);
  };

  const open = async (doc: DocumentRow) => {
    const url = await getDocumentUrl(doc);
    if (url) Linking.openURL(url);
  };

  const download = async (doc: DocumentRow) => {
    try {
      await downloadDocument(doc);
    } catch (err: any) {
      Alert.alert('ההורדה נכשלה', err?.message ?? 'נסה שוב');
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.groupHead}>
        <Ionicons name="folder-open-outline" size={18} color={COLORS.accent} />
        <AppText weight="bold" style={styles.groupTitle}>
          מסמכים כלליים
        </AppText>
      </View>

      {docs.length === 0 && (
        <AppText style={styles.emptyDocs}>אין עדיין מסמכים כלליים</AppText>
      )}

      {docs.map((doc) => (
        <View key={doc.id} style={styles.docRow}>
          <TouchableOpacity style={styles.docNameWrap} onPress={() => open(doc)} activeOpacity={0.7}>
            <Ionicons
              name={doc.mime_type?.includes('pdf') ? 'document-text-outline' : 'image-outline'}
              size={16}
              color={COLORS.textFaint}
            />
            <AppText style={styles.docName} numberOfLines={1}>
              {doc.file_name ?? doc.title}
            </AppText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => download(doc)} hitSlop={8}>
            <Ionicons name="download-outline" size={16} color={COLORS.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => remove(doc)} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color={COLORS.dangerText} />
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={styles.uploadBtn} activeOpacity={0.8} onPress={add} disabled={busy}>
        {busy ? (
          <ActivityIndicator size="small" color={COLORS.accent} />
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={16} color={COLORS.accent} />
            <AppText weight="bold" style={styles.uploadText}>
              העלה מסמך
            </AppText>
          </>
        )}
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 2 },
  groupHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.sm,
  },
  groupTitle: { fontSize: 15.5 },

  item: { borderTopWidth: 1, borderTopColor: COLORS.divider },
  itemHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 12,
  },
  itemLabelWrap: { flex: 1, gap: 1 },
  itemLabel: { fontSize: 13.5 },
  itemDocCount: { fontSize: 11, color: COLORS.textFaint },

  itemBody: { paddingBottom: SPACING.md, gap: SPACING.sm },
  dateRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md },
  dateLabel: { fontSize: 12.5, color: COLORS.textMuted, width: 88 },
  dateInput: { flex: 1 },
  confirmBtn: { marginTop: 2 },

  docRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.field,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  docNameWrap: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  docName: { flex: 1, fontSize: 12.5, color: COLORS.textMuted },

  uploadBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.accentSoft,
    backgroundColor: COLORS.accentSoft,
    marginTop: 4,
  },
  uploadText: { fontSize: 13, color: COLORS.accent },

  emptyDocs: { fontSize: 12.5, color: COLORS.textFaint, paddingVertical: SPACING.md },
});
