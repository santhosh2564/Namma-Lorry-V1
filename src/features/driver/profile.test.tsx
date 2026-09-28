/**
 * D8 component tests (M11, docs/12 D8).
 *
 * The verified experience is the number a driver's work is judged by, and nobody
 * edits it — not the driver, not an admin. The caption saying so in words is the
 * point of the card, so it is asserted as text rather than inferred from the
 * absence of an input.
 *
 * `render` is async in RNTL 14 and is awaited throughout.
 */
import { render } from "@testing-library/react-native";

import "@/i18n";

import { ProfileStatsCard } from "./ProfileStatsCard";

describe("ProfileStatsCard", () => {
  it("shows the verified trips, kilometres and last trip", async () => {
    const { getByTestId } = await render(
      <ProfileStatsCard
        lastVerifiedAt="2026-09-26T15:52:00.000Z"
        verifiedKm={14860}
        verifiedTrips={38}
      />,
    );

    expect(getByTestId("profile-stat-trips")).toHaveTextContent(/38/);
    expect(getByTestId("profile-stat-km")).toHaveTextContent(/14,860 km/);
    expect(getByTestId("profile-stat-last")).toHaveTextContent(/26 Sep 2026/);
  });

  it("says the numbers are calculated by Namma Lorry and cannot be edited", async () => {
    const { getAllByText } = await render(
      <ProfileStatsCard lastVerifiedAt={null} verifiedKm={0} verifiedTrips={0} />,
    );

    expect(
      getAllByText("Calculated by Namma Lorry from GPS — can't be edited").length,
    ).toBeGreaterThan(0);
  });

  it("shows a dash rather than a zero for a driver with no verified trip", async () => {
    const { getByTestId } = await render(
      <ProfileStatsCard lastVerifiedAt={null} verifiedKm={null} verifiedTrips={null} />,
    );

    expect(getByTestId("profile-stat-trips")).toHaveTextContent(/—/);
    expect(getByTestId("profile-stat-last")).toHaveTextContent(/Not yet/);
  });
});
