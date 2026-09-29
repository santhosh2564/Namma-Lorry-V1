import { Redirect, Stack } from 'expo-router';

/**
 * Dev-only routes (/dev/kitchen-sink, /dev/map, /dev/tracking). In release builds
 * (__DEV__ === false) every /dev URL redirects to the app root, so they can't be
 * reached by deep link or typed URL on the web console.
 */
export default function DevLayout() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: true }} />;
}
