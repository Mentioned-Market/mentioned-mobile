// Metro resolution fixes for the Privy SDK, from Privy's Expo install guide.
//
// Expo resolves package `exports`, and under React Native's conditions two of
// Privy's dependencies resolve to builds that cannot run on Hermes:
//   - `jose` has no react-native condition, so it falls through to its Node
//     build, which imports `crypto`. Its browser build is the one that works.
//   - `isows` (pulled in by viem, which Privy depends on) resolves to a Node
//     WebSocket shim. Without exports it takes the plain entry, which uses the
//     global WebSocket.
// Everything else resolves as Expo decides.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'jose') {
    return context.resolveRequest({ ...context, unstable_conditionNames: ['browser'] }, moduleName, platform);
  }
  if (moduleName === 'isows') {
    return context.resolveRequest({ ...context, unstable_enablePackageExports: false }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
