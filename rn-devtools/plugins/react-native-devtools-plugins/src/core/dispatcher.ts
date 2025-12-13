// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type { FuseboxDispatcher, JSONValue, PluginCommand } from './types';

/**
 * Global name for the dispatcher object.
 * DevTools frontend will look for this to establish communication.
 */
export const DISPATCHER_GLOBAL_NAME = '__FUSEBOX_PLUGINS_DISPATCHER__';

/**
 * Unique binding name for this dispatcher.
 * Different from React DevTools to avoid conflicts.
 */
const BINDING_NAME = '__fusebox_plugins_binding__';

type MessageHandler = (command: PluginCommand) => void;

/**
 * FuseboxPluginsDispatcher - Global object that DevTools discovers for plugin communication.
 *
 * Communication flow:
 * 1. DevTools calls Runtime.addBinding(BINDING_NAME) to receive messages
 * 2. Plugins send messages by calling the binding function
 * 3. DevTools sends commands via Runtime.evaluate calling sendMessage()
 */
class FuseboxPluginsDispatcherImpl implements FuseboxDispatcher {
  readonly BINDING_NAME = BINDING_NAME;

  private readonly domainHandlers = new Map<string, MessageHandler>();
  private readonly initializedDomains = new Set<string>();

  /**
   * Register a handler for a specific domain.
   * Called internally by PluginRegistry.
   */
  registerDomainHandler(domainName: string, handler: MessageHandler): void {
    this.domainHandlers.set(domainName, handler);
  }

  /**
   * Unregister a domain handler.
   */
  unregisterDomainHandler(domainName: string): void {
    this.domainHandlers.delete(domainName);
    this.initializedDomains.delete(domainName);
  }

  /**
   * Initialize a domain for message routing.
   * Called by DevTools via Runtime.evaluate when it's ready to receive messages.
   */
  initializeDomain(domainName: string): void {
    this.initializedDomains.add(domainName);
  }

  /**
   * Receive a message from DevTools.
   * Called by DevTools via Runtime.evaluate.
   */
  sendMessage(domainName: string, serializedMessage: string): void {
    const handler = this.domainHandlers.get(domainName);
    if (!handler) {
      console.warn(`[DevToolsPlugins] No handler registered for domain: ${domainName}`);
      return;
    }

    try {
      const command = JSON.parse(serializedMessage) as PluginCommand;
      handler(command);
    } catch (err) {
      console.error(`[DevToolsPlugins] Failed to parse message for domain ${domainName}:`, err);
    }
  }

  /**
   * Get list of registered plugin domains.
   * Used by DevTools to know which panels to show.
   */
  getRegisteredDomains(): string[] {
    return Array.from(this.domainHandlers.keys());
  }

  /**
   * Send a message to DevTools via the binding.
   * Called internally by Bridge instances.
   */
  sendToDevTools(domain: string, event: string, data: JSONValue): void {
    const message = JSON.stringify({
      domain,
      message: { event, data },
    });

    // Call the binding function that DevTools registered
    // The binding is available on globalThis after Runtime.addBinding is called
    const binding = (globalThis as Record<string, unknown>)[BINDING_NAME];
    if (typeof binding === 'function') {
      try {
        binding(message);
      } catch (err) {
        console.error(`[DevToolsPlugins] Failed to send message to DevTools:`, err);
      }
    }
    // If binding isn't available yet, messages are silently dropped
    // This is expected before DevTools connects
  }
}

// Singleton instance
let dispatcherInstance: FuseboxPluginsDispatcherImpl | null = null;

/**
 * Get or create the global dispatcher instance.
 */
export function getDispatcher(): FuseboxPluginsDispatcherImpl {
  if (!dispatcherInstance) {
    dispatcherInstance = new FuseboxPluginsDispatcherImpl();
    // Expose on globalThis for DevTools to discover
    (globalThis as Record<string, unknown>)[DISPATCHER_GLOBAL_NAME] = dispatcherInstance;
  }
  return dispatcherInstance;
}

/**
 * Clean up the dispatcher (for testing or shutdown).
 */
export function destroyDispatcher(): void {
  if (dispatcherInstance) {
    delete (globalThis as Record<string, unknown>)[DISPATCHER_GLOBAL_NAME];
    dispatcherInstance = null;
  }
}

