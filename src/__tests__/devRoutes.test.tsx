import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
    Stack: () => <Text testID="dev-stack">dev</Text>,
  };
});

const loadLayout = () => {
  let layout: () => ReactElement = () => <></>;
  jest.isolateModules(() => {
    layout = require('../../app/dev/_layout').default;
  });
  return layout;
};

describe('dev route guard', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;
  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
    jest.resetModules();
  });

  it('redirects every /dev route to the root in release builds', async () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    const DevLayout = loadLayout();
    const screen = await render(<DevLayout />);
    expect(screen.getByTestId('redirect').props.children).toBe('/');
    expect(screen.queryByTestId('dev-stack')).toBeNull();
  });

  it('renders the dev stack in development', async () => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    const DevLayout = loadLayout();
    const screen = await render(<DevLayout />);
    expect(screen.getByTestId('dev-stack')).toBeTruthy();
  });
});
