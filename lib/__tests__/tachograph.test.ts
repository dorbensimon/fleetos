import { addMonthsIso, inspectionValidityMonths, requiresTachograph } from '../tachograph';

describe('requiresTachograph', () => {
  it.each(['truck', 'bus'] as const)('requires a tachograph for %s vehicles', (vehicleType) => {
    expect(requiresTachograph(vehicleType)).toBe(true);
  });

  it.each(['car', 'minibus'] as const)('does not require a tachograph for %s vehicles', (vehicleType) => {
    expect(requiresTachograph(vehicleType)).toBe(false);
  });
});

describe('inspection expiry', () => {
  it('adds a year to the inspection date', () => {
    expect(addMonthsIso('2026-03-01', 12)).toBe('2027-03-01');
    expect(addMonthsIso('2024-02-29', 12)).toBe('2025-02-28');
  });
  it('applies only to the tachograph folder', () => {
    expect(inspectionValidityMonths('tachograph_calibration')).toBe(12);
    expect(inspectionValidityMonths('winter_inspection')).toBeNull();
  });
});
