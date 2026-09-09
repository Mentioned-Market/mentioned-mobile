// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // src/chain and src/free are byte-identical ports from the web repo
    // (PORTED_FROM headers). They are linted there, not restyled here.
    ignores: ['dist/*', 'android/*', 'src/chain/*', 'src/free/*'],
  },
  {
    // zod convention: a schema const and its inferred type share a name.
    files: ['src/api/**/*.ts'],
    rules: { '@typescript-eslint/no-redeclare': 'off' },
  },
]);
