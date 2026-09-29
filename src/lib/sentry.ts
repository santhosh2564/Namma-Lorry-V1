/**
 * Crash reporting (validation report B4; TRD §2 monitoring; PRD §7 crash-free
 * sessions; docs/09 §1 breach readiness).
 *
 * `@sentry/react-native` covers native and web. It is a no-op while
 * `EXPO_PUBLIC_SENTRY_DSN` is empty, so builds without a DSN behave exactly as
 * before. `sendDefaultPii` is off (no IPs or device names), and every event and
 * breadcrumb passes through the PII scrubber (phone numbers, coordinates).
 *
 * Tags: release = `namma-lorry@<app version>`, dist = the native build number
 * (or "web"), environment = `EXPO_PUBLIC_APP_ENV`. Source maps are uploaded at
 * build time by the `@sentry/react-native/expo` plugin when `SENTRY_AUTH_TOKEN`
 * is set (app.config.ts).
 */
import * as Sentry from "@sentry/react-native";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { config, isProd, type ConfigProblem } from "@/lib/config";
import { scrubEvent, scrubValue } from "@/lib/scrub";

export function sentryRelease(): string {
  return `namma-lorry@${Constants.expoConfig?.version ?? "0.0.0"}`;
}

export function sentryDist(): string {
  if (Platform.OS === "web") {
    return "web";
  }
  return Application.nativeBuildVersion ?? Constants.expoConfig?.version ?? "0";
}

let initialised = false;

/** Call once, at module scope of the root layout. Safe to call again. */
export function initSentry(): void {
  if (initialised || config.sentryDsn === "") {
    return;
  }
  initialised = true;
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.appEnv,
    release: sentryRelease(),
    dist: sentryDist(),
    sendDefaultPii: false,
    // A dev build pointed at the development environment is noise, not a crash.
    enabled: !__DEV__ || config.appEnv !== "development",
    tracesSampleRate: isProd ? 0.1 : 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubValue(breadcrumb),
  });
}

/** Report a handled error (scrubbed by beforeSend). Safe to call when Sentry is off. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!initialised) {
    return;
  }
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Associate events with the signed-in user by opaque id only (never phone or name). */
export function setSentryUser(id: string | null): void {
  if (!initialised) {
    return;
  }
  Sentry.setUser(id ? { id } : null);
}

export function reportMisconfigured(_problems: readonly ConfigProblem[]): void {}

export const wrapWithSentry = Sentry.wrap;
