import { Redirect, Stack } from 'expo-router';

/**
 * Developer tools (/dev/*). In release builds `__DEV__` is false and every route in this
 * folder redirects to the start screen, so none of them can be opened by URL or deep link (M12a).
 */
export default function DevLayout() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
