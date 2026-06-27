const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Fixes the Firebase Auth "Component not registered" error
config.resolver.sourceExts.push('cjs');

// Disables the experimental export logic that breaks Firebase 9+
config.resolver.unstable_enablePackageExports = false;

// Mock react-native-maps on web only (native-only module)
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return {
      filePath: path.resolve(__dirname, 'mocks/react-native-maps.js'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;