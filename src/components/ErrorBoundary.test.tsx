import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';

import { AppErrorBoundary } from './ErrorBoundary';

const mockReport = jest.fn();
jest.mock('@/lib/sentry', () => ({ reportError: (...a: unknown[]) => mockReport(...a) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

let shouldThrow = true;
function Boom() {
  const [n] = useState(0);
  if (shouldThrow) throw new Error(`render failed ${n}`);
  return <Text>recovered</Text>;
}

it('shows the crash screen, reports once, and recovers on retry', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await render(
    <AppErrorBoundary>
      <Boom />
    </AppErrorBoundary>,
  );
  expect(screen.getByTestId('error-boundary')).toHaveTextContent(/Something went wrong/);
  expect(screen.queryByText(/render failed/)).toBeNull(); // raw error text is never shown
  expect(mockReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ boundary: 'app' }));
  shouldThrow = false;
  await fireEvent.press(screen.getByTestId('error-retry'));
  expect(screen.getByText('recovered')).toBeTruthy();
});
