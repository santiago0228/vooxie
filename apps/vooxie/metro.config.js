const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Necesario en un monorepo pnpm: los paquetes @vooxie/ui y @vooxie/core viven
// fuera de apps/vooxie/node_modules (son symlinks a packages/ui y packages/core).
// Sin esto Metro no los encuentra ni recarga en caliente cuando cambian.
config.watchFolders = [workspaceRoot];

// Expo SDK 57 ya detecta workspaces y resuelve symlinks de pnpm por defecto:
// NO se sobreescriben `disableHierarchicalLookup` ni `unstable_enableSymlinks`
// (expo-doctor los marca como configuración peligrosa).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
