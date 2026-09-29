import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockSetPreference = jest.fn(async () => {});
const mockSetPreferences = jest.fn(async () => {});
const mockSetNotificationLead = jest.fn(async () => {});

jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]) };
});
jest.mock('../../components/ui', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../CompanyContext', () => ({
  useCompany: () => ({ profile: { id: 'u1', role: 'admin' }, companyId: 'c1' }),
}));
jest.mock('../notificationPreferencesApi', () => {
  const actual = jest.requireActual('../notificationPreferencesApi');
  return {
    ...actual,
    getPreferences: async () => Object.fromEntries(actual.NOTIFICATION_TYPES.map((entry: { type: string }) => [entry.type, true])),
    getNotificationLeads: async () => ({ values: { driver_meeting_due: 7, vehicle_safety_check_due: 7 }, custom: new Set(), perType: true }),
    setPreference: (...args: unknown[]) => mockSetPreference(...(args as [])),
    setPreferences: (...args: unknown[]) => mockSetPreferences(...(args as [])),
    setNotificationLead: (...args: unknown[]) => mockSetNotificationLead(...(args as [])),
  };
});

import { useNotificationPreferences } from '../useNotificationPreferences';

const TYPES = ['driver_profile_update', 'driver_document_upload', 'license_update_requested', 'signature_request_completed'] as const;

test('turning a whole section off turns every toggle in it off, in one save', async () => {
  const { result } = await renderHook(() => useNotificationPreferences());
  await waitFor(() => expect(result.current.prefs).not.toBeNull());

  await act(async () => {
    await result.current.toggleMany([...TYPES], false);
  });

  for (const type of TYPES) expect(result.current.prefs?.[type]).toBe(false);
  expect(mockSetPreferences).toHaveBeenCalledTimes(1);
  expect(mockSetPreferences).toHaveBeenCalledWith('u1', [...TYPES], false);
});

test('two lead times saved one after the other both stay', async () => {
  const { result } = await renderHook(() => useNotificationPreferences());
  await waitFor(() => expect(result.current.leads).not.toBeNull());

  await act(async () => {
    await result.current.setLead('driver_meeting_due', 14);
    await result.current.setLead('vehicle_safety_check_due', 30);
  });

  expect(result.current.leads?.values.driver_meeting_due).toBe(14);
  expect(result.current.leads?.values.vehicle_safety_check_due).toBe(30);
});
