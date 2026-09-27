/**
 * Assignment error mapping (M7).
 *
 * The two unique indexes in 0001 are the real enforcement behind "one open trip
 * per load" and "one live trip per driver". A dispatcher will hit both, so the
 * mapping from Postgres's index name to something an admin can act on is
 * behaviour worth pinning down rather than a stringly-typed afterthought.
 */
import { assignErrorKey } from "./useTrips";

describe("assignErrorKey", () => {
  it("explains the one-open-trip-per-load index in the admin's terms", () => {
    expect(
      assignErrorKey('duplicate key value violates unique constraint "trips_one_open_per_load"'),
    ).toBe("console.load.alreadyHasTrip");
  });

  it("explains the one-live-trip-per-driver index", () => {
    expect(
      assignErrorKey(
        'duplicate key value violates unique constraint "trips_one_active_per_driver"',
      ),
    ).toBe("console.load.driverOnTrip");
  });

  it("maps a foreign key back to the field that is actually wrong", () => {
    expect(assignErrorKey('insert violates foreign key constraint "trips_vehicle_id_fkey"')).toBe(
      "console.load.invalidVehicle",
    );
    expect(assignErrorKey('insert violates foreign key constraint "trips_driver_id_fkey"')).toBe(
      "console.load.invalidDriver",
    );
    expect(assignErrorKey('insert violates foreign key constraint "trips_load_id_fkey"')).toBe(
      "console.load.invalidId",
    );
  });

  it("falls back to a generic failure for anything unrecognised", () => {
    expect(assignErrorKey("connection reset")).toBe("console.load.assignFailed");
    expect(assignErrorKey("")).toBe("console.load.assignFailed");
  });

  it("never echoes the raw database message into the UI", () => {
    // The screen renders `t(assignErrorKey(message))`, so every branch has to
    // resolve to a key — never to the Postgres text itself.
    const postgresMessages = [
      'duplicate key value violates unique constraint "trips_one_open_per_load"',
      "permission denied for table trips",
      "row-level security violation",
    ];
    for (const message of postgresMessages) {
      expect(assignErrorKey(message)).toMatch(/^console\.load\./);
    }
  });
});
