import { SCREENS, screenList } from "./screens";

describe("SCREENS", () => {
  it("covers exactly the 21 screens of docs/12", () => {
    expect(Object.keys(SCREENS).sort()).toEqual(
      [
        "S1",
        "S2",
        "S3",
        "S4",
        "D1",
        "D2",
        "D3",
        "D4",
        "D5",
        "D6",
        "D7",
        "D8",
        "C1",
        "C2",
        "C3",
        "C4",
        "C5",
        "C6",
        "C7",
        "C8",
        "C9",
      ].sort(),
    );
    expect(screenList).toHaveLength(21);
  });

  it("has unique routes", () => {
    const routes = screenList.map((s) => s.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("matches the doc 04/12 route tree", () => {
    expect(SCREENS.S2.route).toBe("/(auth)/sign-in");
    expect(SCREENS.D4.route).toBe("/(driver)/trips/[id]");
    expect(SCREENS.D5.route).toBe("/(driver)/trips/[id]/live");
    expect(SCREENS.C6.route).toBe("/(console)/trips/[id]");
    // doc 12: no separate review decision screen
    expect(Object.keys(SCREENS)).not.toContain("C10");
  });
});
