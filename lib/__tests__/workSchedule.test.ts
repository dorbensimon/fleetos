import { createRules, holidayOf, isOff, nextWorkDay, repeatDates, travelMinutes, type ScheduleData, type Trip } from '../workSchedule';

const trip = (over: Partial<Trip>): Trip => ({
  id: Math.random().toString(36).slice(2), date: '2026-10-21', end: null, from: '08:00', to: '09:00', title: 'נסיעה', client: '', phone: '',
  pickup: '', dest: '', vehicleId: 'v1', driverId: 'd1', seriesId: null, status: 'active', ...over,
});

const base = (trips: Trip[]): ScheduleData => ({
  vehicles: [
    { id: 'v1', plate: '11-111-11', type: 'passenger_minibus', status: 'active', driverId: 'd1', docs: [{ label: 'טסט', until: '2026-10-25', warnOnly: false }] },
    { id: 'v2', plate: '22-222-22', type: 'bus', status: 'active', driverId: 'd2', docs: [] },
  ],
  drivers: [
    { id: 'd1', name: 'שמעון', licenseExpiry: '2028-01-01', classes: ['D1'] },
    { id: 'd2', name: 'עוזי', licenseExpiry: '2028-01-01', classes: ['D'] },
  ],
  trips,
  blocks: [{ id: 'b1', ownerType: 'vehicle', ownerId: 'v2', from: '2026-10-27', to: '2026-10-28', reason: 'תיקון' }],
  clients: [],
  saved: [],
  series: [],
});

describe('work schedule rules', () => {
  it('finds the vehicle busy, in the garage, or with an expired test', () => {
    const r = createRules(base([trip({ id: 't1' })]));
    expect(r.vehicleBusy('v1', '2026-10-21', '08:30', '10:00', null)).toBeTruthy();
    expect(r.vehicleBusy('v1', '2026-10-21', '09:00', '10:00', null)).toBeNull();
    expect(r.vehicleBusy('v1', '2026-10-21', '08:30', '10:00', 't1')).toBeNull();
    expect(r.vehicleBusy('v2', '2026-10-27', '08:00', '09:00', null)).toBeTruthy();
    expect(r.vehicleBusy('v1', '2026-10-26', '08:00', '09:00', null)).toBeTruthy();
  });

  it('tells a real clash with another trip apart from an expired document', () => {
    const r = createRules(base([trip({ id: 't1' })]));
    expect(r.vehicleClash('v1', '2026-10-21', '08:30', '10:00', null)).toBe(true);
    expect(r.vehicleClash('v1', '2026-10-26', '08:00', '09:00', null)).toBe(false);
    expect(r.vehicleClash('v2', '2026-10-27', '08:00', '09:00', null)).toBe(false);
  });

  it('takes a trip of several days on all its days', () => {
    const r = createRules(base([trip({ vehicleId: 'v2', driverId: 'd2', date: '2026-10-21', end: '2026-10-23', from: '07:00', to: '18:00' })]));
    expect(r.vehicleBusy('v2', '2026-10-22', '01:00', '02:00', null)).toBeTruthy();
    expect(r.vehicleBusy('v2', '2026-10-23', '19:00', '20:00', null)).toBeNull();
  });

  it('checks the license class against the vehicle type', () => {
    const r = createRules(base([]));
    expect(r.noLicense('d1', r.vehicle('v1'))).toBeNull();
    expect(r.noLicense('d1', r.vehicle('v2'))).toBeTruthy();
    expect(r.noLicense('d2', r.vehicle('v1'))).toBeNull();
  });

  it('a commercial van ("מסחרי", stored as minibus) needs only B', () => {
    const r = createRules({ ...base([]), vehicles: [{ id: 'v3', plate: '33-333-33', type: 'minibus', status: 'active', driverId: null, docs: [] }], drivers: [{ id: 'd3', name: 'דני', licenseExpiry: '2028-01-01', classes: ['C'] }, { id: 'd4', name: 'רון', licenseExpiry: '2028-01-01', classes: ['A2'] }] });
    expect(r.noLicense('d3', r.vehicle('v3'))).toBeNull();
    expect(r.noLicense('d4', r.vehicle('v3'))).toBeTruthy();
  });

  it('warns about too little rest between days and no time to get there', () => {
    const rest = createRules(base([
      trip({ date: '2026-10-20', from: '20:00', to: '22:00' }),
      trip({ date: '2026-10-21', from: '04:30', to: '06:00' }),
    ]));
    expect(rest.hoursIssue('d1', '2026-10-21')).toBeTruthy();
    const far = createRules(base([
      trip({ from: '06:00', to: '11:00', pickup: 'תל אביב', dest: 'אילת' }),
      trip({ vehicleId: 'v2', from: '12:30', to: '14:00', pickup: 'חיפה', dest: 'חיפה' }),
    ]));
    expect(far.issues('2026-10-21').some((x) => x.text.includes('אילת'))).toBe(true);
    expect(travelMinutes('אילת', 'חיפה')).toBeGreaterThan(5 * 60);
  });

  it('flags two trips of one vehicle at the same time', () => {
    const r = createRules(base([trip({}), trip({ from: '08:30', to: '09:30', driverId: 'd2' })]));
    expect(r.issues('2026-10-21').length).toBeGreaterThan(0);
  });
});

describe('calendar', () => {
  it('knows the holidays from the Hebrew calendar', () => {
    expect(holidayOf('2026-09-21')?.off).toBe(true); // Yom Kippur 5787
    expect(holidayOf('2027-04-22')?.off).toBe(true); // Pesach 5787
    expect(holidayOf('2026-12-05')?.off).toBeFalsy(); // Chanukah, a work day
    expect(holidayOf('2026-12-05')).toBeTruthy();
    expect(isOff('2026-10-24')).toBe(true); // Saturday
  });

  it('skips Saturdays, holidays and (daily) Fridays in a recurring trip', () => {
    const days = repeatDates('daily', '2026-10-18', '2026-10-24');
    expect(days).toEqual(['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
    expect(repeatDates('weekly', '2026-10-18', '2026-11-08')).toEqual(['2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08']);
    expect(nextWorkDay('2026-10-23')).toBe('2026-10-25');
  });
});
