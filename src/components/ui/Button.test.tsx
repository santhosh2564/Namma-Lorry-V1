import { render } from "@testing-library/react-native";

import { Button } from "./Button";

// RNTL v14 renders asynchronously — await render() in every test.
describe("Button", () => {
  it("renders its label", async () => {
    const { getByText } = await render(<Button label="Send OTP" />);
    expect(getByText("Send OTP")).toBeTruthy();
  });

  it("renders every variant's label", async () => {
    for (const variant of [
      "primary",
      "secondary",
      "danger",
      "dangerOutline",
      "success",
      "outline",
      "text",
    ] as const) {
      const { getByText } = await render(<Button label={variant} variant={variant} />);
      expect(getByText(variant)).toBeTruthy();
    }
  });

  it("exposes a disabled accessibility state when disabled", async () => {
    const { getByRole } = await render(<Button disabled label="Disabled" />);
    expect(getByRole("button").props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("hides the label and reports busy while loading", async () => {
    const { queryByText, getByRole } = await render(<Button label="Saving" loading />);
    expect(queryByText("Saving")).toBeNull();
    expect(getByRole("button").props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });

  it("does not fire onPress while disabled", async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(<Button disabled label="Nope" onPress={onPress} />);
    getByRole("button").props.onPress?.();
    expect(onPress).not.toHaveBeenCalled();
  });
});
