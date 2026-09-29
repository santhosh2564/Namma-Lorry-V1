import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import en from '@/i18n/en.json';
import { fetchTrips } from '../data';
import { ReviewQueueScreen, TripHistoryScreen } from '../screens';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 't1' }),
}));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('../data', () => ({
  ...jest.requireActual('../data'),
  fetchTrips: jest.fn(),
  subscribe: jest.fn(() => () => undefined),
}));

const mockedFetchTrips = fetchTrips as jest.Mock;

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('M11 screens — network error and empty states', () => {
  beforeEach(() => mockedFetchTrips.mockReset());

  it('C7 shows an offline error with Retry, and recovers on retry', async () => {
    mockedFetchTrips
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce([]);
    const screen = await renderWithQuery(<ReviewQueueScreen />);
    await waitFor(() => expect(screen.getByTestId('error-state')).toBeTruthy());
    expect(screen.getByText(en.errors.network)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: en.common.retry }));
    await waitFor(() => expect(screen.getByText(en.console.review.emptyTitle)).toBeTruthy());
  });

  it('D7 shows the empty state for a driver with no trips (no demo data)', async () => {
    mockedFetchTrips.mockResolvedValue([]);
    const screen = await renderWithQuery(<TripHistoryScreen />);
    await waitFor(() => expect(screen.getByText(en.driver.history.emptyTitle)).toBeTruthy());
    expect(screen.queryByText(/Arun Kumar|Murugan S/)).toBeNull();
  });

  it('D7 status filters are labelled buttons at least 48 px tall', async () => {
    mockedFetchTrips.mockResolvedValue([]);
    const screen = await renderWithQuery(<TripHistoryScreen />);
    const filter = screen.getByRole('button', { name: 'Show Verified' });
    const style = [filter.props.style]
      .flat(Infinity)
      .reduce((acc, item) => ({ ...acc, ...item }), {});
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
  });
});
