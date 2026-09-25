import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { assignSigningTemplate, listSignatureRequests, type SigningTemplate } from '../../../lib/docuseal';
import { listDrivers } from '../../../lib/adminApi/drivers';
import { Sheet, useSheetClose } from './Sheet.web';

/**
 * Sends one document to any number of the company's drivers, straight from
 * "מסמכים חתומים". Each driver is sent through the same path as the driver's
 * own file (one request per driver, in-app only, no email), one after the
 * other, so a failure for one driver never stops the rest.
 */

type Driver = { id: string; name: string; state: 'none' | 'pending' | 'signed' };
type Outcome = { sent: number; failed: { name: string; reason: string }[] };

const STATE_LABEL: Record<Driver['state'], string> = { none: '', pending: 'ממתין לחתימה', signed: 'כבר חתם' };

export function SendToDriversSheet({ companyId, template, onClosed }: { companyId: string; template: SigningTemplate; onClosed: () => void }) {
  const { closing, close } = useSheetClose(onClosed);
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listDrivers(companyId), listSignatureRequests(companyId).catch(() => [])])
      .then(([rows, requests]) => {
        if (cancelled) return;
        const forThis = requests.filter((r) => r.template_id === template.id);
        const stateOf = (id: string): Driver['state'] =>
          forThis.some((r) => r.driver_id === id && r.status === 'completed')
            ? 'signed'
            : forThis.some((r) => r.driver_id === id && r.status === 'pending')
              ? 'pending'
              : 'none';
        setDrivers(
          rows
            .filter((d) => d.status === 'active')
            .map((d) => ({ id: d.id, name: d.full_name?.trim() || 'נהג ללא שם', state: stateOf(d.id) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'he')),
        );
      })
      .catch(() => !cancelled && setLoadError(true));
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
    const result: Outcome = { sent: 0, failed: [] };
    setProgress({ done: 0, total: targets.length });
    for (const [i, driver] of targets.entries()) {
      try {
        const response = await assignSigningTemplate(companyId, template.id, [driver.id]);
        if (response.success && response.created === 1) result.sent += 1;
        else result.failed.push({ name: driver.name, reason: response.message || 'השליחה לא אושרה' });
      } catch (error) {
        result.failed.push({ name: driver.name, reason: (error as Error)?.message || 'השליחה נכשלה' });
      }
      setProgress({ done: i + 1, total: targets.length });
    }
    setOutcome(result);
  };

  const count = picked.size;
  return (
    <Sheet
      closing={closing}
      onRequestClose={sending ? () => undefined : close}
      label={`שליחת ${template.title} לנהגים`}
      head={
        <>
          <div />
          <div className="sd-sheet-title">
            <strong className="sd-b">שליחה לנהגים</strong>
            <div className="sd-progress-label">{template.title}</div>
          </div>
          <button type="button" className="sd-btn sd-btn-link sd-b" onClick={close} disabled={sending}>
            {outcome ? 'סגירה' : 'ביטול'}
          </button>
        </>
      }
      foot={
        outcome ? (
          <>
            <span />
            <button type="button" className="sd-btn sd-btn-primary sd-btn-lg" onClick={close} style={{ minWidth: 150 }}>
              סיום
            </button>
          </>
        ) : (
          <>
            <span className="sd-foot-note">
              <Ionicons name="phone-portrait" size={20} color="#0075B3" />
              הנהגים יקבלו את המסמך באפליקציה ויחתמו בה
            </span>
            <button type="button" className="sd-btn sd-btn-primary sd-btn-lg" onClick={() => void send()} disabled={!count || sending} style={{ minWidth: 220 }}>
              <Ionicons name="paper-plane" size={20} color="#fff" />
              {sending ? `שולח… ${progress!.done} מתוך ${progress!.total}` : count ? `שליחה ל-${count === 1 ? 'נהג אחד' : `${count} נהגים`}` : 'בחרו נהגים'}
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
              {outcome.sent ? `המסמך נשלח ל-${outcome.sent === 1 ? 'נהג אחד' : `${outcome.sent} נהגים`}` : 'המסמך לא נשלח'}
            </h3>
            {outcome.sent ? <p>הנהגים יראו אותו באפליקציה, ואחרי החתימה הוא יישמר בתיק של כל נהג.</p> : null}
            {outcome.failed.length ? (
              <div className="sd-send-failed">
                <strong className="sd-sb">{outcome.failed.length === 1 ? 'לנהג אחד לא נשלח:' : `ל-${outcome.failed.length} נהגים לא נשלח:`}</strong>
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
            <Ionicons name="cloud-offline" size={46} color="#FF9F0A" />
            <h3 className="sd-b">לא הצלחנו לטעון את רשימת הנהגים</h3>
            <p>סגרו ונסו שוב בעוד רגע.</p>
          </div>
        ) : !drivers ? (
          <div className="sd-busy" role="status">
            <div className="sd-spinner" />
          </div>
        ) : drivers.length === 0 ? (
          <div className="sd-busy">
            <Ionicons name="people" size={46} color="#0075B3" />
            <h3 className="sd-b">אין עדיין נהגים פעילים בחברה</h3>
          </div>
        ) : (
          <>
            <h2 className="sd-b">למי לשלוח?</h2>
            <div className="sd-send-quick">
              <button type="button" className="sd-btn sd-btn-tinted" disabled={sending} onClick={() => setPicked(new Set(drivers.map((d) => d.id)))}>
                <Ionicons name="people" size={18} color="currentColor" />
                כל הנהגים ({drivers.length})
              </button>
              {notYet.length && notYet.length !== drivers.length ? (
                <button type="button" className="sd-btn sd-btn-plain" disabled={sending} onClick={() => setPicked(new Set(notYet.map((d) => d.id)))}>
                  רק מי שעוד לא קיבל ({notYet.length})
                </button>
              ) : null}
              {count ? (
                <button type="button" className="sd-btn sd-btn-link" disabled={sending} onClick={() => setPicked(new Set())}>
                  ניקוי הבחירה
                </button>
              ) : null}
            </div>
            <label className="sd-send-search">
              <Ionicons name="search" size={18} color="#8B98A4" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש נהג לפי שם" aria-label="חיפוש נהג לפי שם" />
            </label>
            <div className="sd-drivers" role="group" aria-label="נהגים">
              {visible.map((d) => (
                <label key={d.id} className={`sd-drv${picked.has(d.id) ? ' sd-on' : ''}`}>
                  <input type="checkbox" checked={picked.has(d.id)} disabled={sending} onChange={() => toggle(d.id)} />
                  <span className="sd-drv-name sd-sb">{d.name}</span>
                  {d.state !== 'none' ? (
                    <span className={`sd-drv-state sd-${d.state}`}>
                      {STATE_LABEL[d.state]}
                      {picked.has(d.id) ? (d.state === 'pending' ? ' · יוחלף במסמך חדש' : ' · יישלח שוב') : ''}
                    </span>
                  ) : null}
                </label>
              ))}
              {!visible.length ? <p className="sd-panel-sub">לא נמצא נהג בשם הזה.</p> : null}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
