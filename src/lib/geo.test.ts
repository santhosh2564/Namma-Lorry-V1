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
