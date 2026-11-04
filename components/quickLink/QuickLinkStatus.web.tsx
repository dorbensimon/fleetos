// מסך מצב לנהג שפתח קישור מוואטסאפ: הצלחה, קישור שנוצל, שגיאה, אין חיבור...
import React from 'react';
import { useSigningStyles } from '../desktop/signing/folderCss';
import { QUICK_LINK_STATUS, type QuickLinkStatusKind } from './statusKinds';

// The ring and symbol draw like a saved signing document (sd-success-ring), in the status's color.
const CSS = `
.ql-ring::after { box-shadow: 0 0 0 0 var(--ql-glow); animation: ql-pulse 1200ms ease-out 800ms; }
.ql-ring path { stroke-dasharray: 100; stroke-dashoffset: 100; }
.ql-btn { min-height: 48px; padding: 0 28px; border-radius: 14px; background: var(--sd-tint); color: #fff; font-size: 16px; }
.ql-btn:active { transform: scale(0.97); }
@keyframes ql-pulse { to { box-shadow: 0 0 0 28px transparent; } }
`;

export function QuickLinkStatus({ kind, title, text, action }: {
  kind: QuickLinkStatusKind;
  title: string;
  text: string;
  /** A way out when the case can pass (no internet, a server error). */
  action?: { label: string; onPress: () => void };
}) {
  useSigningStyles();
  const { color, glyph } = QUICK_LINK_STATUS[kind];
  return (
    <div className="sd-root" dir="rtl" style={{ minHeight: '100%', display: 'flex', alignItems: 'center', background: '#F4F6F9' }}>
      <style>{CSS}</style>
      {/* key: a new status draws again */}
      <div key={kind} className="sd-success sd-stage" role={kind === 'done' || kind === 'used' ? 'status' : 'alert'}>
        <div className="sd-success-ring ql-ring" aria-hidden="true" style={{ '--sd-green': color, '--ql-glow': `${color}59` } as React.CSSProperties}>
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" />
            <path d={glyph} pathLength={100} />
          </svg>
        </div>
        <h2 className="sd-xb">{title}</h2>
        <p>{text}</p>
        {action && <button type="button" className="ql-btn sd-sb" onClick={action.onPress}>{action.label}</button>}
      </div>
    </div>
  );
}
