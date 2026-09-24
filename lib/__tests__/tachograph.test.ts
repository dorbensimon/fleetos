import { requiresTachograph } from '../tachograph';

describe('requiresTachograph', () => {
  it.each(['truck', 'bus'] as const)('requires a tachograph for %s vehicles', (vehicleType) => {
    expect(requiresTachograph(vehicleType)).toBe(true);
  });

  it.each(['car', 'minibus'] as const)('does not require a tachograph for %s vehicles', (vehicleType) => {
    expect(requiresTachograph(vehicleType)).toBe(false);
  });
});
