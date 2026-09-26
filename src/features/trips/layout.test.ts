import { activeTripMapHeight, tripDetailMapHeight } from './layout';

it('the map gives up space when the system font is large', () => {
  expect(activeTripMapHeight(800, 1)).toBe(360);
  expect(activeTripMapHeight(800, 2)).toBe(240);
  expect(activeTripMapHeight(500, 2)).toBe(180);
  expect(tripDetailMapHeight(1)).toBe(320);
  expect(tripDetailMapHeight(1.5)).toBe(220);
});
