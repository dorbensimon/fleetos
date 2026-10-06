import type * as Web from './FolderCatalogSheets.web';

/**
 * The folder catalog's windows are web only (see the .web.tsx file).
 * This stub keeps the DOM windows out of the phone app bundle.
 */
type Props<T extends (...args: never[]) => unknown> = Parameters<T>[0];
export function FloatWindow(_p: Props<typeof Web.FloatWindow>) { return null; }
export function FolderHero(_p: Props<typeof Web.FolderHero>) { return null; }
export function AddCatalogFolderSheet(_p: Props<typeof Web.AddCatalogFolderSheet>) { return null; }
export function EmptyCatalogFolderSheet(_p: Props<typeof Web.EmptyCatalogFolderSheet>) { return null; }
export function AfterReplaceSheet(_p: Props<typeof Web.AfterReplaceSheet>) { return null; }
export function FormVersionsSheet(_p: Props<typeof Web.FormVersionsSheet>) { return null; }
export const useRemoveCatalogFolder: typeof Web.useRemoveCatalogFolder = () => ({ start: () => undefined, dialog: null, error: null, busy: false });
