import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { SigningTemplate } from '../../../lib/docuseal';
import { driversCount, loadSendRecipients, recipientNote, sendToRecipients, type SendOutcome, type SendRecipient } from '../../../lib/signingSend';
import { requestErrorDetails, type RequestErrorDetails } from '../../../lib/requestError';
import { Sheet, useSheetClose } from './Sheet.web';
import { t } from '../../../lib/i18n';

/**
 * Sends one document to any number of the company's drivers, straight from
 * "מסמכים חתומים" (see lib/signingSend.ts; the phone has the same flow).
 */

export function SendToDriversSheet({ companyId, template, onClosed }: { companyId: string; template: SigningTemplate; onClosed: () => void }) {
  const { closing, close } = useSheetClose(onClosed);
  const [drivers, setDrivers] = useState<SendRecipient[] | null>(null);
  const [loadError, setLoadError] = useState<RequestErrorDetails | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSendRecipients(companyId, template.id)
      .then((rows) => !cancelled && setDrivers(rows))
      .catch((error) => !cancelled && setLoadError(requestErrorDetails(error, t('driver.listLoadFailed'))));
    return () => {
      cancelled = true;
    };
  }, [companyId, template.id]);

  const visible = useMemo(() => {
    const q = query.trim();
    return (drivers ?? []).filter((d) => !q || d.name.includes(q));
  }, [drivers, query]);
  const notYet = (drivers ?? []).filter((d) => d.state === 'none');
  const sending = progress !== null && outcome === null;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    const targets = (drivers ?? []).filter((d) => picked.has(d.id));
    if (!targets.length) return;
    setProgress({ done: 0, total: targets.length });
    setOutcome(await sendToRecipients(companyId, template.id, targets, (done, total) => setProgress({ done, total })));
  };

  const count = picked.size;
  return (
    <Sheet
      closing={closing}
      onRequestClose={sending ? () => undefined : close}
      label={t('signing.sendTitleToDrivers', { title: template.title })}
      head={
        <>
          <div />
          <div className="sd-sheet-title">
            <strong className="sd-b">{t('signing.sendToDrivers')}</strong>
            <div className="sd-progress-label">{template.title}</div>
          </div>
          <button type="button" className="sd-btn sd-btn-link sd-b" onClick={close} disabled={sending}>
            {outcome ? t('common.close') : t('common.cancel')}
          </button>
        </>
      }
      foot={
        outcome ? (
          <>
            <span />
            <button type="button" className="sd-btn sd-btn-primary sd-btn-lg" onClick={close} style={{ minWidth: 150 }}>
              {t('common.done')}
            </button>
          </>
        ) : (
          <>
            <span className="sd-foot-note">
              <Ionicons name="phone-portrait" size={20} color="#2F5BFF" />
              {t('signing.driversWillSignInApp')}
            </span>
            <button type="button" className="sd-btn sd-btn-primary sd-btn-lg" onClick={() => void send()} disabled={!count || sending} style={{ minWidth: 220 }}>
              <Ionicons name="paper-plane" size={20} color="#fff" />
              {sending ? t('signing.sendingProgress', { done: progress!.done, total: progress!.total }) : count ? t('signing.sendToCount', { drivers: driversCount(count) }) : t('signing.chooseDrivers')}
            </button>
          </>
        )
      }
    >
      <div className="sd-send">
        {outcome ? (
          <div className="sd-send-result" role="status">
            <span className={`sd-send-result-icon${outcome.sent ? '' : ' sd-bad'}`}>
              <Ionicons name={outcome.sent ? 'checkmark' : 'alert'} size={34} color="#fff" />
            </span>
            <h3 className="sd-b">
              {outcome.sent ? t('signing.sentTo', { v1: driversCount(outcome.sent) }) : t('signing.notSent')}
            </h3>
            {outcome.sent ? <p>{t('signing.sentExplainer')}</p> : null}
            {outcome.failed.length ? (
              <div className="sd-send-failed">
                <strong className="sd-sb">{outcome.failed.length === 1 ? t('signing.notSentToOne') : t('signing.notSentToMany', { length: outcome.failed.length })}</strong>
                <ul>
                  {outcome.failed.map((f) => (
                    <li key={f.name}>
                      <span className="sd-sb">{f.name}</span> – {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : loadError ? (
          <div className="sd-busy">
            <Ionicons name={loadError.icon} size={46} color="#FF9F0A" />
            <h3 className="sd-b">{loadError.message}</h3>
            {loadError.hint ? <p>{loadError.hint}</p> : null}
          </div>
        ) : !drivers ? (
          <div className="sd-busy" role="status">
            <div className="sd-spinner" />
          </div>
        ) : drivers.length === 0 ? (
          <div className="sd-busy">
            <Ionicons name="people" size={46} color="#2F5BFF" />
            <h3 className="sd-b">{t('driver.noActiveDrivers')}</h3>
          </div>
        ) : (
          <>
            <h2 className="sd-b">{t('signing.sendToWhom')}</h2>
            <div className="sd-send-quick">
              <button type="button" className="sd-btn sd-btn-tinted" disabled={sending} onClick={() => setPicked(new Set(drivers.map((d) => d.id)))}>
                <Ionicons name="people" size={18} color="currentColor" />
                {t('signing.allDriversOpen')}{drivers.length})
              </button>
              {notYet.length && notYet.length !== drivers.length ? (
                <button type="button" className="sd-btn sd-btn-plain" disabled={sending} onClick={() => setPicked(new Set(notYet.map((d) => d.id)))}>
                  {t('signing.onlyNotReceivedOpen')}{notYet.length})
                </button>
              ) : null}
              {count ? (
                <button type="button" className="sd-btn sd-btn-link" disabled={sending} onClick={() => setPicked(new Set())}>
                  {t('common.clearSelection')}
                </button>
              ) : null}
            </div>
            <label className="sd-send-search">
              <Ionicons name="search" size={18} color="#8B98A4" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('driver.searchByName')} aria-label={t('driver.searchByName')} />
            </label>
            <div className="sd-drivers" role="group" aria-label={t('common.drivers')}>
              {visible.map((d) => (
                <label key={d.id} className={`sd-drv${picked.has(d.id) ? ' sd-on' : ''}`}>
                  <input type="checkbox" checked={picked.has(d.id)} disabled={sending} onChange={() => toggle(d.id)} />
                  <span className="sd-drv-name sd-sb">{d.name}</span>
                  {d.state !== 'none' ? (
                    <span className={`sd-drv-state sd-${d.state}`}>{recipientNote(d, picked.has(d.id))}</span>
                  ) : null}
                </label>
              ))}
              {!visible.length ? <p className="sd-panel-sub">{t('driver.notFoundByName')}</p> : null}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
