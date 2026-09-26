// D2 Battery Setup: brand-specific steps (docs/12 D2, risk "OEM battery killers").
// Pure so each brand mapping is unit-tested (batteryGuide.test.ts).
// Every guide starts from the app's own "App info" page, which "Open settings" opens:
// the battery and auto-start switches for Namma Lorry live there on all these skins.

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

const OPEN = 'Tap Open settings (it opens Namma Lorry’s App info).';

const GUIDES: Record<BatteryBrand, Omit<BatteryGuide, 'brand'>> = {
  xiaomi: {
    label: 'Xiaomi / Redmi / POCO',
    steps: [
      OPEN,
      'Tap Battery saver and choose No restrictions.',
      'Go back and turn on Autostart for Namma Lorry.',
    ],
  },
  vivo: {
    label: 'Vivo / iQOO',
    steps: [
      OPEN,
      'Tap Battery, then Background power consumption, and choose Allow (or turn on Allow high background power consumption).',
      'Turn on Autostart (in i Manager → App manager → Autostart manager on older phones).',
    ],
  },
  oppo: {
    label: 'Oppo / Realme / OnePlus',
    steps: [
      OPEN,
      'Tap Battery usage and turn on Allow background activity.',
      'Turn on Allow auto launch (Auto launch on some models).',
    ],
  },
  samsung: {
    label: 'Samsung',
    steps: [
      OPEN,
      'Tap Battery and choose Unrestricted.',
      'In Settings → Battery → Background usage limits, make sure Namma Lorry is not in Sleeping or Deep sleeping apps.',
    ],
  },
  generic: {
    label: null,
    steps: [
      OPEN,
      'Tap Battery and choose Unrestricted (or Don’t optimise).',
      'If you see Autostart or Auto launch, turn it on.',
    ],
  },
};

export function batteryGuide(brand: BatteryBrand): BatteryGuide {
  return { brand, ...GUIDES[brand] };
}
