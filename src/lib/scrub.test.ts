/**
 * PII scrubbing for crash reports (validation report B4, docs/09 §1 data
 * minimisation). Phone numbers and GPS coordinates must never leave the phone
 * inside a Sentry event, breadcrumb or extra.
 */
import { FILTERED, scrubEvent, scrubString, scrubValue } from "@/lib/scrub";

describe("scrubString", () => {
  it.each(["+91 98765 43210", "+919876543210", "919000000011", "98765-43210", "9876543210"])(
    "masks phone %s",
    (phone) => {
      expect(scrubString(`call ${phone} now`)).toBe("call [phone] now");
    },
  );

  it("masks high-precision coordinates in free text", () => {
    expect(scrubString("OUTSIDE at 12.9563, 79.94221")).toBe("OUTSIDE at [coord], [coord]");
  });

  it("keeps ordinary numbers, ids and codes", () => {
    const text =
      "OUTSIDE_PICKUP:3120 trip f0000000-0000-4000-8000-000000000001 took 42.5 km in 1.25 h (v2.1.0)";
    expect(scrubString(text)).toBe(text);
  });
});

describe("scrubValue", () => {
  it("filters phone and coordinate keys at any depth", () => {
    const input = {
      profile: { phone: "919000000011", full_name: "Murugan S" },
      body: { p_trip_id: "t1", p_lat: 12.9, p_lng: 79.9, p_accuracy_m: 8 },
      points: [{ lat: 13.1, lng: 80.2, seq: 1 }],
      load: { pickup_lat: 12.95, drop_lng: 76.96, load_code: "NL-2026-000142" },
    };
    expect(scrubValue(input)).toEqual({
      profile: { phone: FILTERED, full_name: "Murugan S" },
      body: { p_trip_id: "t1", p_lat: FILTERED, p_lng: FILTERED, p_accuracy_m: 8 },
      points: [{ lat: FILTERED, lng: FILTERED, seq: 1 }],
      load: { pickup_lat: FILTERED, drop_lng: FILTERED, load_code: "NL-2026-000142" },
    });
  });

  it("survives cycles without throwing", () => {
    const a: Record<string, unknown> = { name: "x" };
    a.self = a;
    expect(() => scrubValue(a)).not.toThrow();
  });
});

describe("scrubEvent", () => {
  it("reduces the user to an id and scrubs message, breadcrumbs and extras", () => {
    const event = {
      message: "Upload failed for 9876543210 near 13.08271, 80.27071",
      user: { id: "u1", phone: "+919876543210", ip_address: "1.2.3.4" },
      breadcrumbs: [
        { category: "fetch", data: { url: "/rest/v1/trips", body: '{"lat":12.9563}' } },
      ],
      extra: { coords: { latitude: 1, longitude: 2 } },
    };
    const out = scrubEvent(event);
    expect(out.user).toEqual({ id: "u1" });
    expect(out.message).toBe("Upload failed for [phone] near [coord], [coord]");
    expect(JSON.stringify(out)).not.toMatch(/9876543210|12\.9563|80\.2707/);
    expect(out.extra).toEqual({ coords: FILTERED });
  });
});
