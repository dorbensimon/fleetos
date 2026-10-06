import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import type { SigningTemplate } from '../../lib/docuseal';
import { listCompanyFolders, type CompanyFolder } from '../../lib/folderCatalog';
import { DText, HoverPressable } from '../desktop/primitives';
import { DESKTOP_COLORS, webOnly } from '../desktop/desktopTheme';
import { AddCatalogFolderSheet, EmptyCatalogFolderSheet, FormVersionsSheet, useRemoveCatalogFolder } from '../desktop/signing/FolderCatalogSheets';
import { CreateDocumentSheet, type FormFolder } from '../desktop/signing/CreateDocumentSheet';
import { t } from '../../lib/i18n';
import { useIsDesktop } from '../../lib/useDesktopLayout';

/**
 * The owner's view of one company's driver-file folders (company page, desktop):
 * add a folder for the company, create or replace its form, remove it. The
 * same windows and server checks as the company's own screens.
 */
export function CompanyFoldersPanel({ companyId }: { companyId: string }) {
  const [folders, setFolders] = useState<CompanyFolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [emptyFolder, setEmptyFolder] = useState<CompanyFolder | null>(null);
  const [creatingFor, setCreatingFor] = useState<FormFolder | null>(null);
  const [replacing, setReplacing] = useState<SigningTemplate | null>(null);
  const [versionsOf, setVersionsOf] = useState<SigningTemplate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Forms are built on a computer; the phone adds and removes folders only.
  const isDesktop = useIsDesktop();

  const load = useCallback(async () => {
    try {
      setFolders((await listCompanyFolders(companyId)).folders.filter((folder) => folder.added));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('folders.loadFailed'));
    }
  }, [companyId]);
  useEffect(() => {
    void load();
  }, [load]);
  const removeFolder = useRemoveCatalogFolder(companyId, () => void load());

  const openForm = async (folder: CompanyFolder, then: (template: SigningTemplate) => void) => {
    if (!folder.form) return;
    const { data } = await supabase.from('signing_templates').select('*').eq('id', folder.form.id).maybeSingle();
    if (data) then(data as SigningTemplate);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <DText weight={isDesktop ? 'bold' : 'medium'} style={[styles.title, !isDesktop && styles.titlePhone]}>{t('folders.sectionTitle')}</DText>
        <HoverPressable style={[styles.addButton, !isDesktop && styles.addButtonPhone]} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => setAdding(true)}>
          <Ionicons name="add" size={14} color={DESKTOP_COLORS.brand} />
          <DText weight="semiBold" style={styles.addText}>{t('folders.addButton')}</DText>
        </HoverPressable>
      </View>
      <View style={[styles.card, !isDesktop && styles.cardPhone]}>
        {error || removeFolder.error ? <DText style={styles.error}>{error || removeFolder.error}</DText> : null}
        {notice ? <DText style={styles.notice}>{notice}</DText> : null}
        {!folders ? (
          <DText style={styles.empty}>{t('common.loading')}</DText>
        ) : !folders.length ? (
          <DText style={styles.empty}>{t('folders.noneAddedOwner')}</DText>
        ) : (
          folders.map((folder, index) => (
            <View key={folder.id} style={[styles.row, !isDesktop && styles.rowPhone, index > 0 && styles.divider]}>
              <Ionicons name={folder.kind === 'checklist' ? 'list-outline' : 'create-outline'} size={16} color={DESKTOP_COLORS.inkMuted} />
              <View style={styles.text}>
                <DText weight="semiBold" style={styles.rowTitle}>{folder.title}</DText>
                <DText style={styles.meta}>{folder.form ? t('folders.versionN', { version: folder.form.version }) : t('folders.noFormYet')}</DText>
              </View>
              <View style={[styles.actions, !isDesktop && styles.actionsPhone]}>
                {folder.form ? (
                  isDesktop && (
                    <>
                      <HoverPressable style={styles.action} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => void openForm(folder, setReplacing)}>
                        <DText weight="semiBold" style={styles.link}>{t('folders.replaceForm')}</DText>
                      </HoverPressable>
                      {folder.form.version > 1 && (
                        <HoverPressable style={styles.action} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => void openForm(folder, setVersionsOf)}>
                          <DText weight="semiBold" style={styles.link}>{t('folders.versionsTitle')}</DText>
                        </HoverPressable>
                      )}
                    </>
                  )
                ) : (
                  <HoverPressable style={styles.action} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => setEmptyFolder(folder)}>
                    <DText weight="semiBold" style={styles.link}>{t('folders.createForm')}</DText>
                  </HoverPressable>
                )}
                <HoverPressable style={styles.action} hoverStyle={{ backgroundColor: DESKTOP_COLORS.rowHover }} onPress={() => removeFolder.start(folder.id, folder.title)}>
                  <DText weight="semiBold" style={styles.danger}>{t('folders.removeFolder')}</DText>
                </HoverPressable>
              </View>
            </View>
          ))
        )}
      </View>

      {adding && (
        <AddCatalogFolderSheet
          companyId={companyId}
          onClosed={() => setAdding(false)}
          onAdded={(folder, templateId) => {
            void load();
            if (!templateId) setEmptyFolder({ ...folder, added: true });
          }}
        />
      )}
      {emptyFolder && (
        <EmptyCatalogFolderSheet
          companyId={companyId}
          folder={emptyFolder}
          onCreate={() => setCreatingFor({ catalogId: emptyFolder.id, title: emptyFolder.title, kind: emptyFolder.kind, defaultRepeatMonths: emptyFolder.default_repeat_months })}
          onClosed={() => setEmptyFolder(null)}
          onChanged={() => void load()}
        />
      )}
      {(creatingFor || replacing) && (
        <CreateDocumentSheet
          companyId={companyId}
          folder={creatingFor ?? undefined}
          replace={replacing ?? undefined}
          onClosed={() => {
            setCreatingFor(null);
            setReplacing(null);
          }}
          onCreated={(template, pendingOld) => {
            if (replacing) setNotice(pendingOld ? t('folders.pendingOldOwnerNotice', { count: pendingOld }) : t('folders.newVersionSaved', { version: template.version ?? 1 }));
            void load();
          }}
        />
      )}
      {versionsOf && (
        <FormVersionsSheet
          companyId={companyId}
          template={versionsOf}
          onClosed={() => setVersionsOf(null)}
          onRestored={(template, pendingOld) => {
            setNotice(pendingOld ? t('folders.pendingOldOwnerNotice', { count: pendingOld }) : t('folders.newVersionSaved', { version: template.version ?? 1 }));
            void load();
          }}
        />
      )}
      {removeFolder.dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  headRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 12.5, color: DESKTOP_COLORS.inkMuted },
  addButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: 6 },
  titlePhone: { fontSize: 13 },
  addButtonPhone: { height: 32, borderRadius: 16, paddingHorizontal: 12, backgroundColor: 'rgba(47,91,255,0.08)' },
  cardPhone: { borderWidth: 0, borderRadius: 20, ...webOnly({ boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 4px 14px rgba(16,24,40,0.05)' }) },
  addText: { fontSize: 12, color: DESKTOP_COLORS.brand },
  card: {
    backgroundColor: DESKTOP_COLORS.surface,
    borderWidth: 1,
    borderColor: DESKTOP_COLORS.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, minHeight: 52 },
  rowPhone: { flexWrap: 'wrap', rowGap: 4 },
  actions: { flexDirection: 'row-reverse', alignItems: 'center' },
  // A full line under the name, lined up with it (icon 16 + gap 10).
  actionsPhone: { width: '100%', paddingRight: 18 },
  divider: { borderTopWidth: 1, borderTopColor: DESKTOP_COLORS.borderSoft },
  text: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { fontSize: 13.5 },
  meta: { fontSize: 12, color: DESKTOP_COLORS.inkMuted, ...webOnly({ fontVariantNumeric: 'tabular-nums' }) },
  action: { paddingHorizontal: 8, minHeight: 30, borderRadius: 6, justifyContent: 'center' },
  link: { fontSize: 12.5, color: DESKTOP_COLORS.brand },
  danger: { fontSize: 12.5, color: DESKTOP_COLORS.danger },
  empty: { fontSize: 12.5, color: DESKTOP_COLORS.inkFaint, textAlign: 'center', paddingVertical: 20 },
  error: { fontSize: 12.5, color: DESKTOP_COLORS.danger, padding: 12 },
  notice: { fontSize: 12.5, color: DESKTOP_COLORS.ink, padding: 12, backgroundColor: 'rgba(47,91,255,0.06)' },
});
