import { contrastRatio } from '../contrast';
import { colors } from '../tokens';

// Every text/background pair the screens use. WCAG AA: 4.5 for body text.
const textPairs: [keyof typeof colors, keyof typeof colors][] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['textSecondary', 'background'],
  ['textSecondary', 'surface'],
  ['primary', 'surface'],
  ['primary', 'background'],
  ['primary', 'primarySoft'],
  ['onPrimary', 'primary'],
  ['onPrimary', 'dangerText'],
  ['verifiedText', 'surface'],
  ['verifiedText', 'verifiedSoft'],
  ['reviewText', 'surface'],
  ['reviewText', 'reviewSoft'],
  ['dangerText', 'surface'],
  ['dangerText', 'dangerSoft'],
  ['liveText', 'surface'],
  ['liveText', 'liveSoft'],
];

describe('colour tokens contrast (WCAG AA)', () => {
  it.each(textPairs)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('flags the brief status colours as unsafe for small text on white', () => {
    // Documented in tokens.ts: these are fill/icon colours only.
    // (live #1A73E8 passes at 4.505:1 — too close to rely on, so it has liveText too.)
    for (const token of ['accent', 'review', 'verified'] as const) {
      expect(contrastRatio(colors[token], colors.surface)).toBeLessThan(4.5);
    }
  });

  it('computes known reference ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});
