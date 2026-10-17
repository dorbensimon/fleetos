// התיקיות שהבעלים מוסיף לחברה: לרכבים ולתיק הנהג (מחשב וטלפון)
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DesktopInput, DesktopSelect, DText, HoverPressable } from '../desktop/primitives';
import { DesktopModal } from '../desktop/DesktopModal';
import { DESKTOP_COLORS, webOnly } from '../desktop/desktopTheme';
import { GroupLabel, pageStyles } from '../desktop/record/RecordPage';
import { BrandLoader } from '../ui/BrandLoader';
import { DK, DK_SPACE, DKText, EditField, KitSection, KitSheet, ListRow, PrimaryAction, Pressy, SheetActions, STATUS } from '../driverKit';
import { ChoiceChips } from '../owner/ownerKit';
import { showAlert } from '../../lib/platformAlert';
import { useIsDesktop } from '../../lib/useDesktopLayout';
import { t } from '../../lib/i18n';
import {
  addCompanyFolder,
  countFolderFiles,
  deleteCompanyFolder,
  folderCategory,
  listCompanyFolders,
  updateCompanyFolder,
  type CompanyFolder,
  type FolderOwnerType,
} from '../../lib/companyFolders';

/**
 * The owner's folders for one company (migration 112), on its page: the
 * vehicle card's and the driver file's, each with how many files it holds.
 * Add (to this company or to every company), rename, switch the expiry date
 * on or off, and remove an empty folder. Managers and drivers then upload
 * into them like any other folder.
 */

type Draft = { id: string | null; title: string; ownerType: FolderOwnerType; tracksExpiry: boolean; allCompanies: boolean };

// טופס ריק
const emptyDraft = (ownerType: FolderOwnerType = 'vehicle'): Draft => ({ id: null, title: '', ownerType, tracksExpiry: false, allCompanies: false });

// הטעינה, הפעולות והחלונות; המראה לפי מחשב או טלפון
export function CompanyFoldersPanel({ companyId, companyName }: { companyId: string; companyName: string }) {
  const desktop = useIsDesktop();
  const [folders, setFolders] = useState<CompanyFolder[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await listCompanyFolders(companyId);
      setFolders(rows);
      setCounts(await countFolderFiles(companyId, rows).catch(() => new Map()));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [companyId]);
  useEffect(() => {
    void load();
  }, [load]);

  const open = (next: Draft) => {
    setError(null);
    setDraft(next);
  };
  const close = () => !saving && setDraft(null);

  const save = async () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) return setError(t('companyFolders.nameRequired'));
    setSaving(true);
    setError(null);
    try {
      if (draft.id) {
        await updateCompanyFolder(draft.id, { title, tracks_expiry: draft.tracksExpiry });
      } else {
        const added = await addCompanyFolder({ companyId, ownerType: draft.ownerType, title, tracksExpiry: draft.tracksExpiry, allCompanies: draft.allCompanies });
        if (draft.allCompanies) showAlert(t('companyFolders.addedTitle'), t('companyFolders.addedToCompanies', { count: added }));
      }
      setDraft(null);
      await load();
    } catch (err) {
      setError((err as Error).message || t('common.tryAgainShortly'));
    } finally {
      setSaving(false);
    }
  };

  const remove = (folder: CompanyFolder) => {
    const files = counts.get(folderCategory(folder)) ?? 0;
    if (files > 0) {
      showAlert(t('companyFolders.cannotDeleteTitle'), t('companyFolders.cannotDeleteBody', { count: files }));
      return;
    }
    showAlert(t('companyFolders.deleteTitle'), t('companyFolders.deleteBody', { title: folder.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.deleteAction'),
        style: 'destructive',
        onPress: () =>
          void deleteCompanyFolder(folder.id).then(load, (err: Error) => showAlert(t('common.updateFailed'), err.message || t('common.tryAgainShortly'))),
      },
    ]);
  };

  const edit = (folder: CompanyFolder) => open({ id: folder.id, title: folder.title, ownerType: folder.owner_type, tracksExpiry: folder.tracks_expiry, allCompanies: false });
  const groups: { ownerType: FolderOwnerType; title: string; empty: string }[] = [
    { ownerType: 'vehicle', title: t('companyFolders.vehicleGroup'), empty: t('companyFolders.vehicleEmpty') },
    { ownerType: 'driver', title: t('companyFolders.driverGroup'), empty: t('companyFolders.driverEmpty') },
  ];
  const meta = (folder: CompanyFolder) => {
    const files = counts.get(folderCategory(folder)) ?? 0;
    return [files === 1 ? t('companyFolders.oneFile') : t('companyFolders.filesCount', { count: files }), folder.tracks_expiry ? t('companyFolders.withExpiry') : null]
      .filter(Boolean)
      .join(' · ');
  };

  const form = draft ? (
    <FolderForm desktop={desktop} draft={draft} companyName={companyName} onChange={setDraft} />
  ) : null;

  if (desktop) {
    return (
      <View>
        <GroupLabel
          action={
            <HoverPressable style={pageStyles.linkBtn} hoverStyle={pageStyles.rowHover} onPress={() => open(emptyDraft())}>
              <Ionicons name="add" size={15} color={DESKTOP_COLORS.brand} />
              <DText weight="semiBold" style={pageStyles.linkText}>{t('companyFolders.add')}</DText>
            </HoverPressable>
          }
        >
          {t('companyFolders.title')}
        </GroupLabel>
        <View style={[pageStyles.card, pageStyles.listCard]}>
          {folders == null && !failed ? (
            <View style={d.loading}><BrandLoader size="small" color={DESKTOP_COLORS.brand} /></View>
          ) : failed ? (
            <DText style={d.empty}>{t('companyFolders.loadFailed')}</DText>
          ) : (
            groups.map((group, groupIndex) => {
              const rows = folders!.filter((f) => f.owner_type === group.ownerType);
              return (
                <View key={group.ownerType} style={groupIndex > 0 && pageStyles.rowDivider}>
                  <View style={d.groupHead}>
                    <Ionicons name={group.ownerType === 'vehicle' ? 'car-sport-outline' : 'person-outline'} size={15} color={DESKTOP_COLORS.inkMuted} />
                    <DText weight="semiBold" style={d.groupTitle}>{group.title}</DText>
                    <HoverPressable style={d.groupAdd} hoverStyle={pageStyles.rowHover} onPress={() => open(emptyDraft(group.ownerType))} accessibilityLabel={`${t('companyFolders.add')} · ${group.title}`}>
                      <Ionicons name="add" size={16} color={DESKTOP_COLORS.brand} />
                    </HoverPressable>
                  </View>
                  {rows.length === 0 ? (
                    <DText style={d.groupEmpty}>{group.empty}</DText>
                  ) : (
                    rows.map((folder) => (
                      <View key={folder.id} style={[pageStyles.detailRow, pageStyles.rowDivider]}>
                        <Ionicons name="folder-outline" size={18} color={DESKTOP_COLORS.brand} />
                        <View style={pageStyles.flex}>
                          <DText weight="semiBold" style={d.rowTitle} numberOfLines={1}>{folder.title}</DText>
                          <DText style={pageStyles.rowNote}>{meta(folder)}</DText>
                        </View>
                        <HoverPressable style={d.iconBtn} hoverStyle={pageStyles.rowHover} onPress={() => edit(folder)} accessibilityLabel={t('companyFolders.editNamed', { title: folder.title })} {...webOnly({ title: t('common.edit') })}>
                          <Ionicons name="create-outline" size={16} color={DESKTOP_COLORS.inkMuted} />
                        </HoverPressable>
                        <HoverPressable style={d.iconBtn} hoverStyle={d.iconBtnDanger} onPress={() => remove(folder)} accessibilityLabel={t('companyFolders.deleteNamed', { title: folder.title })} {...webOnly({ title: t('common.deleteAction') })}>
                          <Ionicons name="trash-outline" size={16} color={DESKTOP_COLORS.inkFaint} />
                        </HoverPressable>
                      </View>
                    ))
                  )}
                </View>
              );
            })
          )}
        </View>
        <DesktopModal visible={!!draft} title={draft?.id ? t('companyFolders.editTitle') : t('companyFolders.add')} onClose={close} maxWidth={480}>
          <View style={pageStyles.editBody}>
            {form}
            {!!error && <DText style={pageStyles.editError}>{error}</DText>}
            <View style={pageStyles.editActions}>
              <HoverPressable style={[pageStyles.primaryBtn, pageStyles.editActionBtn, saving && pageStyles.disabled]} hoverStyle={pageStyles.primaryBtnHover} pressStyle={pageStyles.pressDown} onPress={() => void save()} disabled={saving}>
                {saving && <BrandLoader size="small" color="#FFFFFF" />}
                <DText weight="semiBold" style={pageStyles.primaryBtnText}>{draft?.id ? t('common.save') : t('companyFolders.addAction')}</DText>
              </HoverPressable>
              <HoverPressable style={[pageStyles.plainBtn, pageStyles.editActionBtn]} hoverStyle={pageStyles.plainBtnHover} pressStyle={pageStyles.pressDown} onPress={close}>
                <DText weight="semiBold" style={pageStyles.plainBtnText}>{t('common.cancel')}</DText>
              </HoverPressable>
            </View>
          </View>
        </DesktopModal>
      </View>
    );
  }

  return (
    <View>
      <KitSection
        title={t('companyFolders.title')}
        trailing={
          <Pressy onPress={() => open(emptyDraft())} accessibilityLabel={t('companyFolders.add')} style={m.linkChip} pressScale={0.95}>
            <Ionicons name="add" size={15} color={DK.accent} />
            <DKText variant="micro" color={DK.accent}>
              {t('companyFolders.addShort')}
            </DKText>
          </Pressy>
        }
      >
        {folders == null && !failed ? (
          <View style={m.loading}><BrandLoader size="small" color={DK.accent} /></View>
        ) : failed ? (
          <DKText variant="caption" color={DK.muted} style={m.empty}>{t('companyFolders.loadFailed')}</DKText>
        ) : (
          groups.map((group, groupIndex) => {
            const rows = folders!.filter((f) => f.owner_type === group.ownerType);
            return (
              <View key={group.ownerType} style={groupIndex > 0 && m.divider}>
                <View style={m.groupHead}>
                  <Ionicons name={group.ownerType === 'vehicle' ? 'car-sport' : 'person'} size={15} color={DK.muted} />
                  <DKText variant="micro" color={DK.muted} style={m.flex}>{group.title}</DKText>
                </View>
                {rows.length === 0 ? (
                  <DKText variant="caption" color={DK.muted} style={m.groupEmpty}>{group.empty}</DKText>
                ) : (
                  rows.map((folder, index) => (
                    <ListRow
                      key={folder.id}
                      first={index === 0}
                      icon="folder-outline"
                      title={folder.title}
                      subtitle={meta(folder)}
                      onPress={() => edit(folder)}
                    />
                  ))
                )}
              </View>
            );
          })
        )}
      </KitSection>
      <KitSheet
        visible={!!draft}
        onClose={close}
        title={draft?.id ? t('companyFolders.editTitle') : t('companyFolders.add')}
        icon="folder-open-outline"
        footer={
          <SheetActions>
            <PrimaryAction label={t('common.cancel')} tone="ghost" onPress={close} disabled={saving} style={m.flex} />
            <PrimaryAction label={draft?.id ? t('common.save') : t('companyFolders.addAction')} icon="checkmark" onPress={() => void save()} loading={saving} style={m.flex} />
          </SheetActions>
        }
      >
        {form}
        {!!error && (
          <DKText variant="caption" color={STATUS.expired.fg} style={m.error}>
            {error}
          </DKText>
        )}
        {draft?.id ? (
          <View style={m.deleteBox}>
            <PrimaryAction
              label={t('companyFolders.deleteAction')}
              icon="trash-outline"
              tone="danger"
              onPress={() => {
                const folder = folders?.find((f) => f.id === draft.id);
                setDraft(null);
                if (folder) remove(folder);
              }}
              disabled={saving}
            />
          </View>
        ) : null}
      </KitSheet>
    </View>
  );
}

// שדות הטופס
function FolderForm({ desktop, draft, companyName, onChange }: { desktop: boolean; draft: Draft; companyName: string; onChange: (d: Draft) => void }) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const whereOptions = [
    { value: 'vehicle' as const, label: t('companyFolders.inVehicle') },
    { value: 'driver' as const, label: t('companyFolders.inDriverFile') },
  ];
  const expiryOptions = [
    { value: 'no' as const, label: t('companyFolders.noExpiry') },
    { value: 'yes' as const, label: t('companyFolders.askExpiry') },
  ];
  const scopeOptions = [
    { value: 'one' as const, label: t('companyFolders.onlyThisCompany', { name: companyName }) },
    { value: 'all' as const, label: t('companyFolders.allCompanies') },
  ];

  if (desktop) {
    return (
      <>
        <View>
          <DText style={pageStyles.editFieldLabel}>{t('companyFolders.nameLabel')}</DText>
          <DesktopInput value={draft.title} onChangeText={(title) => set({ title })} maxLength={60} placeholder={t('companyFolders.namePlaceholder')} large />
        </View>
        {!draft.id && (
          <View>
            <DText style={pageStyles.editFieldLabel}>{t('companyFolders.whereLabel')}</DText>
            <DesktopSelect value={draft.ownerType} onChange={(v) => v && set({ ownerType: v })} options={whereOptions} large />
          </View>
        )}
        <View>
          <DText style={pageStyles.editFieldLabel}>{t('companyFolders.expiryLabel')}</DText>
          <DesktopSelect value={draft.tracksExpiry ? 'yes' : 'no'} onChange={(v) => set({ tracksExpiry: v === 'yes' })} options={expiryOptions} large />
          <DText style={[pageStyles.rowNote, d.hint]}>{t('companyFolders.expiryHint')}</DText>
        </View>
        {!draft.id && (
          <View>
            <DText style={pageStyles.editFieldLabel}>{t('companyFolders.scopeLabel')}</DText>
            <DesktopSelect value={draft.allCompanies ? 'all' : 'one'} onChange={(v) => set({ allCompanies: v === 'all' })} options={scopeOptions} large />
          </View>
        )}
      </>
    );
  }

  return (
    <>
      <EditField first label={t('companyFolders.nameLabel')} value={draft.title} onChangeText={(title) => set({ title })} maxLength={60} placeholder={t('companyFolders.namePlaceholder')} required />
      {!draft.id && (
        <EditField
          label={t('companyFolders.whereLabel')}
          editor={<ChoiceChips label={t('companyFolders.whereLabel')} value={draft.ownerType} onChange={(v) => v && set({ ownerType: v })} options={whereOptions.map((o) => ({ ...o, icon: o.value === 'vehicle' ? 'car-sport-outline' : 'person-outline' }))} />}
        />
      )}
      <EditField
        label={t('companyFolders.expiryLabel')}
        hint={t('companyFolders.expiryHint')}
        editor={<ChoiceChips label={t('companyFolders.expiryLabel')} value={draft.tracksExpiry ? 'yes' : 'no'} onChange={(v) => set({ tracksExpiry: v === 'yes' })} options={expiryOptions} />}
      />
      {!draft.id && (
        <EditField
          label={t('companyFolders.scopeLabel')}
          editor={<ChoiceChips label={t('companyFolders.scopeLabel')} value={draft.allCompanies ? 'all' : 'one'} onChange={(v) => set({ allCompanies: v === 'all' })} options={scopeOptions} />}
        />
      )}
    </>
  );
}

// עיצוב במחשב
const d = StyleSheet.create({
  loading: { paddingVertical: 24, alignItems: 'center' },
  empty: { fontSize: 14, color: DESKTOP_COLORS.inkFaint, textAlign: 'center', paddingVertical: 20 },
  groupHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  groupTitle: { flex: 1, fontSize: 13, color: DESKTOP_COLORS.inkMuted, textAlign: 'right' },
  groupAdd: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  groupEmpty: { fontSize: 13, color: DESKTOP_COLORS.inkFaint, textAlign: 'right', paddingHorizontal: 16, paddingBottom: 12 },
  rowTitle: { fontSize: 14, color: DESKTOP_COLORS.ink, textAlign: 'right' },
  iconBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', ...webOnly({ transition: 'background-color 150ms ease' }) },
  iconBtnDanger: { backgroundColor: 'rgba(217,45,32,0.08)' },
  hint: { marginTop: 4, textAlign: 'right' },
});

// עיצוב בטלפון
const m = StyleSheet.create({
  flex: { flex: 1 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DK.hairline },
  loading: { paddingVertical: 24, alignItems: 'center' },
  empty: { textAlign: 'center', padding: 20 },
  groupHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: DK_SPACE.md, paddingTop: 12, paddingBottom: 4 },
  groupEmpty: { paddingHorizontal: DK_SPACE.md, paddingBottom: 14 },
  linkChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: DK.accentSoft },
  error: { paddingHorizontal: DK_SPACE.md, paddingTop: 8 },
  deleteBox: { paddingHorizontal: DK_SPACE.md, paddingTop: 16 },
});
