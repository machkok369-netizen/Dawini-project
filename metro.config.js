const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fixes the Firebase Auth "Component not registered" error
config.resolver.sourceExts.push('cjs');

// Disables the experimental export logic that breaks Firebase 9+
config.resolver.unstable_enablePackageExports = false;

module.exports = config;