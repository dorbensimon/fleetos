jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));

import { registryChanges, registryPatch } from '../vehicleRegistryFields';
import type { Vehicle } from '../adminApi';

const vehicle = {
  manufacturer: 'סקודה', model: 'אוקטביה', color: null, production_year: 2022, vin: 'abc123',
  road_registration_date: '2022-10-29', registry_details: { fuel_type: 'בנזין', seats: '5' },
} as unknown as Vehicle;

describe('registryChanges', () => {
  const changes = registryChanges(vehicle, {
    plateNumber: '12345678', manufacturer: 'סקודה צ׳כיה', model: 'אוקטביה', productionYear: 2022, color: 'לבן',
    licenseExpiry: null, vin: 'ABC123', roadRegistrationDate: null,
    details: { fuel_type: 'דיזל', seats: '5', tow_hitch: 'יש' },
  });

  it('lists only fields the ministry has and that differ', () => {
    expect(changes.map((c) => c.key)).toEqual(['manufacturer', 'color', 'fuel_type', 'tow_hitch']);
    expect(changes.find((c) => c.key === 'color')?.current).toBe('—');
  });

  it('saves only the picked fields and keeps the other registry values', () => {
    const patch = registryPatch(vehicle, changes.filter((c) => c.key !== 'manufacturer' && c.key !== 'tow_hitch'));
    expect(patch).toEqual({ color: 'לבן', registry_details: { fuel_type: 'דיזל', seats: '5' } });
  });
});
