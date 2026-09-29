import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import en from '@/i18n/en.json';
import { reportError } from '@/lib/sentry';
import { ErrorBoundary } from '../ErrorBoundary';

jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));

let shouldThrow = true;
function Bomb() {
  if (shouldThrow) throw new Error('render crash near 12.95631, 79.94221');
  return <Text>recovered</Text>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('shows the translated fallback, reports the error, and recovers on retry', async () => {
    shouldThrow = true;
    const screen = await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText(en.errors.boundaryTitle)).toBeTruthy();
    expect(screen.queryByText(/12\.95631/)).toBeNull(); // raw error text is never shown
    expect(reportError).toHaveBeenCalledTimes(1);

    shouldThrow = false;
    await fireEvent.press(screen.getByRole('button', { name: en.errors.boundaryRetry }));
    expect(screen.getByText('recovered')).toBeTruthy();
  });
});
