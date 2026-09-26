// Dev-only routes are unreachable in release builds (M12a).
import { render, screen } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text: T } = jest.requireActual('react-native');
    return <T testID="redirect">{href}</T>;
  },
  Stack: () => {
    const { Text: T } = jest.requireActual('react-native');
    return <T testID="stack">dev</T>;
  },
}));

const g = globalThis as { __DEV__?: boolean };

afterEach(() => {
  g.__DEV__ = true;
});

it('release build (__DEV__ false): /dev/* redirects to /', async () => {
  g.__DEV__ = false;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DevLayout = require('../../app/dev/_layout').default;
  await render(<DevLayout />);
  expect(screen.getByTestId('redirect')).toHaveTextContent('/');
  expect(screen.queryByTestId('stack')).toBeNull();
});

it('dev build: the dev stack renders', async () => {
  g.__DEV__ = true;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DevLayout = require('../../app/dev/_layout').default;
  await render(<DevLayout />);
  expect(screen.getByTestId('stack')).toBeTruthy();
});

it('every dev tool lives under app/dev (behind that layout); none elsewhere', () => {
  const app = path.join(__dirname, '..', '..', 'app');
  const all: string[] = [];
  const walk = (d: string) =>
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else all.push(path.relative(app, p));
    });
  walk(app);
  const devish = all.filter((f) => /(^|\/)(dev|debug|kitchen|playground|test)[-/.]/i.test(f));
  expect(devish.every((f) => f.startsWith('dev/'))).toBe(true);
  expect(all).toContain('dev/_layout.tsx');
});
