// Remembers that D2 Battery Setup was completed or skipped on this phone, so the
// permission flow doesn't show it again. Per device, not per account: it's about the phone.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'nl.battery_setup';
export type BatterySetup = 'done' | 'skipped';

let webValue: BatterySetup | null = null; // dev browser preview only

export async function getBatterySetup(): Promise<BatterySetup | null> {
  if (Platform.OS === 'web') return webValue;
  const v = await SecureStore.getItemAsync(KEY).catch(() => null);
  return v === 'done' || v === 'skipped' ? v : null;
}

export async function setBatterySetup(v: BatterySetup): Promise<void> {
  if (Platform.OS === 'web') return void (webValue = v);
  await SecureStore.setItemAsync(KEY, v).catch(() => undefined);
}

/** D2 is Android-only (iOS doesn't kill a background-location app this way). */
export async function needsBatterySetup(): Promise<boolean> {
  if (Platform.OS === 'ios') return false;
  return (await getBatterySetup()) === null;
}
