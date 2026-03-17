const path = require('path');
const fs = require('fs');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 * Resolves local @abstraxn packages from repo root.
 * Forces react and react-native to resolve from the app so hooks work (avoids "useState of null").
 * Resolves @turnkey/api-key-stamper/dist/purejs so dynamic require in RN (purejs runtime) works.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');
const appNodeModules = path.resolve(projectRoot, 'node_modules');

// Resolve react and react-native from the app so the same instance is used everywhere
const reactPath = require.resolve('react', { paths: [projectRoot] });
const reactJsxRuntimePath = require.resolve('react/jsx-runtime', { paths: [projectRoot] });
const reactNativePath = require.resolve('react-native', { paths: [projectRoot] });

// @turnkey/api-key-stamper uses dynamic require('./purejs.js') in RN; Metro resolves it wrong from monorepo.
function resolveApiKeyStamperPurejs(moduleName) {
  if (!moduleName || typeof moduleName !== 'string') return null;
  const normalized = moduleName.replace(/^\.\//, '');
  if (!normalized.includes('api-key-stamper') || !normalized.includes('purejs')) return null;
  const candidates = [
    path.join(appNodeModules, '@turnkey', 'api-key-stamper', 'dist', 'purejs.js'),
    path.join(monorepoRoot, 'abstraxn-sdks', 'signer-core-react-native', 'node_modules', '@turnkey', 'api-key-stamper', 'dist', 'purejs.js'),
    path.join(projectRoot, normalized + (normalized.endsWith('.js') ? '' : '.js')),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const defaultConfig = getDefaultConfig(__dirname);
const defaultResolveRequest = defaultConfig.resolver.resolveRequest;

const config = {
  watchFolders: [monorepoRoot],
  resolver: {
    ...defaultConfig.resolver,
    nodeModulesPaths: [
      appNodeModules,
      path.resolve(monorepoRoot, 'abstraxn-sdks/signer-react-native/node_modules'),
      path.resolve(monorepoRoot, 'abstraxn-sdks/signer-core-react-native/node_modules'),
    ],
    resolveRequest: (context, moduleName, platform) => {
      // Force a single React instance so hooks (useState, etc.) work in @abstraxn/signer-react-native
      if (moduleName === 'react') {
        return { filePath: reactPath, type: 'sourceFile' };
      }
      if (moduleName === 'react/jsx-runtime') {
        return { filePath: reactJsxRuntimePath, type: 'sourceFile' };
      }
      if (moduleName === 'react-native') {
        return { filePath: reactNativePath, type: 'sourceFile' };
      }
      // Dynamic require('./purejs.js') inside @turnkey/api-key-stamper resolves wrong in monorepo
      const purejsPath = resolveApiKeyStamperPurejs(moduleName);
      if (purejsPath) {
        return { filePath: purejsPath, type: 'sourceFile' };
      }
      // Also resolve relative purejs request when origin is inside api-key-stamper
      if ((moduleName === './purejs.js' || moduleName === './purejs') && context.originModulePath && context.originModulePath.includes('@turnkey/api-key-stamper')) {
        const dir = path.dirname(context.originModulePath);
        const relativePath = path.join(dir, 'purejs.js');
        if (fs.existsSync(relativePath)) {
          return { filePath: relativePath, type: 'sourceFile' };
        }
      }
      return defaultResolveRequest
        ? defaultResolveRequest(context, moduleName, platform)
        : context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
