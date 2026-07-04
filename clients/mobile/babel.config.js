module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated 4 + react-native-worklets 0.8: the worklet Babel transform now
      // lives in react-native-worklets (the legacy reanimated/plugin is deprecated).
      'react-native-worklets/plugin',
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@': './src',
            '@components': './src/components',
            '@hooks': './src/hooks',
            '@api': './src/api',
            '@store': './src/store',
            '@theme': './src/theme',
            '@utils': './src/utils',
            '@types': './src/types',
          },
        },
      ],
    ],
  };
};
