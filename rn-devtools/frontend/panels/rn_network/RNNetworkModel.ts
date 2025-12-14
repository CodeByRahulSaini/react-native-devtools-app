// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Common from '../../../../front_end/core/common/common.js';
import * as SDK from '../../../../front_end/core/sdk/sdk.js';
import * as PluginsBindings from '../../models/plugins_bindings/plugins_bindings.js';

const NETWORK_DOMAIN = 'network';

/**
 * Network request data received from the plugin.
 */
export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  startTime: number;
}

/**
 * Network response data received from the plugin.
 */
export interface NetworkResponse {
  id: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body?: string;
  endTime: number;
  duration: number;
}

/**
 * Network error data received from the plugin.
 */
export interface NetworkError {
  id: string;
  error: string;
  endTime: number;
  duration: number;
}

/**
 * Combined network entry tracking request, response, and error state.
 */
export interface NetworkEntry {
  request: NetworkRequest;
  response?: NetworkResponse;
  error?: NetworkError;
  status: 'pending' | 'completed' | 'error';
}

/**
 * Message format from network plugin.
 */
interface PluginMessage {
  event: string;
  data: NetworkRequest | NetworkResponse | NetworkError;
}

export const enum Events {
  REQUEST_STARTED = 'RequestStarted',
  REQUEST_COMPLETED = 'RequestCompleted',
  REQUEST_ERROR = 'RequestError',
  ENTRIES_CLEARED = 'EntriesCleared',
}

export interface EventTypes {
  [Events.REQUEST_STARTED]: NetworkEntry;
  [Events.REQUEST_COMPLETED]: NetworkEntry;
  [Events.REQUEST_ERROR]: NetworkEntry;
  [Events.ENTRIES_CLEARED]: void;
}

type BackendExecutionContextUnavailableEvent = Common.EventTarget.EventTargetEvent<
    PluginsBindings.PluginsBindingsModel.EventTypes[PluginsBindings.PluginsBindingsModel.Events.BACKEND_EXECUTION_CONTEXT_UNAVAILABLE]>;

/**
 * RNNetworkModel - Model for managing network request state from the Network plugin.
 *
 * This model:
 * - Subscribes to "network" domain messages from PluginsBindingsModel
 * - Tracks requests, responses, and errors
 * - Exposes events for UI updates
 */
export class RNNetworkModel extends SDK.SDKModel.SDKModel<EventTypes> {
  readonly #bindingsModel: PluginsBindings.PluginsBindingsModel.PluginsBindingsModel;
  readonly #entries = new Map<string, NetworkEntry>();
  #initializeCalled = false;
  #initialized = false;

  constructor(target: SDK.Target.Target) {
    super(target);

    const bindingsModel = target.model(PluginsBindings.PluginsBindingsModel.PluginsBindingsModel);
    if (bindingsModel === null) {
      throw new Error('Failed to construct RNNetworkModel: PluginsBindingsModel was null');
    }

    this.#bindingsModel = bindingsModel;

    bindingsModel.addEventListener(
        PluginsBindings.PluginsBindingsModel.Events.BACKEND_EXECUTION_CONTEXT_CREATED,
        this.#handleBackendExecutionContextCreated,
        this,
    );
    bindingsModel.addEventListener(
        PluginsBindings.PluginsBindingsModel.Events.BACKEND_EXECUTION_CONTEXT_UNAVAILABLE,
        this.#handleBackendExecutionContextUnavailable,
        this,
    );
    bindingsModel.addEventListener(
        PluginsBindings.PluginsBindingsModel.Events.BACKEND_EXECUTION_CONTEXT_DESTROYED,
        this.#handleBackendExecutionContextDestroyed,
        this,
    );
  }

  override dispose(): void {
    this.#bindingsModel.removeEventListener(
        PluginsBindings.PluginsBindingsModel.Events.BACKEND_EXECUTION_CONTEXT_CREATED,
        this.#handleBackendExecutionContextCreated,
        this,
    );
    this.#bindingsModel.removeEventListener(
        PluginsBindings.PluginsBindingsModel.Events.BACKEND_EXECUTION_CONTEXT_UNAVAILABLE,
        this.#handleBackendExecutionContextUnavailable,
        this,
    );
    this.#bindingsModel.removeEventListener(
        PluginsBindings.PluginsBindingsModel.Events.BACKEND_EXECUTION_CONTEXT_DESTROYED,
        this.#handleBackendExecutionContextDestroyed,
        this,
    );

    this.#entries.clear();
  }

  ensureInitialized(): void {
    if (this.#initializeCalled) {
      return;
    }

    this.#initializeCalled = true;
    void this.#initialize();
  }

  async #initialize(): Promise<void> {
    try {
      const bindingsModel = this.#bindingsModel;
      await bindingsModel.enable();

      bindingsModel.subscribeToDomainMessages(
        NETWORK_DOMAIN,
        message => this.#handleMessage(message as unknown as PluginMessage),
      );

      await bindingsModel.initializeDomain(NETWORK_DOMAIN);

      this.#initialized = true;
    } catch (e) {
      console.error('[RNNetworkModel] Failed to initialize:', e);
    }
  }

  isInitialized(): boolean {
    return this.#initialized;
  }

  getEntries(): NetworkEntry[] {
    return Array.from(this.#entries.values());
  }

  getEntry(id: string): NetworkEntry | undefined {
    return this.#entries.get(id);
  }

  clearEntries(): void {
    this.#entries.clear();
    this.dispatchEventToListeners(Events.ENTRIES_CLEARED);

    // Also send clear command to the plugin
    void this.#bindingsModel.sendMessage(NETWORK_DOMAIN, {action: 'clear'});
  }

  #handleMessage(message: PluginMessage): void {
    if (!message || !message.event) {
      return;
    }

    switch (message.event) {
      case 'request':
        this.#handleRequest(message.data as NetworkRequest);
        break;
      case 'response':
        this.#handleResponse(message.data as NetworkResponse);
        break;
      case 'error':
        this.#handleError(message.data as NetworkError);
        break;
      default:
        console.warn(`[RNNetworkModel] Unknown event: ${message.event}`);
    }
  }

  #handleRequest(request: NetworkRequest): void {
    const entry: NetworkEntry = {
      request,
      status: 'pending',
    };
    this.#entries.set(request.id, entry);
    this.dispatchEventToListeners(Events.REQUEST_STARTED, entry);
  }

  #handleResponse(response: NetworkResponse): void {
    const entry = this.#entries.get(response.id);
    if (entry) {
      entry.response = response;
      entry.status = 'completed';
      this.dispatchEventToListeners(Events.REQUEST_COMPLETED, entry);
    }
  }

  #handleError(error: NetworkError): void {
    const entry = this.#entries.get(error.id);
    if (entry) {
      entry.error = error;
      entry.status = 'error';
      this.dispatchEventToListeners(Events.REQUEST_ERROR, entry);
    }
  }

  #handleBackendExecutionContextCreated(): void {
    // Reconnect if needed
    if (!this.#bindingsModel.isEnabled()) {
      this.ensureInitialized();
    }
  }

  #handleBackendExecutionContextUnavailable({data: errorMessage}: BackendExecutionContextUnavailableEvent): void {
    console.error('[RNNetworkModel] Backend execution context unavailable:', errorMessage);
  }

  #handleBackendExecutionContextDestroyed(): void {
    // Clear entries on context destruction (app reload)
    this.#entries.clear();
    this.dispatchEventToListeners(Events.ENTRIES_CLEARED);
  }
}

SDK.SDKModel.SDKModel.register(RNNetworkModel, {capabilities: SDK.Target.Capability.JS, autostart: false});

