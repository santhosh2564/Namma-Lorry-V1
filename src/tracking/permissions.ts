// Native permission reads/requests for D1 and the foreground re-check.
// The decisions live in features/onboarding/permissionModel.ts (pure, tested).
import * as IntentLauncher from 'expo-intent-launcher';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import {
  isLocationReady,
  isPrecise,
  toPermStatus,
  type PermissionSnapshot,
} from '@/features/onboarding/permissionModel';
import { devSessionGet, devSessionSet } from '@/lib/devDriverWeb';

export const permissionsQueryKey = ['tracking', 'permissions'] as const;

// Dev browser preview (lib/devDriverWeb): each request grants its permission.
const isWeb = Platform.OS === 'web';
const simulated: PermissionSnapshot = (isWeb && devSessionGet<PermissionSnapshot>('permissions')) || {
  platform: 'android',
  foreground: 'undetermined',
  precise: true,
  background: 'undetermined',
  notifications: 'undetermined',
  servicesEnabled: true,
};
const grant = (key: 'foreground' | 'background' | 'notifications') => {
  simulated[key] = 'granted';
  devSessionSet('permissions', simulated);
};

export async function readPermissions(): Promise<PermissionSnapshot> {
  if (isWeb) return { ...simulated };
  const [fg, bg, notif, servicesEnabled] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
    Location.hasServicesEnabledAsync().catch(() => true),
  ]);
  return {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    foreground: toPermStatus(fg),
    precise: isPrecise(fg),
    background: toPermStatus(bg),
    notifications: toPermStatus(notif),
    servicesEnabled,
  };
}

/** Used by the root routing decision: precise + "all the time" location. */
export async function checkTrackingPermissions(): Promise<{ ok: boolean }> {
  return { ok: isLocationReady(await readPermissions()) };
}

// Each request is only called from D1 after the disclosure is on screen (docs/09 §2).
export async function requestForeground(): Promise<void> {
  if (isWeb) return grant('foreground');
  await Location.requestForegroundPermissionsAsync();
}

/** Android 11+ opens the app's location settings page instead of a dialog. */
export async function requestBackground(): Promise<void> {
  if (isWeb) return grant('background');
  await Location.requestBackgroundPermissionsAsync();
}

export async function requestNotifications(): Promise<void> {
  if (isWeb) return grant('notifications');
  await Notifications.requestPermissionsAsync();
}

export async function openAppSettings(): Promise<void> {
  await Linking.openSettings();
}

export async function openLocationServicesSettings(): Promise<void> {
  if (Platform.OS === 'android') {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS).catch(
      () => Linking.openSettings(),
    );
  } else {
    await Linking.openSettings();
  }
}
