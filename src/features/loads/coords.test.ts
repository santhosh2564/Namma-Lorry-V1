import { parseCoords } from './coords';

describe('parseCoords', () => {
  it.each([
    ['12.9563, 79.9422', { lat: 12.9563, lng: 79.9422 }],
    ['12.9563 79.9422', { lat: 12.9563, lng: 79.9422 }],
    [' -1.5,36.8 ', { lat: -1.5, lng: 36.8 }],
  ])('%s', (t, p) => expect(parseCoords(t)).toEqual(p));

  it.each(['', '12.9', '91, 10', '12,abc', '12.9563; 79.9'])('rejects %s', (t) =>
    expect(parseCoords(t)).toBeNull(),
  );
});
