import React, { useEffect, useRef } from 'react';
import { SIGNATURE_INK_JS } from './signatureInk';
import type { SignatureSurfaceProps } from './SignatureSurface.types';

type Ink = { clear: () => void; destroy: () => void };
type CreateInk = (canvas: HTMLCanvasElement, onChange: (png: string | null, length: number) => void, onDrawing: (active: boolean) => void) => Ink;

/**
 * The same drawing code the phone runs inside its WebView, added to the page
 * once as an inline script. (The site's CSP forbids eval, and the code has to
 * stay a string for the phone, where Hermes keeps no function source.)
 */
function loadInk(): CreateInk {
  const host = window as unknown as { __icarCreateInk?: CreateInk };
  if (!host.__icarCreateInk) {
    const script = document.createElement('script');
    script.textContent = `${SIGNATURE_INK_JS}\nwindow.__icarCreateInk = createInk;`;
    document.head.appendChild(script);
    script.remove();
  }
  return host.__icarCreateInk!;
}

/** The signature surface in a browser: a canvas drawn with pointer events. */
export function SignatureSurface({ onChange, onDrawing, clearKey, label }: SignatureSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<Ink | null>(null);
  const handlers = useRef({ onChange, onDrawing });
  handlers.current = { onChange, onDrawing };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ink = loadInk()(
      canvas,
      (png, length) => handlers.current.onChange(png, length),
      (active) => handlers.current.onDrawing?.(active),
    );
    inkRef.current = ink;
    return () => {
      ink.destroy();
      inkRef.current = null;
    };
  }, []);

  const firstClear = useRef(true);
  useEffect(() => {
    if (firstClear.current) {
      firstClear.current = false;
      return;
    }
    inkRef.current?.clear();
  }, [clearKey]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={label}
      role="img"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'crosshair' }}
    />
  );
}
