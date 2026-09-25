import { vehicleAttentionGroups, vehicleAttentionTotals } from '../vehicleAttention';
import type { ComplianceItem, Vehicle, VehicleDriverWithProfile } from '../adminApi';

const vehicle = (id: string, extra: Partial<Vehicle> = {}) =>
  ({ id, plate_number: '12345678', manufacturer: 'טויוטה', model: 'קורולה', status: 'active', ...extra }) as Vehicle;
const item = (item_type: string, expiry_date: string | null) => ({ item_type, expiry_date }) as ComplianceItem;
const iso = (daysFromToday: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const assigned = [{ id: 'a' }] as VehicleDriverWithProfile[];

test('each problem says what is wrong and opens the spot that fixes it', () => {
  const vehicles = [vehicle('v1'), vehicle('v2', { manufacturer: null, model: null }), vehicle('v3'), vehicle('old', { status: 'archived' })];
  const compliance = new Map<string, ComplianceItem[]>([
    ['v1', [item('insurance_mandatory', iso(-3)), item('vehicle_license', iso(-1))]],
    ['v2', [item('insurance_mandatory', iso(40))]],
    ['v3', [item('insurance_mandatory', iso(0)), item('vehicle_license', null)]],
  ]);
  const drivers = new Map([['v1', assigned], ['v3', assigned]]);
  const groups = vehicleAttentionGroups(vehicles, compliance, drivers);

  expect(groups.map((g) => g.kind)).toEqual(['insurance', 'registration', 'unassigned']);
  const [insurance, registration, unassigned] = groups;
  // Expiring today is still valid today; only v1's lapsed insurance counts.
  expect(insurance.items).toEqual([
    { vehicleId: 'v1', plate: '123-45-678', name: 'טויוטה קורולה', detail: expect.stringMatching(/^פג לפני 3 ימים · \d\d\/\d\d\/\d{4}$/), target: { openFolder: 'insurance_mandatory' } },
  ]);
  expect(registration.items.map((i) => [i.vehicleId, i.detail.split(' · ')[0], i.target])).toEqual([['v1', 'פג אתמול', { openFolder: 'vehicle_license' }]]);
  expect(unassigned.items.map((i) => [i.vehicleId, i.name, i.target])).toEqual([['v2', 'רכב ללא דגם', { openDrivers: true }]]);
});

test('mandatory insurance never entered is a problem; an empty registration folder is not', () => {
  const groups = vehicleAttentionGroups([vehicle('v1')], new Map(), new Map([['v1', assigned]]));
  expect(groups).toHaveLength(1);
  expect(groups[0].items[0].detail).toBe('לא הוזן ביטוח חובה');
});

test('the pill counts vehicles, not problems', () => {
  const compliance = new Map([['v1', [item('insurance_mandatory', iso(-5))]], ['v2', [item('insurance_mandatory', iso(-5))]]]);
  const groups = vehicleAttentionGroups([vehicle('v1'), vehicle('v2')], compliance, new Map());
  expect(vehicleAttentionTotals(groups)).toEqual({ vehicles: 2, issues: 4 });
  expect(vehicleAttentionTotals([])).toEqual({ vehicles: 0, issues: 0 });
});
