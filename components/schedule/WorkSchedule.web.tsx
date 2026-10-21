// מסך סידור העבודה בדפדפן: לוח חודש, פאנל יום, טופס נסיעה וחלונות
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getLocale, t } from '../../lib/i18n';
import { useCompany } from '../../lib/CompanyContext';
import { errorMessage } from '../../lib/requestError';
import {
  addDays, byStart, CITIES, count, createRules, dayKey, dayName, diffDays, fromKey, hebrewDayLabel, holidayOf, isOff,
  lastDay, monthName, nextWorkDay, niceDate, repeatDates, route, shortDate, span, timeRange, todayKey, tripDayOf, tripTime,
  weekday, weekStart, type Block, type Repeat, type Rules, type SavedTrip, type ScheduleData, type ScheduleVehicle, type Series, type Trip,
} from '../../lib/workSchedule';
import { addClient, addSavedTrip, deleteBlock, deleteSavedTrip, deleteTrips, loadSchedule, loadTrips, newId, saveBlock, saveSeries, saveTrips, SERIES_AHEAD_DAYS } from '../../lib/workScheduleApi';
import { SCHEDULE_CSS } from './scheduleCss';

/* ---------- אייקונים ---------- */
const ICONS: Record<string, string> = {
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>', chevL: '<path d="m15 18-6-6 6-6"/>', plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  printer: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a2 2 0 0 1 2-2h10"/>',
  userX: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 4 1.5M17 15l5 5M22 15l-5 5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  chart: '<path d="M3 3v18h18M8 17v-5M13 17V8M18 17v-8"/>',
};
function Icon({ name, className = 'ic', label }: { name: string; className?: string; label?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined} dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}

/* ---------- עזרים ---------- */
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
const vehicleLabel = (v: ScheduleVehicle) => `${t(`vehicle.type.${v.type}`)} ${v.plate}`;
const monthStart = (y: number, m: number) => dayKey(new Date(y, m, 1, 12));
const datesRange = (from: string, to: string) => (to !== from ? timeRange(shortDate(from), shortDate(to)) : shortDate(from));
const sortTrips = (trips: Trip[]) => [...trips].sort((a, b) => (a.date === b.date ? (a.from < b.from ? -1 : 1) : a.date < b.date ? -1 : 1));

type Undo = () => Promise<void>;
type Toast = { message: string; undo: Undo | null; id: number };
type DialogName = 'dup' | 'away' | 'garage' | 'print' | 'more' | 'report' | 'saved' | null;

// חלון (dialog של הדפדפן): נפתח כשמופיע, נסגר ב-Esc או בלחיצה על הרקע
function Dialog({ title, onClose, children, bodyClass = 'dlg-body' }: { title: string; onClose: () => void; children: React.ReactNode; bodyClass?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className="dlg-head">
        <h3>{title}</h3>
        <button type="button" className="sq" onClick={onClose} aria-label={t('common.close')}><Icon name="x" /></button>
      </div>
      <div className={bodyClass}>{children}</div>
    </dialog>
  );
}

function Seg<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: { value: T; label: React.ReactNode; disabled?: boolean; hidden?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.filter((o) => !o.hidden).map((o) => (
        <label key={o.value}>
          <input type="radio" name={name} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/* ================================================================== */

export function WorkSchedule({ companyId, phone, onMenu }: { companyId: string; phone: boolean; onMenu?: () => void }) {
  const today = todayKey();
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedFrom, setLoadedFrom] = useState(() => {
    const d = new Date();
    return monthStart(d.getFullYear(), d.getMonth() - 1);
  });
  const [sel, setSel] = useState(today);
  const [view, setView] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [monthMove, setMonthMove] = useState(0);
  const [editing, setEditing] = useState<{ trip: Partial<Trip> & { date: string } } | null>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState(false);
  const [print, setPrint] = useState<{ day: string; how: 'drivers' | 'table' } | null>(null);
  const [blockOpen, setBlockOpen] = useState<Block | null>(null);
  const searchRef = useRef<HTMLLabelElement>(null);
  const agendaRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (from: string) => {
    setLoadError(null);
    try {
      setData(await loadSchedule(companyId, from));
    } catch (error) {
      setLoadError(errorMessage(error, t('schedule.loadFailed')));
    }
  }, [companyId]);
  useEffect(() => { void load(loadedFrom); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  // חודש שלפני מה שנטען: מביאים גם את הנסיעות שלו
  useEffect(() => {
    const start = addDays(monthStart(view.y, view.m), -7);
    if (!data || start >= loadedFrom) return;
    setLoadedFrom(start);
    loadTrips(companyId, start).then((trips) => setData((d) => (d ? { ...d, trips } : d))).catch(() => undefined);
  }, [view, data, loadedFrom, companyId]);

  const rules = useMemo(() => (data ? createRules(data) : null), [data]);

  const showToast = useCallback((message: string, undo: Undo | null = null) => setToast({ message, undo, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 10000);
    return () => clearTimeout(timer);
  }, [toast]);

  const goTo = useCallback((k: string) => {
    setSel(k);
    const d = fromKey(k);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }, []);
  const shiftMonth = (n: number) => {
    setMonthMove(n);
    setView((v) => {
      const d = new Date(v.y, v.m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };
  const flash = (id: string) => {
    setFlashId(id);
    setTimeout(() => setFlashId((x) => (x === id ? null : x)), 1800);
  };
  useEffect(() => {
    if (!flashId) return;
    const el = [...document.querySelectorAll<HTMLElement>(`[data-tid="${flashId}"]`)].find((e) => e.offsetParent);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [flashId]);

  // שמירה מול השרת, ואז עדכון המסך. נכשל = הודעה, בלי לשנות את המסך
  const applyTrips = useCallback(async (changed: Trip[], undo: Undo | null, message: string) => {
    try {
      await saveTrips(companyId, changed);
      setData((d) => {
        if (!d) return d;
        const ids = new Set(changed.map((x) => x.id));
        return { ...d, trips: [...d.trips.filter((x) => !ids.has(x.id)), ...changed] };
      });
      showToast(message, undo);
      return true;
    } catch (error) {
      showToast(errorMessage(error, t('schedule.saveFailed')));
      return false;
    }
  }, [companyId, showToast]);

  // ביטול פעולה: מחזיר נסיעות קודמות ומוחק נסיעות שנוצרו עכשיו
  const undoTrips = useCallback((before: Trip[], created: string[]): Undo => async () => {
    try {
      if (before.length) await saveTrips(companyId, before);
      if (created.length) await deleteTrips(created);
      setData((d) => {
        if (!d) return d;
        const drop = new Set([...created, ...before.map((x) => x.id)]);
        return { ...d, trips: [...d.trips.filter((x) => !drop.has(x.id)), ...before] };
      });
      showToast(t('schedule.undone'));
    } catch (error) {
      showToast(errorMessage(error, t('schedule.saveFailed')));
    }
  }, [companyId, showToast]);

  // מחיקה מהיומן: אפשר להחזיר מיד מההודעה
  const removeTrips = useCallback(async (trips: Trip[], message: string, alsoUndo: Undo | null) => {
    const ids = new Set(trips.map((x) => x.id));
    try {
      await deleteTrips([...ids]);
      setData((d) => (d ? { ...d, trips: d.trips.filter((x) => !ids.has(x.id)) } : d));
      showToast(message, async () => {
        try {
          await saveTrips(companyId, trips);
          setData((d) => (d ? { ...d, trips: [...d.trips.filter((x) => !ids.has(x.id)), ...trips] } : d));
          await alsoUndo?.();
          showToast(t('schedule.undone'));
        } catch (error) {
          showToast(errorMessage(error, t('schedule.saveFailed')));
        }
      });
      return true;
    } catch (error) {
      showToast(errorMessage(error, t('schedule.saveFailed')));
      return false;
    }
  }, [companyId, showToast]);

  // הסרת "רכב במוסך" / "נהג לא זמין" מהיומן
  const removeBlock = useCallback(async (b: Block) => {
    try {
      await deleteBlock(b.id);
      setData((d) => (d ? { ...d, blocks: d.blocks.filter((x) => x.id !== b.id) } : d));
      setBlockOpen(null);
      showToast(t('schedule.block.removed'), async () => {
        try {
          await saveBlock(companyId, b);
          setData((d) => (d ? { ...d, blocks: [...d.blocks, b] } : d));
          showToast(t('schedule.undone'));
        } catch (error) {
          showToast(errorMessage(error, t('schedule.saveFailed')));
        }
      });
    } catch (error) {
      showToast(errorMessage(error, t('schedule.saveFailed')));
    }
  }, [companyId, showToast]);

  /* ---------- חיפוש ---------- */
  const hits = useMemo(() => {
    const q = norm(query).replace(/-/g, '');
    if (!data || !rules || q.length < 2) return [];
    return sortTrips(data.trips.filter((x) => x.status === 'active' && lastDay(x) >= today && [
      x.title, x.client, x.pickup, x.dest, rules.driverName(x.driverId), rules.vehicle(x.vehicleId)?.plate,
    ].some((s) => s && s.replace(/-/g, '').includes(q)))).slice(0, 40);
  }, [query, data, rules, today]);
  useEffect(() => {
    if (!searchOpen) return;
    const close = (e: Event) => { if (!(e.target as HTMLElement).closest?.('.pop,.search')) setSearchOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [searchOpen]);

  if (loadError) {
    return (
      <div className={`ws${phone ? ' phone' : ''}`}>
        <style>{SCHEDULE_CSS}</style>
        <div className="state" role="alert">
          <Icon name="alert" />
          <div>{loadError}</div>
          <button type="button" className="primary" onClick={() => void load(loadedFrom)}>{t('common.tryAgain')}</button>
        </div>
      </div>
    );
  }
  if (!data || !rules) {
    return (
      <div className={`ws${phone ? ' phone' : ''}`}>
        <style>{SCHEDULE_CSS}</style>
        <div className="state" aria-busy="true">{t('common.loadingEllipsis')}</div>
      </div>
    );
  }

  const openTrip = (trip: Partial<Trip> & { date: string }) => setEditing({ trip });
  const searchPop = searchOpen && norm(query).length >= 2 && searchRef.current ? (() => {
    const r = searchRef.current!.getBoundingClientRect();
    let last = '';
    return (
      <div className="pop" style={{ top: r.bottom + 8, right: Math.max(12, window.innerWidth - r.right) }}>
        {hits.length ? hits.map((x) => {
          const head = x.date !== last ? <h4>{niceDate(x.date)}</h4> : null;
          last = x.date;
          const v = rules.vehicle(x.vehicleId);
          return (
            <React.Fragment key={x.id}>
              {head}
              <button type="button" onClick={() => { setSearchOpen(false); setPhoneSearch(false); goTo(x.date); flash(x.id); }}>
                <b className="tnum">{tripTime(x, x.date)}</b> {x.title}{x.end ? t('schedule.untilDate', { date: shortDate(x.end) }) : ''}
                <div className="vsub">{[v ? v.plate : t('schedule.waitingVehicle'), rules.driverName(x.driverId), x.client].filter(Boolean).join(' · ')}</div>
              </button>
            </React.Fragment>
          );
        }) : <p className="empty">{t('schedule.noResults', { q: norm(query) })}</p>}
      </div>
    );
  })() : null;
  const searchInput = (
    <input
      type="search"
      value={query}
      placeholder={t('schedule.searchPlaceholder')}
      aria-label={t('schedule.search')}
      autoComplete="off"
      autoFocus={phone}
      onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
      onFocus={() => setSearchOpen(true)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { setSearchOpen(false); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Enter' && hits[0]) { setSearchOpen(false); goTo(hits[0].date); flash(hits[0].id); }
      }}
    />
  );

  const common = { data, rules, sel, today, flashId, openTrip, onBlock: setBlockOpen };
  return (
    <div className={`ws${phone ? ' phone' : ''}`}>
      <style>{SCHEDULE_CSS}</style>
      {phone ? (
        <PhoneView
          {...common}
          view={view}
          monthMove={monthMove}
          agendaRef={agendaRef}
          onSelect={setSel}
          onShift={shiftMonth}
          onToday={() => goTo(today)}
          onMenu={onMenu}
          onMore={() => setDialog('more')}
          search={phoneSearch ? <label className="search ios-search" ref={searchRef}><Icon name="search" />{searchInput}</label> : null}
          onToggleSearch={() => { setPhoneSearch((s) => !s); setQuery(''); setSearchOpen(false); }}
        />
      ) : (
        <>
          <header className="hero">
            <div className="monthnav">
              <button type="button" className="sq" onClick={() => shiftMonth(-1)} aria-label={t('schedule.prevMonth')}><Icon name="chevR" /></button>
              <div className="month" aria-live="polite">{monthName(view.m)} {view.y}</div>
              <button type="button" className="sq" onClick={() => shiftMonth(1)} aria-label={t('schedule.nextMonth')}><Icon name="chevL" /></button>
              <button type="button" onClick={() => goTo(today)}>{t('schedule.today')}</button>
            </div>
            <div className="spacer" />
            <label className="search" ref={searchRef}><Icon name="search" />{searchInput}</label>
            <button type="button" onClick={() => setDialog('saved')}><Icon name="bookmark" />{t('schedule.savedTrips')}</button>
            <button type="button" onClick={() => setDialog('report')}><Icon name="chart" />{t('schedule.clientReport')}</button>
            <button type="button" className="primary" onClick={() => openTrip({ date: sel })}><Icon name="plus" />{t('schedule.newTrip')}</button>
          </header>
          <main>
            <MonthGrid {...common} view={view} onSelect={setSel} />
            <DayPanel
              {...common}
              onDay={(n) => goTo(addDays(sel, n))}
              onAction={(name) => setDialog(name)}
            />
          </main>
        </>
      )}
      {searchPop}

      {editing && (
        <TripForm
          data={data}
          rules={rules}
          initial={editing.trip}
          companyId={companyId}
          onClose={() => setEditing(null)}
          applyTrips={applyTrips}
          undoTrips={undoTrips}
          onSaved={(date, id) => { setEditing(null); goTo(date); flash(id); }}
          onClientAdded={(c) => setData((d) => (d ? { ...d, clients: [...d.clients, c] } : d))}
          onSavedTripAdded={(s) => setData((d) => (d ? { ...d, saved: [...d.saved, s] } : d))}
          onSeriesChanged={(x) => setData((d) => (d ? { ...d, series: [...d.series.filter((y) => y.id !== x.id), x] } : d))}
          removeTrips={removeTrips}
        />
      )}
      {dialog === 'dup' && (
        <DuplicateDialog data={data} rules={rules} sel={sel} onClose={() => setDialog(null)} applyTrips={applyTrips} undoTrips={undoTrips} onDone={(k) => { setDialog(null); goTo(k); }} />
      )}
      {(dialog === 'away' || dialog === 'garage') && (
        <BlockDialog
          kind={dialog === 'away' ? 'driver' : 'vehicle'}
          data={data}
          sel={sel}
          today={today}
          companyId={companyId}
          onClose={() => setDialog(null)}
          onChange={(blocks, message, undo) => { setData((d) => (d ? { ...d, blocks } : d)); showToast(message, undo); }}
          onError={(error) => showToast(errorMessage(error, t('schedule.saveFailed')))}
          onSaved={() => setDialog(null)}
        />
      )}
      {dialog === 'print' && (
        <PrintDialog rules={rules} sel={sel} today={today} onClose={() => setDialog(null)} onPrint={(day, how) => { setDialog(null); setPrint({ day, how }); }} />
      )}
      {dialog === 'more' && (
        <Dialog title={t('schedule.addMenu')} onClose={() => setDialog(null)} bodyClass="dlg-body sheet-list">
          <button type="button" className="sheet-main" onClick={() => { setDialog(null); openTrip({ date: sel }); }}><Icon name="plus" />{t('schedule.newTrip')}</button>
          {([['dup', 'copy', 'schedule.more.dup'], ['away', 'userX', 'schedule.driverAway'], ['garage', 'wrench', 'schedule.vehicleGarage'],
            ['print', 'printer', 'schedule.print.title'], ['saved', 'bookmark', 'schedule.savedTrips'], ['report', 'chart', 'schedule.more.report']] as const).map(([name, icon, key]) => (
            <button type="button" key={name} onClick={() => setDialog(name)}><Icon name={icon} />{t(key)}</button>
          ))}
        </Dialog>
      )}
      {dialog === 'report' && <ReportDialog data={data} view={view} onClose={() => setDialog(null)} />}
      {dialog === 'saved' && (
        <SavedDialog
          saved={data.saved}
          onClose={() => setDialog(null)}
          onRemove={async (s) => {
            try {
              await deleteSavedTrip(s.id);
              setData((d) => (d ? { ...d, saved: d.saved.filter((x) => x.id !== s.id) } : d));
            } catch (error) {
              showToast(errorMessage(error, t('schedule.saveFailed')));
            }
          }}
        />
      )}
      {blockOpen && (
        <Dialog title={blockOpen.ownerType === 'driver' ? t('schedule.driverAway') : t('schedule.vehicleGarage')} onClose={() => setBlockOpen(null)}>
          <p>
            <b>{blockOpen.ownerType === 'driver' ? rules.driverName(blockOpen.ownerId) : rules.vehicleLabel(rules.vehicle(blockOpen.ownerId))}</b> · {blockOpen.reason}
          </p>
          <div className="vsub tnum">{datesRange(blockOpen.from, blockOpen.to)}</div>
          {blockOpen.details && <p style={{ whiteSpace: 'pre-wrap' }}>{blockOpen.details}</p>}
          <div className="dlg-foot">
            <button type="button" className="danger" onClick={() => void removeBlock(blockOpen)}>{t('schedule.block.removeFromCalendar')}</button>
            <button type="button" onClick={() => setBlockOpen(null)}>{t('common.close')}</button>
          </div>
        </Dialog>
      )}
      {print && <PrintSheets data={data} rules={rules} day={print.day} how={print.how} onDone={() => setPrint(null)} />}

      <div className={`toast${toast ? ' show' : ''}`} role="status">
        <span>{toast?.message}</span>
        {toast?.undo && (
          <button type="button" onClick={() => { const undo = toast.undo; setToast(null); void undo?.(); }}>{t('schedule.undo')}</button>
        )}
      </div>
    </div>
  );
}

type Common = {
  data: ScheduleData;
  rules: Rules;
  sel: string;
  today: string;
  flashId: string | null;
  openTrip: (trip: Partial<Trip> & { date: string }) => void;
  onBlock: (b: Block) => void;
};

/* ---------- סיכום של יום ללוח ---------- */
function daySummary(data: ScheduleData, rules: Rules, k: string) {
  const trips = rules.dayTrips(k).filter((x) => x.status === 'active');
  const assigned = trips.filter((x) => x.vehicleId).length;
  const waiting = trips.length - assigned;
  const garage = data.vehicles.filter((v) => rules.garageOf(v.id, k)).length;
  const away = new Set(data.blocks.filter((b) => b.ownerType === 'driver' && b.from <= k && k <= b.to).map((b) => b.ownerId)).size;
  const issues = rules.issues(k).length;
  const hol = holidayOf(k);
  const label = [niceDate(k), hol?.name, assigned && count(assigned, 'schedule.trips'), waiting && count(waiting, 'schedule.waitingTrips'), issues && count(issues, 'schedule.toCheck')]
    .filter(Boolean).join(', ');
  return { assigned, waiting, garage, away, issues, hol, label };
}

/* ---------- לוח החודש (מחשב) ---------- */
function MonthGrid({ data, rules, sel, today, view, onSelect }: Common & { view: { y: number; m: number }; onSelect: (k: string) => void }) {
  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const pill = (cls: string, long: string, short: string) => (
    <span className={`pill ${cls}`} key={cls}><span className="lg">{long}</span><span className="sh">{short}</span></span>
  );
  return (
    <section className="cal" aria-label={t('schedule.monthBoard')}>
      <div className="weekdays">{[0, 1, 2, 3, 4, 5, 6].map((d) => <div key={d}>{t(`schedule.weekday.${d}`)}</div>)}</div>
      <div className="grid">
        {Array.from({ length: first }, (_, i) => <div key={`o${i}`} className="day out" aria-hidden="true" />)}
        {Array.from({ length: days }, (_, i) => {
          const k = dayKey(new Date(view.y, view.m, i + 1, 12));
          const s = daySummary(data, rules, k);
          // כל יום באותו גובה: עד 3 תוויות לפי חשיבות, והשאר "+N עוד"
          const pills = [
            s.issues ? pill('p-red', t('schedule.cal.check', { n: s.issues }), t('schedule.cal.check', { n: s.issues })) : null,
            s.waiting ? pill('p-amber', count(s.waiting, 'schedule.cal.waiting'), t('schedule.cal.waitingShort', { n: s.waiting })) : null,
            s.assigned ? pill('p-blue', count(s.assigned, 'schedule.trips'), count(s.assigned, 'schedule.tripsShort')) : null,
            s.garage ? pill('p-gray g', t('schedule.cal.garage', { n: s.garage }), t('schedule.cal.garage', { n: s.garage })) : null,
            s.away ? pill('p-gray a', count(s.away, 'schedule.cal.away'), count(s.away, 'schedule.cal.awayShort')) : null,
          ].filter(Boolean);
          const max = s.hol ? 2 : 3;
          const shown = pills.length <= max ? pills : [...pills.slice(0, max - 1), <span className="more" key="more">{t('schedule.cal.more', { n: pills.length - max + 1 })}</span>];
          return (
            <button
              type="button"
              key={k}
              className={['day', isOff(k) && 'off', k < today && 'past', k === sel && 'sel'].filter(Boolean).join(' ')}
              aria-label={s.label}
              aria-pressed={k === sel}
              onClick={() => onSelect(k)}
            >
              <div className="num"><span>{i + 1}</span>{k === today && <span className="badge-today">{t('schedule.today')}</span>}</div>
              {s.hol && <div className="hol">{s.hol.name}</div>}
              {shown}
            </button>
          );
        })}
      </div>
      <div className="legend">
        <span className="pill p-blue">{t('schedule.legend.trips')}</span>
        <span className="pill p-amber">{t('schedule.legend.waiting')}</span>
        <span className="pill p-gray">{t('schedule.legend.unavailable')}</span>
        <span className="pill p-red">{t('schedule.legend.check')}</span>
      </div>
    </section>
  );
}

function TripTags({ trip, k }: { trip: Trip; k: string }) {
  return (
    <>
      {trip.seriesId && <Icon name="repeat" className="ic rep" label={t('schedule.recurring')} />}
      {trip.end && <> <span className="pill p-blue">{tripDayOf(trip, k)}</span></>}
    </>
  );
}

/* ---------- פאנל היום (מחשב) ---------- */
function DayPanel({ data, rules, sel: k, today, flashId, openTrip, onBlock, onDay, onAction }: Common & { onDay: (n: number) => void; onAction: (name: 'dup' | 'away' | 'garage' | 'print') => void }) {
  const trips = rules.dayTrips(k).sort(byStart(k));
  const hol = holidayOf(k);
  const waiting = trips.filter((x) => !x.vehicleId && x.status === 'active');
  const issues = rules.issues(k);
  const sub = hol ? hol.name + (hol.off ? t('schedule.noWork') : '') : weekday(k) === 6 ? t('schedule.weekday.6') : k === today ? t('schedule.today') : '';
  const away = data.blocks.filter((b) => b.ownerType === 'driver' && b.from <= k && k <= b.to);
  const shown = data.vehicles.filter((v) => rules.garageOf(v.id, k) || trips.some((x) => x.vehicleId === v.id));
  const nowHm = new Date().toTimeString().slice(0, 5);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => { panelRef.current?.scrollTo({ top: 0 }); }, [k]);

  const vehicleStatus = (v: ScheduleVehicle) => {
    const g = rules.garageOf(v.id, k);
    if (g) return <button type="button" className="pill p-gray pill-btn" onClick={() => onBlock(g)} aria-label={t('schedule.block.editMark')}>{t('schedule.garagePill', { reason: g.reason })}</button>;
    const own = trips.filter((x) => x.vehicleId === v.id && x.status === 'active');
    if (k === today) {
      const cur = own.find((x) => span(x, k)[0] <= nowHm && nowHm < span(x, k)[1]);
      if (cur) return <span className="pill p-blue">{cur.end && k !== cur.end ? t('schedule.onLongTrip') : t('schedule.onTripUntil', { time: span(cur, k)[1] })}</span>;
      return <span className="pill p-green">{t('schedule.freeNow')}</span>;
    }
    return own.length ? <span className="pill p-blue">{count(own.length, 'schedule.trips')}</span> : <span className="pill p-green">{t('schedule.freeAllDay')}</span>;
  };

  return (
    <aside className="panel" aria-live="polite" ref={panelRef}>
      <div className="panel-head">
        <button type="button" className="icon-btn" onClick={() => onDay(-1)} aria-label={t('schedule.prevDay')}><Icon name="chevR" /></button>
        <div className="ttl"><h2>{niceDate(k)}</h2>{sub && <div className="sub">{sub}</div>}</div>
        <button type="button" className="icon-btn" onClick={() => onDay(1)} aria-label={t('schedule.nextDay')}><Icon name="chevL" /></button>
      </div>
      <div className="actions">
        <button type="button" className="primary" onClick={() => openTrip({ date: k })}><Icon name="plus" /> {t('schedule.newTripOnDay')}</button>
        <button type="button" onClick={() => onAction('dup')}><Icon name="copy" />{t('schedule.duplicate')}</button>
        <button type="button" onClick={() => onAction('away')}><Icon name="userX" />{t('schedule.driverAway')}</button>
        <button type="button" onClick={() => onAction('garage')}><Icon name="wrench" />{t('schedule.vehicleGarage')}</button>
        <button type="button" onClick={() => onAction('print')}><Icon name="printer" />{t('schedule.print.button')}</button>
      </div>
      {issues.length || waiting.length ? (
        <div className="todo warn">
          <h3><Icon name="alert" /> {t('schedule.openTitle')}</h3>
          {waiting.length > 0 && (
            <button type="button" className="amb" onClick={() => document.getElementById('ws-waiting')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
              <Icon name="clock" />{count(waiting.length, 'schedule.waitingTrips')}
            </button>
          )}
          {issues.map((x, i) => {
            const trip = data.trips.find((y) => y.id === x.tripId);
            return <button type="button" key={i} onClick={() => trip && openTrip(trip)}><Icon name="alert" />{x.text}</button>;
          })}
        </div>
      ) : trips.some((x) => x.status === 'active') ? (
        <div className="todo ok"><Icon name="check" /> {t('schedule.allGood')}</div>
      ) : null}
      {away.length > 0 && (
        <div className="vsub" style={{ margin: '-4px 2px 12px' }}>
          <Icon name="userX" /> {t('schedule.awayToday')} {away.map((b, i) => <React.Fragment key={b.id}>{i > 0 && ', '}<button type="button" className="link" onClick={() => onBlock(b)}><b>{rules.driverName(b.ownerId)}</b> ({b.reason})</button></React.Fragment>)}
        </div>
      )}
      {waiting.length > 0 && (
        <div className="waiting" id="ws-waiting">
          <h3>{t('schedule.waitingTitle', { n: waiting.length })}</h3>
          {waiting.map((x) => (
            <div className={`witem${flashId === x.id ? ' flash' : ''}`} key={x.id} data-tid={x.id}>
              <div>
                <b className="tnum">{tripTime(x, k)}</b> {x.title}<TripTags trip={x} k={k} />
                {(x.client || x.driverId || route(x)) && (
                  <div className="vsub">{[x.client, x.phone, route(x), x.driverId && t('schedule.driverLabel', { name: rules.driverName(x.driverId) })].filter(Boolean).join(' · ')}</div>
                )}
              </div>
              <button type="button" onClick={() => openTrip(x)}>{t('schedule.assignVehicle')}</button>
            </div>
          ))}
        </div>
      )}
      {!shown.length && !waiting.length && <div className="vsub empty-day">{t('schedule.noTrips')}</div>}
      {shown.map((v) => {
        const g = rules.garageOf(v.id, k);
        const own = trips.filter((x) => x.vehicleId === v.id);
        const bad = rules.vehicleBlocked(v, k);
        const soon = !bad && rules.vehicleSoon(v, k);
        const driverBlock = rules.driverBlocked(v.driverId, k);
        return (
          <div className={`vrow${g ? ' garage' : ''}`} key={v.id}>
            <div className="vtop">
              <div className="grow">
                <div className="vname">
                  {vehicleLabel(v)}
                  {bad ? <span className="pill p-red">{bad}</span> : soon ? <span className="pill p-amber">{soon}</span> : null}
                </div>
                <div className="vsub">
                  {t('schedule.primaryDriver', { name: rules.driverName(v.driverId) || '—' })}
                  {driverBlock && <> <span className="pill p-amber">{driverBlock}</span></>}
                </div>
              </div>
              {vehicleStatus(v)}
              {!g && (
                <button type="button" className="icon-btn" onClick={() => openTrip({ date: k, vehicleId: v.id })} aria-label={t('schedule.newTripFor', { plate: v.plate })}><Icon name="plus" /></button>
              )}
            </div>
            {own.map((x) => (
              <button type="button" key={x.id} data-tid={x.id} className={['trip', x.status === 'cancelled' && 'cancel', flashId === x.id && 'flash'].filter(Boolean).join(' ')} onClick={() => openTrip(x)}>
                <span className="t">{tripTime(x, k)}</span>{x.title}<TripTags trip={x} k={k} />
                {x.client && <> · <span className="vsub">{x.client}</span></>}
                {x.phone && <> · <span className="vsub" dir="ltr">{x.phone}</span></>}
                {x.driverId !== v.driverId && <> · <span className="vsub">{t('schedule.driverLabel', { name: rules.driverName(x.driverId) || '—' })}</span></>}
                {x.status === 'cancelled' && ` ${t('schedule.cancelledMark')}`}
                {route(x) && <div className="vsub">{route(x)}</div>}
              </button>
            ))}
          </div>
        );
      })}
    </aside>
  );
}

/* ---------- אייפון: יומן בסגנון iOS ---------- */
function PhoneView({
  data, rules, sel: k, today, flashId, openTrip, onBlock, view, monthMove, agendaRef, onSelect, onShift, onToday, onMenu, onMore, search, onToggleSearch,
}: Common & {
  view: { y: number; m: number }; monthMove: number; agendaRef: React.RefObject<HTMLDivElement | null>; onSelect: (k: string) => void; onShift: (n: number) => void;
  onToday: () => void; onMenu?: () => void; onMore: () => void; search: React.ReactNode; onToggleSearch: () => void;
}) {
  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const touch = useRef({ x: 0, y: 0 });
  const trips = rules.dayTrips(k).sort(byStart(k));
  const issues = rules.issues(k);
  const waiting = trips.filter((x) => !x.vehicleId && x.status === 'active');
  const hol = holidayOf(k);
  const heb = hebrewDayLabel(k);
  const open = issues.length + waiting.length;

  const row = (key: string, cls: string, title: React.ReactNode, sub: React.ReactNode, time: React.ReactNode, onClick?: () => void, tid?: string) => (
    <button type="button" key={key} className={`ag-row ${cls}${tid && flashId === tid ? ' flash' : ''}`} disabled={!onClick} onClick={onClick} data-tid={tid}>
      <i className="ag-bar" />
      <span className="ag-main"><span className="ag-t">{title}</span>{sub && <span className="ag-s">{sub}</span>}</span>
      <span className="ag-time">{time}</span>
    </button>
  );

  return (
    <div>
      <div className="ios-top">
        <button type="button" className="ios-pill" onClick={onMenu} aria-label={t('schedule.menu')}><Icon name="menu" /></button>
        <div className="ios-pill grp">
          <button type="button" onClick={onToggleSearch} aria-label={t('schedule.search')}><Icon name="search" /></button>
          <button type="button" onClick={onMore} aria-label={t('schedule.addMenu')}><Icon name="plus" /></button>
        </div>
      </div>
      {search}
      <div className="ios-title">
        <h1>{monthName(view.m)}</h1><span className="yr">{view.y}</span>
        <button type="button" onClick={() => onShift(-1)} aria-label={t('schedule.prevMonth')}><Icon name="chevR" /></button>
        <button type="button" onClick={() => onShift(1)} aria-label={t('schedule.nextMonth')}><Icon name="chevL" /></button>
      </div>
      <div className="ios-wd">{[0, 1, 2, 3, 4, 5, 6].map((d) => <span key={d}>{t(`schedule.weekdayShort.${d}`)}</span>)}</div>
      <div
        className={`ios-grid${monthMove ? ' mv' : ''}`}
        key={`${view.y}-${view.m}`}
        style={{ ['--dx' as string]: `${monthMove > 0 ? -18 : 18}px` }}
        onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - touch.current.x;
          const dy = e.changedTouches[0].clientY - touch.current.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onShift(dx > 0 ? 1 : -1);
        }}
      >
        {Array.from({ length: first }, (_, i) => <span key={`b${i}`} className="icell blank" />)}
        {Array.from({ length: days }, (_, i) => {
          const day = dayKey(new Date(view.y, view.m, i + 1, 12));
          const s = daySummary(data, rules, day);
          const h = hebrewDayLabel(day);
          const dots = [s.issues && '#FF3B30', s.waiting && '#FF9F0A', s.assigned && '#2F5BFF', (s.garage || s.away) && '#9AA5B0'].filter(Boolean).slice(0, 3) as string[];
          return (
            <button type="button" key={day} className={['icell', isOff(day) && 'off', day === today && 'today', day === k && 'sel'].filter(Boolean).join(' ')} aria-label={s.label} aria-pressed={day === k} onClick={() => onSelect(day)}>
              <span className="n">{i + 1}<span className="h">{h.first ? h.month : h.day}</span></span>
              <span className="ind">{dots.map((c) => <i key={c} style={{ background: c }} />)}</span>
            </button>
          );
        })}
      </div>
      <div className="ag" ref={agendaRef}>
        <div className="ag-head">{[niceDate(k), `${heb.day} ${heb.month}`.trim(), hol?.name].filter(Boolean).join(' · ')}</div>
        {issues.map((x, i) => {
          const trip = data.trips.find((y) => y.id === x.tripId);
          return row(`i${i}`, 'issue', t('schedule.check'), x.text, '', trip ? () => openTrip(trip) : undefined);
        })}
        {data.vehicles.map((v) => {
          const g = rules.garageOf(v.id, k);
          return g ? row(`g${v.id}`, 'note', t('schedule.vehicleInGarage', { vehicle: vehicleLabel(v) }), g.reason, t('schedule.allDay'), () => onBlock(g)) : null;
        })}
        {data.blocks.filter((b) => b.ownerType === 'driver' && b.from <= k && k <= b.to).map((b) =>
          row(`a${b.id}`, 'note', `${rules.driverName(b.ownerId)} – ${b.reason}`, t('schedule.notAvailable'), t('schedule.allDay'), () => onBlock(b)))}
        {trips.map((x) => {
          const v = rules.vehicle(x.vehicleId);
          const sub = x.status === 'cancelled' ? t('schedule.cancelled') : v ? [vehicleLabel(v), rules.driverName(x.driverId), x.client, x.phone, route(x)].filter(Boolean).join(' · ') : t('schedule.waitingTap');
          const [s, e] = span(x, k);
          const time = s === '00:00' && e === '24:00' ? t('schedule.allDay') : <>{s === '00:00' ? '—' : s}<span>{e === '24:00' ? '—' : e}</span></>;
          return row(x.id, x.status === 'cancelled' ? 'cancel' : v ? '' : 'wait', <>{x.title}<TripTags trip={x} k={k} /></>, sub, time, () => openTrip(x), x.id);
        })}
        {!trips.length && (
          <div className="ag-empty">
            {isOff(k) ? t('schedule.offNoTrips', { what: hol?.name ?? dayName(k) }) : t('schedule.noTrips')}
            <button type="button" className="primary" onClick={() => openTrip({ date: k })}><Icon name="plus" /> {t('schedule.newTripOnDay')}</button>
          </div>
        )}
      </div>
      <div className="ios-bottom">
        <button type="button" className="ios-pill" onClick={() => { onToday(); document.querySelector('.ws')?.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t('schedule.today')}</button>
        <div className="ios-pill grp">
          <button
            type="button"
            onClick={() => agendaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            aria-label={open ? t('schedule.openCount', { n: open }) : t('schedule.nothingOpen')}
          >
            <Icon name="alert" />{open > 0 && <span className="badge">{open}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- טופס נסיעה ---------- */
type ApplyTrips = (changed: Trip[], undo: Undo | null, message: string) => Promise<boolean>;
type UndoTrips = (before: Trip[], created: string[]) => Undo;
type RemoveTrips = (trips: Trip[], message: string, alsoUndo: Undo | null) => Promise<boolean>;

function TripForm({
  data, rules, initial, companyId, onClose, applyTrips, undoTrips, onSaved, onClientAdded, onSavedTripAdded, onSeriesChanged, removeTrips,
}: {
  data: ScheduleData; rules: Rules; initial: Partial<Trip> & { date: string }; companyId: string; onClose: () => void;
  applyTrips: ApplyTrips; undoTrips: UndoTrips; onSaved: (date: string, id: string) => void;
  onClientAdded: (c: { id: string; name: string }) => void; onSavedTripAdded: (s: SavedTrip) => void;
  onSeriesChanged: (x: Series) => void; removeTrips: RemoveTrips;
}) {
  const editing = initial.id ? (initial as Trip) : null;
  const cancelled = editing?.status === 'cancelled';
  const series = !!editing?.seriesId;
  const [date, setDate] = useState(initial.date);
  const [from, setFrom] = useState(initial.from ?? '');
  const [to, setTo] = useState(initial.to ?? '');
  const [repeat, setRepeat] = useState<Repeat>(editing?.end ? 'multi' : 'once');
  const [until, setUntil] = useState(editing?.end ?? '');
  const [scope, setScope] = useState<'one' | 'all'>('one');
  const [title, setTitle] = useState(initial.title ?? '');
  const [client, setClient] = useState(initial.client ?? '');
  const [phoneNo, setPhoneNo] = useState(initial.phone ?? '');
  // נסיעה קבועה בלי תאריך סיום: נמשכת עד שמבטלים אותה
  const [forever, setForever] = useState(false);
  const seriesRow = editing?.seriesId ? data.series.find((x) => x.id === editing.seriesId) ?? null : null;
  const [pickup, setPickup] = useState(initial.pickup ?? '');
  const [dest, setDest] = useState(initial.dest ?? '');
  // undefined = לא נבחר, null = רשימת המחכים
  const [pick, setPick] = useState<string | null | undefined>(editing ? editing.vehicleId : initial.vehicleId ?? undefined);
  const [driverId, setDriverId] = useState<string>(editing ? editing.driverId ?? '' : rules.vehicle(initial.vehicleId)?.driverId ?? '');
  const [lostDriver, setLostDriver] = useState('');
  const [keep, setKeep] = useState(false);
  const [errors, setErrors] = useState<{ when?: string; what?: string; vehicle?: string }>({});
  const [busy, setBusy] = useState(false);

  const repeating = repeat === 'daily' || repeat === 'weekly';
  const showUntil = repeat !== 'once' && !(series && !cancelled) && !(repeating && forever);
  const end = repeat === 'multi' && until > date ? until : date;
  const ignore = editing?.id ?? null;
  const vehicleWhy = (id: string) => rules.vehicleBusyRange(id, date, end, from, to, ignore);
  const pickedVehicle = rules.vehicle(pick);
  const driverBlock = (id: string) => rules.driverBlockedRange(id, date, end) || rules.noLicense(id, pickedVehicle);
  const horizon = addDays(todayKey(), SERIES_AHEAD_DAYS);
  const dates = repeating ? repeatDates(repeat, date, forever ? (horizon > date ? horizon : date) : until) : [];
  // אפשר לשבץ כל רכב; מה שלא תקין נשאר כהערה מתחת
  const pickWhy = pick ? vehicleWhy(pick) : null;
  // נהג שלא יכול לנהוג יוצא, וחוזר כשהוא שוב יכול
  useEffect(() => {
    if (driverId && driverBlock(driverId)) {
      setLostDriver(driverId);
      setDriverId('');
    } else if (!driverId && lostDriver && !driverBlock(lostDriver)) {
      setDriverId(lostDriver);
      setLostDriver('');
    }
  }, [date, end, pick, driverId]); // eslint-disable-line react-hooks/exhaustive-deps

  const busyWith = driverId && from && to ? rules.driverBusyRange(driverId, date, end, from, to, ignore) : null;
  let soft: string | null = null;
  if (driverId && from && to && end === date && to > from) {
    const draft: Trip = { id: '-', date, end: null, from, to, title, client, phone: phoneNo, pickup: norm(pickup), dest: norm(dest), vehicleId: pick ?? null, driverId, seriesId: null, status: 'active' };
    soft = rules.hoursIssue(driverId, date, ignore, draft) || rules.hoursIssue(driverId, addDays(date, 1), ignore, draft);
    const gap = rules.gaps(rules.driverDay(driverId, date, ignore, draft)).find((g) => g.prev === draft || g.next === draft);
    if (!soft && gap) soft = t('schedule.form.gapReason', { gap: gap.text });
  }
  const name = rules.driverName(driverId);
  const note = busyWith
    ? t('schedule.form.driverBusy', { name, when: [busyWith.end ? t('schedule.severalDays') : timeRange(busyWith.from, busyWith.to), rules.vehicle(busyWith.vehicleId)?.plate].filter(Boolean).join(' · ') })
    : soft ? t('schedule.form.driverSoft', { name, reason: soft })
    : !driverId && lostDriver ? t('schedule.form.lostDriver', { name: rules.driverName(lostDriver), reason: driverBlock(lostDriver) ?? '' })
    : '';

  const clientValue = norm(client);
  const knownClient = !clientValue || data.clients.some((c) => c.name === clientValue);
  const guess = knownClient ? null : data.clients.find((c) => clientValue.split(' ').every((w) => c.name.includes(w)));

  const changeRepeat = (r: Repeat) => {
    setRepeat(r);
    if (r === 'multi') setUntil(addDays(date, 2));
    else if (r !== 'once') setUntil(addDays(date, 27));
    setErrors((e) => ({ ...e, when: undefined }));
  };
  const fillSaved = (s: SavedTrip) => {
    setFrom(s.from); setTo(s.to); setTitle(s.title); setClient(s.client); setPickup(s.pickup); setDest(s.dest);
    setErrors({});
  };

  let repeatHint = '';
  if (repeat === 'multi' && until > date) repeatHint = t('schedule.form.multiHint', { n: diffDays(until, date) + 1, start: `${shortDate(date)} ${from}`.trim(), end: `${shortDate(until)} ${to}`.trim() });
  else if (repeating && forever) repeatHint = t('schedule.form.foreverHint');
  else if (repeating && dates.length) repeatHint = t('schedule.form.seriesHint', { trips: count(dates.length, 'schedule.trips') });
  else if (seriesRow && !seriesRow.until && !cancelled) repeatHint = t('schedule.form.foreverScopeHint');
  else if (series && !cancelled) repeatHint = t('schedule.form.scopeHint');

  const save = async () => {
    const r: Repeat = series ? 'once' : repeat;
    const next: typeof errors = {};
    if (!date || !from || !to) next.when = t('schedule.form.whenMissing');
    else if (r === 'multi' && !(until > date)) next.when = t('schedule.form.lastDayMissing');
    else if (r !== 'multi' && to <= from) next.when = t('schedule.form.endBeforeStart');
    else if ((r === 'daily' || r === 'weekly') && !dates.length) next.when = forever ? t('schedule.form.endBeforeStart') : t('schedule.form.untilMissing');
    if (!norm(title)) next.what = t('schedule.form.titleMissing');
    if (pick === undefined) next.vehicle = t('schedule.form.vehicleMissing');
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    const fields = {
      from, to, title: norm(title), client: clientValue, phone: norm(phoneNo), pickup: norm(pickup), dest: norm(dest), vehicleId: pick ?? null, driverId: driverId || null,
    };
    try {
      if (clientValue && !knownClient) {
        const c = { id: newId(), name: clientValue };
        await addClient(companyId, c).then(() => onClientAdded(c)).catch(() => undefined);
      }
      if (keep) {
        const s: SavedTrip = { id: newId(), name: fields.title + (fields.client ? ` – ${fields.client}` : ''), title: fields.title, client: fields.client, from, to, pickup: fields.pickup, dest: fields.dest };
        await addSavedTrip(companyId, s).then(() => onSavedTripAdded(s)).catch(() => undefined);
      }

      let changed: Trip[] = [];
      let created: string[] = [];
      let before: Trip[] = [];
      let stopOnUndo: Series | null = null;
      let message = cancelled ? t('schedule.form.restored') : pick ? t('schedule.form.saved') : t('schedule.form.savedWaiting');
      let firstId: string;
      if (editing) {
        const self: Trip = { ...editing, ...fields, date, end: r === 'multi' ? until : null, status: 'active' };
        changed = [self];
        before = [editing];
        firstId = self.id;
        if (editing.seriesId && scope === 'all') {
          let moved = 0;
          const later = data.trips.filter((x) => x.seriesId === editing.seriesId && x.date > editing.date && x.status === 'active');
          later.forEach((x) => {
            const c: Trip = { ...x, ...fields };
            if (c.vehicleId && rules.vehicleClash(c.vehicleId, x.date, from, to, x.id)) { c.vehicleId = null; moved++; }
            if (c.driverId && (rules.driverBlocked(c.driverId, x.date) || rules.driverBusy(c.driverId, x.date, from, to, x.id))) c.driverId = null;
            changed.push(c);
          });
          before = [editing, ...later];
          // A series with no end: the trips made from now on follow the change too.
          if (seriesRow) {
            const updated: Series = { ...seriesRow, ...fields };
            try {
              await saveSeries(companyId, updated);
            } catch (error) {
              setErrors({ when: errorMessage(error, t('schedule.saveFailed')) });
              return;
            }
            onSeriesChanged(updated);
          }
          message = t('schedule.form.seriesUpdated', { trips: count(later.length, 'schedule.trips') }) + (moved ? t('schedule.movedWaiting', { n: moved }) : '');
        }
      } else if (r === 'daily' || r === 'weekly') {
        const seriesId = newId();
        let moved = 0;
        if (forever) {
          const row: Series = { id: seriesId, repeat: r, start: date, until: null, generatedUntil: dates[dates.length - 1], ...fields };
          try {
            await saveSeries(companyId, row);
          } catch (error) {
            setErrors({ when: errorMessage(error, t('schedule.saveFailed')) });
            return;
          }
          onSeriesChanged(row);
          // Undoing ends the series too, so no more trips are made for it.
          stopOnUndo = { ...row, until: addDays(date, -1) };
        }
        // נסיעה קבועה: רכב שכבר יוצא באותן שעות = לרשימת המחכים, נהג שלא יכול = בלי נהג
        changed = dates.map((d) => {
          const c: Trip = { id: newId(), date: d, end: null, ...fields, seriesId, status: 'active' };
          if (c.vehicleId && rules.vehicleClash(c.vehicleId, d, from, to, null)) { c.vehicleId = null; moved++; }
          if (c.driverId && (rules.driverBlocked(c.driverId, d) || rules.noLicense(c.driverId, rules.vehicle(c.vehicleId)) || rules.driverBusy(c.driverId, d, from, to, null))) c.driverId = null;
          return c;
        });
        created = changed.map((x) => x.id);
        firstId = changed[0].id;
        message = (forever
          ? t('schedule.form.foreverCreated', { day: r === 'weekly' ? dayName(date) : t('schedule.form.everyDay'), time: from })
          : t('schedule.form.seriesCreated', { trips: count(changed.length, 'schedule.recurringTrips'), date: shortDate(until) })) + (moved ? t('schedule.movedWaiting', { n: moved }) : '');
      } else {
        const c: Trip = { id: newId(), date, end: r === 'multi' ? until : null, ...fields, seriesId: null, status: 'active' };
        changed = [c];
        created = [c.id];
        firstId = c.id;
      }
      const undo = undoTrips(before, created);
      const stop = stopOnUndo;
      if (await applyTrips(changed, stop ? withSeries(undo, stop) : undo, message)) onSaved(date, firstId);
    } finally {
      setBusy(false);
    }
  };

  const cancelTrip = async () => {
    if (!editing) return;
    setBusy(true);
    const later = editing.seriesId && scope === 'all'
      ? data.trips.filter((x) => x.seriesId === editing.seriesId && x.date > editing.date && x.status === 'active')
      : [];
    const before = [editing, ...later];
    const changed = before.map((x) => ({ ...x, status: 'cancelled' as const }));
    const message = later.length || (seriesRow && scope === 'all') ? t('schedule.form.cancelledMany', { trips: count(later.length, 'schedule.trips') }) : t('schedule.form.cancelledOne');
    const stopped = await stopSeries();
    if (!stopped) { setBusy(false); return; }
    if (await applyTrips(changed, withSeries(undoTrips(before, []), stopped), message)) onClose();
    setBusy(false);
  };

  // ביטול/מחיקה של "כל הבאות" בסדרה בלי סוף: לא יוצרים עוד נסיעות אחרי היום הזה
  // Returns the series as it was (to undo), 'none' when there is nothing to stop, or null when saving failed.
  const stopSeries = async (): Promise<Series | 'none' | null> => {
    if (!editing || !seriesRow || scope !== 'all') return 'none';
    const stopped: Series = { ...seriesRow, until: addDays(editing.date, -1) };
    try {
      await saveSeries(companyId, stopped);
      onSeriesChanged(stopped);
      return seriesRow;
    } catch (error) {
      setErrors((e) => ({ ...e, when: errorMessage(error, t('schedule.saveFailed')) }));
      return null;
    }
  };
  // Undoing also lets the series go on again.
  const withSeries = (undo: Undo, previous: Series | 'none'): Undo => async () => {
    await undo();
    if (previous === 'none') return;
    await saveSeries(companyId, previous).then(() => onSeriesChanged(previous)).catch(() => undefined);
  };

  // מחיקה מהיומן (אפשר לבטל מיד מההודעה למטה)
  const deleteTrip = async () => {
    if (!editing) return;
    setBusy(true);
    const later = editing.seriesId && scope === 'all'
      ? data.trips.filter((x) => x.seriesId === editing.seriesId && x.date > editing.date)
      : [];
    const gone = [editing, ...later];
    const stopped = await stopSeries();
    if (!stopped) { setBusy(false); return; }
    const message = later.length ? t('schedule.form.deletedMany', { trips: count(gone.length, 'schedule.trips') }) : t('schedule.form.deletedOne');
    if (await removeTrips(gone, message, stopped === 'none' ? null : withSeries(async () => undefined, stopped))) onClose();
    setBusy(false);
  };

  const heading = cancelled ? t('schedule.form.titleCancelled') : editing ? (editing.vehicleId ? t('schedule.form.titleEdit') : t('schedule.form.titleAssign')) : t('schedule.form.titleNew');
  return (
    <Dialog title={heading} onClose={onClose}>
      {data.saved.length > 0 && (
        <>
          <div className="q">{t('schedule.form.savedQ')} <small>{t('schedule.form.savedHint')}</small></div>
          <div className="chips">{data.saved.map((s) => <button type="button" key={s.id} onClick={() => fillSaved(s)}>{s.name}</button>)}</div>
        </>
      )}

      <div className="q">{t('schedule.form.when')}</div>
      <div className="row">
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setErrors((x) => ({ ...x, when: undefined })); }} aria-label={t('schedule.form.date')} />
        {t('schedule.form.fromTime')} <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('schedule.form.fromTime')} />
        {t('schedule.form.toTime')} <input type="time" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('schedule.form.toTime')} />
      </div>
      {!series && (
        <div style={{ marginTop: 10 }}>
          <Seg<Repeat>
            name="ws-repeat"
            value={repeat}
            onChange={changeRepeat}
            options={[
              { value: 'once', label: t('schedule.form.once') },
              { value: 'daily', label: t('schedule.form.daily'), disabled: !!editing },
              { value: 'weekly', label: date ? t('schedule.form.weeklyOn', { day: dayName(date) }) : t('schedule.form.weekly'), disabled: !!editing },
              { value: 'multi', label: t('schedule.form.multi') },
            ]}
          />
        </div>
      )}
      {repeating && !editing && (
        <label className="check"><input type="checkbox" checked={forever} onChange={(e) => setForever(e.target.checked)} /> {t('schedule.form.forever')}</label>
      )}
      {showUntil && (
        <div className="dates">
          <label>{repeat === 'multi' ? t('schedule.form.lastDay') : t('schedule.form.repeatUntil')}<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
        </div>
      )}
      {series && !cancelled && (
        <div style={{ marginTop: 10 }}>
          <Seg<'one' | 'all'> name="ws-scope" value={scope} onChange={setScope} options={[{ value: 'one', label: t('schedule.form.scopeOne') }, { value: 'all', label: t('schedule.form.scopeAll') }]} />
        </div>
      )}
      <div className="hint">{repeatHint}</div>
      <div className="err">{errors.when}</div>

      <div className="q">{t('schedule.form.what')}</div>
      <div className="row">
        <input value={title} onChange={(e) => { setTitle(e.target.value); setErrors((x) => ({ ...x, what: undefined })); }} placeholder={t('schedule.form.titlePlaceholder')} style={{ flex: '2 1 220px' }} aria-label={t('schedule.form.titleLabel')} />
        <input value={client} onChange={(e) => setClient(e.target.value)} list="ws-clients" placeholder={t('schedule.form.clientPlaceholder')} style={{ flex: '1 1 160px' }} aria-label={t('schedule.form.clientLabel')} autoComplete="off" />
        <datalist id="ws-clients">{data.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        <input value={phoneNo} onChange={(e) => setPhoneNo(e.target.value)} type="tel" inputMode="tel" dir="ltr" maxLength={20} placeholder={t('schedule.form.phonePlaceholder')} style={{ flex: '1 1 140px' }} aria-label={t('schedule.form.phoneLabel')} autoComplete="off" />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input value={pickup} onChange={(e) => setPickup(e.target.value)} list="ws-cities" placeholder={t('schedule.form.pickup')} style={{ flex: '1 1 150px' }} aria-label={t('schedule.form.pickup')} autoComplete="off" />
        <input value={dest} onChange={(e) => setDest(e.target.value)} list="ws-cities" placeholder={t('schedule.form.dest')} style={{ flex: '1 1 150px' }} aria-label={t('schedule.form.dest')} autoComplete="off" />
        <datalist id="ws-cities">{Object.keys(CITIES).map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div className="err">{errors.what}</div>
      <div className="hint">
        {guess ? <>{t('schedule.form.didYouMean')}<button type="button" className="link" onClick={() => setClient(guess.name)}>{guess.name}</button>?</> : !knownClient ? t('schedule.form.newClient') : null}
      </div>

      <div className="q">{t('schedule.form.vehicleQ')} <small>{t('schedule.form.vehicleHint')}</small></div>
      <div className="vpick">
        {data.vehicles.map((v) => {
          const why = vehicleWhy(v.id);
          const soon = rules.vehicleSoon(v, date);
          const primary = rules.driverBlockedRange(v.driverId, date, end) || rules.noLicense(v.driverId, v);
          return (
            <button
              type="button"
              key={v.id}
              className={pick === v.id ? 'sel' : ''}
              aria-pressed={pick === v.id}
              onClick={() => { setPick(v.id); setDriverId(v.driverId ?? ''); setLostDriver(''); setErrors((x) => ({ ...x, vehicle: undefined })); }}
            >
              {vehicleLabel(v)}
              {why ? <small className="bad">{why}</small> : soon ? <small className="warn">{soon}</small> : primary ? <small className="warn">{t('schedule.form.primaryIssue', { reason: primary })}</small> : <small className="ok">{t('schedule.form.free')}</small>}
            </button>
          );
        })}
        <button type="button" className={`wide${pick === null ? ' sel' : ''}`} aria-pressed={pick === null} onClick={() => { setPick(null); setErrors((x) => ({ ...x, vehicle: undefined })); }}>
          {t('schedule.form.waitingOption')}
        </button>
      </div>
      <div className="err">{errors.vehicle}</div>
      {pickWhy && <div className="hint warn">{t('schedule.form.vehicleWarn', { plate: rules.vehicle(pick)?.plate ?? '', reason: pickWhy })}</div>}

      <div className="q">{t('schedule.form.driverQ')} <small>{t('schedule.form.driverHint')}</small></div>
      <select style={{ width: '100%' }} value={driverId} aria-label={t('schedule.form.driverLabel')} onChange={(e) => { setDriverId(e.target.value); setLostDriver(''); }}>
        <option value="">{t('schedule.form.noDriver')}</option>
        {data.drivers.map((d) => {
          const b = driverBlock(d.id);
          return <option key={d.id} value={d.id} disabled={!!b}>{d.name}{b ? ` – ${b}` : ''}</option>;
        })}
      </select>
      <div className={`hint${note ? ' warn' : ''}`}>{note}</div>

      {!editing && (
        <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> {t('schedule.form.keepSaved')}</label>
      )}

      <div className="dlg-foot">
        <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
          {cancelled ? t('schedule.form.restore') : busyWith || soft || pickWhy ? t('schedule.form.saveAnyway') : t('common.save')}
        </button>
        {editing && !cancelled && <button type="button" className="danger" disabled={busy} onClick={() => void cancelTrip()}>{t('schedule.form.cancelTrip')}</button>}
        {editing && <button type="button" className="danger" disabled={busy} onClick={() => void deleteTrip()}>{t('schedule.form.deleteTrip')}</button>}
        <button type="button" onClick={onClose}>{t('common.close')}</button>
      </div>
    </Dialog>
  );
}

/* ---------- שכפול יום / שבוע ---------- */
function DuplicateDialog({ data, rules, sel, onClose, applyTrips, undoTrips, onDone }: {
  data: ScheduleData; rules: Rules; sel: string; onClose: () => void; applyTrips: ApplyTrips; undoTrips: UndoTrips; onDone: (k: string) => void;
}) {
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [target, setTarget] = useState(addDays(sel, 7));
  const [busy, setBusy] = useState(false);
  const ws = weekStart(sel);
  const week = mode === 'week';
  const base = week ? ws : sel;
  const to = target ? (week ? weekStart(target) : target) : '';
  const diff = to ? diffDays(to, base) : 0;
  const sources = week ? [0, 1, 2, 3, 4, 5].map((i) => addDays(ws, i)) : [sel];
  // רק נסיעות שמתחילות ביום הזה
  const items = to ? sources.flatMap((k) => data.trips.filter((x) => x.date === k && x.status === 'active').map((x) => ({ trip: x, k: addDays(k, diff) }))) : [];
  const off = items.filter((i) => isOff(i.k)).length;
  const n = items.length - off;

  let preview = '';
  let warn = false;
  if (!to) preview = t('schedule.dup.chooseDate');
  else if (diff === 0) { preview = week ? t('schedule.dup.sameWeek') : t('schedule.dup.sameDay'); warn = true; }
  else {
    preview = (items.length
      ? t('schedule.dup.willCopy', { trips: count(n, 'schedule.trips'), target: week ? t('schedule.dup.targetWeek', { range: timeRange(shortDate(to), shortDate(addDays(to, 5))) }) : niceDate(to) })
      : t('schedule.dup.nothing'))
      + (off ? ` ${count(off, 'schedule.dup.fallsOff')}` : '') + (n ? ` ${t('schedule.dup.busyNote')}` : '');
  }

  const go = async () => {
    if (!to || diff === 0 || !n) return;
    setBusy(true);
    let moved = 0;
    const created = items.filter((i) => !isOff(i.k)).map(({ trip, k }) => {
      const c: Trip = { ...trip, id: newId(), date: k, end: trip.end ? addDays(trip.end, diff) : null, seriesId: null, status: 'active' };
      if (c.vehicleId && rules.vehicleBusyRange(c.vehicleId, k, lastDay(c), c.from, c.to, null)) { c.vehicleId = null; moved++; }
      if (rules.driverBlockedRange(c.driverId, k, lastDay(c)) || rules.noLicense(c.driverId, rules.vehicle(c.vehicleId)) || rules.driverBusyRange(c.driverId, k, lastDay(c), c.from, c.to, null)) c.driverId = null;
      return c;
    });
    const message = t('schedule.dup.done', { trips: count(created.length, 'schedule.trips') }) + (moved ? t('schedule.movedWaiting', { n: moved }) : '') + (off ? t('schedule.dup.offNotCopied', { n: off }) : '');
    if (await applyTrips(created, undoTrips([], created.map((x) => x.id)), message)) onDone(to);
    setBusy(false);
  };

  return (
    <Dialog title={t('schedule.dup.title')} onClose={onClose}>
      <div className="q">{t('schedule.dup.what')}</div>
      <Seg<'day' | 'week'>
        name="ws-dup"
        value={mode}
        onChange={(m) => { setMode(m); setTarget(m === 'week' ? addDays(ws, 7) : addDays(sel, 7)); }}
        options={[
          { value: 'day', label: t('schedule.dup.dayOnly', { date: niceDate(sel) }) },
          { value: 'week', label: t('schedule.dup.week', { range: timeRange(shortDate(ws), shortDate(addDays(ws, 5))) }) },
        ]}
      />
      <div className="q">{week ? t('schedule.dup.toWeek') : t('schedule.dup.toDay')}</div>
      <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t('schedule.dup.target')} />
      <div className={`hint${warn ? ' warn' : ''}`}>{preview}</div>
      <div className="dlg-foot">
        <button type="button" className="primary" disabled={busy || !to || diff === 0 || !n} onClick={() => void go()}>{t('schedule.dup.go')}</button>
        <button type="button" onClick={onClose}>{t('common.close')}</button>
      </div>
    </Dialog>
  );
}

/* ---------- נהג לא זמין / רכב במוסך ---------- */
function BlockDialog({ kind, data, sel, today, companyId, onClose, onChange, onError, onSaved }: {
  kind: 'driver' | 'vehicle'; data: ScheduleData; sel: string; today: string; companyId: string; onClose: () => void;
  onChange: (blocks: Block[], message: string, undo: Undo | null) => void; onError: (error: unknown) => void; onSaved: () => void;
}) {
  const driver = kind === 'driver';
  const reasons = driver ? ['vacation', 'sick', 'reserve', 'other'] : ['service', 'repair', 'test', 'other'];
  const [owner, setOwner] = useState('');
  const [len, setLen] = useState<'1' | '3' | '7' | '0'>('1');
  const [from, setFrom] = useState(sel);
  const [to, setTo] = useState(sel);
  const [reason, setReason] = useState(reasons[0]);
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const blocksRef = useRef(data.blocks);
  blocksRef.current = data.blocks;

  const nameOf = (b: Pick<Block, 'ownerId'>) => {
    if (driver) return data.drivers.find((d) => d.id === b.ownerId)?.name ?? '';
    const v = data.vehicles.find((x) => x.id === b.ownerId);
    return v ? vehicleLabel(v) : '';
  };
  const days = from && to && to >= from ? diffDays(to, from) + 1 : 0;
  const sum = days === 1 ? t('schedule.block.sumOne', { date: shortDate(from) }) : days ? t('schedule.block.sumMany', { n: days, range: timeRange(shortDate(from), shortDate(to)) }) : '';
  const reasonText = (r: string) => t(`schedule.block.${kind}Reason.${r}`);

  const remove = async (b: Block) => {
    try {
      await deleteBlock(b.id);
      onChange(blocksRef.current.filter((x) => x.id !== b.id), t('schedule.block.removed'), async () => {
        try {
          await saveBlock(companyId, b);
          onChange([...blocksRef.current, b], t('schedule.undone'), null);
        } catch (e) { onError(e); }
      });
    } catch (e) { onError(e); }
  };
  const save = async () => {
    if (!owner) return setError(driver ? t('schedule.block.chooseDriver') : t('schedule.block.chooseVehicle'));
    if (!from || !to) return setError(t('schedule.block.chooseDates'));
    if (to < from) return setError(t('schedule.block.datesOrder'));
    setBusy(true);
    const b: Block = { id: newId(), ownerType: kind, ownerId: owner, from, to, reason: reasonText(reason), details: details.trim() };
    try {
      await saveBlock(companyId, b);
      const hit = data.trips.filter((x) => (driver ? x.driverId : x.vehicleId) === owner && x.status === 'active' && x.date <= to && lastDay(x) >= from).length;
      const message = (driver
        ? t('schedule.block.savedDriver', { name: nameOf(b), reason: b.reason, dates: datesRange(from, to) })
        : t('schedule.block.savedVehicle', { plate: data.vehicles.find((v) => v.id === owner)?.plate ?? '', dates: datesRange(from, to) }))
        + (hit ? ` · ${count(hit, 'schedule.block.marked')}` : '');
      onChange([...data.blocks, b], message, async () => {
        try {
          await deleteBlock(b.id);
          onChange(blocksRef.current.filter((x) => x.id !== b.id), t('schedule.undone'), null);
        } catch (e) { onError(e); }
      });
      onSaved();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const marked = data.blocks.filter((b) => b.ownerType === kind && b.to >= today);
  const setRange = (f: string, n: '1' | '3' | '7' | '0') => {
    setFrom(f);
    if (n !== '0' && f) setTo(addDays(f, Number(n) - 1));
    else if (to < f) setTo(f);
  };
  return (
    <Dialog title={driver ? t('schedule.driverAway') : t('schedule.vehicleGarage')} onClose={onClose}>
      <div className="q">{driver ? t('schedule.block.whichDriver') : t('schedule.block.whichVehicle')}</div>
      <select style={{ width: '100%' }} value={owner} onChange={(e) => { setOwner(e.target.value); setError(''); }} aria-label={driver ? t('schedule.form.driverLabel') : t('schedule.block.vehicleLabel')}>
        <option value="">{driver ? t('schedule.block.chooseDriver') : t('schedule.block.chooseVehicle')}</option>
        {driver
          ? data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)
          : data.vehicles.map((v) => {
            const off = v.status === 'maintenance' || v.status === 'disabled';
            return <option key={v.id} value={v.id} disabled={off}>{vehicleLabel(v)}{off ? ` – ${t(`schedule.vehicleStatus.${v.status}`)}` : ''}</option>;
          })}
      </select>
      <div className="q">{t('schedule.block.howLong')}</div>
      <Seg<'1' | '3' | '7' | '0'>
        name={`ws-len-${kind}`}
        value={len}
        onChange={(n) => { setLen(n); setRange(from, n); }}
        options={[
          { value: '1', label: t('schedule.block.oneDay') }, { value: '3', label: t('schedule.block.threeDays') },
          { value: '7', label: t('schedule.block.week') }, { value: '0', label: t('schedule.block.someDays') },
        ]}
      />
      <div className="dates">
        <label>{t('schedule.block.fromDate')}<input type="date" value={from} onChange={(e) => setRange(e.target.value, len)} /></label>
        <label>{t('schedule.block.toDate')}<input type="date" value={to} onChange={(e) => { setTo(e.target.value); setLen('0'); }} /></label>
      </div>
      <div className="tnum" style={{ marginTop: 8, color: 'var(--blue)', fontFamily: 'var(--f-b)' }}>{sum}</div>
      <div className="q">{t('schedule.block.why')}</div>
      <Seg<string> name={`ws-why-${kind}`} value={reason} onChange={setReason} options={reasons.map((r) => ({ value: r, label: t(`schedule.block.${kind}ReasonShort.${r}`) }))} />
      <div className="q">{t('schedule.block.details')}</div>
      <textarea style={{ width: '100%', minHeight: 72, resize: 'vertical' }} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t(`schedule.block.${kind}DetailsHint`)} aria-label={t('schedule.block.details')} />
      <div className="err">{error}</div>
      <div className="dlg-foot">
        <button type="button" className="primary" disabled={busy} onClick={() => void save()}>{t('common.save')}</button>
        <button type="button" onClick={onClose}>{t('common.close')}</button>
      </div>
      {marked.length > 0 && (
        <div className="marked">
          <div className="q">{t('schedule.block.alreadyMarked')}</div>
          {marked.map((b) => (
            <div className="witem" key={b.id}>
              <div><b>{nameOf(b)}</b> · {b.reason}<div className="vsub tnum">{datesRange(b.from, b.to)}</div>{b.details && <div className="vsub" style={{ whiteSpace: 'pre-wrap' }}>{b.details}</div>}</div>
              <button type="button" onClick={() => void remove(b)}>{t('common.remove')}</button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/* ---------- הדפסת סידור ---------- */
function PrintDialog({ rules, sel, today, onClose, onPrint }: {
  rules: Rules; sel: string; today: string; onClose: () => void; onPrint: (day: string, how: 'drivers' | 'table') => void;
}) {
  // ברירת המחדל: יום העבודה הבא
  const next = nextWorkDay(today);
  const [day, setDay] = useState(next);
  const [how, setHow] = useState<'drivers' | 'table'>('drivers');
  const trips = rules.dayTrips(day).filter((x) => x.status === 'active');
  const drivers = new Set(trips.filter((x) => x.vehicleId).map((x) => x.driverId ?? '')).size;
  const waiting = trips.filter((x) => !x.vehicleId).length;
  const open = rules.issues(day).length;
  const preview = !trips.length ? t('schedule.noTrips')
    : (how === 'drivers' ? t('schedule.print.perDriverPreview', { pages: count(drivers, 'schedule.print.pages') }) : t('schedule.print.tablePreview', { trips: count(trips.length, 'schedule.trips') }))
      + (open ? t('schedule.print.openWarn', { things: count(open, 'schedule.print.openThings') }) : '')
      + (waiting ? ` · ${count(waiting, 'schedule.print.waiting')}` : '');
  return (
    <Dialog title={t('schedule.print.title')} onClose={onClose}>
      <div className="q">{t('schedule.print.whichDay')}</div>
      <Seg<string>
        name="ws-print-day"
        value={day}
        onChange={setDay}
        options={[
          { value: next, label: next === addDays(today, 1) ? t('schedule.print.tomorrow', { date: niceDate(next) }) : t('schedule.print.nextWork', { date: niceDate(next) }) },
          { value: sel, label: t('schedule.print.selected', { date: niceDate(sel) }), hidden: sel === next },
        ]}
      />
      <div className="q">{t('schedule.print.how')}</div>
      <Seg<'drivers' | 'table'> name="ws-print-how" value={how} onChange={setHow} options={[{ value: 'drivers', label: t('schedule.print.perDriver') }, { value: 'table', label: t('schedule.print.table') }]} />
      <div className={`hint${open || waiting ? ' warn' : ''}`}>{preview}</div>
      <div className="hint">{t('schedule.print.pdfHint')}</div>
      <div className="dlg-foot">
        <button type="button" className="primary" onClick={() => onPrint(day, how)}>{t('schedule.print.go')}</button>
        <button type="button" onClick={onClose}>{t('common.close')}</button>
      </div>
    </Dialog>
  );
}

// הדפים להדפסה: מוצגים רק בהדפסה, ואז נעלמים
function PrintSheets({ data, rules, day: k, how, onDone }: { data: ScheduleData; rules: Rules; day: string; how: 'drivers' | 'table'; onDone: () => void }) {
  const { company } = useCompany();
  useEffect(() => {
    const done = () => onDone();
    window.addEventListener('afterprint', done);
    const timer = setTimeout(() => window.print(), 50);
    return () => { clearTimeout(timer); window.removeEventListener('afterprint', done); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const trips = rules.dayTrips(k).filter((x) => x.status === 'active').sort(byStart(k));
  const garage = data.vehicles.filter((v) => rules.garageOf(v.id, k)).map((v) => `${v.plate} (${rules.garageOf(v.id, k)?.reason})`);
  const away = data.blocks.filter((b) => b.ownerType === 'driver' && b.from <= k && k <= b.to).map((b) => `${rules.driverName(b.ownerId)} (${b.reason})`);
  const printedAt = new Date().toLocaleString(getLocale(), { dateStyle: 'short', timeStyle: 'short' });

  const head = (withDriver: boolean) => (
    <tr>
      <th className="c-time">{t('schedule.print.colTime')}</th>
      <th>{t('schedule.print.colTrip')}</th>
      <th>{t('schedule.print.colRoute')}</th>
      <th>{t('schedule.print.colVehicle')}</th>
      {withDriver && <th>{t('schedule.print.colDriver')}</th>}
      <th>{t('schedule.print.colClient')}</th>
    </tr>
  );
  const line = (x: Trip, withDriver: boolean) => {
    const v = rules.vehicle(x.vehicleId);
    const [from, to] = span(x, k);
    return (
      <tr key={x.id} className={v ? '' : 'wait'}>
        <td className="c-time"><b>{from === '00:00' ? '—' : from}</b><span>{to === '24:00' ? '—' : to}</span>{x.end && <em>{tripDayOf(x, k)}</em>}</td>
        <td><b>{x.title}</b></td>
        <td>{x.pickup || x.dest ? <>{x.pickup || '—'}<span className="arrow">←</span>{x.dest || '—'}</> : '—'}</td>
        <td>{v ? <><span className="plate">{v.plate}</span><small>{t(`vehicle.type.${v.type}`)}</small></> : <span className="tag">{t('schedule.waitingVehicle')}</span>}</td>
        {withDriver && <td>{rules.driverName(x.driverId) || '—'}</td>}
        <td>{x.client || '—'}{x.phone && <small dir="ltr">{x.phone}</small>}</td>
      </tr>
    );
  };
  const sheetHead = (title: string, sub: string, list: Trip[]) => {
    const vehicles = new Set(list.map((x) => x.vehicleId).filter(Boolean)).size;
    const first = list[0] ? span(list[0], k)[0] : '';
    const last = list.reduce((m, x) => (span(x, k)[1] > m ? span(x, k)[1] : m), '');
    return (
      <header className="p-head">
        <div>
          <div className="p-kicker">{company?.name ?? ''}</div>
          <h2>{title}</h2>
          <div className="p-sub">{sub}</div>
        </div>
        <div className="p-stats">
          <div><b>{list.length}</b><span>{t('schedule.print.statTrips')}</span></div>
          <div><b>{vehicles}</b><span>{t('schedule.print.statVehicles')}</span></div>
          {first && <div><b className="tnum">{timeRange(first, last)}</b><span>{t('schedule.print.statHours')}</span></div>}
        </div>
      </header>
    );
  };
  const foot = (signature: boolean) => (
    <footer className="p-foot">
      {(garage.length > 0 || away.length > 0) && (
        <div className="p-note">
          {garage.length > 0 && <div><b>{t('schedule.print.noteGarage')}</b> {garage.join(' · ')}</div>}
          {away.length > 0 && <div><b>{t('schedule.print.noteAway')}</b> {away.join(' · ')}</div>}
        </div>
      )}
      {signature && <div className="p-sign"><span>{t('schedule.print.driverSignature')}</span><span>{t('schedule.print.signDate')}</span></div>}
      <div className="p-printed">{t('schedule.print.printedAt', { when: printedAt })}</div>
    </footer>
  );

  let body: React.ReactNode;
  if (!trips.length) body = <div className="sheet">{sheetHead(t('schedule.title'), niceDate(k), [])}<p className="p-empty">{t('schedule.noTrips')}</p></div>;
  else if (how === 'table') {
    body = (
      <div className="sheet">
        {sheetHead(t('schedule.title'), niceDate(k), trips)}
        <table><thead>{head(true)}</thead><tbody>{trips.map((x) => line(x, true))}</tbody></table>
        {foot(false)}
      </div>
    );
  } else {
    const by = new Map<string, Trip[]>();
    trips.filter((x) => x.vehicleId).forEach((x) => {
      const n = rules.driverName(x.driverId) || t('schedule.print.noDriver');
      by.set(n, [...(by.get(n) ?? []), x]);
    });
    body = [...by].map(([n, list]) => (
      <div className="sheet" key={n}>
        {sheetHead(n, `${t('schedule.print.driverSheet')} · ${niceDate(k)}`, list)}
        <table><thead>{head(false)}</thead><tbody>{list.map((x) => line(x, false))}</tbody></table>
        {foot(true)}
      </div>
    ));
  }
  return createPortal(<div className="ws-print">{body}</div>, document.body);
}

/* ---------- דוח לקוחות / נסיעות שמורות ---------- */
function ReportDialog({ data, view, onClose }: { data: ScheduleData; view: { y: number; m: number }; onClose: () => void }) {
  const prefix = monthStart(view.y, view.m).slice(0, 7);
  const byClient = new Map<string, number>();
  data.trips.filter((x) => x.date.startsWith(prefix) && x.vehicleId && x.status === 'active').forEach((x) => {
    const c = x.client || t('schedule.report.noClient');
    byClient.set(c, (byClient.get(c) ?? 0) + 1);
  });
  const rows = [...byClient].sort((a, b) => b[1] - a[1]);
  return (
    <Dialog title={t('schedule.report.title', { month: `${monthName(view.m)} ${view.y}` })} onClose={onClose}>
      {rows.length ? (
        <table>
          <thead><tr><th>{t('schedule.print.colClient')}</th><th>{t('schedule.report.trips')}</th></tr></thead>
          <tbody>{rows.map(([c, n]) => <tr key={c}><td>{c}</td><td>{n}</td></tr>)}</tbody>
        </table>
      ) : <p className="vsub">{t('schedule.report.empty')}</p>}
    </Dialog>
  );
}

function SavedDialog({ saved, onClose, onRemove }: { saved: SavedTrip[]; onClose: () => void; onRemove: (s: SavedTrip) => void }) {
  return (
    <Dialog title={t('schedule.savedTrips')} onClose={onClose}>
      {saved.length ? (
        <table>
          <thead><tr><th>{t('schedule.saved.name')}</th><th>{t('schedule.saved.hours')}</th><th>{t('schedule.print.colClient')}</th><th /></tr></thead>
          <tbody>
            {saved.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td><td>{timeRange(s.from, s.to)}</td><td>{s.client}</td>
                <td><button type="button" onClick={() => onRemove(s)}>{t('common.remove')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="vsub">{t('schedule.saved.hint')}</p>
    </Dialog>
  );
}
