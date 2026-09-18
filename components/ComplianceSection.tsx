import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Image, Linking } from 'react-native';
import { showAlert } from '../lib/platformAlert';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, ExpiryBadge, PrimaryButton, useToast } from './ui';
import { DocumentFileRow } from './documents/DocumentFileRow';
import { DateField } from './ui/DateField';
import { COLORS, EXPIRY_STYLE, RADIUS, SPACING } from '../lib/theme';
import {
  ComplianceItem,
  DocumentRow,
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
import { getDocumentUrl, listDocuments, uploadDocument } from '../lib/documents';
import {
  chooseDocumentSource,
  confirmDeleteDocument,
  downloadDocumentWithAlert,
  getDocumentViewUrl,
  pickDocumentSource,
  type DocumentSource,
} from '../lib/documentActions';
import { DocumentFolderModal } from './documents/DocumentFolderModal';
import { DesktopDateField, HoverPressable } from './desktop/primitives';
import { DESKTOP_COLORS, webOnly } from './desktop/desktopTheme';

/** compliance_items only tracks driver/vehicle expiries — not company-level documents. */
type ComplianceOwnerType = 'driver' | 'vehicle';

const complianceFolderIcon = (itemType: string): keyof typeof Ionicons.glyphMap => ({
  vehicle_license: 'car-outline', operating_license: 'document-text-outline',
  insurance_mandatory: 'shield-checkmark-outline', insurance_comprehensive: 'shield-outline',
  annual_test: 'car-sport-outline',
}[itemType] ?? 'document-text-outline') as keyof typeof Ionicons.glyphMap;
const complianceFolderColor = (itemType: string) => ({
  vehicle_license: '#0088CC', operating_license: '#5E5CE6', insurance_mandatory: '#34C759',
  insurance_comprehensive: '#0A7FD0', annual_test: '#FF9500',
}[itemType] ?? '#8E8E93');

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
  folderAppearance = false,
  desktopModal = false,
  hiddenItemTypes = [],
  extraFolderTiles,
}: {
  companyId: string;
  ownerType: ComplianceOwnerType;
  ownerId: string;
  focusItemType?: string | null;
  spacious?: boolean;
  folderAppearance?: boolean;
  /** Desktop only: open a tile's documents in a centered modal instead of an inline expand panel. */
  desktopModal?: boolean;
  hiddenItemTypes?: string[];
  /** Extra, non-compliance folder tiles (e.g. free-form document categories) rendered in the same grid. */
  extraFolderTiles?: React.ReactNode;
}) {
  const { showToast } = useToast();
  const [items, setItems] = useState<Map<string, ComplianceItem>>(new Map());
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);

  // Date edits are staged here and only sent to the server when the admin
  // taps "אישור" — picking a date used to save instantly, which meant one
  // slip of the finger silently overwrote the real date.
  const [drafts, setDrafts] = useState<Record<string, { last_date?: string | null; expiry_date?: string | null }>>(
    {}
  );
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

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
      try {
        await load();
      } catch {
        // The folder structure is useful before its document counts arrive.
        // Individual uploads and date saves still surface their own errors.
      }
    })();
  }, [load]);

  useEffect(() => {
    if (focusItemType) setExpanded(focusItemType);
  }, [focusItemType]);

  // Folder tiles show a thumbnail of the most recently uploaded image, so
  // admins can tell folders apart without opening each one.
  useEffect(() => {
    if (!folderAppearance) return;
    let cancelled = false;
    (async () => {
      const imagesByTitle = new Map<string, DocumentRow>();
      for (const doc of docs) {
        if (!doc.mime_type?.startsWith('image/')) continue;
        const existing = imagesByTitle.get(doc.title);
        if (!existing || doc.created_at > existing.created_at) imagesByTitle.set(doc.title, doc);
      }
      const entries = await Promise.all(
        Array.from(imagesByTitle.entries()).map(async ([title, doc]) => {
          const url = await getDocumentUrl(doc).catch(() => null);
          return [title, url] as const;
        })
      );
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [title, url] of entries) if (url) next[title] = url;
      setThumbnails(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [docs, folderAppearance]);

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
      showAlert('שמירה נכשלה', 'לא הצלחנו לשמור את התאריך. נסה שוב.');
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
        showAlert('העלאה נכשלה', err?.message ?? 'נסה שוב');
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

  const renderDateFields = (def: ComplianceItemDef) => {
    const item = items.get(def.itemType);
    const draft = drafts[def.itemType];
    const currentLastDate = draft?.last_date !== undefined ? draft.last_date : item?.last_date ?? null;
    const currentExpiryDate = draft?.expiry_date !== undefined ? draft.expiry_date : item?.expiry_date ?? null;
    const isDirty =
      !!draft &&
      ((draft.last_date !== undefined && draft.last_date !== (item?.last_date ?? null)) ||
        (draft.expiry_date !== undefined && draft.expiry_date !== (item?.expiry_date ?? null)));

    return (
      <>
        {def.tracksLastDate && (
          <View style={styles.dateRow}>
            <AppText style={styles.dateLabel}>בדיקה אחרונה</AppText>
            <View style={styles.dateInput}>
              <DateField value={currentLastDate} onChange={(iso) => setDraftDate(def, 'last_date', iso)} />
            </View>
          </View>
        )}

        <View style={styles.dateRow}>
          <AppText style={styles.dateLabel}>{def.tracksLastDate ? 'בדיקה הבאה (אופציונלי)' : 'תוקף'}</AppText>
          <View style={styles.dateInput}>
            <DateField value={currentExpiryDate} onChange={(iso) => setDraftDate(def, 'expiry_date', iso)} />
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
      </>
    );
  };

  /** Compact date fields for the desktop modal — small popover calendars instead of the mobile bottom-sheet DateField. */
  const renderDesktopDateFields = (def: ComplianceItemDef) => {
    const item = items.get(def.itemType);
    const draft = drafts[def.itemType];
    const currentLastDate = draft?.last_date !== undefined ? draft.last_date : item?.last_date ?? null;
    const currentExpiryDate = draft?.expiry_date !== undefined ? draft.expiry_date : item?.expiry_date ?? null;
    const isDirty =
      !!draft &&
      ((draft.last_date !== undefined && draft.last_date !== (item?.last_date ?? null)) ||
        (draft.expiry_date !== undefined && draft.expiry_date !== (item?.expiry_date ?? null)));

    return (
      <>
        {def.tracksLastDate && (
          <View style={styles.desktopDateField}>
            <DesktopDateField value={currentLastDate} onChange={(iso) => setDraftDate(def, 'last_date', iso)} placeholder="בדיקה אחרונה" />
          </View>
        )}
        <View style={styles.desktopDateField}>
          <DesktopDateField
            value={currentExpiryDate}
            onChange={(iso) => setDraftDate(def, 'expiry_date', iso)}
            placeholder={def.tracksLastDate ? 'בדיקה הבאה' : 'תוקף'}
          />
        </View>
        {isDirty && (
          <TouchableOpacity style={styles.desktopConfirmBtn} activeOpacity={0.8} onPress={() => confirmDates(def)} disabled={savingItem === def.itemType}>
            {savingItem === def.itemType ? (
              <ActivityIndicator size="small" color={COLORS.textInverse} />
            ) : (
              <Ionicons name="checkmark" size={14} color={COLORS.textInverse} />
            )}
          </TouchableOpacity>
        )}
      </>
    );
  };

  const renderItemBody = (def: ComplianceItemDef) => {
    const itemDocs = docs.filter((d) => d.title === def.label);

    return (
      <View style={[styles.itemBody, spacious && styles.itemBodySpacious, folderAppearance && styles.folderItemBody]}>
        {renderDateFields(def)}

        {itemDocs.map((doc) => (
          <DocumentFileRow
            key={doc.id}
            doc={doc}
            onOpen={openDocument}
            onDownload={downloadDocumentWithAlert}
            onDelete={(item) => confirmDeleteDocument(item, load)}
          />
        ))}

        <TouchableOpacity style={styles.uploadBtn} activeOpacity={0.8} onPress={() => addDocument(def)} disabled={busyItem === def.itemType}>
          {busyItem === def.itemType ? (
            <>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <AppText weight="bold" style={styles.uploadText}>מעבד ומעלה…</AppText>
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={16} color={COLORS.accent} />
              <AppText weight="bold" style={styles.uploadText}>העלה מסמך</AppText>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const hiddenItems = new Set(hiddenItemTypes);
  const groups = groupByCategory(complianceCatalog(ownerType))
    .map((group) => ({ ...group, items: group.items.filter((item) => !hiddenItems.has(item.itemType)) }))
    .filter((group) => group.items.length > 0);
  const displayedGroups = folderAppearance
    ? [{ category: 'folders', label: '', icon: '', items: groups.flatMap((group) => group.items) }]
    : groups;

  return (
    <>
      {displayedGroups.map((group) => (
        <Card key={group.category} style={[styles.card, spacious && styles.cardSpacious, folderAppearance && styles.folderCard]}>
          {!folderAppearance && <View style={styles.groupHead}>
            <Ionicons name={group.icon as any} size={18} color={COLORS.accent} />
            <AppText weight="bold" style={styles.groupTitle}>
              {group.label}
            </AppText>
          </View>}

          {folderAppearance ? (
            <View style={styles.folderGrid}>
              {group.items.map((def) => {
                const itemDocs = docs.filter((d) => d.title === def.label);
                const isOpen = expanded === def.itemType;
                const item = items.get(def.itemType);
                const badgeState = complianceBadgeState(def, item);
                const thumbnail = thumbnails[def.label];

                return (
                  <HoverPressable
                    key={def.itemType}
                    style={[styles.folderTile, isOpen && styles.folderTileOpen]}
                    hoverStyle={styles.folderTileHover}
                    onPress={() => setExpanded(desktopModal ? def.itemType : isOpen ? null : def.itemType)}
                  >
                    {thumbnail ? (
                      <Image source={{ uri: thumbnail }} style={styles.folderTileThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.folderTileThumb, styles.folderTileIconWrap, { backgroundColor: complianceFolderColor(def.itemType) }]}>
                        <Ionicons name={complianceFolderIcon(def.itemType)} size={26} color="#FFF" />
                      </View>
                    )}
                    <AppText weight="bold" style={styles.folderTileLabel} numberOfLines={1}>{def.label}</AppText>
                    <View style={styles.folderTileMetaRow}>
                      <ExpiryBadge state={badgeState} label={complianceBadgeLabel(def, item)} />
                      <AppText style={styles.itemDocCount}>{itemDocs.length > 0 ? `${itemDocs.length} מסמכים` : 'אין מסמכים'}</AppText>
                    </View>
                  </HoverPressable>
                );
              })}
              {extraFolderTiles}
            </View>
          ) : (
            group.items.map((def) => {
              const item = items.get(def.itemType);
              const itemDocs = docs.filter((d) => d.title === def.label);
              const isOpen = expanded === def.itemType;
              const badgeState = complianceBadgeState(def, item);
              const derivedTargetDate = complianceTargetDate(def, item);

              return (
                <View key={def.itemType} style={styles.item}>
                  <TouchableOpacity activeOpacity={0.7} style={[styles.itemHead, spacious && styles.itemHeadSpacious]} onPress={() => setExpanded(isOpen ? null : def.itemType)}>
                    <Ionicons name={isOpen ? 'chevron-down' : 'chevron-back'} size={15} color={COLORS.textFaint} />
                    <View style={styles.itemLabelWrap}>
                      <AppText weight="bold" style={styles.itemLabel}>{def.label}</AppText>
                      {itemDocs.length > 0 && <AppText style={styles.itemDocCount}>{itemDocs.length} מסמכים</AppText>}
                      {def.tracksLastDate && item?.last_date && !item?.expiry_date && <AppText style={[styles.itemStatusNote, { color: EXPIRY_STYLE[badgeState].fg }]}>בדיקה אחרונה{derivedTargetDate ? ' · תוקף מחושב אוטומטית' : ''}</AppText>}
                    </View>
                    <ExpiryBadge state={badgeState} label={complianceBadgeLabel(def, item)} />
                  </TouchableOpacity>

                  {isOpen && renderItemBody(def)}
                </View>
              );
            })
          )}

          {folderAppearance && !desktopModal && expanded && group.items.some((def) => def.itemType === expanded) && (
            <View style={styles.folderDetailPanel}>{renderItemBody(group.items.find((def) => def.itemType === expanded)!)}</View>
          )}
        </Card>
      ))}

      {folderAppearance && desktopModal && (() => {
        const openDef = displayedGroups.flatMap((group) => group.items).find((def) => def.itemType === expanded);
        if (!openDef) return null;
        const itemDocs = docs.filter((d) => d.title === openDef.label);
        return (
          <DocumentFolderModal
            visible
            title={openDef.label}
            docs={itemDocs}
            onClose={() => setExpanded(null)}
            onDeleted={load}
            footer={
              <View style={styles.desktopUploadRow}>
                {renderDesktopDateFields(openDef)}
                <TouchableOpacity style={styles.desktopUploadBtn} activeOpacity={0.8} onPress={() => addDocument(openDef)} disabled={busyItem === openDef.itemType}>
                  <Ionicons name="cloud-upload-outline" size={13} color={COLORS.accent} />
                  <AppText weight="bold" style={styles.desktopUploadText}>{busyItem === openDef.itemType ? 'מעלה…' : 'העלה מסמך'}</AppText>
                </TouchableOpacity>
              </View>
            }
          />
        );
      })()}

      {!folderAppearance && <GeneralDocuments
        companyId={companyId}
        ownerType={ownerType}
        ownerId={ownerId}
        docs={docs.filter((d) => d.category === 'general')}
        onChanged={load}
      />}
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
  ownerType: ComplianceOwnerType;
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
        showAlert('העלאה נכשלה', err?.message ?? 'נסה שוב');
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
  cardSpacious: { marginHorizontal: 20, marginBottom: SPACING.sm, paddingVertical: SPACING.sm },
  folderCard: { padding: 0, gap: 0, overflow: 'hidden' },
  groupHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.sm,
  },
  groupTitle: { fontSize: 15.5 },

  item: { borderTopWidth: 1, borderTopColor: COLORS.divider },
  folderFirstItem: { borderTopWidth: 0 },
  itemHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 12,
  },
  itemHeadSpacious: { paddingVertical: SPACING.md },
  folderItemHead: { minHeight: 57, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  folderIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  folderItemLabel: { flex: 1, fontSize: 16.5, color: COLORS.text },
  folderItemBody: { paddingHorizontal: SPACING.lg },
  itemLabelWrap: { flex: 1, gap: 1 },
  itemLabel: { fontSize: 13.5 },
  itemDocCount: { fontSize: 11, color: COLORS.textFaint },
  itemStatusNote: { fontSize: 11.5 },

  folderGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, padding: 14 },
  folderTile: {
    width: 150,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.md,
    padding: 10,
    gap: 6,
    backgroundColor: COLORS.card,
    ...webOnly({ transition: 'background-color 150ms ease, border-color 150ms ease' }),
  },
  folderTileHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  folderTileOpen: { borderColor: COLORS.accent },
  folderTileThumb: {
    width: '100%',
    height: 72,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.field,
  },
  folderTileIconWrap: {},
  folderTileLabel: { fontSize: 13, color: COLORS.text, textAlign: 'right' },
  folderTileMetaRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  folderDetailPanel: { borderTopWidth: 1, borderTopColor: COLORS.divider, paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },

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

  desktopUploadRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  desktopDateField: { width: 150 },
  desktopConfirmBtn: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopUploadBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.accentSoft,
    backgroundColor: COLORS.accentSoft,
  },
  desktopUploadText: { fontSize: 12.5, color: COLORS.accent },
});
