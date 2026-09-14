// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Design handoffs and Edge Functions use their own runtimes/tooling, so they
    // should not be interpreted as application code by the Expo linter.
    ignores: ["dist/**", ".tmp-*/**", "tmp/**", ".claude/**", "supabase/**"],
  },
  {
    files: ["**/__tests__/**/*.{js,jsx,ts,tsx}"],
    rules: {
      // Jest mocks must be registered before the modules they exercise.
      "import/first": "off",
    },
  },
  {
    rules: {
      // React Native Animated values are intentionally stable mutable objects;
      // the React Compiler rules cannot analyse their imperative API safely.
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
