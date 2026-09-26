// Test doubles that mirror the real backend rules closely enough to test the engine:
// start_trip / end_trip (0001), trip_points RLS time window, upsert ignoreDuplicates.
import type { LocationLike } from '../mapping';
import type { UploadRow } from '../queue';
import type { LocationApi, ServerTrip } from '../stateMachine';

export class Clock {
  constructor(public t = Date.parse('2026-09-26T06:00:00.000Z')) {}
  now = () => this.t;
  advance(ms: number) {
    this.t += ms;
  }
}

interface Trip {
  id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  expected_points: number | null;
}

type Result = { data: ServerTrip | null; error: { message: string; code?: string } | null };

export class FakeServer {
  trips = new Map<string, Trip>();
  points = new Map<string, UploadRow>();
  offline = false;
  /** Commit the next RPC, then fail with a network error (response lost). */
  loseNextResponse = false;
  /** Distance from pickup the next start_trip computes. */
  distanceToPickupM = 100;
  pickupRadiusM = 500;
  upsertCalls: UploadRow[][] = [];
  rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

  constructor(private clock: Clock) {}

  addTrip(id: string, status = 'assigned') {
    this.trips.set(id, { id, status, started_at: null, ended_at: null, expected_points: null });
  }

  private net(): { message: string } {
    return { message: 'TypeError: Network request failed' };
  }
  private row(t: Trip): ServerTrip {
    return { id: t.id, status: t.status, started_at: t.started_at };
  }
  private received(id: string) {
    return [...this.points.values()].filter((p) => p.trip_id === id).length;
  }
  private maybeVerify(t: Trip) {
    if (
      t.status === 'completed' &&
      (t.expected_points === null || this.received(t.id) >= t.expected_points)
    ) {
      t.status = 'verified';
    }
  }
  private respond(r: Result): Result {
    if (this.loseNextResponse) {
      this.loseNextResponse = false;
      throw new Error('Network request failed');
    }
    return r;
  }

  rpc = async (fn: 'start_trip' | 'end_trip', args: Record<string, unknown>): Promise<Result> => {
    this.rpcCalls.push({ fn, args });
    if (this.offline) return { data: null, error: this.net() };
    const t = this.trips.get(String(args.p_trip_id));
    const err = (message: string) => ({ data: null, error: { message, code: 'P0001' } });
    if (!t) return err('TRIP_NOT_FOUND');
    const nowIso = new Date(this.clock.now()).toISOString();
    if (fn === 'start_trip') {
      if (t.status !== 'assigned') return err('TRIP_NOT_STARTABLE');
      if ([...this.trips.values()].some((x) => x.status === 'in_progress')) return err('ANOTHER_TRIP_ACTIVE');
      const acc = args.p_accuracy_m as number | null;
      if (acc === null || acc > 50) return err('GPS_ACCURACY_TOO_LOW');
      if (this.distanceToPickupM > this.pickupRadiusM + acc)
        return err(`OUTSIDE_PICKUP:${this.distanceToPickupM}`);
      t.status = 'in_progress';
      t.started_at = nowIso;
      return this.respond({ data: this.row(t), error: null });
    }
    if (t.status !== 'in_progress') return err('TRIP_NOT_ACTIVE');
    const ended = (args.p_ended_at as string | null) ?? nowIso;
    // Server clamps: least(greatest(p_ended_at, started_at), now())
    const atLeastStart = ended > t.started_at! ? ended : t.started_at!;
    t.ended_at = atLeastStart > nowIso ? nowIso : atLeastStart;
    t.expected_points = (args.p_expected_points as number | null) ?? null;
    t.status = 'completed';
    this.maybeVerify(t);
    return this.respond({ data: this.row(t), error: null });
  };

  /** trip_points RLS (points_driver_insert) + ON CONFLICT DO NOTHING. */
  upsert = async (rows: UploadRow[]): Promise<{ error: { message: string; code?: string } | null }> => {
    this.upsertCalls.push(rows);
    if (this.offline) return { error: this.net() };
    const now = this.clock.now();
    for (const r of rows) {
      const t = this.trips.get(r.trip_id);
      const at = Date.parse(r.recorded_at);
      const ok =
        !!t &&
        !!t.started_at &&
        (t.status === 'in_progress' ||
          (t.status === 'completed' && at <= Date.parse(t.ended_at!) + 120_000)) &&
        at >= Date.parse(t.started_at) - 60_000 &&
        at <= now + 120_000;
      if (!ok)
        return {
          error: {
            code: '42501',
            message: 'new row violates row-level security policy for table "trip_points"',
          },
        };
    }
    for (const r of rows) {
      const k = `${r.trip_id}:${r.seq}`;
      if (!this.points.has(k)) this.points.set(k, r);
    }
    for (const id of new Set(rows.map((r) => r.trip_id))) this.maybeVerify(this.trips.get(id)!);
    if (this.loseNextResponse) {
      this.loseNextResponse = false;
      return { error: this.net() };
    }
    return { error: null };
  };

  fetchTrip = async (id: string): Promise<ServerTrip | null> => {
    if (this.offline) throw new Error('Network request failed');
    const t = this.trips.get(id);
    return t ? this.row(t) : null;
  };

  setStatus(id: string, status: string) {
    this.trips.get(id)!.status = status;
  }
}

export class FakeLocation implements LocationApi {
  calls: string[] = [];
  started = false;
  fg = true;
  bg = true;
  services = true;
  fixDelayMs = 0;
  constructor(
    private clock: Clock,
    public fix: { lat: number; lng: number; accuracy: number } = { lat: 12.7409, lng: 77.8253, accuracy: 8 },
  ) {}
  async getForegroundPermissionsAsync() {
    return { granted: this.fg };
  }
  async getBackgroundPermissionsAsync() {
    return { granted: this.bg };
  }
  async hasServicesEnabledAsync() {
    return this.services;
  }
  async getCurrentPositionAsync(): Promise<LocationLike> {
    this.calls.push('getCurrentPosition');
    if (this.fixDelayMs) await new Promise((r) => setTimeout(r, this.fixDelayMs));
    return location(this.clock.now(), this.fix.lat, this.fix.lng, this.fix.accuracy);
  }
  async startLocationUpdatesAsync(task: string) {
    this.calls.push(`start:${task}`);
    this.started = true;
  }
  async stopLocationUpdatesAsync(task: string) {
    this.calls.push(`stop:${task}`);
    this.started = false;
  }
  async hasStartedLocationUpdatesAsync() {
    return this.started;
  }
}

export function location(ts: number, lat: number, lng: number, accuracy = 8, mocked = false): LocationLike {
  return {
    timestamp: ts,
    mocked,
    coords: { latitude: lat, longitude: lng, accuracy, speed: 10, heading: 45, altitude: 900 },
  };
}
