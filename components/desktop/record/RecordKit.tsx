import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View, type ImageStyle } from 'react-native';
import { BrandLoader } from '../../ui/BrandLoader';
import { Ionicons } from '@expo/vector-icons';
import type { DocumentRow } from '../../../lib/adminApi';
import type { OwnerType } from '../../../lib/adminApi/types';
import { DocumentFolderModal } from '../../documents/DocumentFolderModal';
import { FolderDocumentsModal, FolderUploadBar, type FolderLayout } from './FolderDocuments';
import { getDocumentUrl, listDocuments, uploadDocument, type PickedFile } from '../../../lib/documents';
import { chooseDocumentSource, pickDocumentSource, type DocumentSource } from '../../../lib/documentActions';
import { showAlert } from '../../../lib/platformAlert';
import { ExpiryState } from '../../../lib/theme';
import { DesktopDateField, DesktopInput, DesktopSelect, DesktopSelectOption, DLtrText, DText, HoverPressable, popoverEnterStyle } from '../primitives';
import { DESKTOP_COLORS, DESKTOP_TONES, DesktopTone, webOnly } from '../desktopTheme';

/**
 * Shared building blocks of the desktop record pages ("תיק רכב" and
 * "תיק נהג"): the header, side panels, inline-editable field grid and the
 * document folder tiles with their centered upload modal. Both pages compose
 * these so they keep one visual language — a change here lands on both.
 *
 * `recordStyleDefs` is a plain object (not a StyleSheet) so each page can
 * spread it into its own `StyleSheet.create` alongside page-only styles.
 */

export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

export const EXPIRY_TONE_MAP: Record<ExpiryState, DesktopTone> = { ok: 'ok', soon: 'warn', expired: 'bad', missing: 'neutral', optional: 'neutral' };

export const STATE_LABEL: Record<ExpiryState, string> = { ok: 'בתוקף', soon: 'קרוב לפוג', expired: 'פג תוקף', missing: 'חסר', optional: 'תקין' };

export type RecordMenuItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
};

/** "⋯" header menu — keeps rare or destructive actions out of the always-visible action row. */
export function OverflowMenu({ items }: { items: RecordMenuItem[] }) {
  const triggerRef = React.useRef<View>(null);
  const [anchor, setAnchor] = React.useState<{ top: number; left: number } | null>(null);

  const open = () => {
    triggerRef.current?.measureInWindow((x, y, _width, height) => setAnchor({ top: y + height + 4, left: x }));
  };

  return (
    <View ref={triggerRef}>
      <HoverPressable
        style={styles.iconAction}
        hoverStyle={styles.rowHover}
        pressStyle={styles.pressDown}
        onPress={() => (anchor ? setAnchor(null) : open())}
        accessibilityLabel="פעולות נוספות"
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={DESKTOP_COLORS.ink} />
      </HoverPressable>
      {anchor && (
        <Modal transparent visible animationType="none" onRequestClose={() => setAnchor(null)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)} />
          <View style={[styles.menu, { top: anchor.top, left: anchor.left }, popoverEnterStyle(), styles.menuOrigin]}>
            {items.map((item) => (
              <HoverPressable
                key={item.label}
                style={[styles.menuItem, item.disabled && styles.disabled]}
                hoverStyle={item.danger ? styles.deleteActionHover : styles.rowHover}
                disabled={item.disabled}
                onPress={() => {
                  setAnchor(null);
                  item.onPress();
                }}
              >
                <Ionicons name={item.icon} size={15} color={item.danger ? DESKTOP_TONES.bad.fg : DESKTOP_COLORS.inkMuted} />
                <DText weight="semiBold" style={[styles.actionText, item.danger ? { color: DESKTOP_TONES.bad.fg } : styles.menuItemText]}>{item.label}</DText>
              </HoverPressable>
            ))}
          </View>
        </Modal>
      )}
    </View>
  );
}

/**
 * Status pill that doubles as its own picker: click it, choose from a short
 * menu anchored under it. The current value carries a checkmark; saving is
 * the caller's job, and the pill shows a spinner until it resolves.
 */
export function StatusPicker<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; tone: DesktopTone }[];
  onChange: (value: T) => Promise<unknown>;
}) {
  const triggerRef = React.useRef<View>(null);
  const [anchor, setAnchor] = React.useState<{ top: number; left: number } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const current = options.find((o) => o.value === value);
  const tone = DESKTOP_TONES[current?.tone ?? 'neutral'];

  const open = () => {
    triggerRef.current?.measureInWindow((x, y, _width, height) => setAnchor({ top: y + height + 4, left: x }));
  };
  const choose = async (next: T) => {
    setAnchor(null);
    if (next === value) return;
    setSaving(true);
    try {
      await onChange(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View ref={triggerRef}>
      <HoverPressable
        style={[styles.statusTrigger, { backgroundColor: tone.bg }]}
        hoverStyle={styles.statusTriggerHover}
        pressStyle={styles.pressDown}
        disabled={saving}
        onPress={() => (anchor ? setAnchor(null) : open())}
        accessibilityLabel={`סטטוס: ${current?.label ?? value}. לחיצה לשינוי`}
      >
        <DText weight="bold" style={[styles.statusTriggerText, { color: tone.fg }]} numberOfLines={1}>
          {current?.label ?? value}
        </DText>
        {saving ? (
          <BrandLoader size="small" color={tone.fg} style={styles.statusSpinner} />
        ) : (
          <Ionicons name="chevron-down" size={12} color={tone.fg} />
        )}
      </HoverPressable>
      {anchor && (
        <Modal transparent visible animationType="none" onRequestClose={() => setAnchor(null)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)} />
          <View style={[styles.menu, { top: anchor.top, left: anchor.left }, popoverEnterStyle(), styles.menuOrigin]}>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <HoverPressable
                  key={option.value}
                  style={styles.menuItem}
                  hoverStyle={styles.rowHover}
                  onPress={() => void choose(option.value)}
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.statusOptionDot, { backgroundColor: DESKTOP_TONES[option.tone].fg }]} />
                  <DText weight="semiBold" style={[styles.actionText, styles.menuItemText, styles.statusOptionLabel]}>
                    {option.label}
                  </DText>
                  {selected && <Ionicons name="checkmark" size={15} color={DESKTOP_COLORS.brand} />}
                </HoverPressable>
              );
            })}
          </View>
        </Modal>
      )}
    </View>
  );
}

export function PlateBadge({ plate }: { plate: string }) {
  return (
    <View style={styles.plateBadge}>
      <View style={styles.plateBadgeFlag}>
        <DText weight="bold" style={styles.plateBadgeFlagText}>IL</DText>
      </View>
      <DLtrText weight="bold" style={styles.plateBadgeText} numberOfLines={1}>{plate}</DLtrText>
    </View>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <DText weight="bold" style={styles.sectionTitle}>{title}</DText>
      {children}
    </View>
  );
}

export function Field({ label, value, ltr, compact }: { label: string; value: string; ltr?: boolean; compact?: boolean }) {
  const TextComponent = ltr ? DLtrText : DText;
  return (
    <View style={[styles.field, compact && styles.maintenanceField]}>
      <DText style={styles.fieldGridLabel}>{label}</DText>
      <TextComponent weight="semiBold" style={styles.fieldGridValue} numberOfLines={1}>{value}</TextComponent>
    </View>
  );
}


/**
 * Shell shared by every per-field editor below — a single field in
 * {@link Field}'s read layout that can be clicked into an inline editor with
 * its own confirm/cancel, so editing one value never puts a whole section's
 * worth of other fields into edit mode at once.
 */
export function EditableFieldShell({
  label,
  displayValue,
  ltr,
  plate,
  editing,
  onStartEdit,
  onCancel,
  onConfirm,
  saving,
  error,
  compact,
  savedNonce = 0,
  children,
}: {
  label: string;
  displayValue: string;
  ltr?: boolean;
  plate?: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  saving: boolean;
  error: string | null;
  compact?: boolean;
  /** Bumped after every successful save; each bump replays the confirmation flash. */
  savedNonce?: number;
  children: React.ReactNode;
}) {
  const ValueText = ltr ? DLtrText : DText;

  if (!editing) {
    return (
      <View style={[styles.field, compact && styles.maintenanceField]}>
        <DText style={styles.fieldGridLabel}>{label}</DText>
        <View style={styles.readFieldRow}>
          {savedNonce > 0 && <View key={savedNonce} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.savedFlash]} />}
          {plate ? (
            <PlateBadge plate={displayValue} />
          ) : (
            <ValueText weight="semiBold" style={styles.fieldGridValue} numberOfLines={1}>{displayValue}</ValueText>
          )}
          <HoverPressable hoverStyle={styles.rowHover} onPress={onStartEdit} accessibilityLabel={`עריכת ${label}`}>
            <Ionicons name="create-outline" size={12} color={DESKTOP_COLORS.inkFaint} />
          </HoverPressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.field, compact && styles.maintenanceField, styles.fieldEditing]}>
      <DText style={styles.fieldGridLabel}>{label}</DText>
      <View style={styles.inlineEditRow}>
        <View style={styles.inlineEditControl}>{children}</View>
        <HoverPressable style={[styles.inlineConfirmBtn, saving && styles.disabled]} hoverStyle={styles.saveChipHover} pressStyle={styles.pressDown} onPress={onConfirm} disabled={saving}>
          {saving ? <BrandLoader size={12} color="#FFFFFF" /> : <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
        </HoverPressable>
        <HoverPressable style={styles.inlineCancelBtn} hoverStyle={styles.rowHover} onPress={onCancel}>
          <Ionicons name="close" size={13} color={DESKTOP_COLORS.inkMuted} />
        </HoverPressable>
      </View>
      {!!error && <DText style={styles.fieldError}>{error}</DText>}
    </View>
  );
}

export function EditableTextField({
  label,
  value,
  raw,
  ltr,
  plate,
  keyboardType,
  parse = (v: string) => v,
  format,
  validate,
  onSave,
  onEditingChange,
  onDraftChange,
  compact,
}: {
  label: string;
  value: string;
  raw: string;
  ltr?: boolean;
  plate?: boolean;
  keyboardType?: 'default' | 'number-pad';
  parse?: (v: string) => string;
  format?: (v: string) => string;
  validate?: (v: string) => string | null;
  onSave: (v: string) => Promise<string | null>;
  onEditingChange?: (editing: boolean) => void;
  /** Fired on every keystroke (with the parsed draft), before save — for fields whose live value drives a preview elsewhere on the screen. */
  onDraftChange?: (v: string) => void;
  compact?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(raw);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedNonce, setSavedNonce] = React.useState(0);

  const start = () => { setDraft(raw); setError(null); setEditing(true); onEditingChange?.(true); onDraftChange?.(raw); };
  const cancel = () => { setEditing(false); onEditingChange?.(false); onDraftChange?.(raw); };
  const confirm = async () => {
    const validationError = validate?.(draft) ?? null;
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    const err = await onSave(draft);
    setSaving(false);
    if (err) { setError(err); return; }
    setSavedNonce((n) => n + 1);
    setEditing(false);
    onEditingChange?.(false);
  };

  return (
    <EditableFieldShell label={label} displayValue={value} ltr={ltr} plate={plate} compact={compact} editing={editing} onStartEdit={start} onCancel={cancel} onConfirm={confirm} saving={saving} error={error} savedNonce={savedNonce}>
      <DesktopInput
        value={format ? format(draft) : draft}
        onChangeText={(v) => {
          const parsed = parse(v);
          setDraft(parsed);
          onDraftChange?.(parsed);
        }}
        ltr={ltr}
        keyboardType={keyboardType}
        hasError={!!error}
      />
    </EditableFieldShell>
  );
}

export function EditableSelectField<T extends string>({
  label,
  value,
  raw,
  options,
  allowClear,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  raw: T | null;
  options: DesktopSelectOption<T>[];
  allowClear?: boolean;
  placeholder?: string;
  onSave: (v: T | null) => Promise<string | null>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<T | null>(raw);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedNonce, setSavedNonce] = React.useState(0);

  const start = () => { setDraft(raw); setError(null); setEditing(true); };
  const cancel = () => setEditing(false);
  const confirm = async () => {
    setSaving(true);
    const err = await onSave(draft);
    setSaving(false);
    if (err) { setError(err); return; }
    setSavedNonce((n) => n + 1);
    setEditing(false);
  };

  return (
    <EditableFieldShell label={label} displayValue={value} editing={editing} onStartEdit={start} onCancel={cancel} onConfirm={confirm} saving={saving} error={error} savedNonce={savedNonce}>
      <DesktopSelect value={draft} onChange={setDraft} options={options} allowClear={allowClear} placeholder={placeholder} hasError={!!error} />
    </EditableFieldShell>
  );
}

export function EditableDateField({
  label,
  value,
  raw,
  onSave,
  compact,
}: {
  label: string;
  value: string;
  raw: string | null;
  onSave: (v: string | null) => Promise<string | null>;
  compact?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<string | null>(raw);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedNonce, setSavedNonce] = React.useState(0);

  const start = () => { setDraft(raw); setError(null); setEditing(true); };
  const cancel = () => setEditing(false);
  const confirm = async () => {
    setSaving(true);
    const err = await onSave(draft);
    setSaving(false);
    if (err) { setError(err); return; }
    setSavedNonce((n) => n + 1);
    setEditing(false);
  };

  return (
    <EditableFieldShell label={label} displayValue={value} ltr compact={compact} editing={editing} onStartEdit={start} onCancel={cancel} onConfirm={confirm} saving={saving} error={error} savedNonce={savedNonce}>
      <DesktopDateField value={draft} onChange={setDraft} hasError={!!error} />
    </EditableFieldShell>
  );
}

/** Thumbnail that fades in once its bytes have loaded, instead of popping in. */
export function FadeInImage({ uri, hovered, signedVisual = false }: { uri: string; hovered: boolean; signedVisual?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <View style={[styles.folderTilePreview, signedVisual && styles.folderTilePreviewSigned]}>
      <Image
        source={{ uri }}
        style={[styles.folderTilePreviewImage as ImageStyle, signedVisual && styles.folderTilePreviewImageSigned as ImageStyle, styles.fadeImage, loaded && styles.fadeImageLoaded, hovered && styles.folderTilePreviewImageHover as ImageStyle]}
        resizeMode="cover"
        onLoad={() => setLoaded(true)}
      />
      <View pointerEvents="none" style={[styles.folderTilePreviewScrim, hovered && styles.folderTilePreviewScrimHover]} />
    </View>
  );
}
export type RecordDocumentFolder = {
  category: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  requiresExpiry: boolean;
};

/**
 * One folder tile: an image preview of the folder's newest photo when it has
 * one, otherwise the folder icon, then the title and a `meta` line (expiry
 * badge, document count or status) supplied by the caller.
 */
export function FolderTile({
  title,
  icon,
  thumbnail,
  meta,
  onPress,
  accessibilityLabel,
  signedVisual = false,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  thumbnail?: string | null;
  meta: React.ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Signed-document card treatment for dossier document grids. */
  signedVisual?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <HoverPressable
      style={[styles.folderTile, signedVisual && styles.folderTileSigned]}
      hoverStyle={[styles.folderTileHover, signedVisual && styles.folderTileSignedHover]}
      hoverMotionStyle={styles.folderTileHoverMotion}
      pressMotionStyle={styles.folderTilePress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? title}
    >
      {thumbnail ? (
        <FadeInImage uri={thumbnail} hovered={hovered} signedVisual={signedVisual} />
      ) : (
        <View style={[styles.folderTileThumb, styles.folderTileIconWrap, signedVisual && styles.folderTileIconWrapSigned, hovered && styles.folderTileIconWrapHover]}>
          <Ionicons name={icon} size={24} color={DESKTOP_COLORS.brand} />
        </View>
      )}
      <DText weight="bold" style={styles.folderTileLabel} numberOfLines={1}>{title}</DText>
      <View style={styles.folderTileMetaRow}>{meta}</View>
    </HoverPressable>
  );
}

/** Every document of one owner, plus a preview image URL per category (its first image). */
export function useOwnerDocuments(ownerType: OwnerType, ownerId: string) {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  const reload = React.useCallback(async () => {
    const list = await listDocuments(ownerType, ownerId).catch(() => []);
    setDocs(list);

    const byCategory = new Map<string, typeof list>();
    for (const doc of list) byCategory.set(doc.category, [...(byCategory.get(doc.category) ?? []), doc]);

    const entries = await Promise.all(
      Array.from(byCategory.entries()).map(async ([category, items]) => {
        const image = items.find((d) => d.mime_type?.startsWith('image/'));
        if (!image) return [category, null] as const;
        const url = await getDocumentUrl(image).catch(() => null);
        return [category, url] as const;
      })
    );
    const nextThumbs: Record<string, string> = {};
    for (const [category, url] of entries) if (url) nextThumbs[category] = url;
    setThumbnails(nextThumbs);
  }, [ownerType, ownerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { docs, thumbnails, reload };
}

/** The newest document of a category, or null. */
export function latestDocumentOf(docs: DocumentRow[], category: string): DocumentRow | null {
  return docs.reduce<DocumentRow | null>(
    (latest, doc) => doc.category === category && (!latest || doc.created_at > latest.created_at) ? doc : latest,
    null
  );
}

/**
 * The centered folder modal with its upload control — lists the folder's
 * documents and uploads new ones into it (with an expiry date when the
 * folder requires one).
 */
export function DocumentFolderUploadModal({
  companyId,
  ownerType,
  ownerId,
  folder,
  docs,
  onClose,
  onChanged,
  layout,
}: {
  companyId: string;
  ownerType: OwnerType;
  ownerId: string;
  folder: RecordDocumentFolder;
  docs: DocumentRow[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  /** Opt into the list-style folder window (current document + history, or a gallery). Omitted: the classic thumbnail grid. */
  layout?: FolderLayout;
}) {
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  /** Uploads one file into the folder; resolves to whether it uploaded. */
  const uploadFile = async (file: PickedFile): Promise<boolean> => {
    if (folder.requiresExpiry && !expiryDate) {
      showAlert('חסר תוקף', 'יש לבחור תאריך תוקף למסמך לפני ההעלאה');
      return false;
    }
    setUploading(true);
    try {
      await uploadDocument({
        companyId,
        ownerType,
        ownerId,
        category: folder.category,
        title: folder.title,
        file,
        expiryDate: folder.requiresExpiry ? expiryDate : null,
      });
      if (folder.requiresExpiry) setExpiryDate(null);
      await onChanged();
      return true;
    } catch (err: any) {
      showAlert('העלאה נכשלה', err?.message ?? 'נסה שוב');
      return false;
    } finally {
      setUploading(false);
    }
  };

  const addDocument = () => {
    if (folder.requiresExpiry && !expiryDate) {
      showAlert('חסר תוקף', 'יש לבחור תאריך תוקף למסמך לפני ההעלאה');
      return;
    }
    chooseDocumentSource(folder.title, async (source: DocumentSource) => {
      const file = await pickDocumentSource(source);
      if (file) await uploadFile(file);
    });
  };

  if (layout) {
    const folderDocs = docs.filter((d) => d.category === folder.category);
    return (
      <FolderDocumentsModal
        title={folder.title}
        docs={folderDocs}
        layout={layout}
        onClose={onClose}
        onDeleted={onChanged}
        upload={
          <FolderUploadBar
            requiresExpiry={folder.requiresExpiry}
            expiryDate={expiryDate}
            onExpiryChange={setExpiryDate}
            onUpload={uploadFile}
            onClose={onClose}
            uploading={uploading}
            replacesCurrent={layout === 'versions' && folderDocs.length > 0}
          />
        }
      />
    );
  }

  return (
    <DocumentFolderModal
      visible
      title={folder.title}
      docs={docs.filter((d) => d.category === folder.category)}
      onClose={onClose}
      onDeleted={onChanged}
      footer={
        <View style={styles.folderUploadRow}>
          {folder.requiresExpiry && (
            <View style={styles.folderExpiryField}>
              <DesktopDateField value={expiryDate} onChange={setExpiryDate} placeholder="תוקף המסמך" />
            </View>
          )}
          <HoverPressable style={styles.folderUploadBtn} hoverStyle={styles.folderUploadBtnHover} pressStyle={styles.pressDown} onPress={addDocument} disabled={uploading}>
            <Ionicons name="cloud-upload-outline" size={13} color={DESKTOP_COLORS.brand} />
            <DText weight="semiBold" style={styles.folderUploadText}>{uploading ? 'מעלה…' : 'העלה מסמך'}</DText>
          </HoverPressable>
        </View>
      }
    />
  );
}

export const recordStyles = StyleSheet.create({
  pressDown: { transform: [{ scale: 0.97 }] },
  root: { flex: 1 },
  content: { padding: 22, paddingBottom: 48, maxWidth: 1440, width: '100%', alignSelf: 'center' },
  columns: { width: '100%', flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 16, marginTop: 14 },
  mainColumn: { flex: 1, gap: 14, minWidth: 0 },
  sideColumn: { width: 300, flexShrink: 0, gap: 12, marginTop: 31, ...webOnly({ position: 'sticky', top: 0 }) },
  panel: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...webOnly({ boxShadow: '0 12px 30px -22px rgba(22, 34, 46, 0.32)' }),
  },
  panelTitle: { fontSize: 13, color: DESKTOP_COLORS.ink, marginBottom: 6 },
  complianceRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 10, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 6, ...webOnly({ transition: 'background-color 150ms ease' }) },
  complianceRowText: { flex: 1, minWidth: 0, gap: 1 },
  complianceLabel: { fontSize: 13 },
  complianceDate: { fontSize: 12, color: DESKTOP_COLORS.inkFaint, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  complianceStatus: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  alertBanner: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 12, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  alertTitle: { fontSize: 13 },
  alertItems: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, flex: 1 },
  alertItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, height: 30, paddingHorizontal: 10, borderRadius: 7, backgroundColor: DESKTOP_COLORS.surface, ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  alertItemHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  alertItemText: { fontSize: 12.5 },
  alertItemDetail: { fontSize: 12, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },

  iconAction: { width: 40, height: 40, borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput, borderRadius: 12, backgroundColor: DESKTOP_COLORS.surface, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }) },
  menu: { position: 'absolute', minWidth: 170, padding: 4, backgroundColor: DESKTOP_COLORS.surface, borderWidth: 1, borderColor: DESKTOP_COLORS.border, borderRadius: 8, ...webOnly({ boxShadow: '0 8px 24px -6px rgba(22,34,46,0.18)' }) },
  // The menu opens under a trigger at the inline end of the header, so it grows from that corner.
  menuOrigin: webOnly({ transformOrigin: 'top left' }),
  statusTrigger: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    ...webOnly({ cursor: 'pointer', transition: 'filter 150ms ease, transform 120ms ease-out' }),
  },
  statusTriggerHover: webOnly({ filter: 'brightness(0.95)' }),
  statusTriggerText: { fontSize: 12 },
  statusSpinner: { transform: [{ scale: 0.6 }], width: 12, height: 12 },
  statusOptionDot: { width: 8, height: 8, borderRadius: 4 },
  statusOptionLabel: { flex: 1 },
  menuItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, height: 34, paddingHorizontal: 10, borderRadius: 6, ...webOnly({ transition: 'background-color 150ms ease' }) },

  recordHeader: {
    minHeight: 76,
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
    ...webOnly({ boxShadow: '0 12px 30px -22px rgba(22, 34, 46, 0.32)' }),
  },
  recordIdentity: { flexDirection: 'row-reverse', alignItems: 'center', flex: 1, minWidth: 0, gap: 11 },
  avatar: { width: 44, height: 44, borderRadius: 10, backgroundColor: DESKTOP_COLORS.brandFocusRing, alignItems: 'center', justifyContent: 'center' },
  recordTitleBlock: { minWidth: 0, gap: 6 },
  recordTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  recordMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  metaDivider: { fontSize: 12, color: DESKTOP_COLORS.borderInput },
  headerActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexShrink: 0 },
  secondaryAction: { height: 32, paddingHorizontal: 10, borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput, borderRadius: 7, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, ...webOnly({ transition: 'background-color 150ms ease, border-color 150ms ease, transform 120ms ease-out' }) },
  deleteActionHover: { backgroundColor: DESKTOP_TONES.bad.bg },
  actionText: { fontSize: 12, color: DESKTOP_COLORS.inkMuted },

  section: { gap: 8, marginTop: 4 },
  sectionTitle: { fontSize: 13, color: DESKTOP_COLORS.inkMuted },

  card: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 10,
    padding: 18,
    gap: 10,
    ...webOnly({ boxShadow: '0 12px 30px -22px rgba(22, 34, 46, 0.32)' }),
  },
  cardTitle: { fontSize: 14 },
  cardHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  saveChipHover: { opacity: 0.88 },

  fieldGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 16, marginTop: 4 },
  field: { width: '31.7%', minWidth: 150, gap: 4, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  maintenanceGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, marginTop: 2 },
  maintenanceField: { flexGrow: 1, flexBasis: 150, width: 'auto', minWidth: 150, paddingBottom: 8 },
  fieldEditing: { position: 'relative', zIndex: 100, elevation: 100 },
  fieldGridLabel: { fontSize: 11.5, color: DESKTOP_COLORS.inkFaint },
  fieldGridValue: { fontSize: 13.5, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  fieldError: { fontSize: 11, color: DESKTOP_TONES.bad.fg, marginTop: 3 },

  // Confirmation after a save: a brand tint that fades out on its own (opacity only, so it also runs under reduced motion).
  savedFlash: {
    backgroundColor: DESKTOP_COLORS.brandFocusRing,
    borderRadius: 5,
    opacity: 0,
    ...webOnly({
      animationKeyframes: { from: { opacity: 1 }, to: { opacity: 0 } },
      animationDuration: '900ms',
      animationTimingFunction: 'ease-out',
    }),
  },
  readFieldRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', gap: 6, marginHorizontal: -6, paddingHorizontal: 6, borderRadius: 5, ...webOnly({ transition: 'background-color 150ms ease' }) },
  plateBadge: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 24,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#0F1114',
    backgroundColor: '#F7CB27',
    overflow: 'hidden',
  },
  plateBadgeFlag: { width: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1C4FA0' },
  plateBadgeFlagText: { fontSize: 7, color: '#FFFFFF' },
  plateBadgeText: { fontSize: 13.5, color: '#0F1114', paddingHorizontal: 8, letterSpacing: 0.5 },
  inlineEditRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  inlineEditControl: { flex: 1 },
  inlineConfirmBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: DESKTOP_COLORS.brand, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'opacity 150ms ease, transform 120ms ease-out' }) },
  inlineCancelBtn: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: DESKTOP_COLORS.borderInput, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease' }) },

  rowBorder: { borderBottomWidth: 1, borderBottomColor: DESKTOP_COLORS.borderSoft },
  rowHover: { backgroundColor: DESKTOP_COLORS.rowHover },

  disabled: { opacity: 0.5 },

  folderGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  folderTile: {
    width: 150,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderSoft,
    borderRadius: 14,
    padding: 10,
    gap: 6,
    backgroundColor: DESKTOP_COLORS.surface,
    ...webOnly({ transition: 'transform 150ms ease, border-color 150ms ease' }),
  },
  // Lifts the hovered tile above its neighbours so its shadow isn't painted
  // over by the next row (every RN-web view is position: relative).
  folderTileHover: { zIndex: 1 },
  folderTileSigned: {
    borderRadius: 18,
    ...webOnly({
      boxShadow: '0 10px 26px -22px rgba(16,34,50,0.58)',
      transition: 'transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
    }),
  },
  folderTileSignedHover: webOnly({ borderColor: 'rgba(0,136,204,0.32)', boxShadow: '0 18px 32px -20px rgba(16,34,50,0.42)' }),
  folderTileHoverMotion: webOnly({ transform: 'translateY(-2px)' }),
  folderTilePress: webOnly({ transform: 'scale(0.97)' }),
  folderTileThumb: { width: '100%', height: 72, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  folderTilePreview: { width: '100%', height: 72, borderRadius: 10, overflow: 'hidden' },
  folderTilePreviewSigned: { borderRadius: 14, backgroundColor: '#F1F4F8', alignItems: 'center', justifyContent: 'center' },
  folderTilePreviewImage: {
    width: '100%',
    height: '100%',
    ...webOnly({ transition: 'transform 150ms ease' }),
  },
  folderTilePreviewImageSigned: { width: '78%', height: '84%', borderRadius: 5, backgroundColor: DESKTOP_COLORS.surface, ...webOnly({ boxShadow: '0 6px 16px rgba(16,34,50,0.14)' }) },
  folderTilePreviewImageHover: webOnly({ transform: 'scale(1.02)' }),
  folderTilePreviewScrim: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: '#FFFFFF',
    opacity: 0,
    ...webOnly({ transition: 'opacity 150ms ease' }),
  },
  folderTilePreviewScrimHover: { opacity: 0.08 },
  folderTileIconWrap: {
    backgroundColor: DESKTOP_COLORS.canvas,
    ...webOnly({ transition: 'background-color 150ms ease' }),
  },
  folderTileIconWrapSigned: { borderRadius: 14, backgroundColor: '#F1F4F8' },
  folderTileIconWrapHover: { backgroundColor: DESKTOP_COLORS.brandFocusRing },
  fadeImage: { opacity: 0, ...(webOnly({ transition: 'opacity 200ms ease-out' }) as object) },
  fadeImageLoaded: { opacity: 1 },
  folderTileLabel: { fontSize: 13 },
  folderTileMetaRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  folderTileCount: { fontSize: 11, color: DESKTOP_COLORS.inkFaint },
  folderUploadRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  folderExpiryField: { width: 150 },
  folderUploadBtn: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.borderInput,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    ...webOnly({ transition: 'background-color 150ms ease, transform 120ms ease-out' }),
  },
  folderUploadBtnHover: { backgroundColor: DESKTOP_COLORS.rowHover },
  folderUploadText: { fontSize: 12.5, color: DESKTOP_COLORS.brand },

  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: DESKTOP_COLORS.borderInput, marginTop: 3 },  menuItemText: { color: DESKTOP_COLORS.ink },
});

const styles = recordStyles;
