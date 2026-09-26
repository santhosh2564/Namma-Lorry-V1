import type { DriverTrip } from './api';
import { firstName, homeSections } from './home';

const trip = (id: string, status: string) => ({ id, status }) as unknown as DriverTrip;

describe('D3 homeSections', () => {
  it('empty when nothing is assigned or running', () => {
    expect(homeSections([], null)).toEqual({ live: null, assigned: [], empty: true });
    expect(homeSections(undefined, null).empty).toBe(true);
  });

  it('pins the server in-progress trip and lists assigned ones', () => {
    const s = homeSections([trip('a', 'assigned'), trip('b', 'in_progress'), trip('c', 'assigned')], null);
    expect(s.live?.id).toBe('b');
    expect(s.assigned.map((t) => t.id)).toEqual(['a', 'c']);
    expect(s.empty).toBe(false);
  });

  it('the trip tracking on this phone wins, even offline with no server data', () => {
    expect(homeSections(undefined, 'x')).toEqual({
      live: { id: 'x', trip: null },
      assigned: [],
      empty: false,
    });
    const s = homeSections([trip('x', 'assigned'), trip('y', 'assigned')], 'x');
    expect(s.live).toEqual({ id: 'x', trip: trip('x', 'assigned') });
    expect(s.assigned.map((t) => t.id)).toEqual(['y']);
  });
});

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName('Murugan S')).toBe('Murugan');
    expect(firstName('  Ravi  Kumar ')).toBe('Ravi');
    expect(firstName(null)).toBe('');
  });
});
