import React from 'react';
import { Platform } from 'react-native';
import { act, render } from '@testing-library/react-native';

// React Native defines `window` too, but without location or sessionStorage:
// the app must start, and sign out, without reaching for browser-only APIs.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock') // eslint-disable-line @typescript-eslint/no-require-imports
);
jest.mock('react-native-webview', () => ({ WebView: () => null }));

type AuthCallback = (event: string, session: null) => void;
const authListeners: AuthCallback[] = [];

jest.mock('../supabase', () => {
  // Any query chain resolves to nothing; the test only needs the app to start.
  const query: object = new Proxy(() => query, { get: (_target, key) => (key === 'then' ? undefined : query), apply: () => query });
  return {
    supabase: {
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
        getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
        onAuthStateChange: jest.fn((callback: AuthCallback) => {
          authListeners.push(callback);
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        }),
      },
      from: query,
      rpc: query,
      channel: query,
      storage: { from: query },
      functions: { invoke: jest.fn() },
      removeChannel: jest.fn(),
    },
  };
});

it('starts and signs out on a phone', async () => {
  expect(Platform.OS).not.toBe('web');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const App = require('../../App').default as React.ComponentType;
  await act(async () => {
    render(<App />);
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(authListeners.length).toBeGreaterThan(0);
  await act(async () => {
    authListeners.forEach((listener) => listener('SIGNED_OUT', null));
  });
}, 60000);
