import React, { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  createCatalogFolder,
  deleteCatalogFolder,
  FolderActionError,
  listCatalog,
  reorderCatalog,
  retireCatalogFolder,
  updateCatalogFolder,
  type FolderKind,
  type OwnerCatalogFolder,
} from '../../lib/folderCatalog';
import { SIGNING_LEAD_DEFAULT, VALIDITY_MONTHS, validityLabel } from '../../lib/signingRules';
import { REPEAT_OPTIONS, repeatLabel } from '../../lib/checklistForms';
import { ConfirmAlert, Sheet, useSheetClose } from '../desktop/signing/Sheet.web';
import { FloatWindow, FolderHero } from '../desktop/signing/FolderCatalogSheets.web';
import { useSigningStyles } from '../desktop/signing/folderCss';
import { t } from '../../lib/i18n';

/**
 * The owner's folder catalog (plans/folder_catalog_plan.md): folders every
 * company may add to all its drivers' files. A new folder shows nowhere until
 * a company adds it; one a company ever added is retired, never deleted.
 */

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

export function FolderCatalogManager({ onClosed }: { onClosed: () => void }) {
  useSigningStyles();
  const { closing, close } = useSheetClose(onClosed);
  const [folders, setFolders] = useState<OwnerCatalogFolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OwnerCatalogFolder | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OwnerCatalogFolder | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setFolders(await listCatalog());
      setError(null);
    } catch (err) {
      setError(errorText(err, t('folders.loadFailed')));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, task: () => Promise<void>, fallback: string) => {
    setBusy(key);
    setError(null);
    try {
      await task();
      await load();
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setBusy(null);
    }
  };

  const move = (index: number, by: -1 | 1) => {
    if (!folders) return;
    const next = [...folders];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    setFolders(next);
    void run('order', () => reorderCatalog(next.map((folder) => folder.id)), t('folders.saveFailed'));
  };

  const remove = (folder: OwnerCatalogFolder) => {
    setConfirmDelete(null);
    void run(`delete:${folder.id}`, async () => {
      try {
        await deleteCatalogFolder(folder.id);
      } catch (err) {
        // A company added it meanwhile: it can only be retired now.
        if (err instanceof FolderActionError && err.code === 'in_use') throw new Error(t('folders.inUseRetireInstead'));
        throw err;
      }
    }, t('folders.deleteFailed'));
  };

  const defaultsLine = (folder: OwnerCatalogFolder) =>
    folder.kind === 'checklist'
      ? repeatLabel(folder.default_repeat_months ?? 0)
      : folder.default_valid_months
        ? t('folders.defaultsDocument', { validity: validityLabel(folder.default_valid_months), days: folder.default_lead_days })
        : validityLabel(null);

  return (
    <>
      <Sheet
        closing={closing}
        onRequestClose={close}
        label={t('folders.catalogTitle')}
        head={
          <>
            <div />
            <div className="sd-sheet-title">
              <strong className="sd-b">{t('folders.catalogTitle')}</strong>
            </div>
            <button type="button" className="sd-btn sd-btn-link sd-b" onClick={close}>
              {t('common.close')}
            </button>
          </>
        }
      >
        <div className="fc-manage">
          <p className="fc-manage-intro">{t('folders.catalogIntro')}</p>
          <button type="button" className="sd-btn sd-btn-primary" onClick={() => setEditing('new')} style={{ marginBottom: 18 }}>
            <Ionicons name="add" size={20} color="#fff" />
            {t('folders.newFolder')}
          </button>
          {error ? <div className="fc-note fc-bad" role="alert" style={{ marginBottom: 14 }}>{error}</div> : null}
          {!folders ? (
            <div className="fc-empty"><span className="sd-spinner" /></div>
          ) : !folders.length ? (
            <div className="fc-empty">{t('folders.catalogEmpty')}</div>
          ) : (
            folders.map((folder, index) => (
              <div key={folder.id} className={`fc-folder${folder.retired_at ? ' fc-retired' : ''}`} style={{ ['--i' as string]: index } as React.CSSProperties}>
                <span className="fc-icon">
                  <Ionicons name={folder.kind === 'checklist' ? 'list' : 'create'} size={20} color="currentColor" />
                </span>
                <div className="fc-text">
                  <strong className="sd-sb">{folder.title}</strong>
                  {folder.description ? <span>{folder.description}</span> : null}
                  <div className="fc-chips">
                    <span className="fc-kind sd-sb">{folder.kind === 'checklist' ? t('folders.kindChecklist') : t('folders.kindDocument')}</span>
                    <span className="fc-kind sd-sb">{defaultsLine(folder)}</span>
                    <span className={`fc-kind sd-sb${folder.companies ? ' fc-in' : ''}`}>{folder.companies === 1 ? t('owner.oneCompany') : t('folders.companiesCount', { count: folder.companies })}</span>
                    {folder.retired_at ? <span className="fc-kind sd-sb">{t('folders.retired')}</span> : null}
                  </div>
                </div>
                <div className="fc-tools">
                  <button type="button" className="fc-tool" onClick={() => move(index, -1)} disabled={index === 0 || !!busy} aria-label={t('folders.moveUp')}>
                    <Ionicons name="arrow-up" size={18} color="currentColor" />
                  </button>
                  <button type="button" className="fc-tool" onClick={() => move(index, 1)} disabled={index === folders.length - 1 || !!busy} aria-label={t('folders.moveDown')}>
                    <Ionicons name="arrow-down" size={18} color="currentColor" />
                  </button>
                  <button type="button" className="fc-tool" onClick={() => setEditing(folder)} disabled={!!busy} aria-label={t('common.edit')}>
                    <Ionicons name="create-outline" size={18} color="currentColor" />
                  </button>
                  <button
                    type="button"
                    className="fc-tool"
                    onClick={() => void run(`retire:${folder.id}`, () => retireCatalogFolder(folder.id, !folder.retired_at), t('folders.saveFailed'))}
                    disabled={!!busy}
                    aria-label={folder.retired_at ? t('folders.unretire') : t('folders.retire')}
                    title={folder.retired_at ? t('folders.unretire') : t('folders.retire')}
                  >
                    <Ionicons name={folder.retired_at ? 'eye-outline' : 'eye-off-outline'} size={18} color="currentColor" />
                  </button>
                  {!folder.everAdded ? (
                    <button type="button" className="fc-tool fc-danger" onClick={() => setConfirmDelete(folder)} disabled={!!busy} aria-label={t('common.deleteAction')}>
                      <Ionicons name="trash-outline" size={18} color="currentColor" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Sheet>
      {editing ? (
        <CatalogFolderEditor
          folder={editing === 'new' ? null : editing}
          onClosed={() => setEditing(null)}
          onSaved={() => void load()}
        />
      ) : null}
      {confirmDelete ? (
        <ConfirmAlert
          title={t('folders.deleteQuestion', { title: confirmDelete.title })}
          message={t('folders.deleteWarning')}
          cancelLabel={t('common.cancel')}
          confirmLabel={t('common.deleteAction')}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => remove(confirmDelete)}
        />
      ) : null}
    </>
  );
}

function CatalogFolderEditor({ folder, onClosed, onSaved }: { folder: OwnerCatalogFolder | null; onClosed: () => void; onSaved: () => void }) {
  const { closing, close } = useSheetClose(onClosed);
  const [title, setTitle] = useState(folder?.title ?? '');
  const [kind, setKind] = useState<FolderKind>(folder?.kind ?? 'document');
  const [description, setDescription] = useState(folder?.description ?? '');
  const [validMonths, setValidMonths] = useState<number>(folder?.default_valid_months ?? 0);
  const [leadDays, setLeadDays] = useState<number>(folder?.default_lead_days ?? SIGNING_LEAD_DEFAULT);
  const [repeatMonths, setRepeatMonths] = useState<number>(folder?.default_repeat_months ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renaming = !!folder && folder.companies > 0 && title.trim() !== folder.title;

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    const input = {
      title: title.trim(),
      description: description.trim() || null,
      defaultValidMonths: kind === 'document' && validMonths ? validMonths : null,
      defaultLeadDays: Math.min(90, Math.max(1, Math.round(leadDays) || SIGNING_LEAD_DEFAULT)),
      defaultRepeatMonths: kind === 'checklist' ? repeatMonths : null,
    };
    try {
      if (folder) await updateCatalogFolder(folder.id, input);
      else await createCatalogFolder({ ...input, kind });
      onSaved();
      close();
    } catch (err) {
      setError(errorText(err, t('folders.saveFailed')));
      setSaving(false);
    }
  };

  const head = (
    <>
      {folder ? null : <FolderHero />}
      <h2 className="sd-xb">{folder ? t('folders.editFolder') : t('folders.newFolder')}</h2>
      <p>{t('folders.editorHint')}</p>
    </>
  );

  return (
    <FloatWindow
      closing={closing}
      onRequestClose={saving ? () => undefined : close}
      label={folder ? t('folders.editFolder') : t('folders.newFolder')}
      head={head}
      foot={
        <>
          <button type="button" className="sd-btn sd-btn-plain" onClick={close} disabled={saving}>{t('common.cancel')}</button>
          <button type="button" className="sd-btn sd-btn-primary" onClick={() => void save()} disabled={!title.trim() || saving}>
            {saving ? t('common.savingEllipsis') : t('common.save')}
          </button>
        </>
      }
    >
      <label className="fc-field">
        <span>{t('folders.folderName')}</span>
        <input className="fc-input" value={title} maxLength={120} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder={t('folders.folderNamePlaceholder')} />
      </label>
      {renaming ? <div className="fc-note fc-warn">{t('folders.renameWarning', { count: folder!.companies })}</div> : null}

      {!folder ? (
        <div className="fc-field">
          <span>{t('folders.folderKind')}</span>
          <div className="fc-kinds" role="radiogroup" aria-label={t('folders.folderKind')}>
            {(['document', 'checklist'] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={kind === value} className="fc-item" onClick={() => setKind(value)}>
                <span className="fc-icon"><Ionicons name={value === 'checklist' ? 'list' : 'create'} size={20} color="currentColor" /></span>
                <span className="fc-text">
                  <strong className="sd-sb">{value === 'checklist' ? t('folders.kindChecklist') : t('folders.kindDocument')}</strong>
                  <span>{value === 'checklist' ? t('folders.kindChecklistHint') : t('folders.kindDocumentHint')}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="fc-note" style={{ marginTop: 10 }}>{t('folders.kindFixed')}</div>
        </div>
      ) : null}

      <label className="fc-field">
        <span>{t('folders.description')}</span>
        <textarea className="fc-input" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder={t('folders.descriptionPlaceholder')} />
      </label>

      {kind === 'document' ? (
        <>
          <label className="fc-field">
            <span>{t('folders.defaultValidity')}</span>
            <select className="fc-input" value={validMonths} onChange={(e) => setValidMonths(Number(e.target.value))}>
              {VALIDITY_MONTHS.map((months) => (
                <option key={months} value={months}>{validityLabel(months || null)}</option>
              ))}
            </select>
          </label>
          {validMonths ? (
            <label className="fc-field">
              <span>{t('folders.defaultLead')}</span>
              <input className="fc-input sd-num" type="number" min={1} max={90} value={leadDays} onChange={(e) => setLeadDays(Number(e.target.value))} />
            </label>
          ) : null}
        </>
      ) : (
        <label className="fc-field">
          <span>{t('folders.defaultRepeat')}</span>
          <select className="fc-input" value={repeatMonths} onChange={(e) => setRepeatMonths(Number(e.target.value))}>
            {REPEAT_OPTIONS.map((option) => (
              <option key={option.months} value={option.months}>{option.label}</option>
            ))}
          </select>
        </label>
      )}
      <div className="fc-note" style={{ marginTop: 14 }}>{t('folders.defaultsOnlyNew')}</div>
      {error ? <div className="fc-note fc-bad" role="alert">{error}</div> : null}
    </FloatWindow>
  );
}
