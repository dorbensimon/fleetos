import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { BrandLoader } from './ui/BrandLoader';
import { showAlert } from '../lib/platformAlert';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, ExpiryBadge, PrimaryButton, useToast } from './ui';
import { DocumentFileRow } from './documents/DocumentFileRow';
import { DateField } from './ui/DateField';
import { COLORS, EXPIRY_STYLE, RADIUS, SPACING, expiryState, formatDate } from '../lib/theme';
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
import { getDocumentUrl, listDocuments, uploadDocument, type PickedFile } from '../lib/documents';
import {
  chooseDocumentSource,
  confirmDeleteDocument,
  downloadDocumentWithAlert,
  openDocumentExternally,
  pickDocumentSource,
  type DocumentSource,
} from '../lib/documentActions';
import { DocumentFolderModal } from './documents/DocumentFolderModal';
import { DesktopDateField } from './desktop/primitives';
import { FolderTile } from './desktop/record/RecordKit';
import { FolderDocumentsModal, FolderListRow, FolderUploadBar } from './desktop/record/FolderDocuments';
import { DESKTOP_COLORS } from './desktop/desktopTheme';
import { DK, DK_FONT } from './driverKit/theme';

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
/** The outer folder tile always reflects the expiry of its newest uploaded document. */
const latestDocument = (docs: DocumentRow[]) => docs.reduce<DocumentRow | null>(
  (latest, doc) => (!latest || doc.created_at > latest.created_at ? doc : latest),
  null
);

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
  openRequest,
  desktopList = false,
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
  /**
   * Desktop only: open a folder's modal from outside the grid (e.g. the
   * vehicle card's status rail). `nonce` changes on every request so the
   * same folder can be reopened after it was closed.
   */
  openRequest?: { itemType: string; nonce: number } | null;
  /**
   * Desktop only: the folders as a plain list (one row per folder with its
   * status), opening the versions-style folder window. Renders the rows
   * bare, so the caller supplies the surrounding card.
   */
  desktopList?: boolean;
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
    return { complianceRows, documentRows };
  }, [ownerType, ownerId]);

  /**
   * The mandatory-insurance badge is read from `insurance_mandatory.expiry_date`
   * all over the app (fleet cards, dashboard, reports, notifications) — so
   * that one field has to always reflect the newest uploaded policy document,
   * never a manual edit left stale after a renewal was uploaded (or removed).
   */
  const syncMandatoryInsuranceDate = useCallback(
    async (documentRows: DocumentRow[], complianceRows: ComplianceItem[]) => {
      const def = complianceCatalog(ownerType).find((d) => d.itemType === 'insurance_mandatory');
      if (!def) return;
      const folderDocs = documentRows.filter((d) => d.title === def.label);
      const latestDoc = folderDocs.reduce<DocumentRow | null>(
        (latest, d) => (!latest || d.created_at > latest.created_at ? d : latest),
        null
      );
      const nextExpiry = latestDoc?.expiry_date ?? null;
      const currentRow = complianceRows.find((c) => c.item_type === 'insurance_mandatory');
      if (nextExpiry === (currentRow?.expiry_date ?? null)) return;
      await upsertCompliance({
        companyId,
        ownerType,
        ownerId,
        category: def.category,
        itemType: def.itemType,
        lastDate: currentRow?.last_date ?? null,
        expiryDate: nextExpiry,
      });
      await load();
    },
    [companyId, ownerType, ownerId, load]
  );

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

  useEffect(() => {
    if (openRequest) setExpanded(openRequest.itemType);
  }, [openRequest]);

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

  /** Uploads into a folder. With `picked` (the desktop folder window's chosen or dropped file) no picker opens; resolves to whether it uploaded. */
  const addDocument = async (def: ComplianceItemDef, picked?: PickedFile): Promise<boolean> => {
    // A vehicle compliance document needs the date of the specific document
    // being uploaded, rather than silently reusing a prior document's date.
    const requiresExpiryOnUpload = def.requiresExpiryOnUpload === true;
    const stagedExpiryDate = drafts[def.itemType]?.expiry_date ?? null;
    if (requiresExpiryOnUpload && !stagedExpiryDate) {
      showAlert('חסר תוקף', 'יש לבחור תאריך תוקף למסמך לפני ההעלאה');
      return false;
    }
    const uploadExpiryDate = requiresExpiryOnUpload
      ? stagedExpiryDate
      : items.get(def.itemType)?.expiry_date ?? null;

    const upload = async (file: PickedFile): Promise<boolean> => {
      setBusyItem(def.itemType);
      try {

        await uploadDocument({
          companyId,
          ownerType,
          ownerId,
          category: def.category,
          title: def.label,
          file,
          complianceItemId: items.get(def.itemType)?.id ?? null,
          expiryDate: uploadExpiryDate,
        });
        const { complianceRows, documentRows } = await load();
        if (requiresExpiryOnUpload) {
          if (def.itemType !== 'insurance_mandatory') {
            await upsertCompliance({
              companyId,
              ownerType,
              ownerId,
              category: def.category,
              itemType: def.itemType,
              lastDate: items.get(def.itemType)?.last_date ?? null,
              expiryDate: uploadExpiryDate,
            });
            await load();
          }
        }
        if (def.itemType === 'insurance_mandatory') {
          await syncMandatoryInsuranceDate(documentRows, complianceRows);
        }
        if (requiresExpiryOnUpload) setDrafts((prev) => { const next = { ...prev }; delete next[def.itemType]; return next; });
        return true;
      } catch (err: any) {
        showAlert('העלאה נכשלה', err?.message ?? 'נסה שוב');
        return false;
      } finally {
        setBusyItem(null);
      }
    };

    if (picked) return upload(picked);
    chooseDocumentSource(def.label, async (source: DocumentSource) => {
      const file = await pickDocumentSource(source);
      if (file) await upload(file);
    });
    return false;
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

    if (def.requiresExpiryOnUpload) {
      return (
        <>
          <View style={styles.dateRow}>
            <AppText style={styles.dateLabel}>תוקף המסמך החדש</AppText>
            <View style={styles.dateInput}>
              <DateField value={draft?.expiry_date ?? null} onChange={(iso) => setDraftDate(def, 'expiry_date', iso)} />
            </View>
          </View>
        </>
      );
    }

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

    if (def.requiresExpiryOnUpload) {
      return (
        <>
          <View style={styles.desktopDateField}>
            <DesktopDateField value={draft?.expiry_date ?? null} onChange={(iso) => setDraftDate(def, 'expiry_date', iso)} placeholder="תוקף המסמך החדש" />
          </View>
        </>
      );
    }

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
              <BrandLoader size="small" color={COLORS.textInverse} />
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
            onOpen={openDocumentExternally}
            onDownload={downloadDocumentWithAlert}
            onDelete={(item) =>
              confirmDeleteDocument(item, async () => {
                const { complianceRows, documentRows } = await load();
                if (def.itemType === 'insurance_mandatory') await syncMandatoryInsuranceDate(documentRows, complianceRows);
              })
            }
          />
        ))}

        <TouchableOpacity style={styles.uploadBtn} activeOpacity={0.8} onPress={() => addDocument(def)} disabled={busyItem === def.itemType}>
          {busyItem === def.itemType ? (
            <>
              <BrandLoader size="small" color={COLORS.accent} />
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

  if (desktopList) {
    const listItems = groups.flatMap((group) => group.items);
    const openDef = listItems.find((def) => def.itemType === expanded);
    return (
      <>
        {listItems.map((def, index) => (
          <FolderListRow
            key={def.itemType}
            title={def.label}
            icon={complianceFolderIcon(def.itemType)}
            docs={docs.filter((d) => d.title === def.label)}
            onPress={() => setExpanded(def.itemType)}
            first={index === 0}
          />
        ))}
        {openDef && (() => {
          const itemDocs = docs.filter((d) => d.title === openDef.label);
          return (
            <FolderDocumentsModal
              title={openDef.label}
              docs={itemDocs}
              layout="versions"
              onClose={() => setExpanded(null)}
              onDeleted={async () => {
                const { complianceRows, documentRows } = await load();
                if (openDef.itemType === 'insurance_mandatory') await syncMandatoryInsuranceDate(documentRows, complianceRows);
              }}
              upload={
                <FolderUploadBar
                  requiresExpiry={openDef.requiresExpiryOnUpload === true}
                  expiryDate={drafts[openDef.itemType]?.expiry_date ?? null}
                  onExpiryChange={(iso) => setDraftDate(openDef, 'expiry_date', iso)}
                  onUpload={(file) => addDocument(openDef, file)}
                  onClose={() => setExpanded(null)}
                  uploading={busyItem === openDef.itemType}
                  replacesCurrent={itemDocs.length > 0}
                  extraFields={openDef.requiresExpiryOnUpload ? undefined : renderDesktopDateFields(openDef)}
                />
              }
            />
          );
        })()}
      </>
    );
  }

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

          {folderAppearance && desktopModal ? (
            <View style={styles.folderGrid}>
              {group.items.map((def) => {
                const itemDocs = docs.filter((d) => d.title === def.label);
                const latestDoc = latestDocument(itemDocs);
                const latestExpiry = latestDoc?.expiry_date ?? null;
                const thumbnail = thumbnails[def.label];

                return (
                  <FolderTile
                    key={def.itemType}
                    title={def.label}
                    icon={complianceFolderIcon(def.itemType)}
                    thumbnail={thumbnail}
                    signedVisual
                    onPress={() => setExpanded(def.itemType)}
                    meta={latestDoc ? <ExpiryBadge state={expiryState(latestExpiry)} label={latestExpiry ? formatDate(latestExpiry) : 'חסר תוקף'} /> : <AppText style={styles.itemDocCount}>אין מסמכים</AppText>}
                  />
                );
              })}
              {extraFolderTiles}
            </View>
          ) : folderAppearance ? (
            <>
              {group.items.map((def, index) => {
                const isOpen = expanded === def.itemType;
                const itemDocs = docs.filter((d) => d.title === def.label);
                const latestDoc = latestDocument(itemDocs);
                const latestExpiry = latestDoc?.expiry_date ?? null;
                return (
                  <TouchableOpacity
                    key={def.itemType}
                    activeOpacity={0.66}
                    style={[styles.folderRow, index === 0 && styles.folderFirstItem]}
                    onPress={() => setExpanded(isOpen ? null : def.itemType)}
                  >
                    <View style={[styles.folderIcon, { backgroundColor: `${complianceFolderColor(def.itemType)}1F` }]}>
                      <Ionicons name={complianceFolderIcon(def.itemType)} size={19} color={complianceFolderColor(def.itemType)} />
                    </View>
                    <View style={styles.itemLabelWrap}>
                      <AppText weight="bold" style={styles.folderItemLabel}>{def.label}</AppText>
                      <AppText style={styles.itemDocCount}>{itemDocs.length ? `${itemDocs.length} ${itemDocs.length === 1 ? 'מסמך' : 'מסמכים'}` : 'אין מסמכים'}</AppText>
                    </View>
                    {!!latestDoc && <ExpiryBadge state={expiryState(latestExpiry)} label={latestExpiry ? formatDate(latestExpiry) : 'חסר תוקף'} />}
                    <Ionicons name={isOpen ? 'chevron-down' : 'chevron-back'} size={18} color={DK.faint} />
                  </TouchableOpacity>
                );
              })}
              {group.items.map((def) => expanded === def.itemType && (
                <View key={`${def.itemType}-body`} style={styles.folderDetailPanel}>{renderItemBody(def)}</View>
              ))}
              {extraFolderTiles}
            </>
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
            onDeleted={async () => {
              const { complianceRows, documentRows } = await load();
              if (openDef.itemType === 'insurance_mandatory') await syncMandatoryInsuranceDate(documentRows, complianceRows);
            }}
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
        onChanged={async () => { await load(); }}
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
          onOpen={openDocumentExternally}
          onDownload={downloadDocumentWithAlert}
          onDelete={remove}
        />
      ))}

      <TouchableOpacity style={styles.uploadBtn} activeOpacity={0.8} onPress={add} disabled={busy}>
        {busy ? (
          <>
            <BrandLoader size="small" color={COLORS.accent} />
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
  folderRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline, minHeight: 64, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  folderIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  folderItemLabel: { fontFamily: DK_FONT.semibold, fontSize: 15, lineHeight: 20, color: DK.ink },
  folderItemBody: { paddingHorizontal: SPACING.lg },
  itemLabelWrap: { flex: 1, gap: 1 },
  itemLabel: { fontSize: 13.5 },
  itemDocCount: { fontFamily: DK_FONT.medium, fontSize: 13, color: DK.muted },
  itemStatusNote: { fontSize: 11.5 },

  folderGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, padding: 14 },
  folderDetailPanel: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline, backgroundColor: DK.surfaceSunk, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },

  itemBody: { paddingBottom: SPACING.md, gap: SPACING.sm },
  itemBodySpacious: { paddingBottom: SPACING.lg, gap: SPACING.md },
  dateRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md },
  dateLabel: { fontFamily: DK_FONT.medium, fontSize: 13.5, color: DK.inkSoft, width: 92 },
  dateInput: { flex: 1 },
  autoDateValue: { fontFamily: DK_FONT.medium, fontSize: 14, color: DK.muted, flex: 1 },
  confirmBtn: { marginTop: 2 },

  uploadBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(47,91,255,0.35)',
    backgroundColor: DK.accentSoft,
    marginTop: 4,
  },
  uploadText: { fontFamily: DK_FONT.semibold, fontSize: 15, color: DK.accent },

  emptyDocs: { fontSize: 12.5, color: COLORS.textFaint, paddingVertical: SPACING.md },

  // Keep every desktop vehicle-folder footer aligned with the free-form
  // vehicle folders (for example, "אישור קצין בטיחות").
  desktopUploadRow: { flexDirection: 'row-reverse', alignSelf: 'flex-end', alignItems: 'center', gap: 8 },
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
    borderRadius: 7,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    backgroundColor: 'transparent',
  },
  desktopUploadText: { fontSize: 12.5, color: COLORS.accent },
});
