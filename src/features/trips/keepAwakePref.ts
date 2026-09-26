// "Keep screen on" during a trip (D5). Off by default; remembered per phone.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'nl.keep_awake';
let webValue = false; // dev browser preview only

export async function getKeepAwake(): Promise<boolean> {
  if (Platform.OS === 'web') return webValue;
  return (await SecureStore.getItemAsync(KEY).catch(() => null)) === '1';
}

export async function setKeepAwake(on: boolean): Promise<void> {
  if (Platform.OS === 'web') return void (webValue = on);
  await SecureStore.setItemAsync(KEY, on ? '1' : '0').catch(() => undefined);
}
