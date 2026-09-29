/**
 * Keeps the acceptance-route fixtures in step (M12b): test/gpx/routes.json is the source;
 * the pgTAP helpers, the generated GPX files and the seeded loads must agree with it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

type Route = {
  id: string;
  loadCode: string;
  intervalS: number;
  waypoints: [string, number, number][];
};
const { routes } = JSON.parse(read('test/gpx/routes.json')) as { routes: Route[] };
const helpers = read('supabase/tests/_helpers.psql');
const seed = read('supabase/seed.sql');

describe.each(routes.map((route) => [route.id, route] as const))('route %s', (id, route) => {
  it('pgTAP helper embeds exactly the same waypoints', () => {
    const block = helpers.split(`when '${id}' then array[`)[1]!.split(']')[0]!;
    const sqlPoints = [...block.matchAll(/st_makepoint\(([-\d.]+), ([-\d.]+)\)/g)].map((m) => [
      Number(m[2]),
      Number(m[1]),
    ]);
    expect(sqlPoints).toEqual(route.waypoints.map(([, lat, lng]) => [lat, lng]));
  });

  it('GPX file starts at the pickup, ends at the drop, fixes every intervalS seconds', () => {
    const gpx = read(`test/gpx/${id}.gpx`);
    const pts = [
      ...gpx.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"><time>([^<]+)<\/time>/g),
    ].map((m) => ({
      lat: Number(m[1]),
      lng: Number(m[2]),
      t: Date.parse(m[3]!),
    }));
    const [, pLat, pLng] = route.waypoints[0]!;
    const [, dLat, dLng] = route.waypoints.at(-1)!;
    expect(pts.length).toBeGreaterThan(100);
    expect(pts[0]).toMatchObject({ lat: pLat, lng: pLng });
    expect(pts.at(-1)!.lat).toBeCloseTo(dLat, 5);
    expect(pts.at(-1)!.lng).toBeCloseTo(dLng, 5);
    expect((pts[1]!.t - pts[0]!.t) / 1000).toBe(route.intervalS);
  });

  it('pickup/drop match the seeded load (so the GPX can drive a seeded trip)', () => {
    const [, pLat, pLng] = route.waypoints[0]!;
    const [, dLat, dLng] = route.waypoints.at(-1)!;
    expect(seed).toMatch(new RegExp(`${pLat}, ${pLng},[\\s\\S]{0,120}${dLat}, ${dLng}`));
  });
});
