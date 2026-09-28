/**
 * The D2 battery setup (M9, docs/12 D2, doc 04's O2).
 *
 * Android OEMs aggressively stop background apps. A truck cab is full of the
 * worst offenders (Xiaomi/Redmi/POCO, Vivo/iQOO, Oppo/Realme/OnePlus), so D2
 * detects the manufacturer and shows that brand's exact steps, then opens the
 * relevant settings screen. Skippable — the screen never blocks — but D3 shows
 * a reminder banner when tracking gaps appear (M10's field data decides
 * whether the reminder needs to be stronger).
 *
 * Brand detection is `expo-device`'s `manufacturer`, which is lowercase and
 * inconsistent ("Xiaomi", "HUAWEI", "OnePlus"), so it is matched after
 * normalising. The instruction sets live here rather than in the screen so
 * they can be unit-tested without a device.
 */
import * as Device from "expo-device";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking, Platform } from "react-native";

export type BatteryBrand = "xiaomi" | "vivo" | "oppo" | "samsung" | "generic";

export type BatteryStep = {
  /** i18n key suffix under `onboarding.battery.steps.<brand>` */
  key: string;
  /** Material Symbols hint icon shown next to the step. */
  icon: string;
};

export type BatteryBrandInfo = {
  brand: BatteryBrand;
  /** i18n key suffix under `onboarding.battery.brands.<brand>`. */
  labelKey: string;
  steps: BatteryStep[];
  settingsKind: "intent" | "appSettings";
};

/** Steps per brand. `key` is the i18n suffix; order is the display order. */
const BRAND_INFO: Record<BatteryBrand, BatteryBrandInfo> = {
  xiaomi: {
    brand: "xiaomi",
    labelKey: "xiaomi",
    settingsKind: "intent",
    steps: [
      { key: "s1", icon: "settings" },
      { key: "s2", icon: "battery_saver" },
      { key: "s3", icon: "restart_alt" },
    ],
  },
  vivo: {
    brand: "vivo",
    labelKey: "vivo",
    settingsKind: "intent",
    steps: [
      { key: "s1", icon: "settings" },
      { key: "s2", icon: "battery_saver" },
      { key: "s3", icon: "check_circle" },
    ],
  },
  oppo: {
    brand: "oppo",
    labelKey: "oppo",
    settingsKind: "intent",
    steps: [
      { key: "s1", icon: "settings" },
      { key: "s2", icon: "battery_saver" },
      { key: "s3", icon: "visibility" },
    ],
  },
  samsung: {
    brand: "samsung",
    labelKey: "samsung",
    settingsKind: "intent",
    // Samsung is the tamest: the "unmonitored apps" list plus adaptive battery.
    steps: [
      { key: "s1", icon: "settings" },
      { key: "s2", icon: "battery_saver" },
      { key: "s3", icon: "task_alt" },
    ],
  },
  generic: {
    brand: "generic",
    labelKey: "generic",
    settingsKind: "appSettings",
    // No brand tricks known — stock Android's battery optimisation screen.
    steps: [
      { key: "s1", icon: "settings" },
      { key: "s2", icon: "battery_saver" },
      { key: "s3", icon: "check_circle" },
    ],
  },
};

/** Pure: normalise a manufacturer string into a D2 brand bucket. */
export function detectBatteryBrand(manufacturer: string | null | undefined): BatteryBrand {
  const value = (manufacturer ?? "").trim().toLowerCase();
  if (value === "") {
    return "generic";
  }
  // POCO is Xiaomi's sub-brand and ships the same MIUI screens; iQOO is Vivo's.
  if (/(xiaomi|redmi|poco)/.test(value)) {
    return "xiaomi";
  }
  if (/(vivo|iqoo)/.test(value)) {
    return "vivo";
  }
  // Realme runs ColorOS, same family as Oppo/OnePlus.
  if (/(oppo|realme|oneplus)/.test(value)) {
    return "oppo";
  }
  if (/samsung/.test(value)) {
    return "samsung";
  }
  return "generic";
}

/** The instruction set for a device, derived from its manufacturer string. */
export function batteryInfoForDevice(manufacturer: string | null | undefined): BatteryBrandInfo {
  return BRAND_INFO[detectBatteryBrand(manufacturer)];
}

/**
 * D2 only exists on Android (docs/12: "Battery Setup (Android)"). Web and iOS
 * render the "not needed" note instead of the flow.
 */
export function isBatterySetupNeeded(): boolean {
  return Platform.OS === "android";
}

const APP_SETTINGS_ACTION = IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS;

/** The application id from app.config.ts (same value the Mappls key is bound to). */
const ANDROID_PACKAGE = "com.nammalorry.driver";

/** Open this brand's battery/battery-optimisation settings screen. */
export async function openBatterySettings(brand: BatteryBrand): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }
  try {
    if (brand === "xiaomi") {
      await IntentLauncher.startActivityAsync(
        // MIUI's battery saver screen. Falls through to app settings when the
        // activity is not present on that device.
        "com.miui.securitycenter/com.miui.powerkeeper.PowerSettings",
        {},
      );
      return true;
    }
    if (brand === "vivo" || brand === "oppo") {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
        {},
      );
      return true;
    }
    if (brand === "samsung") {
      await IntentLauncher.startActivityAsync(
        // Device care → battery on modern One UI.
        "com.samsung.android.lox",
        {},
      );
      return true;
    }
    // Generic: the app's own settings page, where battery optimisation lives.
    await IntentLauncher.startActivityAsync(APP_SETTINGS_ACTION, {
      data: `package:${ANDROID_PACKAGE}`,
    });
    return true;
  } catch {
    // The exact component can be renamed per OEM skin; the app settings page
    // always exists, so fall back to it rather than doing nothing.
    try {
      await IntentLauncher.startActivityAsync(APP_SETTINGS_ACTION, {
        data: "package:com.nammalorry.driver",
      });
      return true;
    } catch {
      // IntentLauncher failed entirely (e.g. Android Go restrictions): the
      // driver can still find it from the app drawer.
      try {
        await Linking.openSettings();
        return true;
      } catch {
        return false;
      }
    }
  }
}

/**
 * D3's reminder banner text (module doc). Deliberately a pure function so the
 * reminder can be driven from tracking-gap data in M10 without a screen change.
 */
export function batteryReminderReason(): string {
  return "onboarding.battery.reminder";
}

/**
 * The manufacturer string D2's brand detection starts from. Null on web, where
 * the screen is not shown anyway; expo-device returns null rather than lying
 * when the build property is missing, which maps to the generic steps.
 */
export function readDeviceManufacturer(): string | null {
  if (Platform.OS !== "android") {
    return null;
  }
  return Device.manufacturer ?? null;
}
