import type { SignatureRequest } from './docuseal';

export type SigningTab = 'pending' | 'completed';

export function defaultSigningTab(items: SignatureRequest[]): SigningTab {
  return items.some((item) => item.status === 'pending') ? 'pending' : 'completed';
}
