// D2 Battery Setup: brand-specific steps (docs/12 D2, risk "OEM battery killers").
// Pure so each brand mapping is unit-tested (batteryGuide.test.ts).
// Every guide starts from the app's own "App info" page, which "Open settings" opens:
// the battery and auto-start switches for Namma Lorry live there on all these skins.
import { t } from '@/i18n';

export type BatteryBrand = 'xiaomi' | 'vivo' | 'oppo' | 'samsung' | 'generic';

export interface BatteryGuide {
  brand: BatteryBrand;
  /** Chip text, e.g. "Xiaomi / Redmi / POCO". Null when the brand is unknown. */
  label: string | null;
  steps: string[];
}

const BRAND_KEYS: [BatteryBrand, string[]][] = [
  ['xiaomi', ['xiaomi', 'redmi', 'poco']],
  ['vivo', ['vivo', 'iqoo']],
  ['oppo', ['oppo', 'realme', 'oneplus']],
  ['samsung', ['samsung']],
];

/** `manufacturer` and `brand` from expo-device; either may be null or oddly cased. */
export function detectBrand(manufacturer: string | null, brand: string | null): BatteryBrand {
  const values = [manufacturer, brand].map((v) => (v ?? '').trim().toLowerCase()).filter(Boolean);
  for (const [key, names] of BRAND_KEYS) {
    if (values.some((v) => names.some((n) => v === n || v.startsWith(`${n} `)))) return key;
  }
  return 'generic';
}

/** Brand chip text: brand names, not translated. */
const LABELS: Record<BatteryBrand, string | null> = {
  xiaomi: 'Xiaomi / Redmi / POCO',
  vivo: 'Vivo / iQOO',
  oppo: 'Oppo / Realme / OnePlus',
  samsung: 'Samsung',
  generic: null,
};

/** Steps are in en.json battery.guide: "open" first, then the brand's own steps. */
export function batteryGuide(brand: BatteryBrand): BatteryGuide {
  return { brand, label: LABELS[brand], steps: [t.battery.guide.open, ...t.battery.guide[brand]] };
}
