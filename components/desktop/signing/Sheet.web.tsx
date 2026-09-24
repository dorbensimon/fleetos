import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * An iOS-style page sheet: rises from the bottom over a dimmed, blurred
 * backdrop and sinks back on close. `requestClose` lets the caller confirm
 * first; `close` plays the exit and then calls `onClosed`.
 */
export function useSheetClose(onClosed: () => void) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = useCallback(() => {
    setClosing(true);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(onClosed, reduce ? 0 : 300);
  }, [onClosed]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { closing, close };
}

export function Sheet({
  closing,
  onRequestClose,
  label,
  head,
  foot,
  children,
}: {
  closing: boolean;
  onRequestClose: () => void;
  label: string;
  head: React.ReactNode;
  foot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.sd-alert')) onRequestClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [onRequestClose]);

  return createPortal(
    <div className="sd-root">
      <div className={`sd-backdrop${closing ? ' sd-closing' : ''}`} onClick={onRequestClose} />
      <div ref={sheetRef} className={`sd-sheet${closing ? ' sd-closing' : ''}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className="sd-grabber" />
        <div className="sd-sheet-head">{head}</div>
        <div className="sd-sheet-body">{children}</div>
        {foot ? <div className="sd-sheet-foot">{foot}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/** A small iOS alert for "leave without saving?" style questions. */
export function ConfirmAlert({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return createPortal(
    <div className="sd-root">
      <div className="sd-backdrop" style={{ zIndex: 1100 }} onClick={onCancel} />
      <div className="sd-alert" role="alertdialog" aria-modal="true" aria-label={title}>
        <strong className="sd-b">{title}</strong>
        <p>{message}</p>
        <div className="sd-alert-actions">
          <button ref={cancelRef} type="button" className="sd-sb" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="sd-sb sd-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
