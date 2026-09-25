import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { LegalConsentGate } from '../LegalConsentGate';

let mockProfile: { id: string } | null = null;
jest.mock('../../../lib/CompanyContext', () => ({ useCompany: () => ({ profile: mockProfile }) }));
jest.mock('../../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('../../../lib/legal/acceptance', () => ({
  hasAcceptedCurrentTerms: jest.fn(async () => true),
  recordTermsAcceptance: jest.fn(),
}));
jest.mock('../../ui/BrandLoader', () => ({ BrandLoader: () => null }));

let mounts = 0;
function App() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <Text>app</Text>;
}

test('signing in does not remount the app while the terms are checked', async () => {
  const screen = await render(
    <LegalConsentGate>
      <App />
    </LegalConsentGate>,
  );
  expect(mounts).toBe(1);

  // The profile arrives after the login screen already navigated home.
  mockProfile = { id: 'u1' };
  await act(async () => {
    screen.rerender(
      <LegalConsentGate>
        <App />
      </LegalConsentGate>,
    );
  });

  expect(mounts).toBe(1);
  expect(screen.getByText('app')).toBeTruthy();
});
