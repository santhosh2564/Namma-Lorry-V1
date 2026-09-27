import { render } from "@testing-library/react-native";

import { PlaceholderScreen } from "./PlaceholderScreen";

// RNTL v14 renders asynchronously — await render() in every test.
describe("PlaceholderScreen", () => {
  it("renders the screen id and title", async () => {
    const { getByText } = await render(<PlaceholderScreen screenId="S2" title="Sign in" />);

    expect(getByText("S2")).toBeTruthy();
    expect(getByText("Sign in")).toBeTruthy();
    expect(getByText(/Placeholder/)).toBeTruthy();
  });

  it("renders the optional note when provided", async () => {
    const { getByText } = await render(
      <PlaceholderScreen screenId="D4" title="Trip Detail & Start" note="trip: abc" />,
    );

    expect(getByText("trip: abc")).toBeTruthy();
  });
});
