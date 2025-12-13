// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type { Plugin, PluginCommand } from './types';
import { BridgeImpl } from './bridge';
import { getDispatcher, destroyDispatcher } from './dispatcher';

interface RegisteredPlugin {
  plugin: Plugin;
  bridge: BridgeImpl;
}

/**
 * PluginRegistry - Manages plugin lifecycle and registration.
 *
 * Responsibilities:
 * - Register/unregister plugins
 * - Create Bridge instances for each plugin
 * - Route commands from DevTools to appropriate plugins
 * - Handle plugin initialization and destruction
 */
class PluginRegistryImpl {
  private readonly plugins = new Map<string, RegisteredPlugin>();
  private initialized = false;

  /**
   * Register a plugin with the registry.
   */
  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[DevToolsPlugins] Plugin "${plugin.name}" is already registered`);
      return;
    }

    const bridge = new BridgeImpl(plugin.name);
    this.plugins.set(plugin.name, { plugin, bridge });

    // Register the command handler with the dispatcher
    const dispatcher = getDispatcher();
    dispatcher.registerDomainHandler(plugin.name, (command: PluginCommand) => {
      bridge.handleCommand(command);
    });

    // If already initialized, init the plugin immediately
    if (this.initialized) {
      this.initPlugin(plugin.name);
    }
  }

  /**
   * Unregister a plugin.
   */
  unregister(pluginName: string): void {
    const registered = this.plugins.get(pluginName);
    if (!registered) {
      return;
    }

    // Destroy the plugin
    try {
      registered.plugin.destroy();
    } catch (err) {
      console.error(`[DevToolsPlugins] Error destroying plugin "${pluginName}":`, err);
    }

    // Clean up
    registered.bridge.offMessage();
    getDispatcher().unregisterDomainHandler(pluginName);
    this.plugins.delete(pluginName);
  }

  /**
   * Initialize all registered plugins.
   * Called when DevTools connects.
   */
  initAll(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    for (const pluginName of this.plugins.keys()) {
      this.initPlugin(pluginName);
    }
  }

  /**
   * Initialize a single plugin.
   */
  private initPlugin(pluginName: string): void {
    const registered = this.plugins.get(pluginName);
    if (!registered) {
      return;
    }

    try {
      registered.plugin.init(registered.bridge);
    } catch (err) {
      console.error(`[DevToolsPlugins] Error initializing plugin "${pluginName}":`, err);
    }
  }

  /**
   * Destroy all plugins.
   * Called when DevTools disconnects or on shutdown.
   */
  destroyAll(): void {
    for (const pluginName of this.plugins.keys()) {
      this.unregister(pluginName);
    }

    this.initialized = false;
    destroyDispatcher();
  }

  /**
   * Get list of registered plugin names.
   */
  getRegisteredPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Check if a plugin is registered.
   */
  hasPlugin(pluginName: string): boolean {
    return this.plugins.has(pluginName);
  }
}

// Singleton instance
let registryInstance: PluginRegistryImpl | null = null;

/**
 * Get or create the plugin registry singleton.
 */
export function getRegistry(): PluginRegistryImpl {
  if (!registryInstance) {
    registryInstance = new PluginRegistryImpl();
  }
  return registryInstance;
}

/**
 * Reset the registry (for testing).
 */
export function resetRegistry(): void {
  if (registryInstance) {
    registryInstance.destroyAll();
    registryInstance = null;
  }
}

