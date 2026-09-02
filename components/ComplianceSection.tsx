import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, ExpiryBadge, PrimaryButton, useToast } from './ui';
import { DocumentFileRow } from './documents/DocumentFileRow';
import { DateField } from './ui/DateField';
import { COLORS, EXPIRY_STYLE, RADIUS, SPACING } from '../lib/theme';
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
  complianceBadgeLabel,
  complianceBadgeState,
  complianceTargetDate,
  groupByCategory,
} from '../lib/compliance';
import { listDocuments, uploadDocument } from '../lib/documents';
import {
  chooseDocumentSource,
  confirmDeleteDocument,
  downloadDocumentWithAlert,
  getDocumentViewUrl,
  pickDocumentSource,
  type DocumentSource,
} from '../lib/documentActions';

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
  focusItemType,
  spacious,
}: {
  companyId: string;
  ownerType: OwnerType;
  ownerId: string;
  focusItemType?: string | null;
  spacious?: boolean;
}) {
  const { showToast } = useToast();
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

  useEffect(() => {
    if (focusItemType) setExpanded(focusItemType);
  }, [focusItemType]);

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
      showToast('נשמר בהצלחה');
    } catch {
      Alert.alert('שמירה נכשלה', 'לא הצלחנו לשמור את התאריך. נסה שוב.');
    } finally {
      setSavingItem(null);
    }
  };

  const addDocument = async (def: ComplianceItemDef) => {
    chooseDocumentSource(def.label, async (source: DocumentSource) => {
      setBusyItem(def.itemType);
      try {
        const file = await pickDocumentSource(source);

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
    });
  };

  const openDocument = async (doc: DocumentRow) => {
    const url = await getDocumentViewUrl(doc);
    if (!url) return;
    Linking.openURL(url);
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
        <Card key={group.category} style={[styles.card, spacious && styles.cardSpacious]}>
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
            const badgeState = complianceBadgeState(def, item);
            const derivedTargetDate = complianceTargetDate(def, item);
            const isDirty =
              !!draft &&
              ((draft.last_date !== undefined && draft.last_date !== (item?.last_date ?? null)) ||
                (draft.expiry_date !== undefined && draft.expiry_date !== (item?.expiry_date ?? null)));

            return (
              <View key={def.itemType} style={styles.item}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={[styles.itemHead, spacious && styles.itemHeadSpacious]}
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
                    {def.tracksLastDate && item?.last_date && !item?.expiry_date && (
                      <AppText
                        style={[
                          styles.itemStatusNote,
                          { color: EXPIRY_STYLE[badgeState].fg },
                        ]}
                      >
                        בדיקה אחרונה
                        {derivedTargetDate ? ' · תוקף מחושב אוטומטית' : ''}
                      </AppText>
                    )}
                  </View>
                  <ExpiryBadge
                    state={badgeState}
                    label={complianceBadgeLabel(def, item)}
                  />
                </TouchableOpacity>

                {isOpen && (
                  <View style={[styles.itemBody, spacious && styles.itemBodySpacious]}>
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
                        {def.tracksLastDate ? 'בדיקה הבאה (אופציונלי)' : 'תוקף'}
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
                      <DocumentFileRow
                        key={doc.id}
                        doc={doc}
                        onOpen={openDocument}
                        onDownload={downloadDocumentWithAlert}
                        onDelete={(item) => confirmDeleteDocument(item, load)}
                      />
                    ))}

                    <TouchableOpacity
                      style={styles.uploadBtn}
                      activeOpacity={0.8}
                      onPress={() => addDocument(def)}
                      disabled={busyItem === def.itemType}
                    >
                      {busyItem === def.itemType ? (
                        <>
                          <ActivityIndicator size="small" color={COLORS.accent} />
                          <AppText weight="bold" style={styles.uploadText}>
                            מעבד ומעלה…
                          </AppText>
                        </>
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
    chooseDocumentSource('מסמך כללי', async (source: DocumentSource) => {
      setBusy(true);
      try {
        const file = await pickDocumentSource(source);
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
    });
  };

  const remove = (doc: DocumentRow) => {
    confirmDeleteDocument(doc, onChanged);
  };

  const open = async (doc: DocumentRow) => {
    const url = await getDocumentViewUrl(doc);
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
        <DocumentFileRow
          key={doc.id}
          doc={doc}
          onOpen={open}
          onDownload={downloadDocumentWithAlert}
          onDelete={remove}
        />
      ))}

      <TouchableOpacity style={styles.uploadBtn} activeOpacity={0.8} onPress={add} disabled={busy}>
        {busy ? (
          <>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <AppText weight="bold" style={styles.uploadText}>
              מעבד ומעלה…
            </AppText>
          </>
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
  cardSpacious: { marginBottom: SPACING.sm, paddingVertical: SPACING.sm },
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
  itemHeadSpacious: { paddingVertical: SPACING.md },
  itemLabelWrap: { flex: 1, gap: 1 },
  itemLabel: { fontSize: 13.5 },
  itemDocCount: { fontSize: 11, color: COLORS.textFaint },
  itemStatusNote: { fontSize: 11.5 },

  itemBody: { paddingBottom: SPACING.md, gap: SPACING.sm },
  itemBodySpacious: { paddingBottom: SPACING.lg, gap: SPACING.md },
  dateRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md },
  dateLabel: { fontSize: 12.5, color: COLORS.textMuted, width: 88 },
  dateInput: { flex: 1 },
  confirmBtn: { marginTop: 2 },

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
