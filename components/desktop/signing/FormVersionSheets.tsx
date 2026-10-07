import type * as Web from './FormVersionSheets.web';

/** These windows are web only (see the .web.tsx file); native renders nothing. */
type Props<T extends (...args: never[]) => unknown> = Parameters<T>[0];
export function FloatWindow(_p: Props<typeof Web.FloatWindow>) { return null; }
export function FolderHero(_p: Props<typeof Web.FolderHero>) { return null; }
export function AfterReplaceSheet(_p: Props<typeof Web.AfterReplaceSheet>) { return null; }
export function FormVersionsSheet(_p: Props<typeof Web.FormVersionsSheet>) { return null; }
