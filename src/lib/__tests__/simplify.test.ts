import { douglasPeucker, MAX_DISPLAY_POINTS, simplifyForDisplay, type LatLng } from '../simplify';

// Sriperumbudur → Coimbatore, 12,000 points with ±3 m GPS jitter and one real turn.
function noisyRoute(count: number): (LatLng & { seq: number })[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const turn = t < 0.5 ? t * 2 : 1;
    const jitter = (Math.sin(i * 12.9898) * 43758.5453) % 1; // deterministic noise in [-1, 1]
    return {
      seq: i + 1,
      lat: 12.9563 + (10.9608 - 12.9563) * t + jitter * 0.00003,
      lng: 79.9422 + (76.9656 - 79.9422) * turn + jitter * 0.00003,
    };
  });
}

describe('douglasPeucker', () => {
  it('collapses collinear points to the endpoints', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({
      lat: 13 + i * 0.001,
      lng: 80 + i * 0.001,
    }));
    expect(douglasPeucker(line, 1)).toEqual([line[0], line[49]]);
  });

  it('keeps a corner that exceeds the tolerance', () => {
    const corner = [
      { lat: 13, lng: 80 },
      { lat: 13.01, lng: 80 },
      { lat: 13.01, lng: 80.01 },
    ];
    expect(douglasPeucker(corner, 10)).toHaveLength(3);
  });

  it('handles tiny inputs and duplicate points', () => {
    expect(douglasPeucker([], 5)).toEqual([]);
    const p = { lat: 13, lng: 80 };
    expect(douglasPeucker([p, p, p], 5)).toEqual([p, p]);
  });
});

describe('simplifyForDisplay', () => {
  it('caps a long trip at MAX_DISPLAY_POINTS, keeping endpoints and order', () => {
    const route = noisyRoute(12_000);
    const out = simplifyForDisplay(route);
    expect(out.length).toBeLessThanOrEqual(MAX_DISPLAY_POINTS);
    expect(out[0]).toBe(route[0]);
    expect(out[out.length - 1]).toBe(route[route.length - 1]);
    const seqs = out.map((p) => p.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  it('returns short routes unchanged (display never drops data it can afford)', () => {
    const route = noisyRoute(100);
    expect(simplifyForDisplay(route)).toEqual(route);
  });

  it('does not mutate the input', () => {
    const route = noisyRoute(2_000);
    const copy = route.map((p) => ({ ...p }));
    simplifyForDisplay(route, 50);
    expect(route).toEqual(copy);
  });
});
