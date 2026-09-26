import { Platform } from 'react-native';

/**
 * Dev-only preview of the driver app in a browser (EXPO_PUBLIC_DEV_DRIVER_WEB=1 with
 * `npm run web`): routing treats the browser as Android, permissions and GPS are
 * simulated (the position is set on /dev/tracking), and trips run on the web SQLite
 * queue exactly as on /dev/tracking. Never on in production builds (`__DEV__` is false).
 */
export const devDriverWeb =
  __DEV__ && Platform.OS === 'web' && process.env.EXPO_PUBLIC_DEV_DRIVER_WEB === '1';

/** True where the driver app runs: native, or the dev browser preview. */
export const driverAppPlatform = Platform.OS !== 'web' || devDriverWeb;

/** sessionStorage JSON for the dev browser preview's simulated state (survives reloads). */
export function devSessionGet<T>(key: string): T | null {
  try {
    const v = globalThis.sessionStorage?.getItem(`nl.dev.${key}`);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export function devSessionSet(key: string, value: unknown): void {
  try {
    globalThis.sessionStorage?.setItem(`nl.dev.${key}`, JSON.stringify(value));
  } catch {
    // private mode / storage disabled: in-memory only
  }
}
