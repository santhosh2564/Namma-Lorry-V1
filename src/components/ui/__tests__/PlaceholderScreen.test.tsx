import { render } from '@testing-library/react-native';
import { PlaceholderScreen } from '../PlaceholderScreen';

describe('PlaceholderScreen', () => {
  it('renders the screen ID, title and milestone', async () => {
    const screen = await render(
      <PlaceholderScreen screenId="S2" title="Sign in" milestone="M5" />,
    );

    expect(screen.getByTestId('placeholder-S2')).toBeTruthy();
    expect(screen.getByText('S2')).toBeTruthy();
    expect(screen.getByText('Sign in')).toBeTruthy();
    expect(screen.getByText('Coming in a later milestone (M5).')).toBeTruthy();
  });
});
