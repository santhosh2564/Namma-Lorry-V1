import { snap } from './Slider';

describe('snap', () => {
  it('rounds to the step and clamps to the range', () => {
    expect(snap(512, 100, 2000, 50)).toBe(500);
    expect(snap(530, 100, 2000, 50)).toBe(550);
    expect(snap(20, 100, 2000, 50)).toBe(100);
    expect(snap(99999, 100, 2000, 50)).toBe(2000);
  });
});
