// WCAG 2.1 contrast check of the colour pairs the UI actually uses (M12a, TRD §9).
// Text needs 4.5:1 (AA); icons/large marks need 3:1. Disabled controls are exempt.
import { colors } from './tokens';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

type C = keyof typeof colors;
const TEXT_PAIRS: [C, C, string][] = [
  ['text', 'background', 'body text'],
  ['text', 'surface', 'body text on cards'],
  ['textSecondary', 'surface', 'captions on cards'],
  ['textSecondary', 'background', 'captions on page'],
  ['textSecondary', 'surfaceMuted', 'captions in muted rows / neutral chip'],
  ['onPrimary', 'primary', 'primary button, header, sidebar'],
  ['onPrimary', 'danger', 'danger button'],
  ['onPrimary', 'verifiedStrong', 'success button'],
  ['primary', 'surface', 'outline button, info banner'],
  ['primary', 'surfaceMuted', 'info banner'],
  ['primary', 'accent', 'avatar initials on amber'],
  ['text', 'accentSoft', 'accent chip'],
  ['verifiedText', 'verifiedSoft', 'verified chip'],
  ['reviewText', 'accentSoft', 'review chip, warn banner'],
  ['dangerText', 'dangerSoft', 'danger chip, error banner'],
  ['liveText', 'liveSoft', 'live chip'],
  ['verifiedText', 'surface', 'verified text'],
  ['dangerText', 'surface', 'danger text'],
  ['dangerText', 'background', 'danger text on page'],
  ['liveText', 'surface', 'links'],
  ['danger', 'surface', 'danger outline button'],
];
const GRAPHIC_PAIRS: [C, C, string][] = [
  ['accent', 'primary', 'lorry mark on navy'],
  ['verified', 'surface', 'verified icons, pickup pin'],
  ['review', 'surface', 'review icons'],
  ['danger', 'surface', 'drop pin, error icons'],
  ['live', 'surface', 'live dot'],
];

describe('token contrast (WCAG AA)', () => {
  it.each(TEXT_PAIRS)('text %s on %s ≥ 4.5 (%s)', (fg, bg) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(GRAPHIC_PAIRS)('graphic %s on %s ≥ 3 (%s)', (fg, bg) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(3);
  });
});
