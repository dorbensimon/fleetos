// העיצוב של מסך סידור העבודה בדפדפן (מחשב ואייפון)
/**
 * Scoped under `.ws` so nothing leaks into the rest of the app. The phone
 * look (`.ws.phone`) follows the iPhone Calendar app; the desktop look sits
 * inside DesktopShell beside the app's sidebar. Fonts are the families the
 * app already loads (Assistant for text, Heebo for headings).
 */
export const SCHEDULE_CSS = `
.ws{
  --bg:#F4F6F8;--card:#FFFFFF;--line:#E1E6EA;--line-input:#D8DEE3;--text:#16222E;--muted:#5C6773;--sunk:#F7F9FA;
  --blue:#2F5BFF;--blue-hover:#2449E0;--blue-bg:#EAF0FF;
  --amber-bg:rgba(255,159,10,.16);--amber-line:#F6DDB9;--amber-tx:#955200;--amber-soft:#FFF6EA;
  --green-bg:rgba(52,199,89,.14);--green-tx:#18793a;
  --gray-bg:rgba(11,12,16,.06);--red-bg:rgba(255,59,48,.14);--red-tx:#c20013;--red-soft:#FFF1F0;
  --on-night:#FFFFFF;--on-night-muted:rgba(255,255,255,0.72);
  --shadow:0 1px 2px rgba(22,34,46,0.04),0 2px 10px rgba(22,34,46,0.035);
  --ease:cubic-bezier(.23,1,.32,1);--r:12px;
  --f-r:'Assistant_400Regular',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;
  --f-m:'Assistant_600SemiBold',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;
  --f-b:'Assistant_700Bold',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;
  --h-sb:'Heebo_600SemiBold',system-ui,sans-serif;--h-b:'Heebo_700Bold',system-ui,sans-serif;--h-xb:'Heebo_800ExtraBold',system-ui,sans-serif;
  height:100%;overflow:auto;background:var(--bg);color:var(--text);font-family:var(--f-r);font-size:16px;line-height:1.4;
  direction:var(--app-dir,rtl);-webkit-tap-highlight-color:transparent;accent-color:var(--blue)
}
.ws *,.ws *::before,.ws *::after{box-sizing:border-box}
.ws b,.ws strong{font-family:var(--f-b);font-weight:normal}
.ws .ic{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ws button{font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:8px;padding:8px 12px;
  display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:transform .16s var(--ease),background-color .15s ease,border-color .15s ease}
.ws button:active:not(:disabled){transform:scale(.97)}
.ws button:disabled{cursor:not-allowed;opacity:.6}
.ws button.primary{background:var(--blue);border-color:var(--blue);color:#fff;font-family:var(--f-b)}
.ws button.danger{color:var(--red-tx);border-color:#F09595}
.ws button.link{border:0;background:none;padding:0 2px;color:var(--blue);font-family:var(--f-b);text-decoration:underline;text-underline-offset:3px;display:inline}
@media (hover:hover){.ws button:hover:not(:disabled){border-color:#C5CCD6}.ws button.primary:hover:not(:disabled){background:var(--blue-hover)}}
.ws input,.ws select{font:inherit;font-size:16px;border:1px solid var(--line-input);border-radius:8px;padding:9px 10px;background:#fff;color:var(--text);min-height:42px}
.ws input::placeholder{color:#8B98A4;opacity:1}
.ws input[type=radio],.ws input[type=checkbox]{-webkit-appearance:auto;appearance:auto;min-height:0;width:18px;height:18px;padding:0;margin:0;border:0;flex:none}
.ws input:focus-visible,.ws select:focus-visible,.ws button:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.ws .tnum,.ws .t,.ws input[type=time]{font-variant-numeric:tabular-nums}

/* ---------- כותרת ---------- */
.ws .hero{margin:16px 20px 0;border-radius:16px;padding:12px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--on-night);position:relative;overflow:hidden;isolation:isolate;
  background:linear-gradient(180deg,#12306E 0%,#0B1C45 60%,#0A1626 100%);box-shadow:0 18px 40px -18px rgba(10,22,38,0.55)}
.ws .hero::before{content:"";position:absolute;z-index:-1;pointer-events:none;width:420px;height:420px;top:-200px;left:-150px;background:radial-gradient(closest-side,rgba(47,91,255,0.42),rgba(47,91,255,0.16) 55%,rgba(47,91,255,0) 100%)}
.ws .monthnav{display:flex;align-items:center;gap:6px}
.ws .hero .month{font-family:var(--h-sb);font-size:18px;min-width:130px;text-align:center}
.ws .hero button{background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.22);color:var(--on-night)}
@media (hover:hover){.ws .hero button:hover:not(:disabled){background:rgba(255,255,255,0.2);border-color:rgba(255,255,255,0.3)}}
.ws .hero .spacer{flex:1}
.ws .hero button.primary{background:#fff;color:#12306E;border-color:#fff;border-radius:999px}
@media (hover:hover){.ws .hero button.primary:hover:not(:disabled){background:#EEF2FF}}
.ws .sq{width:38px;height:38px;padding:0}
.ws .search{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.22);border-radius:999px;padding:0 12px;min-width:240px}
.ws .search input{background:transparent;border:0;color:#fff;min-height:38px;padding:0;width:100%;outline:none}
.ws .search input::placeholder{color:var(--on-night-muted)}
.ws .search:focus-within{background:rgba(255,255,255,0.2);border-color:rgba(255,255,255,0.45)}
.ws .search .ic{color:var(--on-night-muted)}

/* ---------- תוצאות חיפוש ---------- */
.ws .pop{position:fixed;z-index:20;width:min(440px,calc(100vw - 24px));max-height:min(480px,70vh);overflow:auto;background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(10,22,38,.22);padding:8px;animation:wsPop .18s var(--ease)}
.ws .pop h4{margin:10px 8px 4px;font-size:13px;color:var(--muted);font-family:var(--f-m);font-weight:normal}
.ws .pop button{display:block;width:100%;text-align:start;border:0;border-radius:8px;padding:9px 10px}
@media (hover:hover){.ws .pop button:hover{background:var(--sunk)}}
.ws .pop .empty{padding:14px 10px;color:var(--muted);margin:0}

/* ---------- לוח החודש ---------- */
.ws main{display:grid;grid-template-columns:minmax(0,1fr) clamp(330px,30vw,440px);gap:16px;padding:16px 20px;align-items:start}
.ws .cal{container-type:inline-size}
.ws .weekdays,.ws .grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.ws .weekdays div{text-align:center;color:var(--muted);font-size:13px;padding-bottom:4px;font-family:var(--f-m)}
.ws .day{height:120px;overflow:hidden;background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:8px;text-align:start;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:4px}
.ws .day.out{visibility:hidden}
.ws .day.past{opacity:.6}
.ws .day.off{background:#EEF1F4}
.ws .day.sel{border:2px solid var(--blue);padding:7px;box-shadow:0 6px 18px -8px rgba(47,91,255,.45)}
.ws .day .num{display:flex;justify-content:space-between;align-items:center;font-family:var(--h-sb);font-size:16px;font-variant-numeric:tabular-nums}
.ws .day .hol{font-size:12px;color:var(--muted);font-family:var(--f-m);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ws .badge-today{font-size:11px;background:var(--blue);color:#fff;border-radius:999px;padding:1px 7px;font-family:var(--f-m)}
.ws .pill{font-size:12.5px;font-family:var(--f-m);border-radius:999px;padding:2px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-flex;align-items:center;gap:4px}
.ws .day .pill{align-self:stretch;flex:none;height:22px}
.ws .day .more{font-size:12px;font-family:var(--f-b);color:var(--muted);padding:0 4px}
.ws .pill .sh{display:none}
.ws .p-blue{background:var(--blue-bg);color:var(--blue)}
.ws .p-amber{background:var(--amber-bg);color:var(--amber-tx)}
.ws .p-gray{background:var(--gray-bg);color:var(--muted)}
.ws .p-green{background:var(--green-bg);color:var(--green-tx)}
.ws .p-red{background:var(--red-bg);color:var(--red-tx)}
.ws .legend{display:flex;gap:10px;margin-top:10px;font-size:12px;color:var(--muted);align-items:center;flex-wrap:wrap}
@container (max-width:720px){
  .ws .weekdays,.ws .grid{gap:5px}
  .ws .day{height:110px;padding:6px 5px}
  .ws .day.sel{padding:5px 4px}
  .ws .day .pill{font-size:12px;padding:0 6px;height:21px}
  .ws .day .pill .lg{display:none}
  .ws .day .pill .sh{display:inline}
}

/* ---------- פאנל היום ---------- */
.ws .panel{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:14px;position:sticky;top:12px;max-height:calc(100vh - 110px);overflow:auto;overscroll-behavior:contain}
.ws .panel-head{display:flex;align-items:center;gap:8px}
.ws .panel-head .ttl{flex:1;min-width:0}
.ws .panel-head h2{font-family:var(--h-b);font-weight:normal;font-size:18px;margin:0}
.ws .panel-head .sub{font-size:13px;color:var(--muted)}
.ws .actions{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:12px 0}
.ws .actions .primary{grid-column:1/-1;min-height:44px}
.ws .actions button:not(.primary){font-size:14px;padding:8px 6px}
.ws .todo{border-radius:var(--r);padding:10px;margin-bottom:12px}
.ws .todo.ok{background:var(--green-bg);color:var(--green-tx);display:flex;align-items:center;gap:8px;font-family:var(--f-m)}
.ws .todo.warn{background:var(--red-soft);border:1px solid #F7C9C5}
.ws .todo h3{margin:0 0 6px;font-size:15px;font-family:var(--f-b);font-weight:normal;color:var(--red-tx);display:flex;align-items:center;gap:6px}
.ws .todo button{display:flex;width:100%;justify-content:flex-start;text-align:start;border:0;background:#fff;border-radius:8px;padding:9px 10px;margin-top:5px;gap:8px;font-size:14.5px}
.ws .todo button .ic{color:var(--red-tx)}
.ws .todo button.amb .ic{color:var(--amber-tx)}
.ws .waiting{background:var(--amber-soft);border:1px solid var(--amber-line);border-radius:var(--r);padding:10px;margin-bottom:12px}
.ws .waiting h3{margin:0 0 4px;font-size:15px;font-family:var(--f-b);font-weight:normal;color:var(--amber-tx)}
.ws .witem{background:#fff;border-radius:8px;padding:8px 10px;margin-top:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;transition:background-color .4s ease}
.ws .vrow{border:1px solid var(--line);border-radius:var(--r);padding:10px;margin-bottom:8px}
.ws .vrow.garage{background:var(--sunk)}
.ws .vtop{display:flex;align-items:center;gap:8px}
.ws .vname{font-family:var(--f-b);display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.ws .vsub{font-size:13px;color:var(--muted)}
.ws .vtop .grow{flex:1;min-width:0}
.ws .trip{display:block;width:100%;text-align:start;border:0;border-top:1px solid var(--line);border-radius:0;padding:8px 2px;margin-top:6px;background:transparent;transition:background-color .4s ease}
@media (hover:hover){.ws .trip:hover{background:var(--sunk)}}
.ws .trip .t{font-family:var(--f-b);margin-inline-end:6px}
.ws .trip.cancel{color:var(--muted);text-decoration:line-through}
.ws .flash{background:var(--blue-bg)!important}
.ws .icon-btn{width:38px;height:38px;padding:0;flex:none}
.ws .rep{width:14px!important;height:14px!important;margin-inline-start:4px;vertical-align:-2px;color:var(--blue)}
.ws .empty-day{text-align:center;padding:28px 0}

/* ---------- חלונות ---------- */
.ws dialog{border:0;border-radius:16px;padding:0;width:min(620px,94vw);box-shadow:0 20px 60px rgba(0,0,0,.25);color:var(--text);background:#fff;font-family:var(--f-r);direction:var(--app-dir,rtl)}
.ws dialog[open]{animation:wsDlg .22s var(--ease)}
.ws dialog::backdrop{background:rgba(16,34,50,0.32)}
.ws .dlg-head{background:linear-gradient(180deg,#12306E 0%,#0B1C45 100%);color:var(--on-night);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:1}
.ws .dlg-head h3{margin:0;font-family:var(--h-b);font-weight:normal;font-size:17px}
.ws .dlg-head button{background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.22);color:var(--on-night)}
.ws .dlg-body{padding:14px 18px 18px;max-height:78vh;overflow:auto}
.ws .q{font-family:var(--f-b);margin:16px 0 6px}
.ws .q:first-child{margin-top:4px}
.ws .q small{font-family:var(--f-r);color:var(--muted)}
.ws .chips{display:flex;flex-wrap:wrap;gap:6px}
.ws .chips button{font-size:14px;padding:6px 11px;border-radius:999px}
.ws .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ws .vpick{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.ws .vpick button,.ws .vpick div{display:block;text-align:start;padding:8px 10px;border-radius:8px;min-height:54px;font-size:14px}
.ws .vpick div{border:1px dashed var(--line);color:var(--muted)}
.ws .vpick button.sel{border:2px solid var(--blue);background:var(--blue-bg);color:var(--blue)}
.ws .vpick .wide{grid-column:1/-1;min-height:44px}
.ws .vpick small{display:block;font-size:12.5px}
.ws .vpick small.warn{color:var(--amber-tx)}
.ws .vpick small.ok{color:var(--green-tx)}
.ws .err{color:var(--red-tx);font-size:14px;min-height:18px;margin-top:4px}
.ws .hint{font-size:14px;color:var(--muted);min-height:18px;margin-top:4px}
.ws .hint.warn{color:var(--amber-tx);font-family:var(--f-m)}
.ws .dates{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}
.ws .dates label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)}
.ws .seg{display:flex;flex-wrap:wrap;gap:6px}
.ws .seg label{display:flex;align-items:center;gap:6px;border:1px solid var(--line-input);border-radius:10px;padding:9px 12px;cursor:pointer;flex:1 1 auto}
.ws .seg label:has(input:checked){border:2px solid var(--blue);background:var(--blue-bg);padding:8px 11px}
.ws .seg label:has(input:disabled){opacity:.4;cursor:default}
.ws .check{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:15px}
.ws .check input{min-height:0;width:20px;height:20px}
.ws .dlg-foot{display:flex;gap:8px;margin-top:18px}
.ws .dlg-foot .primary{flex:1;min-height:44px}
.ws table{border-collapse:collapse;width:100%}
.ws td,.ws th{border-bottom:1px solid var(--line);padding:8px 6px;text-align:start}
.ws th{font-size:13px;color:var(--muted);font-family:var(--f-m);font-weight:normal}
.ws td{font-variant-numeric:tabular-nums}
.ws .marked{margin-top:18px;border-top:1px solid var(--line);padding-top:10px}
.ws .marked .witem{background:var(--sunk)}
.ws .sheet-list{display:flex;flex-direction:column;padding-top:4px}
.ws .sheet-list button{justify-content:flex-start;gap:12px;border:0;border-bottom:1px solid var(--line);border-radius:0;padding:16px 4px;font-size:17px;background:none}
.ws .sheet-list button .ic{width:22px;height:22px;color:var(--blue)}

.ws .toast{position:fixed;bottom:20px;left:50%;transform:translate(-50%,16px);opacity:0;pointer-events:none;background:#0A1626;color:var(--on-night);padding:10px 14px;border-radius:12px;display:flex;gap:12px;align-items:center;z-index:30;
  transition:opacity .2s ease,transform .25s var(--ease);width:max-content;max-width:calc(100vw - 24px);box-shadow:0 10px 30px rgba(10,22,38,.3)}
.ws .toast.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}
.ws .toast button{background:transparent;color:#5FC1F0;border:0;padding:4px;text-decoration:underline;white-space:nowrap}
.ws .state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:80px 20px;color:var(--muted);text-align:center}

@keyframes wsDlg{from{opacity:0;transform:scale(.97)}}
@keyframes wsPop{from{opacity:0;transform:translateY(-4px)}}
@keyframes wsSheet{from{transform:translateY(40px);opacity:0}}
@keyframes wsMonth{from{opacity:0;transform:translateX(var(--dx,0))}}
@media (prefers-reduced-motion:reduce){.ws *,.ws *::backdrop{animation:none!important;transition:none!important}}

/* ---------- אייפון: בסגנון היומן של iOS ---------- */
.ws.phone{background:var(--card);padding-bottom:calc(170px + env(safe-area-inset-bottom))}
.ws.phone button,.ws.phone .sq{min-height:44px}
.ws.phone dialog{width:100vw;max-width:100vw;margin:auto 0 0;border-radius:18px 18px 0 0;max-height:92dvh}
.ws.phone dialog[open]{animation:wsSheet .28s var(--ease)}
.ws.phone .dlg-body{max-height:calc(92dvh - 62px);padding:12px 14px calc(18px + env(safe-area-inset-bottom))}
.ws.phone .row input[type=date]{flex:1 1 100%}
.ws.phone .row input[type=time]{flex:1}
.ws.phone .pop{left:12px!important;right:12px!important;width:auto}
.ws.phone .toast{bottom:calc(150px + env(safe-area-inset-bottom))}
.ws .ios-top{position:sticky;top:0;z-index:15;display:flex;justify-content:space-between;align-items:center;padding:calc(10px + env(safe-area-inset-top)) 16px 8px;
  background:rgba(255,255,255,.84);-webkit-backdrop-filter:saturate(1.8) blur(18px);backdrop-filter:saturate(1.8) blur(18px)}
.ws .ios-pill{background:#fff;border:1px solid var(--line);border-radius:999px;box-shadow:0 6px 18px -6px rgba(22,34,46,.18);height:50px;min-width:50px;padding:0 18px;color:var(--text);font-family:var(--f-b);font-size:17px}
.ws .ios-pill.grp{display:flex;align-items:center;padding:0 4px}
.ws .ios-pill.grp button{border:0;background:none;width:50px;height:48px;padding:0;position:relative;color:var(--text)}
.ws .ios-pill .ic{width:23px;height:23px;stroke-width:2.2}
.ws .ios-search{display:flex;margin:4px 16px 8px;background:var(--sunk);border:1px solid var(--line);min-width:0}
.ws .ios-search input{color:var(--text)}
.ws .ios-search input::placeholder{color:var(--muted)}
.ws .ios-search .ic{color:var(--muted)}
.ws .ios-title{display:flex;align-items:center;gap:8px;padding:4px 16px 10px}
.ws .ios-title h1{font-family:var(--h-xb);font-weight:normal;font-size:36px;letter-spacing:-0.6px;margin:0;line-height:1.1}
.ws .ios-title .yr{font-family:var(--h-sb);font-size:18px;color:var(--muted);flex:1;padding-top:8px}
.ws .ios-title button{border:0;background:var(--sunk);border-radius:999px;width:42px;height:42px;padding:0}
.ws .ios-wd{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:13px;font-family:var(--f-m);color:var(--muted);padding:0 0 6px;border-bottom:1px solid var(--line)}
.ws .ios-grid{display:grid;grid-template-columns:repeat(7,1fr)}
.ws .ios-grid.mv{animation:wsMonth .26s var(--ease)}
.ws .icell{border:0;border-bottom:1px solid var(--line);border-radius:0;background:none;height:72px;padding:6px 0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:3px}
.ws .icell.blank{border-bottom-color:transparent}
.ws .icell .n{width:48px;height:48px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:var(--h-b);font-size:21px;line-height:1;transition:background-color .18s ease}
.ws .icell .h{font-family:var(--f-m);font-size:11.5px;color:var(--muted);margin-top:3px;max-width:44px;overflow:hidden;white-space:nowrap}
.ws .icell.off .n{color:#9AA5B0}
.ws .icell.today .n,.ws .icell.today .h{color:var(--blue)}
.ws .icell.sel .n{background:var(--text);color:#fff}
.ws .icell.sel.today .n{background:var(--blue)}
.ws .icell.sel .h{color:rgba(255,255,255,.8)}
.ws .icell .ind{display:flex;gap:3px;height:6px}
.ws .icell .ind i{width:6px;height:6px;border-radius:50%}
.ws .ag{padding:2px 16px 0;scroll-margin-top:76px}
.ws .ag-head{font-size:14px;color:var(--muted);font-family:var(--f-m);padding:16px 0 4px}
.ws .ag-row{display:flex;align-items:stretch;justify-content:flex-start;gap:12px;width:100%;border:0;border-bottom:1px solid var(--line);border-radius:0;background:none;padding:13px 0;text-align:start;transition:background-color .4s ease}
.ws .ag-bar{width:4px;border-radius:4px;flex:none;background:var(--blue)}
.ws .ag-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.ws .ag-t{font-size:17px;font-family:var(--f-b);line-height:1.25}
.ws .ag-s{font-size:14.5px;color:var(--muted);line-height:1.3}
.ws .ag-time{flex:none;text-align:end;direction:ltr;font-variant-numeric:tabular-nums;font-size:16px;font-family:var(--f-m);line-height:1.35}
.ws .ag-time span{display:block;color:var(--muted);font-family:var(--f-r)}
.ws .ag-row.wait .ag-bar{background:#FF9F0A}
.ws .ag-row.wait .ag-s{color:var(--amber-tx);font-family:var(--f-m)}
.ws .ag-row.issue .ag-bar{background:#FF3B30}
.ws .ag-row.issue .ag-t{color:var(--red-tx)}
.ws .ag-row.note .ag-bar{background:#9AA5B0}
.ws .ag-row.cancel .ag-bar{background:var(--line)}
.ws .ag-row.cancel .ag-t{text-decoration:line-through;color:var(--muted)}
.ws .ag-empty{padding:28px 0;text-align:center;color:var(--muted);display:flex;flex-direction:column;align-items:center;gap:12px}
.ws .ios-bottom{position:fixed;left:16px;right:16px;bottom:calc(86px + env(safe-area-inset-bottom));display:flex;justify-content:space-between;align-items:center;z-index:16;pointer-events:none}
.ws .ios-bottom>*{pointer-events:auto}
.ws .badge{position:absolute;top:2px;left:4px;min-width:20px;height:20px;border-radius:10px;background:#FF3B30;color:#fff;font-size:12px;font-family:var(--h-b);display:flex;align-items:center;justify-content:center;padding:0 5px}

/* ---------- הדפסה ---------- */
.ws-print{display:none}
@media print{
  body>*:not(.ws-print){display:none!important}
  .ws-print{display:block;color:#000;direction:var(--app-dir,rtl);font-family:'Assistant_400Regular',Arial,sans-serif}
  .ws-print .sheet{page-break-after:always;padding:10px}
  .ws-print h2{margin:0 0 4px;font-family:'Heebo_700Bold',Arial,sans-serif;font-weight:normal}
  .ws-print table{border-collapse:collapse;width:100%;margin-top:8px}
  .ws-print th,.ws-print td{border:1px solid #999;padding:5px 6px;text-align:start;font-size:11pt;vertical-align:top}
  .ws-print .foot{margin-top:10px;font-size:11pt}
}
`;
