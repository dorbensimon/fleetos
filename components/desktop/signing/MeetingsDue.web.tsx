import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { formatIsoDay } from '../../../lib/checklistForms';
import { dueState, dueText, type DueState, type PlanRow } from '../../../lib/meetingPlan';

const COLLAPSED = 5;

const MARK: Record<DueState, { icon: 'alert' | 'time' | 'calendar'; color: string; soft: string }> = {
  late: { icon: 'alert', color: '#D92D20', soft: 'rgba(255,69,58,0.12)' },
  today: { icon: 'time', color: '#B25E00', soft: 'rgba(255,149,0,0.14)' },
  soon: { icon: 'time', color: '#B25E00', soft: 'rgba(255,149,0,0.14)' },
  later: { icon: 'calendar', color: '#0075B3', soft: 'rgba(0,136,204,0.1)' },
};

/** "באיחור של 5 ימים" / "היום" / "בעוד 3 ימים", as a coloured pill with a word. */
export function WhenPill({ nextDue }: { nextDue: string }) {
  const state = dueState(nextDue);
  return (
    <span className={`sd-when sd-when-${state} sd-sb`} title={formatIsoDay(nextDue)}>
      {state === 'late' ? <Ionicons name="alert-circle" size={15} color="currentColor" /> : null}
      {dueText(nextDue)}
    </span>
  );
}

/**
 * "מפגשים שצריך לקיים": drivers whose meeting on a repeating form is late or
 * due within two weeks, most urgent first. One button opens the meeting.
 */
export function MeetingsDue({ rows, onStart }: { rows: PlanRow[]; onStart: (row: PlanRow) => void }) {
  const [expanded, setExpanded] = useState(false);
  if (!rows.length) return null;
  const late = rows.filter((row) => dueState(row.nextDue) === 'late').length;
  const shown = expanded ? rows : rows.slice(0, COLLAPSED);

  return (
    <section className="sd-section" aria-labelledby="sd-due">
      <div className="sd-section-head">
        <h2 id="sd-due" className="sd-b">מפגשים שצריך לקיים</h2>
        <span>
          {late ? `${late === 1 ? 'אחד באיחור' : `${late} באיחור`} · ` : ''}
          {rows.length === 1 ? 'נהג אחד' : `${rows.length} נהגים`} בשבועיים הקרובים
        </span>
      </div>
      <div className="sd-due" role="list">
        {shown.map((row, index) => {
          const mark = MARK[dueState(row.nextDue)];
          return (
            <div key={`${row.templateId}:${row.driverId}`} className="sd-due-row" role="listitem" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
              <span className="sd-due-mark" style={{ background: mark.soft }}>
                <Ionicons name={mark.icon} size={22} color={mark.color} />
              </span>
              <span className="sd-due-copy">
                <span className="sd-due-name sd-sb">{row.driverName}</span>
                <span className="sd-due-form">
                  {row.title}
                  {row.lastMeeting ? ` · מפגש אחרון ${formatIsoDay(row.lastMeeting)}` : ''}
                </span>
              </span>
              {row.firstMeeting ? <span className="sd-first sd-sb">מפגש ראשון</span> : null}
              <WhenPill nextDue={row.nextDue} />
              <button type="button" className="sd-btn sd-btn-tinted" onClick={() => onStart(row)} aria-label={`מפגש עם ${row.driverName}`}>
                <Ionicons name="add-circle" size={19} color="currentColor" />
                למפגש
              </button>
            </div>
          );
        })}
        {rows.length > COLLAPSED ? (
          <button type="button" className="sd-due-more sd-sb" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            {expanded ? 'הצגת פחות' : `הצגת כל ${rows.length} הנהגים`}
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color="currentColor" />
          </button>
        ) : null}
      </div>
    </section>
  );
}
