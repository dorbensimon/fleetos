// סידור עבודה: טעינה ושמירה מול מסד הנתונים
import { supabase } from './supabase';
import { listVehicles } from './adminApi/vehicles';
import { listDrivers } from './adminApi/drivers';
import { listComplianceForOwners } from './adminApi/compliance';
import { chunkIds, fetchAllPages } from './adminApi/paging';
import { complianceTargetDate, VEHICLE_COMPLIANCE } from './compliance';
import { VEHICLE_FOLDER_ALERTS } from './vehicleFolderAlerts';
import { splitLicenseClasses } from './driverFields';
import { addDays, hhmm, repeatDates, todayKey, type Block, type Series, type Client, type SavedTrip, type ScheduleData, type ScheduleDriver, type ScheduleVehicle, type Trip, type VehicleDoc } from './workSchedule';

const TRIP_COLUMNS = 'id, trip_date, end_date, start_time, end_time, title, client_name, client_phone, pickup, destination, vehicle_id, driver_id, series_id, status';

type TripRow = {
  id: string; trip_date: string; end_date: string | null; start_time: string; end_time: string; title: string;
  client_name: string | null; client_phone: string | null; pickup: string | null; destination: string | null; vehicle_id: string | null;
  driver_id: string | null; series_id: string | null; status: Trip['status'];
};

const toTrip = (r: TripRow): Trip => ({
  id: r.id, date: r.trip_date, end: r.end_date, from: hhmm(r.start_time), to: hhmm(r.end_time), title: r.title,
  client: r.client_name ?? '', phone: r.client_phone ?? '', pickup: r.pickup ?? '', dest: r.destination ?? '', vehicleId: r.vehicle_id,
  driverId: r.driver_id, seriesId: r.series_id, status: r.status,
});

const toRow = (companyId: string, x: Trip) => ({
  id: x.id, company_id: companyId, trip_date: x.date, end_date: x.end, start_time: x.from, end_time: x.to, title: x.title,
  client_name: x.client || null, client_phone: x.phone || null, pickup: x.pickup || null, destination: x.dest || null, vehicle_id: x.vehicleId,
  driver_id: x.driverId, series_id: x.seriesId, status: x.status,
});

export const newId = () => globalThis.crypto.randomUUID();

/** How far ahead the trips of a series with no last day are made. */
export const SERIES_AHEAD_DAYS = 90;

const toSeries = (r: any): Series => ({
  id: r.id, repeat: r.repeat, start: r.start_date, until: r.end_date, generatedUntil: r.generated_until, from: hhmm(r.start_time), to: hhmm(r.end_time),
  title: r.title, client: r.client_name ?? '', phone: r.client_phone ?? '', pickup: r.pickup ?? '', dest: r.destination ?? '',
  vehicleId: r.vehicle_id, driverId: r.driver_id,
});

const seriesRow = (companyId: string, x: Series) => ({
  id: x.id, company_id: companyId, repeat: x.repeat, start_date: x.start, end_date: x.until, generated_until: x.generatedUntil,
  start_time: x.from, end_time: x.to, title: x.title, client_name: x.client || null, client_phone: x.phone || null,
  pickup: x.pickup || null, destination: x.dest || null, vehicle_id: x.vehicleId, driver_id: x.driverId,
});

/** The trips of a series on the given days. */
export const seriesTrips = (x: Series, dates: string[]): Trip[] => dates.map((d) => ({
  id: newId(), date: d, end: null, from: x.from, to: x.to, title: x.title, client: x.client, phone: x.phone, pickup: x.pickup, dest: x.dest,
  vehicleId: x.vehicleId, driverId: x.driverId, seriesId: x.id, status: 'active',
}));

export async function saveSeries(companyId: string, x: Series) {
  const { error } = await supabase.from('schedule_series').upsert(seriesRow(companyId, x));
  if (error) throw error;
}

// משלים נסיעות לסדרות בלי תאריך סיום, עד 90 יום קדימה
async function extendSeries(companyId: string, list: Series[]): Promise<Trip[]> {
  const horizon = addDays(todayKey(), SERIES_AHEAD_DAYS);
  const out: Trip[] = [];
  for (const x of list) {
    const last = x.until && x.until < horizon ? x.until : horizon;
    if (x.generatedUntil >= last) continue;
    const dates = repeatDates(x.repeat, x.start, last).filter((d) => d > x.generatedUntil);
    // Claim the days first (only if no one else did meanwhile), so two open screens don't both add them.
    const { data, error } = await supabase
      .from('schedule_series')
      .update({ generated_until: last })
      .eq('id', x.id)
      .eq('generated_until', x.generatedUntil)
      .select('id');
    if (error || !data?.length) continue;
    const before = x.generatedUntil;
    x.generatedUntil = last;
    const trips = seriesTrips(x, dates);
    try {
      await saveTrips(companyId, trips);
      out.push(...trips);
    } catch {
      // The next load tries again from the old day.
      x.generatedUntil = before;
      await supabase.from('schedule_series').update({ generated_until: before }).eq('id', x.id);
    }
  }
  return out;
}

/** Document folders with an expiry date (the latest file in each counts). */
const DOC_FOLDERS = VEHICLE_FOLDER_ALERTS.filter((f) => f.source === 'document' && !f.folderKey.startsWith('company_'));

// התוקפים של כל רכב: פריטי התוקף בכרטיס והקובץ האחרון בכל תיקייה
async function vehicleDocs(companyId: string, vehicleIds: string[]): Promise<Map<string, VehicleDoc[]>> {
  const out = new Map<string, VehicleDoc[]>();
  const push = (id: string, doc: VehicleDoc) => out.set(id, [...(out.get(id) ?? []), doc]);

  const compliance = await listComplianceForOwners('vehicle', vehicleIds);
  for (const [vehicleId, items] of compliance) {
    for (const def of VEHICLE_COMPLIANCE) {
      const until = complianceTargetDate(def, items.find((x) => x.item_type === def.itemType));
      if (until) push(vehicleId, { label: def.label, until, warnOnly: def.itemType === 'insurance_comprehensive' });
    }
  }

  const seen = new Set<string>();
  for (const batch of chunkIds(vehicleIds)) {
    const rows = await fetchAllPages<{ owner_id: string; category: string; expiry_date: string | null }>((from, to) =>
      supabase
        .from('documents')
        .select('owner_id, category, expiry_date')
        .eq('company_id', companyId)
        .eq('owner_type', 'vehicle')
        .in('owner_id', batch)
        .in('category', DOC_FOLDERS.map((f) => f.folderKey))
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to)
    );
    for (const row of rows) {
      const k = `${row.owner_id}|${row.category}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const folder = DOC_FOLDERS.find((f) => f.folderKey === row.category);
      if (folder && row.expiry_date) push(row.owner_id, { label: folder.label, until: row.expiry_date, warnOnly: false });
    }
  }
  return out;
}

// טוען את כל מה שהסידור צריך, מתאריך מסוים והלאה
export async function loadSchedule(companyId: string, fromDate: string): Promise<ScheduleData> {
  const [vehicleRows, driverRows] = await Promise.all([listVehicles(companyId), listDrivers(companyId)]);
  const [docs, trips, blocks, clients, saved, seriesRows] = await Promise.all([
    vehicleDocs(companyId, vehicleRows.map((v) => v.id)),
    loadTrips(companyId, fromDate),
    fetchAllPages<any>((from, to) =>
      supabase.from('schedule_blocks').select('*').eq('company_id', companyId).gte('end_date', fromDate).order('id').range(from, to)
    ),
    fetchAllPages<any>((from, to) => supabase.from('schedule_clients').select('id, name').eq('company_id', companyId).order('name').range(from, to)),
    fetchAllPages<any>((from, to) => supabase.from('schedule_saved_trips').select('*').eq('company_id', companyId).order('name').range(from, to)),
    fetchAllPages<any>((from, to) => supabase.from('schedule_series').select('*').eq('company_id', companyId).order('id').range(from, to)),
  ]);
  const series = seriesRows.map(toSeries);
  // נסיעות קבועות בלי סוף: משלימים את הנסיעות של החודשים הקרובים
  const added = await extendSeries(companyId, series);

  const vehicles: ScheduleVehicle[] = vehicleRows
    .map((v) => ({ id: v.id, plate: v.plate_number, type: v.vehicle_type, status: v.status, driverId: v.primary_driver_id, docs: docs.get(v.id) ?? [] }))
    .sort((a, b) => a.plate.localeCompare(b.plate));
  const drivers: ScheduleDriver[] = driverRows
    .map((d) => {
      const c = splitLicenseClasses(d.license_classes);
      return { id: d.id, name: d.full_name ?? '', licenseExpiry: d.license_expiry, classes: [c.primary, c.secondary].filter(Boolean) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

  return {
    vehicles,
    drivers,
    trips: [...trips, ...added],
    blocks: blocks.map((b): Block => ({ id: b.id, ownerType: b.owner_type, ownerId: b.vehicle_id ?? b.driver_id, from: b.start_date, to: b.end_date, reason: b.reason, details: b.details ?? '' })),
    clients: clients as Client[],
    series,
    saved: saved.map((s): SavedTrip => ({
      id: s.id, name: s.name, title: s.title, client: s.client_name ?? '', from: hhmm(s.start_time), to: hhmm(s.end_time), pickup: s.pickup ?? '', dest: s.destination ?? '',
    })),
  };
}

// הנסיעות מתאריך מסוים והלאה (כולל נסיעה של כמה ימים שהתחילה קודם)
export async function loadTrips(companyId: string, fromDate: string): Promise<Trip[]> {
  const rows = await fetchAllPages<TripRow>((from, to) =>
    supabase
      .from('schedule_trips')
      .select(TRIP_COLUMNS)
      .eq('company_id', companyId)
      .or(`trip_date.gte.${fromDate},end_date.gte.${fromDate}`)
      .order('trip_date')
      .order('id')
      .range(from, to)
  );
  return rows.map(toTrip);
}

// שומר נסיעות חדשות או מעודכנות
export async function saveTrips(companyId: string, trips: Trip[]) {
  for (const batch of chunkIds(trips.map((x) => x.id))) {
    const rows = trips.filter((x) => batch.includes(x.id)).map((x) => toRow(companyId, x));
    const { error } = await supabase.from('schedule_trips').upsert(rows);
    if (error) throw error;
  }
}

// מוחק נסיעות (רק בביטול פעולה של נסיעות שנוצרו עכשיו)
export async function deleteTrips(ids: string[]) {
  for (const batch of chunkIds(ids)) {
    const { error } = await supabase.from('schedule_trips').delete().in('id', batch);
    if (error) throw error;
  }
}

export async function saveBlock(companyId: string, block: Block) {
  const { error } = await supabase.from('schedule_blocks').upsert({
    id: block.id, company_id: companyId, owner_type: block.ownerType,
    vehicle_id: block.ownerType === 'vehicle' ? block.ownerId : null,
    driver_id: block.ownerType === 'driver' ? block.ownerId : null,
    start_date: block.from, end_date: block.to, reason: block.reason, details: block.details?.trim() || null,
  });
  if (error) throw error;
}

export async function deleteBlock(id: string) {
  const { error } = await supabase.from('schedule_blocks').delete().eq('id', id);
  if (error) throw error;
}

export async function addClient(companyId: string, client: Client) {
  const { error } = await supabase.from('schedule_clients').insert({ id: client.id, company_id: companyId, name: client.name });
  if (error) throw error;
}

export async function addSavedTrip(companyId: string, saved: SavedTrip) {
  const { error } = await supabase.from('schedule_saved_trips').insert({
    id: saved.id, company_id: companyId, name: saved.name, title: saved.title, client_name: saved.client || null,
    start_time: saved.from, end_time: saved.to, pickup: saved.pickup || null, destination: saved.dest || null,
  });
  if (error) throw error;
}

export async function deleteSavedTrip(id: string) {
  const { error } = await supabase.from('schedule_saved_trips').delete().eq('id', id);
  if (error) throw error;
}
