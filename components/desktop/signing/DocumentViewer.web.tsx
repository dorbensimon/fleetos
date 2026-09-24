import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ionicons } from '@expo/vector-icons';
import { downloadSignedRequest } from '../../../lib/docuseal';
import { downloadRemoteFileOnWeb } from '../../../lib/webDownload';
import { loadPdf, renderPage, type LoadedPdf } from './pdf.web';

/**
 * Desktop document viewer (web only). The phone viewer squeezes a PDF into a
 * narrow column; on a computer the document gets the whole screen: the pages
 * float as real paper on a dark stage, under a glass toolbar with zoom,
 * print and download. Files pdf.js can't read fall back to the browser's own
 * viewer inside the same stage.
 */

const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2];
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const day = (date: string) => new Date(date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });

function baseWidth() {
  return Math.max(320, Math.min(860, window.innerWidth - 200));
}

function Page({ pdf, number, width, index }: { pdf: LoadedPdf; number: number; width: number; index: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const [drawn, setDrawn] = useState(false);
  const size = pdf.pages[number - 1];
  const height = Math.round(width * (size.height / size.width));

  // Each render goes to a fresh canvas that replaces the old one when done,
  // so zooming never draws twice into one canvas and never flashes blank.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const mine = ++token.current;
    const canvas = document.createElement('canvas');
    renderPage(pdf.doc, number, canvas, width)
      .then(() => {
        if (mine !== token.current) return;
        box.querySelector('canvas')?.remove();
        box.appendChild(canvas);
        setDrawn(true);
      })
      .catch(() => undefined);
  }, [pdf, number, width]);

  return (
    <div
      ref={boxRef}
      className={`dv-page${drawn ? ' dv-drawn' : ''}`}
      data-page={number}
      style={{ width, height, animationDelay: `${120 + Math.min(index, 6) * 70}ms` }}
      aria-label={`עמוד ${number}`}
    />
  );
}

export function DocumentViewer({
  src,
  title,
  requestId,
  signedAt,
  onClose,
}: {
  src: string;
  title: string;
  /** A signed request: download goes through the signing API. */
  requestId?: string;
  signedAt?: string;
  onClose: () => void;
}) {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [base, setBase] = useState(baseWidth);
  const [current, setCurrent] = useState(1);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState<'' | 'download' | 'print'>('');
  const [error, setError] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const signed = !!requestId;

  useEffect(() => {
    let cancelled = false;
    loadPdf(src)
      .then((loaded) => !cancelled && setPdf(loaded))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const onResize = () => setBase(baseWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, reduceMotion() ? 0 : 240);
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    document.addEventListener('keydown', onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [close]);

  // The page counter follows whichever page fills the middle of the stage.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !pdf || pdf.pages.length < 2) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) setCurrent(Number((visible[0].target as HTMLElement).dataset.page));
      },
      { root: stage, rootMargin: '-45% 0px -45% 0px' },
    );
    stage.querySelectorAll('.dv-page').forEach((page) => io.observe(page));
    return () => io.disconnect();
  }, [pdf]);

  const zoomIndex = ZOOMS.indexOf(zoom);
  const width = Math.round(base * zoom);

  const download = async () => {
    setBusy('download');
    setError('');
    try {
      if (requestId) await downloadSignedRequest({ id: requestId, template_title: title, template: null });
      else await downloadRemoteFileOnWeb(src, `${title}.pdf`);
    } catch (err) {
      setError((err as Error)?.message || 'ההורדה נכשלה');
    } finally {
      setBusy('');
    }
  };

  // Prints the real file (not the screen), from a hidden same-origin frame.
  const print = async () => {
    setBusy('print');
    setError('');
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0';
      frame.src = url;
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 60_000);
      };
      document.body.appendChild(frame);
    } catch {
      setError('ההדפסה נכשלה. אפשר להוריד את המסמך ולהדפיס אותו.');
    } finally {
      setBusy('');
    }
  };

  const pages = pdf?.pages.length ?? 0;
  return createPortal(
    <div className={`dv-root${closing ? ' dv-closing' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <style>{VIEWER_CSS}</style>
      <div className="dv-backdrop" aria-hidden />

      <header className="dv-bar">
        <div className="dv-bar-start">
          <button ref={closeRef} type="button" className="dv-round" onClick={close} aria-label="סגירה">
            <Ionicons name="close" size={22} color="#fff" />
          </button>
          <div className="dv-title">
            <strong>{title}</strong>
            {signed ? (
              <span className="dv-seal">
                <span className="dv-seal-dot">
                  <Ionicons name="checkmark" size={12} color="#fff" />
                </span>
                {signedAt ? `נחתם ב-${day(signedAt)}` : 'מסמך חתום'}
              </span>
            ) : pages > 1 ? (
              <span className="dv-sub">{pages} עמודים</span>
            ) : null}
          </div>
        </div>

        <div className="dv-bar-end">
          {pdf ? (
            <div className="dv-zoom" role="group" aria-label="גודל תצוגה">
              <button type="button" onClick={() => setZoom(ZOOMS[zoomIndex - 1])} disabled={zoomIndex <= 0} aria-label="הקטנה">
                <Ionicons name="remove" size={20} color="currentColor" />
              </button>
              <button type="button" className="dv-zoom-value" onClick={() => setZoom(1)} aria-label="גודל רגיל">
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" onClick={() => setZoom(ZOOMS[zoomIndex + 1])} disabled={zoomIndex >= ZOOMS.length - 1} aria-label="הגדלה">
                <Ionicons name="add" size={20} color="currentColor" />
              </button>
            </div>
          ) : null}
          <button type="button" className="dv-ghost" onClick={() => void print()} disabled={!!busy}>
            <Ionicons name="print-outline" size={19} color="currentColor" />
            {busy === 'print' ? 'מכין…' : 'הדפסה'}
          </button>
          <button type="button" className="dv-primary" onClick={() => void download()} disabled={!!busy} aria-label="הורדת המסמך" title="הורדה">
            <Ionicons name={busy === 'download' ? 'hourglass-outline' : 'download-outline'} size={21} color="#fff" />
          </button>
        </div>
      </header>

      <div ref={stageRef} className="dv-stage">
        {pdf ? (
          <div className="dv-pages">
            {pdf.pages.map((_, i) => (
              <Page key={i} pdf={pdf} number={i + 1} width={width} index={i} />
            ))}
          </div>
        ) : failed ? (
          <div className="dv-frame" style={{ width: base }}>
            <iframe title={title} src={src} />
          </div>
        ) : (
          <div className="dv-pages">
            <div className="dv-page dv-skeleton" style={{ width: base, height: Math.round(base * 1.414) }} role="status" aria-label="טוען את המסמך" />
          </div>
        )}
      </div>

      {pages > 1 ? (
        <div className="dv-counter" aria-live="polite">
          עמוד <b>{current}</b> מתוך {pages}
        </div>
      ) : null}
      {error ? (
        <div className="dv-toast" role="alert">
          <Ionicons name="alert-circle" size={18} color="#FFB4AE" />
          {error}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

const VIEWER_CSS = `
.dv-root {
  --dv-ease: cubic-bezier(0.23, 1, 0.32, 1);
  --dv-drawer: cubic-bezier(0.32, 0.72, 0, 1);
  --dv-tint: #0088CC;
  position: fixed; inset: 0; z-index: 10000;
  direction: rtl; color: #fff;
  font-family: 'Heebo_400Regular', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  animation: dv-fade 280ms ease both;
}
.dv-root *, .dv-root *::before, .dv-root *::after { box-sizing: border-box; }
:where(.dv-root) button { font: inherit; color: inherit; border: 0; background: none; padding: 0; cursor: pointer; }
:where(.dv-root) button:disabled { cursor: default; opacity: 0.4; }
.dv-root :focus-visible { outline: 3px solid rgba(90,190,245,0.8); outline-offset: 2px; }
.dv-root.dv-closing { animation: dv-fade-out 240ms ease both; }

/* The stage: deep ink, a soft pool of the app's blue behind the paper, fine grain. */
.dv-backdrop {
  position: absolute; inset: 0;
  background:
    radial-gradient(1100px 620px at 50% 12%, rgba(0,136,204,0.30), transparent 70%),
    radial-gradient(700px 500px at 88% 100%, rgba(0,136,204,0.12), transparent 70%),
    linear-gradient(180deg, #13202C 0%, #0C161F 100%);
}
.dv-backdrop::after {
  content: ''; position: absolute; inset: 0; opacity: 0.07; mix-blend-mode: overlay; pointer-events: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}

/* ---------- glass toolbar ---------- */
.dv-bar {
  position: absolute; top: 16px; left: 24px; right: 24px; z-index: 2;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  min-height: 68px; padding: 10px 12px 10px 14px; border-radius: 22px;
  background: rgba(22,34,46,0.58);
  backdrop-filter: blur(24px) saturate(160%); -webkit-backdrop-filter: blur(24px) saturate(160%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.06), 0 18px 40px -18px rgba(0,0,0,0.6);
  animation: dv-drop 520ms var(--dv-drawer) both;
}
.dv-bar-start, .dv-bar-end { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dv-round {
  flex: none; width: 46px; height: 46px; border-radius: 50%;
  display: grid; place-items: center; background: rgba(255,255,255,0.10);
  transition: background-color 160ms ease, transform 140ms var(--dv-ease);
}
.dv-round:active { transform: scale(0.94); }
.dv-title { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dv-title strong {
  font-family: 'Heebo_700Bold', system-ui, sans-serif; font-weight: normal;
  font-size: 19px; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dv-sub { font-size: 14px; color: rgba(255,255,255,0.62); }
.dv-seal {
  display: inline-flex; align-items: center; gap: 7px; align-self: flex-start;
  font-family: 'Heebo_600SemiBold', system-ui, sans-serif; font-size: 14px; color: #7FE3A0;
  font-variant-numeric: tabular-nums;
}
.dv-seal-dot {
  position: relative; width: 18px; height: 18px; border-radius: 50%;
  display: grid; place-items: center; background: #30B158;
  animation: dv-stamp 520ms var(--dv-ease) 520ms both;
}
.dv-seal-dot::after {
  content: ''; position: absolute; inset: -2px; border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(52,199,89,0.7);
  animation: dv-ring 900ms var(--dv-ease) 640ms both;
}

.dv-zoom {
  display: flex; align-items: center; height: 46px; padding: 0 4px; border-radius: 14px;
  background: rgba(255,255,255,0.08);
}
.dv-zoom button { width: 40px; height: 38px; border-radius: 10px; display: grid; place-items: center; transition: background-color 160ms ease; }
.dv-zoom .dv-zoom-value { width: 64px; font-family: 'Heebo_600SemiBold', system-ui, sans-serif; font-size: 15px; font-variant-numeric: tabular-nums; }
.dv-ghost, .dv-primary {
  display: inline-flex; align-items: center; gap: 8px; height: 46px; padding: 0 18px; border-radius: 14px;
  font-family: 'Heebo_600SemiBold', system-ui, sans-serif; font-size: 16px; white-space: nowrap;
  transition: background-color 160ms ease, box-shadow 200ms ease, transform 140ms var(--dv-ease);
}
.dv-ghost { background: rgba(255,255,255,0.08); }
.dv-primary {
  width: 46px; padding: 0; justify-content: center;
  background: linear-gradient(180deg, #1FA3E3 0%, var(--dv-tint) 60%, #0079B5 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), 0 8px 22px -8px rgba(0,136,204,0.9);
}
.dv-ghost:active:not(:disabled), .dv-primary:active:not(:disabled) { transform: scale(0.97); }
@media (hover: hover) and (pointer: fine) {
  .dv-round:hover, .dv-ghost:hover:not(:disabled), .dv-zoom button:hover:not(:disabled) { background: rgba(255,255,255,0.16); }
  .dv-primary:hover:not(:disabled) { box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), 0 12px 28px -8px rgba(0,136,204,1); }
}

/* ---------- paper ---------- */
.dv-stage { position: absolute; inset: 0; overflow: auto; overscroll-behavior: contain; padding: 116px 40px 110px; }
.dv-pages { display: flex; flex-direction: column; align-items: center; gap: 32px; min-width: min-content; }
.dv-page {
  position: relative; flex: none; background: #fff; border-radius: 6px; overflow: hidden;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.04),
    0 2px 4px rgba(0,0,0,0.25),
    0 24px 48px -12px rgba(0,0,0,0.55),
    0 60px 120px -40px rgba(0,60,100,0.55);
  animation: dv-paper 620ms var(--dv-drawer) both;
}
.dv-page canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.dv-page:not(.dv-drawn)::before, .dv-skeleton::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(100deg, transparent 30%, rgba(0,136,204,0.08) 50%, transparent 70%) #F4F6F8;
  background-size: 220% 100%;
  animation: dv-shimmer 1.4s linear infinite;
}
.dv-frame {
  margin: 0 auto; height: calc(100vh - 226px); border-radius: 10px; overflow: hidden; background: #fff;
  box-shadow: 0 24px 48px -12px rgba(0,0,0,0.55);
  animation: dv-paper 620ms var(--dv-drawer) both;
}
.dv-frame iframe { width: 100%; height: 100%; border: 0; display: block; }

/* ---------- floating chips ---------- */
.dv-counter, .dv-toast {
  position: absolute; bottom: 26px; left: 50%; z-index: 2; transform: translateX(-50%);
  display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 999px;
  background: rgba(22,34,46,0.72); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), 0 12px 30px -12px rgba(0,0,0,0.6);
  font-size: 15px; font-variant-numeric: tabular-nums; white-space: nowrap;
  animation: dv-chip 420ms var(--dv-ease) 400ms both;
}
.dv-counter b { font-family: 'Heebo_700Bold', system-ui, sans-serif; font-weight: normal; }
.dv-toast { bottom: 80px; color: #FFD9D6; animation-delay: 0ms; }

@keyframes dv-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes dv-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes dv-drop { from { opacity: 0; transform: translateY(-14px); } to { opacity: 1; transform: none; } }
@keyframes dv-paper { from { opacity: 0; transform: translateY(36px) scale(0.965); } to { opacity: 1; transform: none; } }
@keyframes dv-chip { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes dv-stamp { from { opacity: 0; transform: scale(1.5); } to { opacity: 1; transform: scale(1); } }
@keyframes dv-ring { from { opacity: 1; transform: scale(0.8); } to { opacity: 0; transform: scale(2.2); } }
@keyframes dv-shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }

@media (prefers-reduced-motion: reduce) {
  .dv-bar, .dv-page, .dv-frame, .dv-seal-dot, .dv-seal-dot::after { animation: dv-fade 200ms ease both; }
  .dv-seal-dot::after { display: none; }
  .dv-counter, .dv-toast { animation: none; }
  .dv-page:not(.dv-drawn)::before, .dv-skeleton::before { animation: none; }
}
@media (prefers-reduced-transparency: reduce) {
  .dv-bar, .dv-counter, .dv-toast { background: #16222E; backdrop-filter: none; -webkit-backdrop-filter: none; }
}
`;
