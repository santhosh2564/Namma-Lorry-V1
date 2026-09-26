import { bearingDeg, bounds, circlePolygon, destination, haversineM, isLatLng } from './geo';

const sriperumbudur = { lat: 12.9563, lng: 79.9422 };
const coimbatore = { lat: 10.9608, lng: 76.9656 };

describe('geo', () => {
  it('haversine: Sriperumbudur → Coimbatore straight line ≈ 390 km', () => {
    expect(haversineM(sriperumbudur, coimbatore) / 1000).toBeCloseTo(390, -1);
    expect(haversineM(sriperumbudur, sriperumbudur)).toBe(0);
  });

  it('bearing: due north / east', () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0);
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90);
  });

  it('destination round-trips with haversine', () => {
    const p = destination(sriperumbudur, 45, 500);
    expect(haversineM(sriperumbudur, p)).toBeCloseTo(500, 1);
  });

  it('circle polygon: closed ring at the radius', () => {
    const ring = circlePolygon(sriperumbudur, 500, 32);
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[32]);
    for (const p of ring) expect(haversineM(sriperumbudur, p)).toBeCloseTo(500, 0);
  });

  it('bounds in [lng, lat] order', () => {
    expect(bounds([sriperumbudur, coimbatore])).toEqual([
      [76.9656, 10.9608],
      [79.9422, 12.9563],
    ]);
    expect(bounds([])).toBeNull();
  });

  it('isLatLng', () => {
    expect(isLatLng(sriperumbudur)).toBe(true);
    expect(isLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isLatLng({ lat: NaN, lng: 0 })).toBe(false);
    expect(isLatLng(null)).toBe(false);
  });
});

describe('display simplification (Douglas–Peucker)', () => {
  const { douglasPeucker, simplifyForDisplay, MAX_DISPLAY_POINTS } = jest.requireActual(
    './geo',
  ) as typeof import('./geo');
  const line = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: 12.9 + i * 0.0001, lng: 79.9 }));

  it('collapses a straight line to its ends and keeps a corner', () => {
    expect(douglasPeucker(line(500), 1)).toEqual([line(500)[0], line(500)[499]]);
    const corner = [
      ...line(50),
      ...Array.from({ length: 50 }, (_, i) => ({ lat: 12.9049, lng: 79.9 + (i + 1) * 0.0001 })),
    ];
    const s = douglasPeucker(corner, 1);
    expect(s).toHaveLength(3);
    expect(s[1]).toEqual(corner[49]);
  });

  it('caps long tracks for display, keeps both ends, leaves short ones alone', () => {
    const zigzag = Array.from({ length: 20_000 }, (_, i) => ({
      lat: 12.9 + i * 0.0001,
      lng: 79.9 + (i % 2) * 0.001,
    }));
    const s = simplifyForDisplay(zigzag);
    expect(s.length).toBeLessThanOrEqual(MAX_DISPLAY_POINTS);
    expect(s[0]).toBe(zigzag[0]);
    expect(s.at(-1)).toBe(zigzag.at(-1));
    const short = line(10);
    expect(simplifyForDisplay(short)).toBe(short);
  });

  it('a real-looking 10 h track (3,600 points, GPS noise) is reduced to the cap, not to a stub', () => {
    const track = Array.from({ length: 3_600 }, (_, i) => ({
      lat: 12.9 + i * 0.0003 + Math.sin(i / 40) * 0.002 + ((i * 7919) % 13) * 1e-6,
      lng: 79.9 + i * 0.0002,
    }));
    const s = simplifyForDisplay(track, 500);
    expect(s.length).toBeLessThanOrEqual(500);
    expect(s.length).toBeGreaterThan(50);
  });
});
