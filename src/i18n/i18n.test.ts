/**
 * i18n key-parity test (M6).
 *
 * The ta/kn/hi bundles are TODO stubs until M12a. What matters today is that
 * they have exactly the English keys, so a screen never renders a raw key in
 * another language and a translator is never handed a missing string.
 */
import en from "./en.json";
import hi from "./hi.json";
import kn from "./kn.json";
import ta from "./ta.json";

type Bundle = { [key: string]: string | Bundle };

function keys(bundle: Bundle, prefix = ""): string[] {
  return Object.entries(bundle).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? keys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

function read(bundle: Bundle, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node as Bundle)[part], bundle);
}

const TRANSLATIONS: [string, Bundle][] = [
  ["ta", ta],
  ["kn", kn],
  ["hi", hi],
];

const englishKeys = keys(en).sort();

describe("i18n bundles", () => {
  it("gives every language exactly the English keys", () => {
    for (const [language, bundle] of TRANSLATIONS) {
      expect({ language, keys: keys(bundle).sort() }).toEqual({ language, keys: englishKeys });
    }
  });

  it("keeps every untranslated value visibly marked TODO", () => {
    for (const [language, bundle] of TRANSLATIONS) {
      const unmarked = englishKeys.filter((key) => {
        const value = read(bundle, key);
        return typeof value === "string" && !value.startsWith("TODO:");
      });

      expect({ language, unmarked }).toEqual({ language, unmarked: [] });
    }
  });

  it("has no empty English strings", () => {
    const empty = englishKeys.filter((key) => {
      const value = read(en, key);
      return typeof value === "string" && value.trim() === "";
    });
    expect(empty).toEqual([]);
  });
});
