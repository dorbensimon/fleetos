import { deriveNextServiceKm, nextServiceKmOf } from '../serviceSchedule';

describe('deriveNextServiceKm', () => {
  it('adds the interval to the last service reading', () => {
    expect(deriveNextServiceKm(1000, 20000)).toBe(21000);
  });

  it('returns null without a usable interval', () => {
    expect(deriveNextServiceKm(1000, null)).toBeNull();
    expect(deriveNextServiceKm(1000, 0)).toBeNull();
  });
});

describe('nextServiceKmOf', () => {
  it('ignores a stale stored value that was based on the odometer', () => {
    // Saved by the old rule as odometer (50,000) + interval.
    expect(nextServiceKmOf({ last_service_km: 1000, service_interval_km: 20000, next_service_km: 70000 })).toBe(21000);
  });

  it('falls back to the manually entered value when there is no interval', () => {
    expect(nextServiceKmOf({ last_service_km: 1000, service_interval_km: null, next_service_km: 15000 })).toBe(15000);
  });
});
