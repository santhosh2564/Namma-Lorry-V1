// Crash and error reporting (TRD §2, docs/13 P13, ND-11). One module for native and web:
// @sentry/react-native runs on react-native-web as well. Off unless EXPO_PUBLIC_SENTRY_DSN is
// set. Every event and breadcrumb goes through scrub.ts, so phone numbers and coordinates are
// removed on the device before anything is sent; only the user's UUID is attached.
import * as Sentry from '@sentry/react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { config } from './config';
import { scrubBreadcrumb, scrubEvent } from './scrub';

let enabled = false;

/** "namma-lorry@1.0.0+12": what the source maps are uploaded under (EAS build / web export). */
export function releaseName(): { release: string; dist: string } {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';
  const build = Application.nativeBuildVersion ?? (Platform.OS === 'web' ? 'web' : '0');
  return { release: `namma-lorry@${version}+${build}`, dist: build };
}

export function initSentry(): void {
  const dsn = config.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn || enabled) return;
  const { release, dist } = releaseName();
  Sentry.init({
    dsn,
    environment: config.EXPO_PUBLIC_APP_ENV,
    release,
    dist,
    sendDefaultPii: false, // no IP address, no request bodies
    attachScreenshot: false,
    attachViewHierarchy: false, // view text can hold names and phone numbers
    tracesSampleRate: 0, // errors only in Phase 1
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
  Sentry.setTag('platform', Platform.OS);
  enabled = true;
}

/** Signed-in user: the profile UUID only (never phone or name). */
export function setSentryUser(id: string | null): void {
  if (enabled) Sentry.setUser(id ? { id } : null);
}

/** Report a caught error with optional non-PII context (it is scrubbed as well). */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (__DEV__) console.warn('[error]', error, context ?? '');
  if (!enabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export const wrapRoot = Sentry.wrap;
