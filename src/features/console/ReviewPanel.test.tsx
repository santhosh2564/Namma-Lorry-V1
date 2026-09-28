/**
 * C6 component tests (M11, docs/12 C6).
 *
 * The review decision is the one place an operator changes somebody else's
 * record, so the assertions are about the guard rails: no note means no
 * decision, the note is kept, the buttons are disabled while it is in flight,
 * and a trip that is no longer in review shows its outcome instead of a form.
 *
 * `render` and `fireEvent` are both async in RNTL 14. An un-awaited
 * `fireEvent` leaves its act() scope open and every later query in the file
 * fails with "overlapping act() calls", so both are awaited throughout.
 */
import { fireEvent, render } from "@testing-library/react-native";

import "@/i18n";

import { ReviewPanel, type ReviewPanelProps } from "./ReviewPanel";
import { VerificationCard } from "./VerificationCard";
import { readVerificationMetrics } from "./verificationState";

function props(overrides: Partial<ReviewPanelProps> = {}): ReviewPanelProps {
  return {
    canReview: true,
    note: "",
    pending: false,
    errorKey: null,
    verifiedKm: 512,
    reviewedByName: null,
    reviewedNote: null,
    onNoteChange: jest.fn(),
    onDecide: jest.fn(),
    ...overrides,
  };
}

describe("ReviewPanel — a trip in review", () => {
  it("keeps both buttons disabled until there is a note", async () => {
    const { getByTestId, getByText } = await render(<ReviewPanel {...props()} />);

    expect(getByTestId("review-approve").props.accessibilityState?.disabled).toBe(true);
    expect(getByTestId("review-reject").props.accessibilityState?.disabled).toBe(true);
    expect(getByText("Enter a note to enable the decision.")).toBeTruthy();
  });

  it("enables the decision once a note is typed", async () => {
    const { getByTestId } = await render(
      <ReviewPanel {...props({ note: "Called the driver; the load was short by 400 kg." })} />,
    );

    expect(getByTestId("review-approve").props.accessibilityState?.disabled).toBe(false);
    expect(getByTestId("review-reject").props.accessibilityState?.disabled).toBe(false);
    expect(getByTestId("review-note-required")).toHaveTextContent(
      /^The note is saved with the decision\.$/,
    );
  });

  it("passes the typed note back and reports the decision", async () => {
    const onNoteChange = jest.fn();
    const onDecide = jest.fn();
    const { getByTestId } = await render(
      <ReviewPanel {...props({ note: "Checked with the driver.", onDecide, onNoteChange })} />,
    );

    await fireEvent.changeText(getByTestId("review-note"), "Called the depot.");
    expect(onNoteChange).toHaveBeenCalledWith("Called the depot.");

    await fireEvent.press(getByTestId("review-approve"));
    expect(onDecide).toHaveBeenCalledWith(true);

    await fireEvent.press(getByTestId("review-reject"));
    expect(onDecide).toHaveBeenCalledWith(false);
  });

  it("disables the decision while it is being saved", async () => {
    const { getByTestId } = await render(
      <ReviewPanel {...props({ note: "Checked.", pending: true })} />,
    );
    expect(getByTestId("review-approve").props.accessibilityState?.disabled).toBe(true);
  });

  it("shows the server's refusal as a sentence, not a database error", async () => {
    const { getByTestId, getByText } = await render(
      <ReviewPanel {...props({ note: "Checked.", errorKey: "console.review.notInReview" })} />,
    );
    expect(getByTestId("review-error")).toBeTruthy();
    expect(getByText("Another admin already decided this trip.")).toBeTruthy();
  });
});

describe("ReviewPanel — a trip that is not in review", () => {
  it("shows the outcome instead of a decision form", async () => {
    const { getByTestId, getByText, queryByTestId } = await render(
      <ReviewPanel
        {...props({
          canReview: false,
          verifiedKm: 512,
          reviewedByName: "Priya M",
          reviewedNote: "Called the driver, drop was inside the geofence.",
        })}
      />,
    );

    expect(getByTestId("review-outcome")).toBeTruthy();
    expect(queryByTestId("review-panel")).toBeNull();
    expect(queryByTestId("review-approve")).toBeNull();
    expect(getByText("Verified by review · 512 km")).toBeTruthy();
    expect(getByTestId("review-outcome-note")).toBeTruthy();
    expect(getByText(/Called the driver, drop was inside the geofence\./)).toBeTruthy();
  });
});

describe("VerificationCard", () => {
  const metrics = readVerificationMetrics({
    points: 3412,
    mocked: 0,
    jumps: 2,
    max_gap_s: 264,
    avg_kmh: 52.4,
    planned_ratio: 0.97,
    start_distance_m: 42,
    end_distance_m: 1804,
  });

  it("lists the reason codes with the sentence the driver was given", async () => {
    const { getByTestId, getByText } = await render(
      <VerificationCard metrics={metrics} pending={false} reasons={["END_OUTSIDE_DROP"]} />,
    );

    expect(getByTestId("verification-reason-END_OUTSIDE_DROP")).toBeTruthy();
    expect(getByText("END_OUTSIDE_DROP")).toBeTruthy();
    expect(getByText("Trip didn't end at the delivery location (1.8 km away)")).toBeTruthy();
  });

  it("shows a sub-kilometre miss in metres rather than as zero", async () => {
    const { getByText } = await render(
      <VerificationCard metrics={metrics} pending={false} reasons={["START_OUTSIDE_PICKUP"]} />,
    );
    expect(getByText("Trip didn't start at the pickup location (42 m away)")).toBeTruthy();
  });

  it("shows the measurements the verifier took", async () => {
    const { getByTestId, getByText } = await render(
      <VerificationCard metrics={metrics} pending={false} reasons={[]} />,
    );

    expect(getByTestId("verification-metric-points")).toBeTruthy();
    expect(getByText("3,412")).toBeTruthy();
    expect(getByText("4 min")).toBeTruthy();
    expect(getByText("52.4 km/h")).toBeTruthy();
    expect(getByText("0.97")).toBeTruthy();
    // "0 mocked" is a measurement, not a missing one.
    expect(getByTestId("verification-metric-mocked")).toBeTruthy();
  });

  it("says the system is still checking rather than showing zeros", async () => {
    const { getByText, queryByTestId } = await render(
      <VerificationCard metrics={readVerificationMetrics(null)} pending reasons={[]} />,
    );

    expect(getByText("The system is still checking this trip.")).toBeTruthy();
    expect(queryByTestId("verification-metrics")).toBeNull();
  });

  it("says a clean trip verified with no problems", async () => {
    const { getByText, queryByTestId } = await render(
      <VerificationCard metrics={metrics} pending={false} reasons={[]} />,
    );
    expect(getByText("Verified with no problems.")).toBeTruthy();
    expect(queryByTestId("verification-reasons")).toBeNull();
  });
});
