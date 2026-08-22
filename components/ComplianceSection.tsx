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
import { AppText, Card, ExpiryBadge } from './ui';
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

  const saveDate = async (
    def: ComplianceItemDef,
    field: 'expiry_date' | 'last_date',
    iso: string | null
  ) => {
    const existing = items.get(def.itemType);
    // Optimistic: the row updates instantly, then we persist.
    const next: ComplianceItem = {
      id: existing?.id ?? `temp-${def.itemType}`,
      company_id: companyId,
      owner_type: ownerType,
      owner_id: ownerId,
      category: def.category,
      item_type: def.itemType,
      last_date: field === 'last_date' ? iso : existing?.last_date ?? null,
      expiry_date: field === 'expiry_date' ? iso : existing?.expiry_date ?? null,
      notes: existing?.notes ?? null,
    };
    setItems((prev) => new Map(prev).set(def.itemType, next));

    try {
      await upsertCompliance({
        companyId,
        ownerType,
        ownerId,
        category: def.category,
        itemType: def.itemType,
        lastDate: next.last_date,
        expiryDate: next.expiry_date,
      });
      await load();
    } catch {
      Alert.alert('שמירה נכשלה', 'לא הצלחנו לשמור את התאריך. נסה שוב.');
      await load();
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
                            value={item?.last_date ?? null}
                            onChange={(iso) => saveDate(def, 'last_date', iso)}
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
                          value={item?.expiry_date ?? null}
                          onChange={(iso) => saveDate(def, 'expiry_date', iso)}
                        />
                      </View>
                    </View>

                    {itemDocs.map((doc) => (
                      <View key={doc.id} style={styles.docRow}>
                        <TouchableOpacity onPress={() => removeDocument(doc)} hitSlop={8}>
                          <Ionicons name="trash-outline" size={16} color={COLORS.dangerText} />
                        </TouchableOpacity>
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
    setBusy(true);
    try {
      const file = await pickFile();
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
          <TouchableOpacity onPress={() => remove(doc)} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color={COLORS.dangerText} />
          </TouchableOpacity>
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
