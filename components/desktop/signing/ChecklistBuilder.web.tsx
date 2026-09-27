import React, { useLayoutEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  CHECKLIST_LIMITS,
  REPEAT_OPTIONS,
  STATUS_META,
  filledItems,
  newItemId,
  repeatLabel,
  statusOptions,
  type ChecklistForm,
} from '../../../lib/checklistForms';
import { Letterhead } from './DocumentEditor.web';

/**
 * Building a "רשימת סעיפים" form on desktop: the sheet as it will print (the
 * letterhead, the driver's details that fill in by themselves, the items and
 * the two signatures), with a settings panel beside it. Every item is typed
 * straight on the sheet; Enter adds the next one.
 */

export const CHECKLIST_BUILDER_CSS = `
.cl-banner { width: 100%; max-width: 840px; display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 18px; background: linear-gradient(120deg, rgba(0,136,204,0.10), rgba(52,199,89,0.08)); }
.cl-banner p { flex: 1; margin: 0; font-size: 15.5px; line-height: 1.5; color: var(--sd-ink); }
.cl-banner-icon { flex: none; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: #fff; background: linear-gradient(160deg, #35B8F0, #0075B3); }
.cl-sheet { position: relative; width: 794px; max-width: 100%; background: #fff; border-radius: 4px; padding: 56px 64px 64px; box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 12px 40px rgba(16,34,50,0.10); }
.cl-title { margin: 0 0 12px; font-size: 26px; line-height: 1.3; }
.cl-intro { width: 100%; resize: none; overflow: hidden; border: 0; outline: none; background: transparent; font: inherit; font-size: 16px; line-height: 1.7; color: var(--sd-ink-2); padding: 8px 10px; margin: 0 -10px 12px; border-radius: 10px; transition: background-color 150ms ease, box-shadow 150ms ease; }
.cl-intro:hover { background: var(--sd-bg); }
.cl-intro:focus { background: #fff; box-shadow: inset 0 0 0 2px var(--sd-tint); }
.cl-intro::placeholder { color: var(--sd-ink-3); }
.cl-auto { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 22px; font-size: 14px; color: var(--sd-ink-3); }
.cl-auto-chip { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 9px; background: rgba(14,159,175,0.09); color: #0B7B87; font-size: 14px; }
.cl-block { position: relative; border-radius: 16px; box-shadow: inset 0 0 0 1.5px rgba(0,117,179,0.22); padding: 16px 12px 12px; }
.cl-block-tab { position: absolute; top: -13px; right: 16px; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 8px; background: var(--sd-tint); color: #fff; font-size: 13px; }
.cl-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px 10px; font-size: 14px; color: var(--sd-ink-3); }
.cl-row { display: grid; grid-template-columns: 30px 28px minmax(0, 1fr) 40px; align-items: start; gap: 8px; padding: 10px 6px; border-radius: 12px; transition: background-color 150ms ease, box-shadow 150ms ease, opacity 150ms ease; }
.cl-row + .cl-row { box-shadow: 0 -1px 0 var(--sd-sep); }
.cl-row:focus-within { background: rgba(0,136,204,0.04); }
.cl-row.cl-drag-over { box-shadow: 0 -3px 0 var(--sd-tint); }
.cl-row.cl-dragging { opacity: 0.45; }
.cl-move { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.cl-move button { width: 30px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: var(--sd-ink-3); transition: background-color 150ms ease, color 150ms ease; }
.cl-move button:disabled { opacity: 0.3; }
@media (hover: hover) and (pointer: fine) { .cl-move button:hover:not(:disabled) { background: var(--sd-bg); color: var(--sd-ink); } }
.cl-grip { cursor: grab; }
.cl-num { padding-top: 9px; text-align: center; font-size: 15px; color: var(--sd-ink-3); }
.cl-main { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.cl-text { width: 100%; resize: none; overflow: hidden; border: 0; outline: none; background: transparent; font: inherit; font-size: 17px; line-height: 1.55; color: var(--sd-ink); padding: 7px 10px; border-radius: 10px; transition: background-color 150ms ease, box-shadow 150ms ease; }
.cl-text:hover { background: var(--sd-bg); }
.cl-text:focus { background: #fff; box-shadow: inset 0 0 0 2px var(--sd-tint); }
.cl-text::placeholder { color: var(--sd-ink-3); }
.cl-meta { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 8px; }
.cl-ghost { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 10px; border-radius: 999px; font-size: 13px; opacity: 0.85; }
.cl-ghost-note { background: var(--sd-bg); color: var(--sd-ink-3); }
.cl-del { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: var(--sd-ink-3); transition: background-color 150ms ease, color 150ms ease; }
@media (hover: hover) and (pointer: fine) { .cl-del:hover { background: rgba(255,69,58,0.1); color: #D92D20; } }
.cl-add { width: 100%; margin-top: 8px; min-height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 16px; color: var(--sd-tint-deep) !important; background: rgba(0,136,204,0.06) !important; box-shadow: inset 0 0 0 1.5px rgba(0,117,179,0.25); transition: background-color 150ms ease, transform 160ms var(--sd-ease); }
.cl-add:active { transform: scale(0.99); }
@media (hover: hover) and (pointer: fine) { .cl-add:hover { background: rgba(0,136,204,0.12) !important; } }
.cl-sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 36px; }
.cl-sig input { width: 100%; border: 0; outline: none; background: transparent; font: inherit; font-family: 'Heebo_600SemiBold', system-ui, sans-serif; font-size: 15px; color: var(--sd-ink); padding: 6px 8px; margin: 0 -8px 6px; border-radius: 8px; transition: background-color 150ms ease, box-shadow 150ms ease; }
.cl-sig input:hover { background: var(--sd-bg); }
.cl-sig input:focus { background: #fff; box-shadow: inset 0 0 0 2px var(--sd-tint); }
.cl-sig-line { height: 70px; border-bottom: 1.5px solid #3C4A57; display: flex; align-items: flex-end; gap: 6px; padding-bottom: 6px; font-size: 13.5px; color: var(--sd-ink-3); }
.cl-legend { margin: 10px 8px 0; font-size: 13px; color: var(--sd-ink-3); }
.cl-prow { background: #fff; border-radius: 16px; box-shadow: var(--sd-depth-1); padding: 14px; margin-bottom: 12px; }
.cl-plabel { display: block; font-size: 14px; color: var(--sd-ink-3); margin-bottom: 8px; }
.cl-fixed { display: flex; align-items: flex-start; gap: 8px; font-size: 15px; line-height: 1.45; color: var(--sd-ink); }
.cl-pnote { display: block; margin-top: 8px; font-size: 13.5px; line-height: 1.45; color: var(--sd-ink-2); }
.cl-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.cl-pill { display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 12px; border-radius: 999px; font-size: 14px; }
.cl-switch-row { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; font-size: 15px; text-align: right; }
.cl-switch { flex: none; position: relative; width: 51px; height: 31px; border-radius: 16px; background: rgba(120,120,128,0.24); transition: background-color 200ms ease; }
.cl-switch::after { content: ''; position: absolute; top: 2px; right: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16); transition: transform 240ms var(--sd-ease); }
.cl-switch-row[aria-checked="true"] .cl-switch { background: var(--sd-green); }
.cl-switch-row[aria-checked="true"] .cl-switch::after { transform: translateX(-20px); }
.cl-repeat { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 6px; }
.cl-repeat button { min-height: 44px; padding: 0 10px; border-radius: 12px; font-size: 15px; color: var(--sd-ink); background: var(--sd-bg); box-shadow: inset 0 0 0 1px var(--sd-sep); transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease, transform 100ms ease; }
.cl-repeat button:active { transform: scale(0.97); }
.cl-repeat button[aria-checked="true"] { background: var(--sd-tint); color: #fff; box-shadow: none; }
@media (hover: hover) and (pointer: fine) { .cl-repeat button:hover:not([aria-checked="true"]) { background: rgba(0,136,204,0.08); } }
@keyframes cl-row-in { from { opacity: 0; transform: translateY(-6px); } }
.cl-row-new { animation: cl-row-in 220ms var(--sd-ease) both; }
@media (prefers-reduced-motion: reduce) { .cl-row-new { animation: none; } .cl-switch::after { transition: none; } }
@media (max-width: 1100px) { .cl-sheet { padding: 40px 36px 48px; } .cl-sigs { grid-template-columns: 1fr; gap: 18px; } }
`;

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function GrowingText({
  value,
  onChange,
  className,
  placeholder,
  label,
  maxLength,
  onKeyDown,
  textRef,
}: {
  value: string;
  onChange: (value: string) => void;
  className: string;
  placeholder: string;
  label: string;
  maxLength: number;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textRef?: (el: HTMLTextAreaElement | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => autoGrow(ref.current), [value]);
  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        textRef?.(el);
      }}
      className={className}
      rows={1}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

export function ChecklistBuilder({
  title,
  form,
  onChange,
  fromTemplate,
  onStartFrom,
}: {
  title: string;
  form: ChecklistForm;
  onChange: (form: ChecklistForm) => void;
  fromTemplate: boolean;
  onStartFrom: (which: 'template' | 'blank') => void;
}) {
  const textRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const focusNext = useRef<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!focusNext.current) return;
    const el = textRefs.current.get(focusNext.current);
    focusNext.current = null;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  const items = form.items;
  const set = (patch: Partial<ChecklistForm>) => onChange({ ...form, ...patch });
  const setText = (id: string, text: string) => set({ items: items.map((it) => (it.id === id ? { ...it, text } : it)) });
  const addAfter = (index: number) => {
    if (items.length >= CHECKLIST_LIMITS.items) return;
    const id = newItemId();
    const next = [...items];
    next.splice(index + 1, 0, { id, text: '' });
    focusNext.current = id;
    setFresh(id);
    set({ items: next });
  };
  const remove = (id: string) => {
    const index = items.findIndex((it) => it.id === id);
    const next = items.filter((it) => it.id !== id);
    focusNext.current = next[Math.max(0, index - 1)]?.id ?? null;
    set({ items: next.length ? next : [{ id: newItemId(), text: '' }] });
  };
  const move = (id: string, to: number) => {
    const from = items.findIndex((it) => it.id === id);
    if (from < 0 || to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    set({ items: next });
  };

  const options = statusOptions(form);
  const count = filledItems(form).length;

  return (
    <div className="sd-work">
      <style>{CHECKLIST_BUILDER_CSS}</style>
      <aside className="sd-panel" aria-label="הגדרות רשימת הסעיפים">
        <h3 className="sd-b">הגדרות רשימת הסעיפים</h3>
        <p className="sd-panel-sub">כותבים את הסעיפים על הדף. כאן בוחרים מה מסמנים ליד כל סעיף.</p>

        <div className="cl-prow">
          <span className="cl-plabel sd-sb">מי מסמן את הסעיפים?</span>
          <div className="cl-fixed">
            <Ionicons name="shield-checkmark" size={19} color="#0075B3" />
            <span>המנהל או קצין הבטיחות, בזמן המפגש</span>
          </div>
          <span className="cl-pnote">הנהג לא מסמן כלום. הוא רק חותם בסוף.</span>
        </div>

        <div className="cl-prow">
          <span className="cl-plabel sd-sb" id="cl-repeat-label">כל כמה זמן נפגשים עם כל נהג?</span>
          <RepeatChoice value={form.repeatMonths} onChange={(repeatMonths) => set({ repeatMonths })} labelledBy="cl-repeat-label" />
          <span className="cl-pnote">
            {form.repeatMonths
              ? 'המערכת תזכיר למנהלים שבוע לפני המועד וביום עצמו. נהג חדש מקבל תזכורת למפגש ראשון.'
              : 'בלי תזכורות. ממלאים את הטופס כשצריך.'}
          </span>
        </div>

        <div className="cl-prow">
          <span className="cl-plabel sd-sb">התשובות ליד כל סעיף</span>
          <div className="cl-pills">
            {options.map((key) => (
              <span key={key} className="cl-pill sd-sb" style={{ background: STATUS_META[key].soft, color: STATUS_META[key].fg }}>
                <Ionicons name={STATUS_META[key].icon} size={15} color="currentColor" />
                {STATUS_META[key].label}
              </span>
            ))}
          </div>
          <button type="button" role="switch" aria-checked={form.allowNa} className="cl-switch-row" onClick={() => set({ allowNa: !form.allowNa })}>
            <span>להוסיף גם ״לא רלוונטי״</span>
            <span className="cl-switch" aria-hidden="true" />
          </button>
        </div>

        <div className="cl-prow">
          <span className="cl-plabel sd-sb">הערה ליד כל סעיף</span>
          <div className="cl-fixed">
            <Ionicons name="chatbox-ellipses-outline" size={19} color="#0075B3" />
            <span>אפשר לכתוב, לא חובה</span>
          </div>
        </div>

        <div className="cl-prow">
          <span className="cl-plabel sd-sb">החתימות</span>
          <div className="cl-fixed">
            <Ionicons name="create-outline" size={19} color="#0075B3" />
            <span>קודם הקצין חותם ביד ושמו מודפס מתחת, ואחריו הנהג.</span>
          </div>
          <span className="cl-pnote">את הכותרות מעל החתימות אפשר לשנות על הדף.</span>
        </div>
      </aside>

      <div className="sd-canvas">
        <div className="cl-banner">
          <span className="cl-banner-icon">
            <Ionicons name={fromTemplate ? 'sparkles' : 'document-outline'} size={21} color="#fff" />
          </span>
          <p>
            {fromTemplate ? (
              <>
                <strong className="sd-sb">התחלתם מהתבנית המוכנה ״מפגש שיחה עם נהג״.</strong> אפשר לשנות, למחוק ולהוסיף כל סעיף.
              </>
            ) : (
              <>
                <strong className="sd-sb">טופס חדש מדף ריק.</strong> כתבו את הסעיפים שלכם. Enter מוסיף סעיף חדש.
              </>
            )}
          </p>
          <button type="button" className={`sd-btn ${fromTemplate ? 'sd-btn-plain' : 'sd-btn-tinted'}`} onClick={() => onStartFrom(fromTemplate ? 'blank' : 'template')}>
            {fromTemplate ? 'התחלה מדף ריק' : 'התבנית המוכנה'}
          </button>
        </div>

        <div className="cl-sheet">
          <Letterhead />
          <h1 className="cl-title sd-b">{title || 'טופס ללא שם'}</h1>
          <GrowingText
            className="cl-intro"
            value={form.intro}
            onChange={(intro) => set({ intro })}
            placeholder="פתיח לטופס (לא חובה). לדוגמה: במפגש נבדקו הנושאים הבאים"
            label="פתיח לטופס, לא חובה"
            maxLength={CHECKLIST_LIMITS.intro}
          />
          <div className="cl-auto" aria-label="פרטים שימולאו לבד">
            <span>ימולא לבד מתיק הנהג:</span>
            {[
              ['person', 'שם הנהג'],
              ['id-card', 'תעודת זהות'],
              ['card', 'מספר רישיון'],
              ['bus', 'סוג רישיון'],
            ].map(([icon, label]) => (
              <span key={label} className="cl-auto-chip sd-sb">
                <Ionicons name={icon as 'person'} size={15} color="currentColor" />
                {label}
              </span>
            ))}
          </div>

          <div className="cl-block">
            <span className="cl-block-tab sd-sb">
              <Ionicons name="list" size={15} color="#fff" />
              רשימת סעיפים
            </span>
            <div className="cl-head">
              <span className="sd-sb">הסעיפים</span>
              <span className="sd-num">{count === 1 ? 'סעיף אחד' : `${count} סעיפים`}</span>
            </div>
            {items.map((item, index) => (
              <div
                key={item.id}
                className={`cl-row${fresh === item.id ? ' cl-row-new' : ''}${dragId === item.id ? ' cl-dragging' : ''}${overId === item.id && dragId !== item.id ? ' cl-drag-over' : ''}`}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  setOverId(item.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) move(dragId, index);
                  setDragId(null);
                  setOverId(null);
                }}
              >
                <div className="cl-move">
                  <button type="button" aria-label={`הזזת סעיף ${index + 1} למעלה`} disabled={index === 0} onClick={() => move(item.id, index - 1)}>
                    <Ionicons name="chevron-up" size={17} color="currentColor" />
                  </button>
                  <button
                    type="button"
                    className="cl-grip"
                    draggable
                    tabIndex={-1}
                    aria-hidden="true"
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', item.id);
                      setDragId(item.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                  >
                    <Ionicons name="reorder-two" size={18} color="currentColor" />
                  </button>
                  <button type="button" aria-label={`הזזת סעיף ${index + 1} למטה`} disabled={index === items.length - 1} onClick={() => move(item.id, index + 1)}>
                    <Ionicons name="chevron-down" size={17} color="currentColor" />
                  </button>
                </div>
                <span className="cl-num sd-sb sd-num">{index + 1}</span>
                <div className="cl-main">
                  <GrowingText
                    className="cl-text"
                    value={item.text}
                    onChange={(text) => setText(item.id, text.replace(/\n/g, ' '))}
                    placeholder="כתבו כאן את הסעיף"
                    label={`סעיף ${index + 1}`}
                    maxLength={CHECKLIST_LIMITS.itemText}
                    textRef={(el) => {
                      if (el) textRefs.current.set(item.id, el);
                      else textRefs.current.delete(item.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        addAfter(index);
                      } else if (e.key === 'Backspace' && !item.text && items.length > 1) {
                        e.preventDefault();
                        remove(item.id);
                      }
                    }}
                  />
                  <div className="cl-meta" aria-hidden="true">
                    {options.map((key) => (
                      <span key={key} className="cl-ghost" style={{ background: STATUS_META[key].soft, color: STATUS_META[key].fg }}>
                        <Ionicons name={STATUS_META[key].icon} size={13} color="currentColor" />
                        {STATUS_META[key].label}
                      </span>
                    ))}
                    <span className="cl-ghost cl-ghost-note">
                      <Ionicons name="chatbox-ellipses-outline" size={13} color="currentColor" />
                      הערה, לא חובה
                    </span>
                  </div>
                </div>
                <button type="button" className="cl-del" aria-label={`מחיקת סעיף ${index + 1}`} onClick={() => remove(item.id)}>
                  <Ionicons name="trash-outline" size={19} color="currentColor" />
                </button>
              </div>
            ))}
            <button type="button" className="cl-add sd-sb" onClick={() => addAfter(items.length - 1)} disabled={items.length >= CHECKLIST_LIMITS.items}>
              <Ionicons name="add-circle" size={21} color="currentColor" />
              הוספת סעיף
            </button>
          </div>
          <p className="cl-legend">בכל מפגש מסמנים ליד כל סעיף: {options.map((k) => STATUS_META[k].label).join(' / ')}</p>

          <div className="cl-sigs">
            {(['officer', 'driver'] as const).map((who) => (
              <div key={who} className="cl-sig">
                <input
                  value={form.labels[who]}
                  maxLength={CHECKLIST_LIMITS.label}
                  aria-label={who === 'officer' ? 'הכותרת מעל חתימת החברה' : 'הכותרת מעל חתימת הנהג'}
                  onChange={(e) => set({ labels: { ...form.labels, [who]: e.target.value } })}
                />
                <div className="cl-sig-line">
                  <Ionicons name="create-outline" size={16} color="currentColor" />
                  {who === 'officer' ? 'חותמים ביד בכל מפגש, השם מודפס מתחת' : 'הנהג חותם בסוף'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** "כל כמה זמן": one big button per choice. */
export function RepeatChoice({ value, onChange, labelledBy, disabled }: { value: number; onChange: (months: number) => void; labelledBy?: string; disabled?: boolean }) {
  const options: { months: number; label: string }[] = REPEAT_OPTIONS.some((o) => o.months === value)
    ? [...REPEAT_OPTIONS]
    : [...REPEAT_OPTIONS, { months: value, label: repeatLabel(value) }];
  return (
    <div className="cl-repeat" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((option) => (
        <button
          key={option.months}
          type="button"
          role="radio"
          aria-checked={value === option.months}
          className={value === option.months ? 'sd-sb' : undefined}
          disabled={disabled}
          onClick={() => onChange(option.months)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The saved form as a small printed page, for the review step. */
export function ChecklistPaperPreview({ title, form }: { title: string; form: ChecklistForm }) {
  const items = filledItems(form);
  return (
    <div className="cl-sheet" style={{ width: 440, padding: '28px 30px 34px', transform: 'rotate(-1.2deg)' }}>
      <style>{CHECKLIST_BUILDER_CSS}</style>
      <h1 className="cl-title sd-b" style={{ fontSize: 19 }}>{title}</h1>
      {items.slice(0, 8).map((item, index) => (
        <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '6px 0', borderTop: index ? '1px solid #EEF1F4' : undefined, fontSize: 12.5, lineHeight: 1.45 }}>
          <span className="sd-num" style={{ color: '#8B98A4', width: 16 }}>{index + 1}</span>
          <span style={{ flex: 1 }}>{item.text}</span>
          <span style={{ width: 44, height: 16, borderRadius: 8, border: '1px dashed #C9D1D8', flex: 'none' }} />
        </div>
      ))}
      {items.length > 8 ? <div style={{ fontSize: 12, color: '#8B98A4', paddingTop: 6 }}>ועוד {items.length - 8} סעיפים</div> : null}
      <div style={{ display: 'flex', gap: 18, marginTop: 20 }}>
        {[form.labels.officer, form.labels.driver].map((label) => (
          <div key={label} style={{ flex: 1, fontSize: 11.5, color: '#5C6773' }}>
            {label}
            <div style={{ height: 30, borderBottom: '1px solid #3C4A57' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
