import { Platform } from "react-native";

import {
  batteryInfoForDevice,
  detectBatteryBrand,
  isBatterySetupNeeded,
} from "@/features/onboarding/battery";

jest.mock("expo-intent-launcher", () => ({
  ActivityAction: {
    APPLICATION_DETAILS_SETTINGS: "android.settings.APPLICATION_DETAILS_SETTINGS",
    IGNORE_BATTERY_OPTIMIZATION_SETTINGS: "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS",
  },
  startActivityAsync: jest.fn(),
}));

describe("detectBatteryBrand", () => {
  it("maps Xiaomi family (incl. POCO sub-brand) to xiaomi", () => {
    expect(detectBatteryBrand("Xiaomi")).toBe("xiaomi");
    expect(detectBatteryBrand("Redmi")).toBe("xiaomi");
    expect(detectBatteryBrand("POCO")).toBe("xiaomi");
  });

  it("maps Vivo family (incl. iQOO) to vivo", () => {
    expect(detectBatteryBrand("vivo")).toBe("vivo");
    expect(detectBatteryBrand("iQOO")).toBe("vivo");
  });

  it("maps the ColorOS family to oppo", () => {
    expect(detectBatteryBrand("OPPO")).toBe("oppo");
    expect(detectBatteryBrand("realme")).toBe("oppo");
    expect(detectBatteryBrand("OnePlus")).toBe("oppo");
  });

  it("maps Samsung and normalises case", () => {
    expect(detectBatteryBrand("samsung")).toBe("samsung");
    expect(detectBatteryBrand("SAMSUNG")).toBe("samsung");
  });

  it("falls back to generic for unknown brands and empty input", () => {
    expect(detectBatteryBrand("HMD Global")).toBe("generic");
    expect(detectBatteryBrand("")).toBe("generic");
    expect(detectBatteryBrand(null)).toBe("generic");
    expect(detectBatteryBrand(undefined)).toBe("generic");
  });
});

describe("batteryInfoForDevice", () => {
  it("returns brand-specific steps with the brand's settings kind", () => {
    const info = batteryInfoForDevice("Xiaomi");
    expect(info.brand).toBe("xiaomi");
    expect(info.steps).toHaveLength(3);
    expect(info.steps.every((step) => step.key.length > 0)).toBe(true);
    expect(info.settingsKind).toBe("intent");
  });

  it("returns generic steps for unknown manufacturers", () => {
    const info = batteryInfoForDevice("Nokia");
    expect(info.brand).toBe("generic");
    expect(info.settingsKind).toBe("appSettings");
  });
});

describe("isBatterySetupNeeded", () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: originalOS, writable: true });
  });

  it("is true on android only", () => {
    Object.defineProperty(Platform, "OS", { value: "android", writable: true });
    expect(isBatterySetupNeeded()).toBe(true);
    Object.defineProperty(Platform, "OS", { value: "ios", writable: true });
    expect(isBatterySetupNeeded()).toBe(false);
    Object.defineProperty(Platform, "OS", { value: "web", writable: true });
    expect(isBatterySetupNeeded()).toBe(false);
  });
});
