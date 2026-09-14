import { defaultSigningTab } from '../../../lib/signingTabs';
import type { SignatureRequest } from '../../../lib/docuseal';

const request = (status: SignatureRequest['status']) => ({ status }) as SignatureRequest;

describe('defaultSigningTab', () => {
  it('opens the pending-signatures tab when a document awaits signature', () => {
    expect(defaultSigningTab([request('completed'), request('pending')])).toBe('pending');
  });

  it('opens the signed-documents tab when nothing awaits signature', () => {
    expect(defaultSigningTab([request('completed'), request('declined')])).toBe('completed');
  });
});
