import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { assignSigningTemplate, getSigningTemplateSourceUrl, type SigningTemplate } from '../../../lib/docuseal';
import { FunctionActionError } from '../../../lib/callFunction';
import { listFormVersions, restoreFormVersion, type FormVersion } from '../../../lib/companySigningTemplates';
import { ConfirmAlert, useSheetClose } from './Sheet.web';
import { useSigningStyles } from './folderCss';
import { t, getLocale } from '../../../lib/i18n';

/**
 * Small floating windows for a company form: the "what to send" question
 * after a new version, and the version history. Centered on a computer, a
 * bottom sheet on a phone (folderCss.ts).
 */

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** The floating window itself: backdrop, Escape, focus, no page scroll behind it. */
export function FloatWindow({
  closing,
  onRequestClose,
  label,
  head,
  foot,
  className,
  children,
}: {
  closing: boolean;
  onRequestClose: () => void;
  label: string;
  head: React.ReactNode;
  foot?: React.ReactNode;
  /** Extra class on the window, e.g. `fc-fixed` for a window that keeps one size. */
  className?: string;
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
      <div ref={ref} className={`sd-float${className ? ` ${className}` : ''}${closing ? ' sd-closing' : ''}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
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
  const [versions, setVersions] = useState<FormVersion[] | null>(null);
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

  const view = async (version: FormVersion) => {
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
      setError(err instanceof FunctionActionError && err.code === 'stale' ? t('folders.staleRefresh') : errorText(err, t('folders.restoreFailed')));
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
