/**
 * Load the lazily required React Native components before any test starts.
 *
 * `react-native` exports most components through getters, so the first
 * `<ScrollView>` a test renders is what loads (and, on a cold cache, compiles)
 * it, inside that test's 5 s timeout. On a cold cache that cost alone pushed
 * the first render of LiveTripList, Misconfigured and the D1 screen past the
 * limit. Setup files have no timeout, so the cost is paid here instead.
 */
const RN = require("react-native");

for (const name of [
  "ActivityIndicator",
  "KeyboardAvoidingView",
  "Modal",
  "Pressable",
  "ScrollView",
  "Text",
  "TextInput",
  "View",
]) {
  void RN[name];
}
