import type { ExpoConfig } from "expo/config";

import { appEnvFrom, buildConfig } from "./app.config";

/**
 * app.config.ts assertions (validation report M3, M11; B5a).
 *
 * The permission strings are docs/09 §3 verbatim: the Play declaration and the
 * App Review notes quote them, so change them only together with those docs.
 * Mod-level results (the merged Android manifest, the final iOS Info.plist)
 * need `expo config --type introspect`: see test/config/introspect.test.mjs.
 */
const WHEN_IN_USE =
  "Namma Lorry uses your location to start and end trips at the pickup and delivery points.";
const ALWAYS =
  "Namma Lorry records your route in the background only while a trip you started is in progress, so your driving experience can be verified.";

const pluginName = (p: NonNullable<ExpoConfig["plugins"]>[number]) => (Array.isArray(p) ? p[0] : p);

const pluginOptions = (config: ExpoConfig, name: string) => {
  const entry = config.plugins?.find((p) => pluginName(p) === name);
  return Array.isArray(entry) ? (entry[1] as Record<string, unknown>) : undefined;
};

describe("app.config", () => {
  const prod = buildConfig({ EXPO_PUBLIC_APP_ENV: "production" });

  it("uses the docs/09 §3 location strings for every iOS location key and drops motion", () => {
    expect(pluginOptions(prod, "expo-location")).toMatchObject({
      locationWhenInUsePermission: WHEN_IN_USE,
      locationAlwaysAndWhenInUsePermission: ALWAYS,
      locationAlwaysPermission: ALWAYS,
      // No motion APIs are used; `false` removes NSMotionUsageDescription.
      motionUsagePermission: false,
      isIosBackgroundLocationEnabled: true,
      isAndroidBackgroundLocationEnabled: true,
      isAndroidForegroundServiceEnabled: true,
      isAndroidMotionActivityEnabled: false,
    });
  });

  it("declares only the location background mode on iOS", () => {
    expect(prod.ios?.infoPlist?.UIBackgroundModes).toEqual(["location"]);
  });

  it("ships an iOS privacy manifest with required-reason API entries", () => {
    const types = prod.ios?.privacyManifests?.NSPrivacyAccessedAPITypes ?? [];
    expect(types.map((t) => t.NSPrivacyAccessedAPIType)).toEqual(
      expect.arrayContaining([
        "NSPrivacyAccessedAPICategoryUserDefaults",
        "NSPrivacyAccessedAPICategoryFileTimestamp",
        "NSPrivacyAccessedAPICategorySystemBootTime",
        "NSPrivacyAccessedAPICategoryDiskSpace",
      ]),
    );
    for (const t of types) expect(t.NSPrivacyAccessedAPITypeReasons.length).toBeGreaterThan(0);
  });

  it("Android: backup off, POST_NOTIFICATIONS requested, unused template permissions blocked", () => {
    expect(prod.android?.allowBackup).toBe(false);
    expect(prod.android?.permissions).toContain("android.permission.POST_NOTIFICATIONS");
    expect(prod.android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.VIBRATE",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
      ]),
    );
  });

  it("keeps the Mappls plugin with its config directory", () => {
    expect(pluginOptions(prod, "./plugins/withMappls")).toEqual({ configDir: "mappls" });
  });

  it.each([
    [{}, "Namma Lorry (Dev)", "development"],
    [{ EXPO_PUBLIC_APP_ENV: "" }, "Namma Lorry (Dev)", "development"],
    [{ EXPO_PUBLIC_APP_ENV: "development" }, "Namma Lorry (Dev)", "development"],
    [{ EXPO_PUBLIC_APP_ENV: "staging" }, "Namma Lorry (Staging)", "staging"],
    [{ EXPO_PUBLIC_APP_ENV: "production" }, "Namma Lorry", "production"],
  ])("env %j → name %s", (env, name, appEnv) => {
    const config = buildConfig(env);
    expect(config.name).toBe(name);
    expect(config.extra?.appEnv).toBe(appEnv);
    // Same identifiers for every profile: one store listing per platform.
    expect(config.ios?.bundleIdentifier).toBe("com.nammalorry.driver");
    expect(config.android?.package).toBe("com.nammalorry.driver");
  });

  it("rejects an unknown EXPO_PUBLIC_APP_ENV instead of building a development app", () => {
    expect(() => appEnvFrom({ EXPO_PUBLIC_APP_ENV: "preview" })).toThrow(/must be one of/);
    expect(() => buildConfig({ EXPO_PUBLIC_APP_ENV: "prod" })).toThrow(/must be one of/);
  });

  it("adds the Sentry source-map plugin only when SENTRY_AUTH_TOKEN is set", () => {
    expect(pluginOptions(prod, "@sentry/react-native/expo")).toBeUndefined();
    const withToken = buildConfig({
      EXPO_PUBLIC_APP_ENV: "production",
      SENTRY_AUTH_TOKEN: "t",
      SENTRY_ORG: "o",
      SENTRY_PROJECT: "p",
    });
    expect(pluginOptions(withToken, "@sentry/react-native/expo")).toEqual({
      organization: "o",
      project: "p",
    });
  });
});
