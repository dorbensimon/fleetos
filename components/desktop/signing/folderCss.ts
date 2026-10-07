import { useLayoutEffect } from 'react';
import { SIGNING_CSS } from './signingCss';

/**
 * The floating window of the folder catalog ("הוסף תיקייה", an empty folder,
 * versions): the same look as every other window of the signing screens
 * (signingCss.ts tokens, buttons and rows), centered on a computer and a
 * bottom sheet on a phone.
 */
export const FOLDER_CSS = `
.sd-float {
  /* Pinned at the top, not centered: when the list arrives the window grows down instead of jumping. */
  position: fixed; z-index: 1001; top: max(24px, calc(50dvh - 360px)); left: 50%;
  width: min(560px, calc(100vw - 40px)); max-height: min(720px, calc(100dvh - 48px));
  transform: translateX(-50%); will-change: transform, opacity;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--sd-bg); border-radius: 24px; box-shadow: var(--sd-depth-3);
  animation: fc-float-in 420ms var(--sd-ease) both;
}
.sd-float.sd-closing { animation: fc-float-out 200ms ease-in both; }
.sd-float-head { flex: none; padding: 22px 24px 14px; text-align: center; }
.sd-float-head h2 { margin: 6px 0 4px; font-size: 22px; letter-spacing: -0.01em; }
.sd-float-head p { margin: 0; font-size: 15px; line-height: 1.5; color: var(--sd-ink-2); }
.sd-float-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 4px 20px 16px; overscroll-behavior: contain; }
.sd-float-foot {
  flex: none; display: flex; gap: 10px; justify-content: flex-end; align-items: center;
  padding: 14px 20px; border-top: 1px solid var(--sd-sep); background: rgba(244,246,248,0.92);
}
.sd-float-foot .sd-btn { min-height: 46px; }
.sd-float-grabber { display: none; }
@keyframes fc-float-in { from { opacity: 0; transform: translateX(-50%) translateY(12px) scale(0.97); } to { opacity: 1; transform: translateX(-50%); } }
@keyframes fc-float-out { from { opacity: 1; transform: translateX(-50%); } to { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.98); } }

/* ---------- the folder animation ---------- */
.fc-hero { position: relative; width: 96px; height: 78px; margin: 0 auto; }
.fc-hero svg { width: 96px; height: 78px; overflow: visible; animation: fc-drop 620ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.fc-back { fill: var(--sd-tint); opacity: 0.45; }
.fc-paper { fill: #fff; animation: fc-paper 520ms 260ms var(--sd-ease) both; }
.fc-front {
  fill: var(--sd-tint); transform-box: fill-box; transform-origin: 50% 100%;
  animation: fc-lid-open 460ms 300ms var(--sd-ease) both;
}
.fc-badge {
  position: absolute; inset-inline-end: -6px; bottom: -4px; width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--sd-green); color: #fff; box-shadow: 0 6px 16px rgba(52,199,89,0.45), 0 0 0 3px var(--sd-bg);
  animation: fc-pop 420ms 620ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.fc-hero.fc-done .fc-front { animation: fc-lid-close 320ms var(--sd-ease) both; }
.fc-hero.fc-done .fc-badge { animation: fc-pop 380ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes fc-drop { from { opacity: 0; transform: translateY(-28px) scale(0.82); } to { opacity: 1; transform: none; } }
@keyframes fc-paper { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(-6px); opacity: 1; } }
@keyframes fc-lid-open { from { transform: none; } to { transform: skewX(-9deg) scaleY(0.84); } }
@keyframes fc-lid-close { from { transform: skewX(-9deg) scaleY(0.84); } to { transform: none; } }
@keyframes fc-pop { from { opacity: 0; transform: scale(0.2) rotate(-90deg); } to { opacity: 1; transform: none; } }

/* ---------- folder choices ---------- */
.fc-list { display: flex; flex-direction: column; gap: 10px; }
.fc-item {
  display: flex; align-items: flex-start; gap: 14px; width: 100%; padding: 14px 16px; text-align: start;
  background: var(--sd-card); border-radius: 16px; box-shadow: var(--sd-depth-1), inset 0 0 0 1px rgba(0,0,0,0.04);
  transition: box-shadow 180ms ease, transform 160ms var(--sd-ease), background-color 160ms ease;
  animation: sd-rise 360ms var(--sd-ease) both; animation-delay: calc(min(var(--i, 0), 8) * 35ms);
}
.fc-item[aria-checked="true"] { box-shadow: inset 0 0 0 2px var(--sd-tint), 0 8px 20px -10px rgba(47,91,255,0.45); }
.fc-item:disabled { opacity: 0.55; }
.fc-item:active:not(:disabled) { transform: scale(0.985); }
@media (hover: hover) and (pointer: fine) {
  .fc-item:hover:not(:disabled):not([aria-checked="true"]) { box-shadow: var(--sd-depth-2), inset 0 0 0 1px rgba(0,0,0,0.05); }
}
/* "תיקיות בתיק הנהג": one size whatever the list, a circle beside each name */
.sd-float.fc-fixed { height: min(600px, calc(100dvh - 48px)); }
.fc-rows { background: var(--sd-card); border-radius: 16px; box-shadow: var(--sd-depth-1), inset 0 0 0 1px rgba(0,0,0,0.04); overflow: hidden; }
.fc-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 16px; text-align: start; background: none; border: 0; cursor: pointer; font: inherit; color: inherit; transition: background-color 160ms ease; }
.fc-row + .fc-row { border-top: 1px solid rgba(22,34,46,0.07); }
.fc-row:disabled { cursor: default; opacity: 0.6; }
.fc-row:focus-visible { outline: 2px solid var(--sd-tint); outline-offset: -2px; }
.fc-circle { flex: none; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  box-shadow: inset 0 0 0 2px rgba(92,103,115,0.4); transition: background-color 200ms var(--sd-ease), box-shadow 200ms var(--sd-ease); }
.fc-circle > * { opacity: 0; transform: scale(0.4); transition: opacity 160ms ease, transform 260ms var(--sd-ease); }
.fc-row[aria-checked="true"] .fc-circle { background: var(--sd-tint); box-shadow: none; }
.fc-row[aria-checked="true"] .fc-circle > * { opacity: 1; transform: none; }
@media (hover: hover) and (pointer: fine) {
  .fc-row:hover:not(:disabled) { background: rgba(47,91,255,0.04); }
  .fc-row:hover:not(:disabled) .fc-circle { box-shadow: inset 0 0 0 2px var(--sd-tint); }
  .fc-row[aria-checked="true"]:hover .fc-circle { box-shadow: none; }
}
.fc-icon { flex: none; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--sd-tint-soft); color: var(--sd-tint); }
.fc-text { flex: 1; min-width: 0; }
.fc-text strong { display: block; font-size: 16px; line-height: 1.35; }
.fc-text span { display: block; margin-top: 2px; font-size: 13.5px; line-height: 1.45; color: var(--sd-ink-2); }
.fc-kind { flex: none; align-self: center; padding: 3px 10px; border-radius: 999px; font-size: 12.5px; background: rgba(92,103,115,0.1); color: var(--sd-ink-2); }
.fc-kind.fc-in { background: rgba(52,199,89,0.14); color: #1E7A3C; }
.fc-note { display: flex; gap: 8px; align-items: flex-start; margin-top: 12px; padding: 12px 14px; border-radius: 14px; font-size: 14.5px; line-height: 1.5; background: var(--sd-tint-soft); color: var(--sd-ink); }
.fc-note.fc-warn { background: rgba(255,159,10,0.13); color: #7A4A00; }
.fc-note.fc-bad { background: rgba(255,69,58,0.1); color: #B42318; }
.fc-loading { min-height: 240px; display: flex; align-items: center; justify-content: center; }
.fc-empty { padding: 28px 12px; text-align: center; color: var(--sd-ink-2); font-size: 15px; line-height: 1.6; }
.fc-actions { display: flex; flex-direction: column; gap: 10px; }
.fc-actions .sd-btn { width: 100%; }
.fc-section { margin: 18px 4px 8px; font-size: 13px; color: var(--sd-ink-3); }
.fc-link { color: var(--sd-tint); font-size: 14.5px; }
.fc-danger { color: #C4271E !important; }

/* ---------- the owner's catalog ---------- */
.fc-manage { max-width: 860px; margin: 0 auto; padding: 22px 20px 40px; }
.fc-manage-intro { margin: 0 0 18px; font-size: 15.5px; line-height: 1.6; color: var(--sd-ink-2); }
.fc-folder {
  display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--sd-card);
  border-radius: 18px; box-shadow: var(--sd-depth-1); animation: sd-rise 320ms var(--sd-ease) both; animation-delay: calc(var(--i, 0) * 40ms);
}
.fc-folder + .fc-folder { margin-top: 10px; }
.fc-folder.fc-retired { opacity: 0.62; }
.fc-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.fc-tools { display: flex; align-items: center; gap: 2px; flex: none; }
.fc-tool { width: 36px; height: 36px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; color: var(--sd-ink-2); transition: background-color 140ms ease; }
.fc-tool:disabled { opacity: 0.3; }
@media (hover: hover) and (pointer: fine) { .fc-tool:hover:not(:disabled) { background: rgba(92,103,115,0.1); } }
.fc-field { display: block; margin-top: 16px; }
.fc-field > span { display: block; margin-bottom: 6px; font-size: 14px; color: var(--sd-ink-2); }
.fc-input {
  width: 100%; min-height: 48px; padding: 10px 14px; border: 0; border-radius: 14px; font: inherit; font-size: 16px; color: var(--sd-ink);
  background: var(--sd-card); box-shadow: var(--sd-depth-1), inset 0 0 0 1px rgba(0,0,0,0.06); outline: none;
}
.fc-input:focus { box-shadow: var(--sd-depth-1), inset 0 0 0 2px var(--sd-tint), 0 0 0 5px rgba(47,91,255,0.14); }
textarea.fc-input { min-height: 84px; resize: vertical; line-height: 1.5; }
.fc-kinds { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.fc-kinds .fc-item { animation: none; }

/* ---------- phone: a bottom sheet ---------- */
@media (max-width: 767px) {
  .sd-float {
    top: auto; bottom: 0; left: 0; right: 0; width: 100%; max-height: 90dvh;
    transform: none; border-radius: 24px 24px 0 0;
    animation: sd-sheet-in 460ms var(--sd-sheet) both;
  }
  .sd-float.fc-fixed { height: 80dvh; }
  .sd-float.sd-closing { animation: sd-sheet-out 260ms cubic-bezier(0.4, 0, 1, 1) both; }
  .sd-float-grabber { display: block; width: 40px; height: 5px; border-radius: 3px; background: rgba(22,34,46,0.18); margin: 8px auto 0; flex: none; }
  .sd-float-head { padding: 12px 18px 10px; }
  .sd-float-head h2 { font-size: 20px; }
  .sd-float-body { padding: 4px 16px 14px; }
  .sd-float-foot { padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); }
  .sd-float-foot .sd-btn { flex: 1; min-height: 48px; padding: 0 14px; }
  .fc-hero, .fc-hero svg { width: 76px; height: 62px; }
  .fc-badge { width: 28px; height: 28px; }
  .fc-item { display: grid; grid-template-columns: 40px minmax(0, 1fr); column-gap: 12px; row-gap: 8px; padding: 12px 14px; min-height: 64px; }
  .fc-item .fc-kind { grid-column: 2; justify-self: start; align-self: start; }
  .fc-manage { padding: 16px 14px 32px; }
  .fc-folder { flex-wrap: wrap; }
  .fc-tools { width: 100%; justify-content: flex-end; }
  .fc-kinds { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .sd-float, .sd-float.sd-closing, .fc-hero svg, .fc-paper, .fc-front, .fc-badge, .fc-item, .fc-folder,
  .fc-hero.fc-done .fc-front, .fc-hero.fc-done .fc-badge { animation: none !important; }
}
`;

/**
 * Puts the signing screens' styles on the page once. The folder windows also
 * open from screens that never loaded them (the driver file, the phone).
 */
export function useSigningStyles() {
  useLayoutEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('sd-folder-css')) return;
    const style = document.createElement('style');
    style.id = 'sd-folder-css';
    style.textContent = SIGNING_CSS + FOLDER_CSS;
    document.head.appendChild(style);
  }, []);
}
