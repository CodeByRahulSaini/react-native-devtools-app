// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type { DevToolsConfig, Plugin } from './core/types';
import { getRegistry } from './core/registry';
import { getDispatcher } from './core/dispatcher';

// Re-export types for consumers
export type { Plugin, Bridge, DevToolsConfig, JSONValue } from './core';

// Re-export plugins
export { NetworkPlugin } from './plugins';

/**
 * Initialize React Native DevTools plugins.
 *
 * Call this in your app entry point, wrapped in a __DEV__ check:
 *
 * ```typescript
 * import { initDevTools, NetworkPlugin } from 'react-native-devtools-plugins';
 *
 * if (__DEV__) {
 *   initDevTools({
 *     plugins: [
 *       new NetworkPlugin(),
 *     ],
 *   });
 * }
 * ```
 */
export function initDevTools(config: DevToolsConfig): void {
  const registry = getRegistry();

  // Ensure dispatcher is created
  getDispatcher();

  // Register all plugins
  for (const plugin of config.plugins) {
    registry.register(plugin);
  }

  // Initialize all plugins
  registry.initAll();

  console.log(
    `[DevToolsPlugins] Initialized with plugins: ${registry.getRegisteredPlugins().join(', ')}`
  );
}

/**
 * Shutdown DevTools plugins and clean up.
 * Typically called during app unmount or for testing.
 */
export function shutdownDevTools(): void {
  const registry = getRegistry();
  registry.destroyAll();
  console.log('[DevToolsPlugins] Shutdown complete');
}

/**
 * Register a single plugin after initialization.
 */
export function registerPlugin(plugin: Plugin): void {
  const registry = getRegistry();
  registry.register(plugin);
}

/**
 * Unregister a plugin by name.
 */
export function unregisterPlugin(pluginName: string): void {
  const registry = getRegistry();
  registry.unregister(pluginName);
}

