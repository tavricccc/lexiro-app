// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // src/core is synced from the web repo and linted there.
    ignores: ["dist/*", "src/core/*"],
  }
]);
