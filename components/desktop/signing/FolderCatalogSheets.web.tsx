import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { assignSigningTemplate, getSigningTemplateSourceUrl, type SigningTemplate } from '../../../lib/docuseal';
import {
  addCompanyFolder,
  FolderActionError,
  listCompanyFolders,
  listFormVersions,
  removeCompanyFolder,
  restoreFormVersion,
  type CompanyFolder,
  type FolderVersion,
} from '../../../lib/folderCatalog';
import { ConfirmAlert, useSheetClose } from './Sheet.web';
import { useSigningStyles } from './folderCss';
import { t, getLocale } from '../../../lib/i18n';

/**
 * The folder catalog's floating windows (plans/folder_catalog_plan.md):
 * "הוסף תיקייה", a folder that has no form yet, the "what to send" question
 * after a new version, and the version history. Centered on a computer, a
 * bottom sheet on a phone (folderCss.ts).
 */

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches;

/** The floating window itself: backdrop, Escape, focus, no page scroll behind it. */
export function FloatWindow({
  closing,
  onRequestClose,
  label,
  head,
  foot,
  children,
}: {
  closing: boolean;
  onRequestClose: () => void;
  label: string;
  head: React.ReactNode;
  foot?: React.ReactNode;
  children: React.ReactNode;
}) {
  useSigningStyles();
  const ref = useRef<HTMLDivElement>(null);
  const requestCloseRef = useRef(onRequestClose);
  requestCloseRef.current = onRequestClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.sd-alert')) requestCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div className="sd-root">
      <div className={`sd-backdrop${closing ? ' sd-closing' : ''}`} onClick={onRequestClose} />
      <div ref={ref} className={`sd-float${closing ? ' sd-closing' : ''}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className="sd-float-grabber" />
        <div className="sd-float-head">{head}</div>
        <div className="sd-float-body">{children}</div>
        {foot ? <div className="sd-float-foot">{foot}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/** A folder dropping in, its front opening and a green "+" popping in. `done` closes it on a check. */
export function FolderHero({ done = false }: { done?: boolean }) {
  return (
    <div className={`fc-hero${done ? ' fc-done' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 96 78">
        <path className="fc-back" d="M6 14a8 8 0 0 1 8-8h22l9 9h37a8 8 0 0 1 8 8v43a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z" />
        <rect className="fc-paper" x="18" y="18" width="60" height="40" rx="5" />
        <path className="fc-front" d="M4 30a7 7 0 0 1 7-7h74a7 7 0 0 1 7 7l-3 37a8 8 0 0 1-8 7H15a8 8 0 0 1-8-7z" />
      </svg>
      <span className="fc-badge">
        <Ionicons name={done ? 'checkmark' : 'add'} size={20} color="#fff" />
      </span>
    </div>
  );
}

const kindLabel = (kind: CompanyFolder['kind']) => (kind === 'checklist' ? t('folders.kindChecklist') : t('folders.kindDocument'));

// ── "+ הוסף תיקייה" ─────────────────────────────────────────────────

export function AddCatalogFolderSheet({
  companyId,
  onClosed,
  onAdded,
}: {
  companyId: string;
  onClosed: () => void;
  /** After a folder was added; `templateId` = its form when it already has one (linked or restored). */
  onAdded: (folder: CompanyFolder, templateId: string | null) => void;
}) {
  const { closing, close } = useSheetClose(onClosed);
  const [folders, setFolders] = useState<CompanyFolder[] | null>(null);
  const [driverCount, setDriverCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listCompanyFolders(companyId)
      .then((result) => {
        if (!active) return;
        setFolders(result.folders);
        setDriverCount(result.driverCount);
      })
      .catch((err) => active && setLoadError(errorText(err, t('folders.loadFailed'))));
    return () => {
      active = false;
    };
  }, [companyId]);

  const choice = folders?.find((folder) => folder.id === picked) ?? null;
  // An own document of the same name: the same kind is linked, another kind blocks.
  const twin = choice?.sameName ?? null;
  const blocked = !!twin && twin.kind !== choice?.kind;
  const available = (folders ?? []).filter((folder) => !folder.added && !folder.retired_at);
  const inFile = (folders ?? []).filter((folder) => folder.added);
  // A folder the company removed comes back with its form and history, even when retired.
  const restorable = (folders ?? []).filter((folder) => !folder.added && folder.retired_at && folder.form);

  const add = async () => {
    if (!choice || blocked || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { templateId } = await addCompanyFolder(companyId, choice.id, twin ? twin.id : undefined);
      setDone(true);
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      // Let the folder close on its check, then go.
      setTimeout(() => {
        onAdded(choice, templateId);
        close();
      }, reduce ? 0 : 700);
    } catch (err) {
      setError(errorText(err, t('folders.addFailed')));
      setSaving(false);
    }
  };

  const head = (
    <>
      <FolderHero done={done} />
      <h2 className="sd-xb">{t('folders.addTitle')}</h2>
      {/* Hidden until the count arrives, so it never reads "all 0 drivers". */}
      <p style={{ visibility: folders ? 'visible' : 'hidden' }}>{driverCount === 1 ? t('folders.addSubtitleOne') : t('folders.addSubtitle', { count: driverCount })}</p>
    </>
  );

  const foot = (
    <>
      <button type="button" className="sd-btn sd-btn-plain" onClick={close} disabled={saving}>
        {t('common.cancel')}
      </button>
      <button type="button" className="sd-btn sd-btn-primary" onClick={() => void add()} disabled={!choice || blocked || saving}>
        {saving ? <span className="sd-spinner" style={{ width: 20, height: 20, borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)', borderTopColor: '#fff' }} /> : <Ionicons name="add" size={20} color="#fff" />}
        {twin && !blocked ? t('folders.addAndLink') : t('folders.addToAll')}
      </button>
    </>
  );

  const item = (folder: CompanyFolder, index: number, disabled = false) => (
    <button
      key={folder.id}
      type="button"
      role="radio"
      aria-checked={picked === folder.id}
      className="fc-item"
      style={{ ['--i' as string]: index } as React.CSSProperties}
      disabled={disabled || saving}
      onClick={() => setPicked(folder.id)}
    >
      <span className="fc-icon">
        <Ionicons name={folder.kind === 'checklist' ? 'list' : 'create'} size={20} color="currentColor" />
      </span>
      <span className="fc-text">
        <strong className="sd-sb">{folder.title}</strong>
        {folder.description ? <span>{folder.description}</span> : null}
      </span>
      <span className={`fc-kind sd-sb${disabled ? ' fc-in' : ''}`}>{disabled ? t('folders.inFile') : kindLabel(folder.kind)}</span>
    </button>
  );

  return (
    <FloatWindow closing={closing} onRequestClose={saving ? () => undefined : close} label={t('folders.addTitle')} head={head} foot={foot}>
      {loadError ? (
        <div className="fc-note fc-bad" role="alert">{loadError}</div>
      ) : !folders ? (
        <div className="fc-loading"><span className="sd-spinner" /></div>
      ) : (
        <>
          {available.length + restorable.length === 0 ? (
            <div className="fc-empty">{folders.length ? t('folders.allAdded') : t('folders.noneYet')}</div>
          ) : (
            <div className="fc-list" role="radiogroup" aria-label={t('folders.addTitle')}>
              {[...available, ...restorable].map((folder, index) => item(folder, index))}
            </div>
          )}
          {twin ? (
            <div className={`fc-note${blocked ? ' fc-bad' : ''}`} role="status">
              <Ionicons name={blocked ? 'alert-circle' : 'link'} size={18} color="currentColor" />
              <span>{blocked ? t('folders.twinOtherKind') : t('folders.twinWillLink')}</span>
            </div>
          ) : null}
          {error ? <div className="fc-note fc-bad" role="alert">{error}</div> : null}
          {inFile.length ? (
            <>
              <div className="fc-section sd-sb">{t('folders.alreadyInFile')}</div>
              <div className="fc-list">{inFile.map((folder, index) => item(folder, available.length + index, true))}</div>
            </>
          ) : null}
        </>
      )}
    </FloatWindow>
  );
}

// ── A folder with no form yet ───────────────────────────────────────

export function EmptyCatalogFolderSheet({
  companyId,
  folder,
  onCreate,
  onClosed,
  onChanged,
}: {
  companyId: string;
  folder: CompanyFolder;
  /** Opens "צור טופס" for this folder (desktop). Not given on a phone: forms are made on a computer. */
  onCreate?: () => void;
  onClosed: () => void;
  onChanged: () => void;
}) {
  const { closing, close } = useSheetClose(onClosed);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const phone = isPhone();

  const link = async (templateId: string) => {
    setBusy(templateId);
    setError(null);
    try {
      await addCompanyFolder(companyId, folder.id, templateId);
      onChanged();
      close();
    } catch (err) {
      setError(errorText(err, t('folders.linkFailed')));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setConfirmRemove(false);
    setBusy('remove');
    setError(null);
    try {
      // A folder with no form has nobody waiting on it.
      await removeCompanyFolder(companyId, folder.id);
      onChanged();
      close();
    } catch (err) {
      setError(errorText(err, t('folders.removeFailed')));
    } finally {
      setBusy(null);
    }
  };

  const head = (
    <>
      <FolderHero />
      <h2 className="sd-xb">{folder.title}</h2>
      <p>{folder.description || t('folders.noFormYet')}</p>
    </>
  );

  return (
    <>
      <FloatWindow closing={closing} onRequestClose={busy ? () => undefined : close} label={folder.title} head={head}>
        {!linking ? (
          <div className="fc-actions">
            <div className="fc-note fc-warn">
              <Ionicons name="information-circle" size={18} color="currentColor" />
              <span>{folder.kind === 'checklist' ? t('folders.emptyChecklistHint') : t('folders.emptyDocumentHint')}</span>
            </div>
            {onCreate && !phone ? (
              <button type="button" className="sd-btn sd-btn-primary" onClick={() => { onCreate(); close(); }} disabled={!!busy}>
                <Ionicons name="add-circle" size={20} color="#fff" />
                {t('folders.createForm')}
              </button>
            ) : (
              <div className="fc-note">{t('folders.createOnComputer')}</div>
            )}
            {folder.linkable.length ? (
              <button type="button" className="sd-btn sd-btn-plain" onClick={() => setLinking(true)} disabled={!!busy}>
                <Ionicons name="link" size={19} color="currentColor" />
                {t('folders.pickExisting')}
              </button>
            ) : null}
            <button type="button" className="sd-btn sd-btn-plain fc-danger" onClick={() => setConfirmRemove(true)} disabled={!!busy}>
              {busy === 'remove' ? t('common.deleting') : t('folders.removeFolder')}
            </button>
          </div>
        ) : (
          <div className="fc-list" role="list">
            {folder.linkable.map((form, index) => (
              <button key={form.id} type="button" className="fc-item" style={{ ['--i' as string]: index } as React.CSSProperties} onClick={() => void link(form.id)} disabled={!!busy}>
                <span className="fc-icon"><Ionicons name={folder.kind === 'checklist' ? 'list' : 'document-text'} size={20} color="currentColor" /></span>
                <span className="fc-text">
                  <strong className="sd-sb">{form.title}</strong>
                  <span>{t('folders.linkHint', { title: folder.title })}</span>
                </span>
                {busy === form.id ? <span className="sd-spinner" style={{ width: 18, height: 18 }} /> : null}
              </button>
            ))}
            <button type="button" className="sd-btn sd-btn-plain" onClick={() => setLinking(false)} disabled={!!busy}>
              {t('common.goBack')}
            </button>
          </div>
        )}
        {error ? <div className="fc-note fc-bad" role="alert">{error}</div> : null}
      </FloatWindow>
      {confirmRemove ? (
        <ConfirmAlert
          title={t('folders.removeQuestion', { title: folder.title })}
          message={t('folders.removeEmptyWarning')}
          cancelLabel={t('common.keep')}
          confirmLabel={t('folders.removeFolder')}
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => void remove()}
        />
      ) : null}
    </>
  );
}

// ── Removing a folder that has a form ───────────────────────────────

/**
 * "הסר תיקייה" for a folder with a form: asks first, and when drivers still
 * wait to sign it, says how many and offers to cancel them.
 */
export function useRemoveCatalogFolder(companyId: string, onRemoved: () => void) {
  const [ask, setAsk] = useState<{ catalogId: string; title: string; pending: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (catalogId: string, title: string, cancelPending: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const result = await removeCompanyFolder(companyId, catalogId, cancelPending);
      if (result.pending) setAsk({ catalogId, title, pending: result.pending });
      else {
        setAsk(null);
        onRemoved();
      }
    } catch (err) {
      setAsk(null);
      setError(errorText(err, t('folders.removeFailed')));
    } finally {
      setBusy(false);
    }
  }, [companyId, onRemoved]);

  const start = (catalogId: string, title: string) => setAsk({ catalogId, title, pending: null });

  const dialog = ask ? (
    <ConfirmAlert
      title={t('folders.removeQuestion', { title: ask.title })}
      message={ask.pending ? t('folders.removePendingWarning', { count: ask.pending }) : t('folders.removeWarning')}
      cancelLabel={t('common.keep')}
      confirmLabel={busy ? t('common.deleting') : ask.pending ? t('folders.cancelAndRemove') : t('folders.removeFolder')}
      onCancel={() => !busy && setAsk(null)}
      onConfirm={() => !busy && void run(ask.catalogId, ask.title, ask.pending !== null)}
    />
  ) : null;

  return { start, dialog, error, busy };
}

// ── After a new version: what to send ───────────────────────────────

export function AfterReplaceSheet({
  companyId,
  template,
  pendingOld,
  onPickDrivers,
  onClosed,
}: {
  companyId: string;
  template: SigningTemplate;
  pendingOld: number;
  /** Opens the usual "send to drivers" window. */
  onPickDrivers: () => void;
  onClosed: () => void;
}) {
  const { closing, close } = useSheetClose(onClosed);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checklist = template.form_kind === 'checklist';

  // Drivers still waiting on an earlier version get the new one instead (the
  // server cancels the old request and sends the current form).
  const sendToPending = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: loadError } = await supabase.from('signature_requests')
        .select('driver_id, template_version')
        .eq('template_id', template.id).eq('status', 'pending').is('archived_at', null).is('deleted_at', null);
      if (loadError) throw loadError;
      const drivers = [...new Set((data ?? [])
        .filter((row) => (row.template_version ?? 0) < (template.version ?? 1))
        .map((row) => row.driver_id as string))];
      if (!drivers.length) {
        setResult(t('folders.nobodyWaiting'));
        return;
      }
      const sent = await assignSigningTemplate(companyId, template.id, drivers);
      setResult(sent.success ? t('folders.sentToPending', { count: sent.created }) : sent.message || t('signing.sendNotApprovedRetry'));
    } catch (err) {
      setError(errorText(err, t('signing.sendFailedRetry')));
    } finally {
      setBusy(false);
    }
  };

  const head = (
    <>
      <FolderHero done />
      <h2 className="sd-xb">{t('folders.newVersionSaved', { version: template.version ?? 1 })}</h2>
      <p>{checklist ? t('folders.newVersionChecklistHint') : pendingOld ? t('folders.pendingOldHint', { count: pendingOld }) : t('folders.newVersionHint')}</p>
    </>
  );

  return (
    <FloatWindow closing={closing} onRequestClose={busy ? () => undefined : close} label={t('folders.whatToSend')} head={head}>
      <div className="fc-actions">
        {!checklist && pendingOld > 0 && !result ? (
          <button type="button" className="sd-btn sd-btn-primary" onClick={() => void sendToPending()} disabled={busy}>
            <Ionicons name="refresh" size={19} color="#fff" />
            {busy ? t('common.sending') : t('folders.sendNewToPending', { count: pendingOld })}
          </button>
        ) : null}
        {!checklist ? (
          <button type="button" className="sd-btn sd-btn-plain" onClick={() => { onPickDrivers(); close(); }} disabled={busy}>
            <Ionicons name="people" size={19} color="currentColor" />
            {t('folders.pickDriversToSign')}
          </button>
        ) : null}
        {result ? <div className="fc-note" role="status">{result}</div> : null}
        {error ? <div className="fc-note fc-bad" role="alert">{error}</div> : null}
        <button type="button" className="sd-btn sd-btn-plain" onClick={close} disabled={busy}>
          {result ? t('common.done') : t('folders.notNow')}
        </button>
      </div>
    </FloatWindow>
  );
}

// ── Version history ─────────────────────────────────────────────────

export function FormVersionsSheet({
  companyId,
  template,
  onClosed,
  onRestored,
}: {
  companyId: string;
  template: SigningTemplate;
  onClosed: () => void;
  onRestored: (template: SigningTemplate, pendingOld: number) => void;
}) {
  const { closing, close } = useSheetClose(onClosed);
  const [versions, setVersions] = useState<FolderVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    listFormVersions(template.id)
      .then((rows) => active && setVersions(rows))
      .catch((err) => active && setError(errorText(err, t('folders.versionsLoadFailed'))));
    return () => {
      active = false;
    };
  }, [template.id]);

  const view = async (version: FolderVersion) => {
    if (!version.source_file_path) return;
    setError(null);
    try {
      const url = await getSigningTemplateSourceUrl({ ...template, source_file_path: version.source_file_path });
      if (url) window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(errorText(err, t('common.openDocumentFailedRetry')));
    }
  };

  const restore = async (version: number) => {
    setConfirm(null);
    setBusy(version);
    setError(null);
    try {
      const result = await restoreFormVersion(companyId, template.id, version, template.version ?? 1);
      onRestored(result.template as SigningTemplate, result.pendingOld);
      close();
    } catch (err) {
      setError(err instanceof FolderActionError && err.code === 'stale' ? t('folders.staleRefresh') : errorText(err, t('folders.restoreFailed')));
    } finally {
      setBusy(null);
    }
  };

  const when = (iso: string) => new Date(iso).toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, '/');

  const head = (
    <>
      <h2 className="sd-xb">{t('folders.versionsTitle')}</h2>
      <p>{template.title}</p>
    </>
  );

  return (
    <>
      <FloatWindow closing={closing} onRequestClose={busy !== null ? () => undefined : close} label={t('folders.versionsTitle')} head={head} foot={
        <button type="button" className="sd-btn sd-btn-plain" onClick={close} disabled={busy !== null}>{t('common.close')}</button>
      }>
        <div className="sd-list">
          <div className="sd-row">
            <span>{t('folders.versionN', { version: template.version ?? 1 })}</span>
            <strong className="sd-sb fc-kind fc-in">{t('folders.current')}</strong>
          </div>
          {(versions ?? []).map((version) => (
            <div className="sd-row" key={version.version}>
              <span>{t('folders.versionN', { version: version.version })} · {t('folders.replacedOn', { date: when(version.replaced_at) })}</span>
              <span style={{ display: 'flex', gap: 14 }}>
                {version.source_file_path ? (
                  <button type="button" className="fc-link sd-sb" onClick={() => void view(version)}>{t('common.view')}</button>
                ) : null}
                <button type="button" className="fc-link sd-sb" onClick={() => setConfirm(version.version)} disabled={busy !== null}>
                  {busy === version.version ? t('common.loading') : t('folders.restore')}
                </button>
              </span>
            </div>
          ))}
        </div>
        {versions && !versions.length ? <div className="fc-empty">{t('folders.noOlderVersions')}</div> : null}
        {!versions && !error ? <div className="fc-empty"><span className="sd-spinner" /></div> : null}
        {error ? <div className="fc-note fc-bad" role="alert">{error}</div> : null}
      </FloatWindow>
      {confirm !== null ? (
        <ConfirmAlert
          title={t('folders.restoreQuestion', { version: confirm })}
          message={t('folders.restoreWarning')}
          cancelLabel={t('common.cancel')}
          confirmLabel={t('folders.restore')}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void restore(confirm)}
        />
      ) : null}
    </>
  );
}
