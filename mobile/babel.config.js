module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo handles JSX, TypeScript, and the reanimated/worklets
    // plugin automatically in SDK 54+. Don't add the plugin manually or it
    // will load twice and crash.
    presets: ["babel-preset-expo"],
  };
};
