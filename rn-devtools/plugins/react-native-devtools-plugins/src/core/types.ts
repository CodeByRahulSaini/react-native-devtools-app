// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * JSON-serializable value type for CDP communication.
 */
export type JSONValue =
  | null
  | string
  | number
  | boolean
  | { [key: string]: JSONValue }
  | JSONValue[];

/**
 * Message sent from plugin to DevTools.
 */
export interface PluginMessage {
  domain: string;
  message: {
    event: string;
    data: JSONValue;
  };
}

/**
 * Command received from DevTools to plugin.
 */
export interface PluginCommand {
  action: string;
  data?: JSONValue;
}

/**
 * Bridge interface for plugin communication with DevTools.
 * Each plugin receives its own Bridge instance scoped to its domain.
 */
export interface Bridge {
  /**
   * Send an event to DevTools.
   * @param event - Event name (e.g., 'request', 'response', 'action')
   * @param data - JSON-serializable event data
   */
  send(event: string, data: JSONValue): void;

  /**
   * Register a handler for commands from DevTools.
   * @param handler - Function called when DevTools sends a command
   */
  onMessage(handler: (action: string, data: JSONValue | undefined) => void): void;

  /**
   * Remove the message handler.
   */
  offMessage(): void;
}

/**
 * Plugin interface that all plugins must implement.
 */
export interface Plugin {
  /**
   * Unique identifier for the plugin.
   * Used as the domain name for message routing.
   * Examples: 'network', 'redux', 'apollo'
   */
  readonly name: string;

  /**
   * Called when DevTools connects.
   * Plugin should start collecting/sending data.
   * @param bridge - Bridge instance for this plugin's communication
   */
  init(bridge: Bridge): void;

  /**
   * Called when DevTools disconnects.
   * Plugin should clean up resources and stop collecting data.
   */
  destroy(): void;
}

/**
 * Configuration options for initializing DevTools plugins.
 */
export interface DevToolsConfig {
  /**
   * Array of plugin instances to register.
   */
  plugins: Plugin[];
}

/**
 * Internal type for the global dispatcher object.
 * This matches the interface expected by ReactDevToolsBindingsModel.
 */
export interface FuseboxDispatcher {
  /**
   * Unique binding name for CDP Runtime.addBinding.
   */
  readonly BINDING_NAME: string;

  /**
   * Initialize a domain for message routing.
   * @param domainName - Domain name to initialize
   */
  initializeDomain(domainName: string): void;

  /**
   * Receive a message from DevTools (called via Runtime.evaluate).
   * @param domainName - Target domain
   * @param serializedMessage - JSON-serialized message
   */
  sendMessage(domainName: string, serializedMessage: string): void;

  /**
   * Get list of registered plugin domains.
   */
  getRegisteredDomains(): string[];
}

