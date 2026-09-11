// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // These files carry a PORTED_FROM header: they are byte-identical copies
    // from the web repo, linted there and not restyled here. Listed one by one
    // rather than by directory so that mobile-authored files living alongside
    // them (src/chain/mwa.ts, src/chain/balance.ts) are still linted.
    ignores: [
      'dist/*',
      'android/*',
      'src/chain/amm.ts',
      'src/chain/fetchRetry.ts',
      'src/chain/majority.ts',
      'src/chain/majorityWords.ts',
      'src/chain/rpcSend.ts',
      'src/free/lmsr.ts',
      'src/free/marketUtils.ts',
      'src/lib/chatFilter.ts',
    ],
  },
  {
    // zod convention: a schema const and its inferred type share a name.
    files: ['src/api/**/*.ts'],
    rules: { '@typescript-eslint/no-redeclare': 'off' },
  },
]);
