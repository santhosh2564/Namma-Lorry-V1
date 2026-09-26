// Remembers that D2 Battery Setup was completed or skipped on this phone, so the
// permission flow doesn't show it again. Per device, not per account: it's about the phone.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { devSessionGet, devSessionSet } from '@/lib/devDriverWeb';

const KEY = 'nl.battery_setup';
export type BatterySetup = 'done' | 'skipped';

// Dev browser preview only (kept for the session, like the simulated permissions).
let webValue: BatterySetup | null = Platform.OS === 'web' ? devSessionGet<BatterySetup>('battery') : null;

export async function getBatterySetup(): Promise<BatterySetup | null> {
  if (Platform.OS === 'web') return webValue;
  const v = await SecureStore.getItemAsync(KEY).catch(() => null);
  return v === 'done' || v === 'skipped' ? v : null;
}

export async function setBatterySetup(v: BatterySetup): Promise<void> {
  if (Platform.OS === 'web') {
    webValue = v;
    return devSessionSet('battery', v);
  }
  await SecureStore.setItemAsync(KEY, v).catch(() => undefined);
}

/** D2 is Android-only (iOS doesn't kill a background-location app this way). */
export async function needsBatterySetup(): Promise<boolean> {
  if (Platform.OS === 'ios') return false;
  return (await getBatterySetup()) === null;
}
