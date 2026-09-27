import { bearing, circlePolygon, destinationPoint, haversineMetres } from "./geo";

const ORIGIN = { lat: 0, lng: 0 };
const SRI_PERUMBUDUR = { lat: 12.9698, lng: 79.9382 };
const COIMBATORE = { lat: 10.9878, lng: 76.9558 };

describe("haversineMetres", () => {
  it("is zero for the same point", () => {
    expect(haversineMetres(ORIGIN, ORIGIN)).toBe(0);
  });

  it("is ~111.2 km for one degree of latitude", () => {
    expect(haversineMetres(ORIGIN, { lat: 1, lng: 0 })).toBeCloseTo(111195, -2);
  });

  it("is symmetric", () => {
    const ab = haversineMetres(SRI_PERUMBUDUR, COIMBATORE);
    const ba = haversineMetres(COIMBATORE, SRI_PERUMBUDUR);
    expect(ab).toBeCloseTo(ba, 6);
  });

  it("matches the known Sriperumbudur → Coimbatore great-circle distance", () => {
    // ~392 km straight line; the planned road distance of 512 km is longer.
    const km = haversineMetres(SRI_PERUMBUDUR, COIMBATORE) / 1000;
    expect(km).toBeGreaterThan(385);
    expect(km).toBeLessThan(400);
  });
});

describe("bearing", () => {
  it("is 0 due north, 90 due east, 180 due south and 270 due west", () => {
    expect(bearing(ORIGIN, { lat: 1, lng: 0 })).toBeCloseTo(0, 5);
    expect(bearing(ORIGIN, { lat: 0, lng: 1 })).toBeCloseTo(90, 5);
    expect(bearing(ORIGIN, { lat: -1, lng: 0 })).toBeCloseTo(180, 5);
    expect(bearing(ORIGIN, { lat: 0, lng: -1 })).toBeCloseTo(270, 5);
  });

  it("always returns a value in [0, 360)", () => {
    const b = bearing(SRI_PERUMBUDUR, COIMBATORE);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
    // Coimbatore is south-west of Sriperumbudur.
    expect(b).toBeGreaterThan(180);
    expect(b).toBeLessThan(270);
  });
});

describe("destinationPoint", () => {
  it("moves the expected distance along a bearing", () => {
    const target = destinationPoint(ORIGIN, 1000, 45);
    expect(haversineMetres(ORIGIN, target)).toBeCloseTo(1000, 1);
    expect(bearing(ORIGIN, target)).toBeCloseTo(45, 3);
  });

  it("round-trips with haversineMetres", () => {
    const target = destinationPoint(SRI_PERUMBUDUR, 25000, 200);
    expect(haversineMetres(SRI_PERUMBUDUR, target)).toBeCloseTo(25000, 0);
  });
});

describe("circlePolygon", () => {
  it("returns a closed ring with steps + 1 vertices", () => {
    const ring = circlePolygon(SRI_PERUMBUDUR, 500, 32);
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("keeps every vertex on the geofence radius", () => {
    const ring = circlePolygon(SRI_PERUMBUDUR, 500, 24);
    for (const vertex of ring) {
      expect(haversineMetres(SRI_PERUMBUDUR, vertex)).toBeCloseTo(500, 0);
    }
  });

  it("rejects degenerate rings", () => {
    expect(() => circlePolygon(SRI_PERUMBUDUR, 500, 2)).toThrow();
  });
});
