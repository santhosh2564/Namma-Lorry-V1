// Pure helpers that turn raw console queries into table rows (unit-tested).

export type Activity = 'on_trip' | 'available' | 'inactive';

export interface TripActivity {
  driver_id: string;
  vehicle_id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface DriverRow {
  id: string;
  fullName: string;
  phone: string;
  verifiedTrips: number;
  verifiedKm: number;
  lastTripAt: string | null;
  status: Activity;
}

export interface VehicleRow {
  id: string;
  registrationNo: string;
  vehicleType: string;
  ownerName: string | null;
  trips: number;
  lastUsedAt: string | null;
  status: 'on_trip' | 'available';
}

/** "919000000011" or "+919000000011" → "+91 90000 00011". */
export function formatPhone(stored: string | null): string {
  if (!stored) return '—';
  const d = stored.replace(/\D/g, '');
  const n = d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
  return n.length === 10 ? `+91 ${n.slice(0, 5)} ${n.slice(5)}` : stored;
}

function latest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** Latest activity time of a trip: when it ended, else when it started. */
const tripTime = (t: TripActivity) => t.ended_at ?? t.started_at;

export function buildDriverRows(
  profiles: { id: string; full_name: string; phone: string | null; is_active: boolean }[],
  stats: { driver_id: string; verified_trips: number; verified_distance_m: number }[],
  trips: TripActivity[],
): DriverRow[] {
  const statsBy = new Map(stats.map((s) => [s.driver_id, s]));
  const last = new Map<string, string | null>();
  const onTrip = new Set<string>();
  for (const t of trips) {
    last.set(t.driver_id, latest(last.get(t.driver_id) ?? null, tripTime(t)));
    if (t.status === 'in_progress') onTrip.add(t.driver_id);
  }
  return profiles.map((p) => {
    const s = statsBy.get(p.id);
    return {
      id: p.id,
      fullName: p.full_name || '—',
      phone: formatPhone(p.phone),
      verifiedTrips: s?.verified_trips ?? 0,
      // Server-computed distance (verify_trip); shown in km with one decimal.
      verifiedKm: Math.round((s?.verified_distance_m ?? 0) / 100) / 10,
      lastTripAt: last.get(p.id) ?? null,
      status: !p.is_active ? 'inactive' : onTrip.has(p.id) ? 'on_trip' : 'available',
    };
  });
}

export function buildVehicleRows(
  vehicles: {
    id: string;
    registration_no: string;
    vehicle_type: string;
    owner: { full_name: string } | null;
  }[],
  trips: TripActivity[],
): VehicleRow[] {
  const count = new Map<string, number>();
  const last = new Map<string, string | null>();
  const onTrip = new Set<string>();
  for (const t of trips) {
    count.set(t.vehicle_id, (count.get(t.vehicle_id) ?? 0) + 1);
    last.set(t.vehicle_id, latest(last.get(t.vehicle_id) ?? null, t.started_at));
    if (t.status === 'in_progress') onTrip.add(t.vehicle_id);
  }
  return vehicles.map((v) => ({
    id: v.id,
    registrationNo: v.registration_no,
    vehicleType: v.vehicle_type,
    ownerName: v.owner?.full_name || null,
    trips: count.get(v.id) ?? 0,
    lastUsedAt: last.get(v.id) ?? null,
    status: onTrip.has(v.id) ? 'on_trip' : 'available',
  }));
}

/** Case-insensitive match on any of the given fields (spaces ignored for plate/phone searches). */
export function matchesSearch(q: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const compact = needle.replace(/\s/g, '');
  return fields.some((f) => {
    const hay = (f ?? '').toLowerCase();
    return hay.includes(needle) || hay.replace(/\s/g, '').includes(compact);
  });
}

export type SearchTarget = { path: '/console/loads' | '/console/vehicles' | '/console/drivers'; q: string };

/** Global console search: Load ID → Loads, plate → Vehicles, anything else → Drivers. */
export function routeSearch(raw: string): SearchTarget | null {
  const q = raw.trim();
  if (!q) return null;
  if (/^NL-?\d{0,4}-?\d*$/i.test(q) && /^NL/i.test(q)) return { path: '/console/loads', q: q.toUpperCase() };
  const compact = q.toUpperCase().replace(/[\s.-]/g, '');
  if (/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{0,4}$/.test(compact) || /^\d{2}BH/.test(compact)) {
    return { path: '/console/vehicles', q };
  }
  return { path: '/console/drivers', q };
}
