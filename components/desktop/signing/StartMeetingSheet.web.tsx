import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { SigningTemplate } from '../../../lib/docuseal';
import { loadSendRecipients, type SendRecipient } from '../../../lib/signingSend';
import { formatDate } from '../../../lib/theme';
import type { PlanRow } from '../../../lib/meetingPlan';
import { Sheet, useSheetClose } from './Sheet.web';
import { WhenPill } from './MeetingsDue.web';

/**
 * "מפגש חדש" from "מסמכים חתומים": pick the one driver the meeting is with,
 * and the meeting opens. A "רשימת סעיפים" form is never sent as is; it is
 * filled together with the driver first.
 */
export function StartMeetingSheet({
  companyId,
  template,
  plan,
  onClosed,
  onPick,
}: {
  companyId: string;
  template: SigningTemplate;
  /** On a repeating form: each driver's next meeting. Soonest come first. */
  plan?: Map<string, PlanRow>;
  onClosed: () => void;
  onPick: (driverId: string) => void;
}) {
  const { closing, close } = useSheetClose(onClosed);
  const [drivers, setDrivers] = useState<SendRecipient[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadSendRecipients(companyId, template.id)
      .then((rows) => !cancelled && setDrivers(rows))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [companyId, template.id]);

  const visible = useMemo(() => {
    const q = query.trim();
    const rows = (drivers ?? []).filter((d) => !q || d.name.includes(q));
    if (!plan?.size) return rows;
    return [...rows].sort((a, b) => (plan.get(a.id)?.nextDue ?? '9999').localeCompare(plan.get(b.id)?.nextDue ?? '9999'));
  }, [drivers, query, plan]);

  return (
    <Sheet
      closing={closing}
      onRequestClose={close}
      label={`מפגש חדש: ${template.title}`}
      head={
        <>
          <div />
          <div className="sd-sheet-title">
            <strong className="sd-b">מפגש חדש</strong>
            <div className="sd-progress-label">{template.title}</div>
          </div>
          <button type="button" className="sd-btn sd-btn-link sd-b" onClick={close}>
            ביטול
          </button>
        </>
      }
    >
      <div className="sd-send">
        {loadError ? (
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
            <h2 className="sd-b">עם מי המפגש?</h2>
            <p className="sd-panel-sub" style={{ margin: '0 0 14px' }}>
              לוחצים על שם הנהג, והטופס נפתח למילוי.
            </p>
            {drivers.length > 6 ? (
              <label className="sd-send-search">
                <Ionicons name="search" size={18} color="#8B98A4" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש נהג לפי שם" aria-label="חיפוש נהג לפי שם" autoFocus />
              </label>
            ) : null}
            <div className="sd-drivers" role="list" aria-label="נהגים">
              {visible.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="listitem"
                  className="sd-drv"
                  style={{ width: '100%', textAlign: 'right' }}
                  onClick={() => {
                    onPick(d.id);
                    close();
                  }}
                >
                  <Ionicons name="person-circle-outline" size={26} color="#0075B3" />
                  <span className="sd-drv-name sd-sb">{d.name}</span>
                  {plan?.get(d.id) ? (
                    <>
                      {plan.get(d.id)!.firstMeeting ? <span className="sd-first sd-sb">מפגש ראשון</span> : null}
                      <WhenPill nextDue={plan.get(d.id)!.nextDue} />
                    </>
                  ) : d.state === 'signed' && d.lastSignedAt ? (
                    <span className="sd-drv-state sd-signed">מפגש אחרון: {formatDate(d.lastSignedAt)}</span>
                  ) : d.state === 'pending' ? (
                    <span className="sd-drv-state sd-pending">ממתין לחתימת הנהג</span>
                  ) : null}
                  <Ionicons name="chevron-back" size={18} color="#8B98A4" />
                </button>
              ))}
              {!visible.length ? <p className="sd-panel-sub">לא נמצא נהג בשם הזה.</p> : null}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
