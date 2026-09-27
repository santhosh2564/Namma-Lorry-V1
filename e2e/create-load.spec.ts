import { expect, test } from "@playwright/test";

import {
  ensureAssignableFixtures,
  installSession,
  isLoadCode,
  missingEnvKeys,
  readConfig,
  signInAsAdmin,
} from "./support/console";

/**
 * M7 end-to-end: an admin creates a load and assigns it (PRD P0-2, docs/10 §4).
 *
 * The spec needs a real Supabase project, a deployed `mappls-proxy` and a
 * `MAPPLS_REST_KEY`, because C3 geocodes the two addresses and asks the proxy
 * for the planned distance. With none of that configured it **skips with the
 * missing key names** rather than failing, so the suite is honest about not
 * having run instead of reporting a red that looks like a product bug.
 *
 * What it proves when it does run, end to end: the console guard admits the
 * admin, autosuggest resolves both ends to a point, the load is written with a
 * database-generated Load ID, and assigning it creates a `trips` row that the
 * detail screen shows back.
 */
const config = readConfig();

test.describe("create a load and assign it", () => {
  test.skip(config === null, `Needs: ${missingEnvKeys().join(", ")}`);

  test("an admin creates a load with two geocoded ends and assigns a driver", async ({ page }) => {
    const settings = config;
    if (settings === null) {
      return;
    }

    const session = await signInAsAdmin(settings);
    await installSession(page, settings, session);

    const fixtures = await ensureAssignableFixtures(settings);

    // --- C3: create the load ---------------------------------------------
    await page.goto("/loads/new");
    await expect(page.getByTestId("create-load-screen")).toBeVisible();

    // Pickup: type an address, take the first autosuggest result. The pin is
    // placed by the geocode that follows the choice.
    const pickup = page.getByTestId("create-load-pickup-address");
    await pickup.fill("Sriperumbudur");
    const pickupOption = page.getByTestId("create-load-pickup-option").first();
    await expect(pickupOption).toBeVisible();
    await pickupOption.click();

    // Drop.
    const drop = page.getByTestId("create-load-drop-address");
    await drop.fill("Coimbatore");
    const dropOption = page.getByTestId("create-load-drop-option").first();
    await expect(dropOption).toBeVisible();
    await dropOption.click();

    // The radius defaults to 500 m (doc 12 C3); the geofence is part of what
    // the verification will check later, so it is asserted rather than assumed.
    await expect(page.getByTestId("create-load-pickup-radius-value")).toHaveText(/500/);

    await page.getByTestId("create-load-material").fill("E2E granite blocks");
    await page.getByTestId("create-load-weight").fill("12");

    await page.getByTestId("create-load-submit").click();

    // --- C4: the load detail, with a database-generated code --------------
    await expect(page.getByTestId("load-detail-screen")).toBeVisible();
    const loadCode = (await page.getByTestId("load-detail-code").innerText()).trim();
    expect(isLoadCode(loadCode), `expected an NL-YYYY-NNNNNN code, got "${loadCode}"`).toBe(true);

    // The new load has no trip yet, so the assign card is showing.
    await expect(page.getByTestId("load-detail-assign")).toBeVisible();
    await expect(page.getByTestId("load-detail-status")).toHaveText(/Unassigned/i);

    // --- C4: assign the driver and the vehicle ---------------------------
    await page.getByTestId(`assign-driver-option-${fixtures.driverId}`).click();
    await page.getByTestId(`assign-vehicle-option-${fixtures.vehicleId}`).click();
    await page.getByTestId("assign-submit").click();

    // The resulting trip replaces the assign card and carries a status chip.
    const tripCard = page.getByTestId("load-detail-trip");
    await expect(tripCard).toBeVisible();
    await expect(tripCard.getByTestId(/^status-chip-/)).toBeVisible();
    await expect(tripCard).toContainText(fixtures.driverName);
    await expect(tripCard).toContainText(fixtures.registrationNo);

    // --- C2: the load is on the board and is no longer unassigned --------
    await page.goto("/loads");
    await expect(page.getByTestId("loads-screen")).toBeVisible();
    await page.getByTestId("loads-table").getByText(loadCode).click();

    await expect(page.getByTestId("load-detail-screen")).toBeVisible();
    await expect(page.getByTestId("load-detail-status")).toHaveText(/Assigned/i);
  });
});
