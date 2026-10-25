
import { attentionGroups, attentionRoute, attentionTotals } from '../attention';
import { LICENSE_SIDE_STORED_TITLE } from '../licenseSides';
import type { ComplianceItem, DriverRow, Vehicle, VehicleDriverWithProfile } from '../adminApi';

const vehicle = (id: string, extra: Partial<Vehicle> = {}) =>
  ({ id, plate_number: '12345678', manufacturer: 'טויוטה', model: 'קורולה', status: 'active', ...extra }) as Vehicle;
const driver = (id: string, license_expiry: string | null) => ({ id, full_name: `נהג ${id}`, license_expiry }) as DriverRow;
const item = (item_type: string, expiry_date: string | null) => ({ item_type, expiry_date }) as ComplianceItem;
const iso = (daysFromToday: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const assigned = [{ id: 'a' }] as VehicleDriverWithProfile[];
const bothSides = new Set([LICENSE_SIDE_STORED_TITLE.front, LICENSE_SIDE_STORED_TITLE.back]);

test('each vehicle problem says what is wrong and opens the spot that fixes it', () => {
  const vehicles = [vehicle('v1'), vehicle('v2', { manufacturer: null, model: null }), vehicle('v3'), vehicle('old', { status: 'archived' })];
  const compliance = new Map<string, ComplianceItem[]>([
    ['v1', [item('insurance_mandatory', iso(-3)), item('vehicle_license', iso(-1))]],
    ['v2', [item('insurance_mandatory', iso(40))]],
    ['v3', [item('insurance_mandatory', iso(0)), item('vehicle_license', null)]],
  ]);
  const groups = attentionGroups({ vehicles, compliance, vehicleDrivers: new Map([['v1', assigned], ['v3', assigned]]) });

  expect(groups.map((g) => g.kind)).toEqual(['insurance', 'registration', 'unassigned']);
  const [insurance, registration, unassigned] = groups;
  // Expiring today is still valid today; only v1's lapsed insurance counts.
  expect(insurance.items).toEqual([
    { ownerType: 'vehicle', ownerId: 'v1', title: '123-45-678', name: 'טויוטה קורולה', detail: expect.stringMatching(/^פג לפני 3 ימים · \d\d\/\d\d\/\d{4}$/), tone: 'bad', target: { openFolder: 'insurance_mandatory' } },
  ]);
  expect(registration.items.map((i) => [i.ownerId, i.detail.split(' · ')[0], i.target])).toEqual([['v1', 'פג אתמול', { openFolder: 'vehicle_license' }]]);
  expect(unassigned.items.map((i) => [i.ownerId, i.name, i.target])).toEqual([['v2', 'רכב ללא דגם', { openDrivers: true }]]);
});

test('mandatory insurance never entered is a problem; an empty registration folder is not', () => {
  const groups = attentionGroups({ vehicles: [vehicle('v1')], compliance: new Map(), vehicleDrivers: new Map([['v1', assigned]]) });
  expect(groups).toHaveLength(1);
  expect(groups[0].items[0].detail).toBe('לא הוזן ביטוח חובה');
});

test('drivers: lapsed or 30-day licences, and missing licence photos', () => {
  const groups = attentionGroups({
    vehicles: [],
    compliance: new Map(),
    vehicleDrivers: new Map(),
    drivers: [
      { driver: driver('d1', iso(10)), licenseSides: bothSides },
      { driver: driver('d2', iso(-2)), licenseSides: new Set([LICENSE_SIDE_STORED_TITLE.front]) },
      { driver: driver('d3', iso(200)), licenseSides: bothSides },
    ],
  });
  expect(groups.map((g) => g.kind)).toEqual(['license', 'licenseDocs']);
  // The lapsed licence comes first.
  expect(groups[0].items.map((i) => [i.ownerId, i.tone])).toEqual([['d2', 'bad'], ['d1', 'warn']]);
  expect(groups[0].tone).toBe('bad');
  expect(groups[1].items.map((i) => i.ownerId)).toEqual(['d2']);
  expect(attentionRoute(groups[1].items[0])).toEqual({ screen: 'DriverLicenseDocuments', params: { driverId: 'd2' } });
  expect(attentionRoute(groups[0].items[0])).toEqual({ screen: 'DriverDetail', params: { driverId: 'd2', focus: 'license_expiry' } });
});

test('totals count owners and problems', () => {
  const compliance = new Map([['v1', [item('insurance_mandatory', iso(-5))]], ['v2', [item('insurance_mandatory', iso(-5))]]]);
  const groups = attentionGroups({ vehicles: [vehicle('v1'), vehicle('v2')], compliance, vehicleDrivers: new Map() });
  expect(attentionTotals(groups)).toEqual({ owners: 2, issues: 4 });
  expect(attentionTotals([])).toEqual({ owners: 0, issues: 0 });
});
