import en from '../en.json';
import hi from '../hi.json';
import kn from '../kn.json';
import ta from '../ta.json';
import i18n, { withoutTodos } from '../index';

type Tree = { [key: string]: string | Tree };

const leaves = (tree: Tree, prefix = ''): [string, string][] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[`${prefix}${key}`, value] as [string, string]]
      : leaves(value, `${prefix}${key}.`),
  );
const vars = (value: string) => [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

const enLeaves = new Map(leaves(en));

describe.each([
  ['ta', ta],
  ['kn', kn],
  ['hi', hi],
])('%s.json', (_locale, locale) => {
  const localeLeaves = new Map(leaves(locale as Tree));

  it('has exactly the same keys as en.json (run `npm run i18n:sync`)', () => {
    expect([...localeLeaves.keys()].sort()).toEqual([...enLeaves.keys()].sort());
  });

  it('keeps the same {{variables}} as English (TODO values included)', () => {
    for (const [key, value] of localeLeaves)
      expect([key, vars(value)]).toEqual([key, vars(enLeaves.get(key)!)]);
  });

  it('marks untranslated values with a TODO prefix, never a bare English copy', () => {
    const neutral = (key: string) =>
      key.startsWith('languages.') ||
      ['common.appName', 'common.none', 'common.separator'].includes(key);
    for (const [key, value] of localeLeaves) {
      if (neutral(key) || value.startsWith('TODO')) continue;
      expect([key, value]).not.toEqual([key, enLeaves.get(key)]);
    }
  });
});

describe('runtime fallback', () => {
  it('drops TODO values so users see English, not "TODO: …"', () => {
    expect(withoutTodos({ a: 'TODO: Hello', b: 'வணக்கம்', c: { d: 'TODO: x' } })).toEqual({
      b: 'வணக்கம்',
      c: {},
    });
  });

  it('renders English for an untranslated key when Tamil is selected', async () => {
    await i18n.changeLanguage('ta');
    expect(i18n.t('common.retry')).toBe('Retry');
    expect(i18n.t('languages.ta')).toBe('தமிழ்');
    await i18n.changeLanguage('en');
  });
});
