// Unit tests for the pure logic: ported maths, decoders, merging, schemas.
// UI components are not tested here; they are checked on a Seeker.
//
// Two deviations from the stock jest-expo preset, both about ESM in
// node_modules: @solana/kit and its sub-packages publish ESM for the
// react-native condition that Jest resolves to, so .mjs is transformed and
// those packages are excluded from transformIgnorePatterns.
const expoPreset = require('jest-expo/jest-preset');

const babelOptions = {
  root: __dirname,
  babelrc: true,
  configFile: true,
  presets: [require.resolve('expo/internal/babel-preset.js')],
  caller: { name: 'metro', bundler: 'metro', platform: 'android' },
};

// Packages that ship ESM and must be transformed, on top of the ones the
// Expo preset already allows. Extending the preset's own pattern keeps this
// working across jest-expo upgrades.
const EXTRA_PACKAGES = ['@solana', '@solana-mobile', '@noble', 'bs58', 'base-x', 'uuid', 'superstruct'];

const transformIgnorePatterns = expoPreset.transformIgnorePatterns.map((pattern) =>
  pattern.includes('(?!(') ? pattern.replace('))', `|${EXTRA_PACKAGES.join('|')}))`) : pattern,
);

module.exports = {
  ...expoPreset,
  testMatch: ['<rootDir>/test/**/*.test.ts?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'node'],
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.(bmp|gif|jpg|jpeg|png|psd|svg|webp|xml|m4v|mov|mp4|mpeg|mpg|webm|aac|aiff|caf|m4a|mp3|wav|html|pdf|yaml|yml|otf|ttf|zip|heic|avif|db)$': require.resolve(
      'jest-expo/src/preset/assetFileTransformer.js',
    ),
    '\\.[mc]?[jt]sx?$': ['babel-jest', babelOptions],
  },
  transformIgnorePatterns,
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/app/**', '!src/ui/**', '!src/dev/**'],
};
