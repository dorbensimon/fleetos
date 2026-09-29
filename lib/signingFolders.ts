import type { SignatureRequest, SigningTemplate } from './docuseal';
import { t } from './i18n';
import { INSPECTION_TITLE, LEGACY_INSPECTION_TITLE } from './inspectionTitle';

/** A request's saved title, with inspections signed before the rename shown under the new name. */
export function requestTitle(request: Pick<SignatureRequest, 'template_title'>): string | null {
  return request.template_title === LEGACY_INSPECTION_TITLE ? INSPECTION_TITLE : request.template_title ?? null;
}

export type SigningFolder = { id: string; title: string; template: SigningTemplate | null; requests: SignatureRequest[] };

export function buildSigningFolders(templates: SigningTemplate[], requests: SignatureRequest[]): SigningFolder[] {
  const folders = new Map<string, SigningFolder>(templates.map((template) => [template.id, {
    id: template.id, title: template.title, template, requests: [],
  }]));
  for (const request of requests) {
    // Removed templates have no stable identifier left in legacy records;
    // retain access under their saved title without rewriting the document.
    const savedTitle = requestTitle(request);
    const id = request.template_id || `legacy:${savedTitle || request.id}`;
    if (!folders.has(id)) folders.set(id, { id, title: request.template?.title || savedTitle || t('signing.previousDocument'), template: null, requests: [] });
    folders.get(id)!.requests.push(request);
  }
  return [...folders.values()].sort((a, b) => a.title.localeCompare(b.title, 'he'));
}

export function signingFolderStatus(folder: SigningFolder): 'empty' | 'pending' | 'completed' | 'failed' {
  if (folder.requests.some((r) => r.status === 'pending' && r.docuseal_submitter_slug)) return 'pending';
  const latest = folder.requests[0];
  if (latest && (latest.status === 'failed' || latest.status === 'declined' || (latest.status === 'pending' && !latest.docuseal_submitter_slug))) return 'failed';
  return folder.requests.some((r) => r.status === 'completed') ? 'completed' : 'empty';
}
