/**
 * Stylesheet for the desktop "מסמכים חתומים" screens (web only). These screens
 * are DOM-heavy (a rich-text editor, PDF canvases, drag and drop), so they use
 * plain CSS classes, all prefixed `sd-`, instead of React Native styles.
 *
 * Visual language: iOS. Grouped surfaces, continuous large radii, a single
 * tint, soft layered depth, sheets that rise from the bottom. Text sizes stay
 * large (16px body, 48px targets) so the flow is easy for every office worker.
 */
export const SIGNING_CSS = `
.sd-root {
  /* The app's desktop palette (components/desktop/desktopTheme.ts). */
  --sd-tint: #0088CC;
  --sd-tint-deep: #0079B5;
  --sd-tint-soft: rgba(0,136,204,0.10);
  --sd-ink: #16222E;
  --sd-ink-2: #5C6773;
  --sd-ink-3: #8B98A4;
  --sd-sep: #E1E6EA;
  --sd-bg: #F4F6F8;
  --sd-card: #FFFFFF;
  --sd-green: #34C759;
  --sd-red: #FF453A;
  --sd-ease: cubic-bezier(0.23, 1, 0.32, 1);
  --sd-sheet: cubic-bezier(0.32, 0.72, 0, 1);
  --sd-depth-1: 0 1px 1px rgba(0,0,0,0.03), 0 2px 6px rgba(0,0,0,0.04);
  --sd-depth-2: 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(16,34,50,0.07), 0 24px 48px -12px rgba(16,34,50,0.10);
  --sd-depth-3: 0 2px 4px rgba(0,0,0,0.04), 0 16px 40px rgba(16,34,50,0.12), 0 40px 80px -20px rgba(16,34,50,0.22);
  font-family: 'Heebo_400Regular', system-ui, sans-serif;
  color: var(--sd-ink);
  direction: rtl;
  -webkit-font-smoothing: antialiased;
}
.sd-root *, .sd-root *::before, .sd-root *::after { box-sizing: border-box; }
:where(.sd-root) button { font: inherit; color: inherit; border: 0; background: none; padding: 0; cursor: pointer; }
:where(.sd-root) button:disabled { cursor: default; }
.sd-root :focus-visible { outline: 3px solid rgba(0,136,204,0.55); outline-offset: 2px; }
.sd-b { font-family: 'Heebo_700Bold', system-ui, sans-serif; font-weight: normal; }
.sd-sb { font-family: 'Heebo_600SemiBold', system-ui, sans-serif; font-weight: normal; }
.sd-xb { font-family: 'Heebo_800ExtraBold', system-ui, sans-serif; font-weight: normal; }
.sd-num { font-variant-numeric: tabular-nums; }

/* ---------- buttons ---------- */
.sd-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 48px; padding: 0 22px; border-radius: 14px;
  font-family: 'Heebo_600SemiBold', system-ui, sans-serif; font-size: 16px;
  transition: transform 160ms var(--sd-ease), background-color 180ms ease, box-shadow 220ms ease, opacity 180ms ease;
  white-space: nowrap;
}
.sd-btn:active:not(:disabled) { transform: scale(0.97); }
.sd-btn-primary {
  background: linear-gradient(180deg, #1A9BDB 0%, var(--sd-tint) 55%, #0079B5 100%);
  color: #fff !important;
  box-shadow: 0 1px 0 rgba(255,255,255,0.35) inset, 0 6px 16px -4px rgba(0,136,204,0.55), 0 1px 2px rgba(0,0,0,0.08);
}
@media (hover: hover) and (pointer: fine) {
  .sd-btn-primary:hover:not(:disabled) { box-shadow: 0 1px 0 rgba(255,255,255,0.35) inset, 0 10px 24px -6px rgba(0,136,204,0.6), 0 1px 2px rgba(0,0,0,0.08); transform: translateY(-1px); }
  .sd-btn-plain:hover:not(:disabled) { background: rgba(92,103,115,0.12); }
  .sd-btn-tinted:hover:not(:disabled) { background: rgba(0,136,204,0.16); }
}
.sd-btn-primary:disabled { background: #B8D9EA; box-shadow: none; }
.sd-btn-plain { background: rgba(92,103,115,0.08); color: var(--sd-ink); }
.sd-btn-tinted { background: var(--sd-tint-soft); color: var(--sd-tint-deep) !important; }
.sd-btn-link { min-height: 44px; padding: 0 10px; color: var(--sd-tint-deep); font-size: 17px; }
.sd-btn-lg { min-height: 56px; padding: 0 28px; font-size: 17px; border-radius: 16px; }

/* ---------- page ---------- */
.sd-scroll { flex: 1; min-height: 0; height: 100%; overflow-y: auto; overscroll-behavior: contain; }
.sd-inline-error { display: flex; align-items: center; gap: 8px; max-width: 880px; margin: 16px auto 0; padding: 12px 16px; border-radius: 14px; background: rgba(255,69,58,0.1); color: #C4281C; font-size: 15px; }
.sd-send { max-width: 720px; margin: 0 auto; padding: 28px 24px 40px; }
.sd-send h2 { font-size: 24px; margin: 0 0 14px; }
.sd-send-quick { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
.sd-send-search { display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 14px; border-radius: 14px; background: #fff; box-shadow: inset 0 0 0 1px #E1E6EA; margin-bottom: 12px; }
.sd-send-search:focus-within { box-shadow: inset 0 0 0 2px var(--sd-tint); }
.sd-send-search input { flex: 1; min-width: 0; border: 0; outline: none; background: none; font: inherit; font-size: 16px; color: var(--sd-ink); }
.sd-drivers { background: #fff; border-radius: 18px; box-shadow: var(--sd-depth-1); overflow: hidden; }
.sd-drv { display: flex; align-items: center; gap: 14px; min-height: 58px; padding: 10px 18px; cursor: pointer; border-bottom: 1px solid #EEF1F4; transition: background 150ms ease; }
.sd-drv:last-child { border-bottom: 0; }
.sd-drv.sd-on { background: rgba(0,136,204,0.06); }
@media (hover: hover) and (pointer: fine) { .sd-drv:hover { background: rgba(0,136,204,0.04); } }
.sd-drv input { -webkit-appearance: none; appearance: none; margin: 0; width: 24px; height: 24px; flex: none; cursor: pointer; border-radius: 7px; background: #fff; box-shadow: inset 0 0 0 2px #B8C2CC; transition: background-color 150ms ease, box-shadow 150ms ease; }
.sd-drv input:checked { background: var(--sd-tint) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6 12.5l4 4 8-9' fill='none' stroke='white' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 18px no-repeat; box-shadow: none; }
.sd-drv input:focus-visible { outline: 3px solid rgba(0,136,204,0.45); outline-offset: 2px; }
.sd-send-search input::placeholder { color: #8B98A4; opacity: 1; }
.sd-drv-name { flex: 1; min-width: 0; font-size: 16px; }
.sd-drv-state { flex: none; font-size: 13px; padding: 4px 10px; border-radius: 999px; }
.sd-drv-state.sd-pending { background: rgba(255,149,0,0.14); color: #9A5200; }
.sd-drv-state.sd-signed { background: rgba(52,199,89,0.14); color: #1E7A3C; }
.sd-send-result { text-align: center; padding-top: 24px; }
.sd-send-result h3 { font-size: 24px; margin: 16px 0 6px; }
.sd-send-result p { color: var(--sd-ink-2); margin: 0 0 16px; }
.sd-send-result-icon { display: inline-grid; place-items: center; width: 72px; height: 72px; border-radius: 50%; background: #34C759; }
.sd-send-result-icon.sd-bad { background: #FF9500; }
.sd-send-failed { text-align: right; background: rgba(255,149,0,0.1); border-radius: 16px; padding: 14px 18px; color: #6B3A00; }
.sd-send-failed ul { margin: 8px 0 0; padding-right: 20px; }
.sd-send-failed li { margin: 4px 0; }
.sd-page { max-width: 1240px; margin: 0 auto; padding: 28px 32px 80px; }

.sd-hero {
  position: relative; overflow: hidden; isolation: isolate;
  border-radius: 32px; padding: 44px 48px; min-height: 300px;
  background: #F7FAFC;
  box-shadow: var(--sd-depth-2), inset 0 0 0 1px rgba(255,255,255,0.8);
  display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 32px; align-items: center;
  animation: sd-rise 700ms var(--sd-ease) both;
}
.sd-aurora { position: absolute; inset: -30%; z-index: -1; filter: blur(60px) saturate(140%); opacity: 0.9; }
.sd-aurora span { position: absolute; border-radius: 50%; animation: sd-drift 22s ease-in-out infinite alternate; }
.sd-aurora span:nth-child(1) { width: 46%; height: 60%; top: 18%; right: 8%; background: radial-gradient(circle, rgba(53,184,240,0.45), transparent 65%); }
.sd-aurora span:nth-child(2) { width: 42%; height: 56%; top: 30%; left: 12%; background: radial-gradient(circle, rgba(0,136,204,0.38), transparent 65%); animation-duration: 28s; animation-delay: -6s; }
.sd-aurora span:nth-child(3) { width: 36%; height: 50%; bottom: 8%; left: 38%; background: radial-gradient(circle, rgba(52,199,89,0.16), transparent 65%); animation-duration: 32s; animation-delay: -12s; }
.sd-hero-grain { position: absolute; inset: 0; z-index: -1; opacity: 0.35; mix-blend-mode: soft-light;
  background-image: radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px); background-size: 3px 3px; }
.sd-hero h1 { margin: 0; font-size: 44px; line-height: 1.08; letter-spacing: -0.02em; }
.sd-hero p { margin: 14px 0 28px; font-size: 18px; line-height: 1.6; color: var(--sd-ink-2); max-width: 520px; }
.sd-hero-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }

/* hero art: a small stack of papers being signed */
.sd-art { position: relative; height: 250px; perspective: 1200px; }
.sd-paper {
  position: absolute; top: 12px; left: 50%; width: 190px; height: 238px; margin-left: -95px;
  background: #fff; border-radius: 14px; box-shadow: var(--sd-depth-2);
  padding: 22px 20px; transform-origin: 50% 100%;
}
.sd-paper-back-2 { transform: translateX(-58px) rotate(-11deg) scale(0.9); opacity: 0.55; animation: sd-fan-2 900ms var(--sd-ease) 150ms both; }
.sd-paper-back-1 { transform: translateX(-30px) rotate(-5deg) scale(0.95); opacity: 0.8; animation: sd-fan-1 900ms var(--sd-ease) 100ms both; }
.sd-paper-front { transform: rotate(3deg); box-shadow: var(--sd-depth-3); animation: sd-front 900ms var(--sd-ease) both; }
.sd-paper i { display: block; height: 7px; border-radius: 4px; background: #E9EDF3; margin-bottom: 10px; }
.sd-paper i.sd-t { width: 60%; height: 10px; background: #D5DEEA; margin-bottom: 16px; }
.sd-paper i.sd-s { width: 72%; }
.sd-paper-sign { position: absolute; left: 18px; right: 18px; bottom: 20px; height: 54px; border-radius: 10px; background: rgba(0,136,204,0.07); border: 1.5px dashed rgba(0,136,204,0.45); }
.sd-paper-sign svg { position: absolute; inset: 6px 10px; width: calc(100% - 20px); height: calc(100% - 12px); }
.sd-paper-sign path { fill: none; stroke: #0B4A6E; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round;
  stroke-dasharray: 320; stroke-dashoffset: 320; animation: sd-sign 1600ms cubic-bezier(0.65, 0, 0.35, 1) 900ms forwards; }
.sd-paper-check {
  position: absolute; top: -14px; left: -14px; width: 44px; height: 44px; border-radius: 50%;
  background: var(--sd-green); color: #fff; display: grid; place-items: center;
  box-shadow: 0 8px 18px -6px rgba(52,199,89,0.7), 0 0 0 4px #fff;
  transform: scale(0.6); opacity: 0; animation: sd-pop 520ms var(--sd-ease) 2400ms forwards;
}

.sd-steps { margin-top: 18px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.sd-step {
  background: var(--sd-card); border-radius: 22px; padding: 20px 22px; box-shadow: var(--sd-depth-1);
  display: flex; gap: 14px; align-items: flex-start; animation: sd-rise 600ms var(--sd-ease) both;
}
.sd-step-num { flex: none; width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; font-size: 17px; color: var(--sd-tint-deep); background: var(--sd-tint-soft); }
.sd-step h3 { margin: 4px 0 4px; font-size: 17px; }
.sd-step p { margin: 0; font-size: 15px; line-height: 1.55; color: var(--sd-ink-2); }

.sd-section { margin-top: 40px; }
.sd-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 6px 14px; }
.sd-section-head h2 { margin: 0; font-size: 24px; letter-spacing: -0.01em; }
.sd-section-head span { font-size: 15px; color: var(--sd-ink-3); }

.sd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(214px, 1fr)); gap: 20px; }
.sd-card {
  position: relative; text-align: right; display: flex; flex-direction: column;
  background: var(--sd-card); border-radius: 24px; padding: 10px 10px 16px;
  box-shadow: var(--sd-depth-1), inset 0 0 0 1px rgba(0,0,0,0.035);
  transition: transform 420ms var(--sd-ease), box-shadow 420ms var(--sd-ease);
  animation: sd-rise 620ms var(--sd-ease) both;
  transform-style: preserve-3d;
}
@media (hover: hover) and (pointer: fine) {
  .sd-card:hover { box-shadow: var(--sd-depth-3); }
  .sd-card:hover .sd-thumb-shine { opacity: 1; transform: translateX(-120%) skewX(-18deg); }
  .sd-card:hover .sd-thumb canvas { transform: scale(1.035); }
}
.sd-card:active { transform: scale(0.98) !important; }
.sd-thumb { position: relative; overflow: hidden; border-radius: 16px; aspect-ratio: 4 / 3.6; background: linear-gradient(180deg, #F4F6FA, #ECEFF5); }
.sd-thumb canvas { position: absolute; top: 12px; left: 50%; width: 78%; margin-left: -39%; border-radius: 6px; box-shadow: 0 6px 20px rgba(16,34,50,0.14); background: #fff; transition: transform 600ms var(--sd-ease); transform-origin: 50% 0; }
.sd-thumb-shine { position: absolute; inset: 0; opacity: 0; transform: translateX(120%) skewX(-18deg); transition: transform 900ms var(--sd-ease), opacity 200ms ease;
  background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.65) 50%, transparent 70%); pointer-events: none; }
.sd-thumb-placeholder { position: absolute; inset: 0; display: grid; place-items: center; color: #B8C2CF; }
.sd-card h4 { margin: 14px 8px 4px; font-size: 17px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sd-card-meta { margin: 0 8px; font-size: 14px; color: var(--sd-ink-3); display: flex; align-items: center; gap: 6px; }
.sd-badge { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 9px; border-radius: 12px; font-size: 13px; background: rgba(52,199,89,0.13); color: #1E9E4C; }
.sd-card-new {
  border: 2px dashed rgba(0,136,204,0.35); background: rgba(0,136,204,0.035); box-shadow: none;
  align-items: center; justify-content: center; gap: 12px; min-height: 280px; color: var(--sd-tint-deep);
}
.sd-card-new-icon { width: 64px; height: 64px; border-radius: 22px; display: grid; place-items: center; background: #fff; box-shadow: var(--sd-depth-2); transition: transform 420ms var(--sd-ease); }
@media (hover: hover) and (pointer: fine) {
  .sd-card-new:hover { background: rgba(0,136,204,0.07); box-shadow: none; }
  .sd-card-new:hover .sd-card-new-icon { transform: rotate(90deg) scale(1.06); }
}
.sd-card-new span { font-size: 18px; }

.sd-empty {
  border-radius: 26px; padding: 44px 24px; text-align: center; background: var(--sd-card); box-shadow: var(--sd-depth-1);
}
.sd-empty h3 { margin: 16px 0 6px; font-size: 21px; }
.sd-empty p { margin: 0 auto 22px; max-width: 420px; font-size: 16px; line-height: 1.6; color: var(--sd-ink-2); }
.sd-skeleton { border-radius: 24px; height: 300px; background: linear-gradient(90deg, #ECEEF2 0%, #F6F7F9 40%, #ECEEF2 80%); background-size: 200% 100%; animation: sd-shimmer 1.4s linear infinite; }

/* ---------- sheet ---------- */
.sd-backdrop { position: fixed; inset: 0; z-index: 1000; background: rgba(16,34,50,0.32); backdrop-filter: blur(6px) saturate(120%); -webkit-backdrop-filter: blur(6px) saturate(120%); animation: sd-fade 320ms ease both; }
.sd-backdrop.sd-closing { animation: sd-fade-out 260ms ease both; }
.sd-sheet {
  position: fixed; z-index: 1001; top: 12px; bottom: 0; left: 50%; width: min(1320px, calc(100vw - 40px)); margin-left: calc(min(1320px, calc(100vw - 40px)) / -2);
  background: var(--sd-bg); border-radius: 30px 30px 0 0; overflow: hidden;
  box-shadow: 0 -10px 60px rgba(0,0,0,0.25);
  display: flex; flex-direction: column;
  animation: sd-sheet-in 560ms var(--sd-sheet) both;
}
.sd-sheet.sd-closing { animation: sd-sheet-out 320ms cubic-bezier(0.4, 0, 1, 1) both; }
.sd-grabber { width: 40px; height: 5px; border-radius: 3px; background: rgba(22,34,46,0.18); margin: 6px auto 0; flex: none; }
.sd-sheet-head {
  flex: none; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; padding: 2px 18px 8px;
  border-bottom: 1px solid var(--sd-sep); background: rgba(244,246,248,0.9); backdrop-filter: blur(20px);
}
.sd-sheet-head > :last-child { justify-self: end; }
.sd-sheet-title { text-align: center; }
.sd-sheet-title strong { display: block; font-size: 17px; }
.sd-progress { display: flex; gap: 6px; justify-content: center; margin-top: 4px; }
.sd-progress i { width: 28px; height: 5px; border-radius: 3px; background: rgba(22,34,46,0.16); transition: background-color 300ms ease, width 400ms var(--sd-ease); }
.sd-progress i.sd-on { background: var(--sd-tint); width: 40px; }
.sd-progress-label { font-size: 13px; color: var(--sd-ink-3); margin-top: 2px; }
.sd-sheet-body { flex: 1; min-height: 0; overflow: auto; position: relative; }
.sd-sheet-foot {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 24px 12px;
  border-top: 1px solid var(--sd-sep); background: rgba(255,255,255,0.92); backdrop-filter: blur(20px);
}
.sd-foot-note { font-size: 15px; color: var(--sd-ink-2); display: flex; align-items: center; gap: 8px; }
.sd-foot-note.sd-warn { color: #B96A00; }
.sd-stage { animation: sd-stage-in 480ms var(--sd-ease) both; }

/* step 1 */
.sd-start { max-width: 820px; margin: 0 auto; padding: 40px 24px 60px; }
.sd-q { margin: 0 0 6px; font-size: 28px; letter-spacing: -0.015em; }
.sd-q-sub { margin: 0 0 18px; font-size: 16px; color: var(--sd-ink-2); }
.sd-name {
  width: 100%; height: 64px; border-radius: 18px; border: 0; padding: 0 22px; font-size: 22px; font-family: 'Heebo_600SemiBold', system-ui, sans-serif;
  background: #fff; color: var(--sd-ink); box-shadow: var(--sd-depth-1), inset 0 0 0 1px rgba(0,0,0,0.06);
  transition: box-shadow 200ms ease; outline: none; direction: rtl;
}
.sd-name:focus { box-shadow: var(--sd-depth-1), inset 0 0 0 2px var(--sd-tint), 0 0 0 5px rgba(0,136,204,0.14); }
.sd-name::placeholder { color: rgba(22,34,46,0.35); }
.sd-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.sd-chip { height: 38px; padding: 0 16px; border-radius: 19px; background: #fff; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08); font-size: 15px; color: var(--sd-ink-2); transition: background-color 160ms ease, transform 160ms var(--sd-ease); }
.sd-chip:active { transform: scale(0.96); }
@media (hover: hover) and (pointer: fine) { .sd-chip:hover { background: var(--sd-tint-soft); color: var(--sd-tint-deep); } }
.sd-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 40px; }
.sd-choice {
  position: relative; text-align: right; border-radius: 26px; padding: 26px; background: #fff; min-height: 230px;
  box-shadow: var(--sd-depth-1), inset 0 0 0 1px rgba(0,0,0,0.05);
  transition: transform 380ms var(--sd-ease), box-shadow 380ms var(--sd-ease);
  display: flex; flex-direction: column; gap: 10px;
}
@media (hover: hover) and (pointer: fine) { .sd-choice:hover { transform: translateY(-3px); box-shadow: var(--sd-depth-2), inset 0 0 0 1px rgba(0,0,0,0.05); } }
.sd-choice.sd-selected { box-shadow: var(--sd-depth-2), inset 0 0 0 2.5px var(--sd-tint); }
.sd-choice-icon { width: 60px; height: 60px; border-radius: 18px; display: grid; place-items: center; color: #fff; margin-bottom: 8px; }
.sd-choice h3 { margin: 0; font-size: 22px; }
.sd-choice p { margin: 0; font-size: 16px; line-height: 1.55; color: var(--sd-ink-2); }
.sd-choice-check { position: absolute; top: 20px; left: 20px; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; box-shadow: inset 0 0 0 2px rgba(22,34,46,0.2); color: #fff; transition: background-color 200ms ease, box-shadow 200ms ease, transform 300ms var(--sd-ease); }
.sd-choice.sd-selected .sd-choice-check { background: var(--sd-tint); box-shadow: none; transform: scale(1.05); }

/* workspace (editor / placer) */
.sd-work { display: grid; grid-template-columns: 316px minmax(0, 1fr); min-height: 100%; }
.sd-panel { position: sticky; top: 0; align-self: start; max-height: calc(100vh - 150px); overflow: auto; padding: 18px 16px 24px; border-left: 1px solid var(--sd-sep); background: var(--sd-card); min-height: calc(100vh - 150px); }
.sd-panel h3 { margin: 0 4px 4px; font-size: 18px; }
.sd-panel-sub { margin: 0 4px 14px; font-size: 14.5px; line-height: 1.5; color: var(--sd-ink-2); }
.sd-group-label { margin: 16px 4px 8px; font-size: 13px; color: var(--sd-ink-3); letter-spacing: 0.01em; }
.sd-palette { background: #fff; border-radius: 18px; box-shadow: var(--sd-depth-1); overflow: hidden; }
.sd-tool {
  width: 100%; display: flex; align-items: center; gap: 12px; min-height: 58px; padding: 8px 14px; text-align: right;
  transition: background-color 150ms ease; position: relative; user-select: none;
}
.sd-tool + .sd-tool::before { content: ''; position: absolute; top: 0; right: 62px; left: 0; height: 1px; background: var(--sd-sep); }
@media (hover: hover) and (pointer: fine) { .sd-tool:hover { background: rgba(92,103,115,0.07); } }
.sd-tool:active { background: rgba(92,103,115,0.14); }
.sd-tool[draggable="true"] { cursor: grab; }
.sd-tool-icon { flex: none; width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; color: #fff; }
.sd-tool-text { flex: 1; min-width: 0; }
.sd-tool-text strong { display: block; font-size: 16px; }
.sd-tool-text small { display: block; font-size: 13px; color: var(--sd-ink-3); }
.sd-tool-plus { color: var(--sd-ink-3); }
.sd-area-btn {
  width: 100%; display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 10px 12px; text-align: right; border-radius: 14px;
  background: var(--sd-tint-soft) !important; box-shadow: inset 0 0 0 1px rgba(0,136,204,0.18); transition: background-color 150ms ease, transform 160ms var(--sd-ease);
}
.sd-area-btn:active { transform: scale(0.98); }
@media (hover: hover) and (pointer: fine) { .sd-area-btn:hover { background: rgba(0,136,204,0.16) !important; } }
.sd-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sd-tile {
  display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 6px 8px; border-radius: 12px; text-align: right; font-size: 14px; line-height: 1.2; white-space: nowrap;
  background: var(--sd-bg) !important; box-shadow: inset 0 0 0 1px var(--sd-sep); cursor: grab; user-select: none;
  transition: box-shadow 150ms ease, background-color 150ms ease, transform 160ms var(--sd-ease);
}
.sd-tile:active { transform: scale(0.97); cursor: grabbing; }
@media (hover: hover) and (pointer: fine) { .sd-tile:hover { background: #fff !important; box-shadow: inset 0 0 0 1.5px var(--sd-tint), 0 4px 12px -4px rgba(16,34,50,0.18); } }
.sd-tile-icon { flex: none; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; }
.sd-canvas { padding: 14px 28px 60px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.sd-tip {
  width: 100%; max-width: 840px; display: flex; gap: 12px; align-items: center; padding: 14px 18px; border-radius: 18px;
  background: rgba(0,136,204,0.08); color: #006A9E; font-size: 15.5px; line-height: 1.5;
}

/* editor */
.sd-toolbar {
  position: sticky; top: 8px; z-index: 5; display: flex; flex-wrap: wrap; gap: 2px; align-items: center; padding: 4px;
  border-radius: 14px; background: rgba(255,255,255,0.82); backdrop-filter: blur(22px) saturate(180%); -webkit-backdrop-filter: blur(22px) saturate(180%);
  box-shadow: var(--sd-depth-2), inset 0 0 0 1px rgba(0,0,0,0.05);
}
.sd-tb { height: 40px; min-width: 40px; padding: 0 11px; border-radius: 10px; font-size: 15px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: var(--sd-ink); transition: background-color 140ms ease; }
@media (hover: hover) and (pointer: fine) { .sd-tb:hover { background: rgba(92,103,115,0.1); } }
.sd-tb.sd-on { background: var(--sd-tint-soft); color: var(--sd-tint-deep); }
.sd-tb-sep { width: 1px; height: 24px; background: var(--sd-sep); margin: 0 4px; }
.sd-paper-page {
  /* An A4 sheet at 96dpi: the server renders the very same geometry (EDITOR_PAGE). */
  position: relative; flex: none; width: 794px; min-height: 1123px; background: #fff; border-radius: 4px; padding: 64px 72px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 12px 40px rgba(16,34,50,0.10); transition: box-shadow 200ms ease;
}
.sd-paper-page.sd-over { box-shadow: 0 0 0 3px var(--sd-tint), 0 12px 40px rgba(16,34,50,0.14); }
.sd-lh { position: relative; height: 72px; margin-bottom: 32px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding-bottom: 16px; border-bottom: 1px solid #E1E6EA; direction: rtl; user-select: none; }
.sd-lh::after { content: ''; position: absolute; right: 0; bottom: -2px; width: 56px; height: 3px; border-radius: 2px; background: #0088CC; }
.sd-lh-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
.sd-lh-logo { flex: none; width: 52px; height: 52px; border-radius: 13px; overflow: hidden; display: grid; place-items: center; background: #F4F6F8; box-shadow: inset 0 0 0 1px rgba(22,34,46,0.06); }
.sd-lh-logo img { width: 100%; height: 100%; object-fit: contain; }
.sd-lh-mono { background: linear-gradient(160deg, #35B8F0, #0088CC); color: #fff; font-family: 'Heebo_700Bold', system-ui, sans-serif; font-size: 24px; box-shadow: none; }
.sd-lh-name { font-family: 'Heebo_700Bold', system-ui, sans-serif; font-size: 22px; line-height: 1.2; color: #16222E; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sd-lh-date { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-align: left; }
.sd-lh-label { font-size: 12px; line-height: 1.2; color: #8B98A4; }
.sd-lh-value { font-family: 'Heebo_600SemiBold', system-ui, sans-serif; font-size: 16px; line-height: 1.3; color: #16222E; font-variant-numeric: tabular-nums; direction: ltr; }
.sd-page-break { position: absolute; left: 0; right: 0; height: 0; border-top: 2px dashed rgba(22,34,46,0.14); pointer-events: none; }
.sd-page-break span { position: absolute; top: -11px; left: 12px; padding: 0 8px; font-size: 12px; line-height: 20px; color: var(--sd-ink-3); background: #fff; border-radius: 6px; }
.sd-doc, .sd-doc:focus-visible { outline: none; min-height: 600px; font-size: 16px; line-height: 1.8; color: #111; direction: rtl; text-align: right; caret-color: var(--sd-tint); }
.sd-doc h1 { font-family: 'Heebo_700Bold', system-ui, sans-serif; font-weight: normal; font-size: 28px; line-height: 1.3; margin: 0 0 16px; }
.sd-doc h2 { font-family: 'Heebo_700Bold', system-ui, sans-serif; font-weight: normal; font-size: 20px; line-height: 1.4; margin: 20px 0 8px; }
.sd-doc p { margin: 0 0 8px; }
.sd-doc ul, .sd-doc ol { margin: 0 0 8px; padding-right: 26px; padding-left: 0; }
.sd-doc b, .sd-doc strong { font-family: 'Heebo_700Bold', system-ui, sans-serif; font-weight: normal; }
.sd-doc:empty::before, .sd-doc > p:only-child:has(br:only-child)::before { content: attr(data-placeholder); color: rgba(22,34,46,0.35); pointer-events: none; }

/* placer */
.sd-dropzone {
  width: 100%; max-width: 760px; margin: 40px auto; border-radius: 30px; padding: 56px 32px; text-align: center; background: #fff;
  box-shadow: var(--sd-depth-1), inset 0 0 0 2px rgba(0,136,204,0.2);
  transition: box-shadow 220ms ease, transform 300ms var(--sd-ease), background-color 220ms ease;
}
.sd-dropzone.sd-over { transform: scale(1.015); background: #F2F9FD; box-shadow: var(--sd-depth-2), inset 0 0 0 3px var(--sd-tint); }
.sd-dropzone h3 { margin: 18px 0 8px; font-size: 24px; }
.sd-dropzone p { margin: 0 0 24px; font-size: 16px; color: var(--sd-ink-2); }
.sd-drop-icon { width: 88px; height: 88px; margin: 0 auto; border-radius: 28px; display: grid; place-items: center; color: #fff;
  background: linear-gradient(160deg, #35B8F0, var(--sd-tint)); box-shadow: 0 14px 30px -10px rgba(0,136,204,0.6); animation: sd-float 3.2s ease-in-out infinite; }
.sd-busy { text-align: center; padding: 90px 20px; }
.sd-busy h3 { margin: 22px 0 6px; font-size: 22px; }
.sd-busy p { margin: 0; color: var(--sd-ink-2); font-size: 16px; }
.sd-spinner { width: 54px; height: 54px; margin: 0 auto; border-radius: 50%; border: 5px solid rgba(0,136,204,0.15); border-top-color: var(--sd-tint); animation: sd-spin 900ms linear infinite; }
.sd-page-wrap { position: relative; width: 100%; max-width: 840px; }
.sd-page-label { font-size: 13px; color: var(--sd-ink-3); margin: 0 4px 8px; }
.sd-pdf-page { position: relative; background: #fff; border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 12px 40px rgba(16,34,50,0.10); overflow: hidden; transition: box-shadow 200ms ease; }
.sd-pdf-page.sd-over { box-shadow: 0 0 0 3px var(--sd-tint), 0 12px 40px rgba(16,34,50,0.14); }
.sd-pdf-page canvas { display: block; width: 100%; height: auto; }
.sd-field {
  position: absolute; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 6px;
  background: color-mix(in srgb, var(--c) 14%, rgba(255,255,255,0.7)); color: color-mix(in srgb, var(--c) 82%, black);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 60%, transparent);
  font-family: 'Heebo_600SemiBold', system-ui, sans-serif; font-size: 13px; cursor: move; user-select: none; touch-action: none;
  animation: sd-drop 460ms var(--sd-ease) both; overflow: visible;
}
.sd-field span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.sd-field-sign { border-radius: 10px; font-size: 14px; background: color-mix(in srgb, var(--c) 9%, rgba(255,255,255,0.85)); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, transparent), inset 0 -2px 0 color-mix(in srgb, var(--c) 35%, transparent); }
.sd-field:focus-visible { outline: none; }
.sd-field-sign { background: color-mix(in srgb, var(--c) 6%, rgba(255,255,255,0.9)); box-shadow: none; outline: 2px dashed color-mix(in srgb, var(--c) 65%, transparent); outline-offset: -2px; }
.sd-field-sign::before { content: ''; position: absolute; inset-inline: 10px; bottom: 4px; height: 1.5px; background: color-mix(in srgb, var(--c) 45%, transparent); }
.sd-sign-hint { display: flex; align-items: center; gap: 5px; font-size: 12px; opacity: 0.85; min-width: 0; }
.sd-field-sign.sd-sel { outline-style: solid; }
.sd-field.sd-covers { background: rgba(255,149,0,0.18); color: #9A5200; box-shadow: inset 0 0 0 2px #FF9500; outline-color: #FF9500; }
.sd-field.sd-covers.sd-sel { box-shadow: inset 0 0 0 2px #FF9500, 0 0 0 4px rgba(255,149,0,0.25), 0 8px 18px -6px rgba(0,0,0,0.25); }
.sd-field-size { position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%); white-space: nowrap; background: #16222E; color: #fff; font-size: 12px; line-height: 1; padding: 5px 8px; border-radius: 7px; pointer-events: none; font-family: 'Heebo_500Medium', system-ui, sans-serif; }
.sd-insp-size { display: flex; align-items: center; gap: 6px; margin-top: 12px; font-size: 14px; color: var(--sd-ink-2); }
.sd-insp-warn { display: flex; gap: 8px; align-items: flex-start; margin-top: 12px; padding: 10px 12px; border-radius: 12px; background: rgba(255,149,0,0.12); color: #9A5200; font-size: 14px; line-height: 1.45; }
.sd-field.sd-sel { box-shadow: inset 0 0 0 2px var(--c), 0 0 0 4px color-mix(in srgb, var(--c) 22%, transparent), 0 8px 18px -6px rgba(0,0,0,0.25); z-index: 2; }
.sd-field-del { position: absolute; top: -13px; left: -13px; width: 26px; height: 26px; border-radius: 50%; background: #fff; color: var(--sd-red); display: grid; place-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.2); cursor: pointer; }
.sd-field-grip { position: absolute; bottom: -7px; right: -7px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px var(--c), 0 2px 6px rgba(0,0,0,0.2); cursor: nwse-resize; }
.sd-inspector { margin-top: 18px; background: #fff; border-radius: 18px; box-shadow: var(--sd-depth-1); padding: 16px; animation: sd-rise 360ms var(--sd-ease) both; }
.sd-inspector label { display: block; font-size: 14px; color: var(--sd-ink-2); margin-bottom: 6px; }
.sd-input { width: 100%; height: 48px; border-radius: 12px; border: 0; padding: 0 14px; font-size: 16px; background: var(--sd-bg); color: var(--sd-ink); outline: none; direction: rtl; font-family: inherit; }
.sd-input:focus { box-shadow: inset 0 0 0 2px var(--sd-tint); background: #fff; }
.sd-danger { color: var(--sd-red) !important; }

/* review + success */
.sd-review { max-width: 1040px; margin: 0 auto; padding: 36px 28px 60px; display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 34px; align-items: start; }
.sd-review-preview { background: linear-gradient(180deg, #EDF0F2, #E1E6EA); border-radius: 28px; padding: 30px; display: grid; place-items: center; min-height: 520px; }
.sd-review-preview canvas { width: 100%; max-width: 440px; border-radius: 6px; background: #fff; box-shadow: var(--sd-depth-3); transform: rotate(-1.2deg); animation: sd-rise 600ms var(--sd-ease) both; }
.sd-mini-page { flex: none; width: 437px; height: 618px; overflow: hidden; border-radius: 6px; background: #fff; box-shadow: var(--sd-depth-3); transform: rotate(-1.2deg); animation: sd-rise 600ms var(--sd-ease) both; }
.sd-mini-inner { transform: scale(0.55); transform-origin: top right; box-shadow: none; pointer-events: none; }
.sd-mini-inner .sd-field { animation: none; }
.sd-list { background: #fff; border-radius: 20px; box-shadow: var(--sd-depth-1); overflow: hidden; }
.sd-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; padding: 10px 18px; position: relative; font-size: 16px; }
.sd-row + .sd-row::before { content: ''; position: absolute; top: 0; right: 18px; left: 0; height: 1px; background: var(--sd-sep); }
.sd-row span:first-child { color: var(--sd-ink-2); }
.sd-review h2 { margin: 0 0 6px; font-size: 28px; letter-spacing: -0.015em; }
.sd-review-sub { margin: 0 0 20px; font-size: 16px; color: var(--sd-ink-2); line-height: 1.55; }
.sd-dots { display: inline-flex; gap: 4px; margin-left: 2px; }
.sd-dots i { width: 9px; height: 9px; border-radius: 50%; }
.sd-error { margin-top: 14px; padding: 14px 16px; border-radius: 16px; background: rgba(255,59,48,0.09); color: #C4271E; font-size: 15px; line-height: 1.5; display: flex; gap: 10px; align-items: flex-start; }
.sd-success { max-width: 620px; margin: 0 auto; padding: 90px 24px; text-align: center; }
.sd-success-ring { position: relative; width: 120px; height: 120px; margin: 0 auto; }
.sd-success-ring svg { width: 120px; height: 120px; }
.sd-success-ring circle { fill: none; stroke: var(--sd-green); stroke-width: 6; stroke-dasharray: 340; stroke-dashoffset: 340; animation: sd-draw 700ms var(--sd-ease) forwards; transform-origin: center; transform: rotate(-90deg); }
.sd-success-ring path { fill: none; stroke: var(--sd-green); stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 80; stroke-dashoffset: 80; animation: sd-draw 420ms var(--sd-ease) 520ms forwards; }
.sd-success-ring::after { content: ''; position: absolute; inset: 0; border-radius: 50%; box-shadow: 0 0 0 0 rgba(52,199,89,0.35); animation: sd-pulse 1200ms ease-out 800ms; }
.sd-success h2 { margin: 28px 0 10px; font-size: 32px; letter-spacing: -0.02em; }
.sd-success p { margin: 0 auto 30px; font-size: 17px; line-height: 1.65; color: var(--sd-ink-2); max-width: 500px; }
.sd-success-path { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 14px; background: #fff; box-shadow: var(--sd-depth-1); font-size: 16px; margin-bottom: 30px; }

/* preview */
.sd-preview-pages { display: flex; flex-direction: column; align-items: center; gap: 22px; padding: 30px 24px 60px; }
.sd-preview-pages canvas { width: 100%; max-width: 820px; background: #fff; border-radius: 4px; box-shadow: 0 12px 40px rgba(16,34,50,0.12); animation: sd-rise 520ms var(--sd-ease) both; }

/* alert */
.sd-alert {
  position: fixed; z-index: 1101; top: 50%; left: 50%; width: 340px; transform: translate(-50%, -50%);
  border-radius: 22px; overflow: hidden; text-align: center;
  background: rgba(255,255,255,0.94); backdrop-filter: blur(30px) saturate(180%); -webkit-backdrop-filter: blur(30px) saturate(180%);
  box-shadow: 0 30px 80px rgba(0,0,0,0.3); animation: sd-alert-in 320ms var(--sd-ease) both;
}
.sd-alert strong { display: block; padding: 22px 22px 6px; font-size: 19px; }
.sd-alert p { margin: 0; padding: 0 22px 20px; font-size: 16px; line-height: 1.5; color: var(--sd-ink-2); }
.sd-alert-actions { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--sd-sep); }
.sd-alert-actions button { height: 56px; font-size: 17px; color: var(--sd-tint-deep); transition: background-color 140ms ease; }
.sd-alert-actions button + button { border-right: 1px solid var(--sd-sep); }
.sd-alert-actions button:hover { background: rgba(92,103,115,0.1); }
@keyframes sd-alert-in { from { opacity: 0; transform: translate(-50%, -50%) scale(1.12); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }

/* ---------- motion ---------- */
@keyframes sd-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes sd-stage-in { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
@keyframes sd-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes sd-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes sd-sheet-in { from { transform: translateY(100%); } to { transform: none; } }
@keyframes sd-sheet-out { from { transform: none; } to { transform: translateY(100%); } }
@keyframes sd-drift { 0% { transform: translate(0, 0) scale(1); } 50% { transform: translate(6%, -5%) scale(1.08); } 100% { transform: translate(-5%, 6%) scale(0.96); } }
@keyframes sd-fan-2 { from { transform: rotate(0) scale(0.9); opacity: 0; } }
@keyframes sd-fan-1 { from { transform: rotate(0) scale(0.95); opacity: 0; } }
@keyframes sd-front { from { transform: translateY(24px) rotate(0); opacity: 0; } }
@keyframes sd-sign { to { stroke-dashoffset: 0; } }
@keyframes sd-pop { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes sd-drop { 0% { transform: scale(0.85); opacity: 0; } 60% { transform: scale(1.04); opacity: 1; } 100% { transform: scale(1); } }
@keyframes sd-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes sd-spin { to { transform: rotate(360deg); } }
@keyframes sd-shimmer { to { background-position: -200% 0; } }
@keyframes sd-draw { to { stroke-dashoffset: 0; } }
@keyframes sd-pulse { to { box-shadow: 0 0 0 28px rgba(52,199,89,0); } }

@media (prefers-reduced-motion: reduce) {
  .sd-root *, .sd-root *::before, .sd-root *::after { animation-duration: 1ms !important; animation-delay: 0ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
  .sd-paper-sign path, .sd-success-ring circle, .sd-success-ring path { stroke-dashoffset: 0; }
  .sd-paper-check { opacity: 1; transform: none; }
}
@media (max-width: 1180px) {
  .sd-hero { grid-template-columns: 1fr; }
  .sd-art { display: none; }
  .sd-review { grid-template-columns: 1fr; }
  .sd-work { grid-template-columns: 270px minmax(0, 1fr); }
}
`;
