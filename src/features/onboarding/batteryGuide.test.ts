import { batteryGuide, detectBrand } from './batteryGuide';

describe('detectBrand', () => {
  it.each([
    ['Xiaomi', 'Redmi', 'xiaomi'],
    ['Xiaomi', 'POCO', 'xiaomi'],
    ['xiaomi', 'xiaomi', 'xiaomi'],
    [null, 'Redmi', 'xiaomi'],
    ['vivo', 'vivo', 'vivo'],
    ['vivo', 'iQOO', 'vivo'],
    ['OPPO', 'OPPO', 'oppo'],
    ['realme', 'realme', 'oppo'],
    ['OnePlus', 'OnePlus', 'oppo'],
    ['samsung', 'samsung', 'samsung'],
    ['Google', 'google', 'generic'],
    ['motorola', 'motorola', 'generic'],
    [null, null, 'generic'],
    ['', '  ', 'generic'],
  ])('%s / %s → %s', (manufacturer, brand, expected) => {
    expect(detectBrand(manufacturer, brand)).toBe(expected);
  });

  it('does not match brand names inside other words', () => {
    expect(detectBrand('Vivobook Corp', null)).toBe('generic');
  });
});

describe('batteryGuide', () => {
  it('gives every brand a label (except generic) and 3 steps starting with Open settings', () => {
    for (const b of ['xiaomi', 'vivo', 'oppo', 'samsung', 'generic'] as const) {
      const g = batteryGuide(b);
      expect(g.brand).toBe(b);
      expect(g.steps).toHaveLength(3);
      expect(g.steps[0]).toMatch(/Open settings/);
      expect(g.label === null).toBe(b === 'generic');
    }
  });

  it('uses brand-specific wording', () => {
    expect(batteryGuide('xiaomi').steps.join(' ')).toMatch(/No restrictions.*Autostart/);
    expect(batteryGuide('vivo').steps.join(' ')).toMatch(/Background power consumption/);
    expect(batteryGuide('oppo').steps.join(' ')).toMatch(/Allow background activity.*auto launch/);
    expect(batteryGuide('samsung').steps.join(' ')).toMatch(/Unrestricted.*Deep sleeping/);
    expect(batteryGuide('xiaomi').label).toBe('Xiaomi / Redmi / POCO');
  });
});
