/**
 * Sentry (native + web via @sentry/react-native). No-op when EXPO_PUBLIC_SENTRY_DSN is
 * empty. Every event and breadcrumb passes through the PII scrubber (phones, coordinates)
 * and `sendDefaultPii` is off, so IPs and device names are not collected either.
 *
 * Release tagging: release = `namma-lorry@<app version>`, dist = native build number
 * (or "web"), environment = EXPO_PUBLIC_APP_ENV. Source-map upload is a build step
 * (M12c: SENTRY_AUTH_TOKEN as an EAS secret, see docs/HARDENING_REPORT.md).
 */
import * as Sentry from '@sentry/react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { config } from './config';
import { scrubEvent, scrubValue } from './scrub';

export const sentryRelease = () => `namma-lorry@${Constants.expoConfig?.version ?? '0.0.0'}`;
export const sentryDist = () =>
  Platform.OS === 'web'
    ? 'web'
    : (Application.nativeBuildVersion ?? Constants.expoConfig?.version ?? '0');

let initialised = false;

export function initSentry(): void {
  if (initialised || !config.sentryDsn) return;
  initialised = true;
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.appEnv,
    release: sentryRelease(),
    dist: sentryDist(),
    sendDefaultPii: false,
    enabled: !__DEV__ || config.appEnv !== 'development',
    tracesSampleRate: config.isProd ? 0.1 : 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubValue(breadcrumb),
  });
}

/** Report a handled error (scrubbed by beforeSend). Safe to call when Sentry is off. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!initialised) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Associate events with the signed-in user by opaque id only (never phone or name). */
export function setSentryUser(id: string | null): void {
  if (!initialised) return;
  Sentry.setUser(id ? { id } : null);
}

export const wrapWithSentry = Sentry.wrap;
