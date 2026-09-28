/**
 * Keep-awake while a trip is recording (M10).
 *
 * `expo-keep-awake` holds a wake lock under a tag, so activating and releasing
 * it is symmetric and cannot leak: leaving D5, ending the trip or turning the
 * setting off all release the same tag.
 *
 * This is deliberately **not** `useKeepAwake()` from the package: that hook
 * locks the screen for as long as its component is mounted, which would make the
 * setting unenforceable. The lock follows the driver's choice instead.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect } from "react";

/** One tag for the whole app, so two screens can never fight over the lock. */
export const KEEP_AWAKE_TAG = "namma-lorry-active-trip";

/**
 * Hold the wake lock while `enabled`, release it otherwise (and on unmount).
 * A failure is swallowed: not being able to keep the screen on must never break
 * a trip that is recording.
 */
export function useTripKeepAwake(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [enabled]);
}
