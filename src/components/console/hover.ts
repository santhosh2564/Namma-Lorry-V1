import type { PressableStateCallbackType } from 'react-native';

/** react-native-web adds `hovered` to Pressable state; native never sets it. */
export const isHovered = (state: PressableStateCallbackType) =>
  (state as { hovered?: boolean }).hovered === true;
