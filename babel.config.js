module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    // babel-preset-expo automatically applies the react-native-worklets
    // plugin when react-native-reanimated is installed — do not add it here.
  };
};
