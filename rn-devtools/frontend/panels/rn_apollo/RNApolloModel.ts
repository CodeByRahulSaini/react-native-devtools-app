// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Common from '../../../../front_end/core/common/common.js';
import * as SDK from '../../../../front_end/core/sdk/sdk.js';
import * as PluginsBindings from '../../models/plugins_bindings/plugins_bindings.js';

const APOLLO_DOMAIN = 'apollo';

type JSONValue = null | string | number | boolean | {[key: string]: JSONValue} | JSONValue[];

/**
 * Apollo operation data received from the plugin.
 */
export interface ApolloOperation {
  id: string;
  type: 'query' | 'mutation' | 'subscription';
  name: string;
  variables: Record<string, any>;
  startTime: number;
}

/**
 * Apollo operation completion data received from the plugin.
 */
export interface ApolloOperationComplete {
  id: string;
  result: any;
  endTime: number;
  duration: number;
  fromCache?: boolean;
}

/**
 * Apollo operation error data received from the plugin.
 */
export interface ApolloOperationError {
  id: string;
  error: any;
  endTime: number;
  duration: number;
}

/**
 * Combined Apollo operation entry tracking operation, result, and error state.
 */
export interface ApolloOperationEntry {
  operation: ApolloOperation;
  result?: ApolloOperationComplete;
  error?: ApolloOperationError;
  status: 'pending' | 'completed' | 'error';
}

/**
 * Cache data received from the plugin.
 */
export interface ApolloCacheData {
  data: string;
  timestamp: number;
}

/**
 * Message format from Apollo plugin.
 */
interface PluginMessage {
  event: string;
  data: ApolloOperation | ApolloOperationComplete | ApolloOperationError | ApolloCacheData | { error: string; timestamp: number };
}

export const enum Events {
  OPERATION_STARTED = 'OperationStarted',
  OPERATION_COMPLETED = 'OperationCompleted',
  OPERATION_ERROR = 'OperationError',
  CACHE_UPDATED = 'CacheUpdated',
  CACHE_CLEARED = 'CacheCleared',
  OPERATIONS_CLEARED = 'OperationsCleared',
}

export interface EventTypes {
  [Events.OPERATION_STARTED]: ApolloOperationEntry;
  [Events.OPERATION_COMPLETED]: ApolloOperationEntry;
  [Events.OPERATION_ERROR]: ApolloOperationEntry;
  [Events.CACHE_UPDATED]: ApolloCacheData;
  [Events.CACHE_CLEARED]: void;
  [Events.OPERATIONS_CLEARED]: void;
}

type BackendExecutionContextUnavailableEvent = Common.EventTarget.EventTargetEvent<
    PluginsBindings.PluginsBindingsModel.EventTypes[PluginsBindings.PluginsBindingsModel.Events.BACKEND_EXECUTION_CONTEXT_UNAVAILABLE]>;

/**
 * RNApolloModel - Model for managing Apollo GraphQL operation state from the Apollo plugin.
 *
 * This model:
 * - Subscribes to "apollo" domain messages from PluginsBindingsModel
 * - Tracks operations, results, errors, and cache state
 * - Exposes events for UI updates
 */
export class RNApolloModel extends SDK.SDKModel.SDKModel<EventTypes> {
  readonly #bindingsModel: PluginsBindings.PluginsBindingsModel.PluginsBindingsModel;
  readonly #operations = new Map<string, ApolloOperationEntry>();
  #cache: ApolloCacheData | null = null;
  #initializeCalled = false;
  #initialized = false;

  constructor(target: SDK.Target.Target) {
    super(target);

    const bindingsModel = target.model(PluginsBindings.PluginsBindingsModel.PluginsBindingsModel);
    if (bindingsModel === null) {
      throw new Error('Failed to construct RNApolloModel: PluginsBindingsModel was null');
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

    this.#operations.clear();
    this.#cache = null;
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
        APOLLO_DOMAIN,
        message => this.#handleMessage(message as unknown as PluginMessage),
      );

      await bindingsModel.initializeDomain(APOLLO_DOMAIN);

      this.#initialized = true;
    } catch (e) {
      console.error('[RNApolloModel] Failed to initialize:', e);
    }
  }

  isInitialized(): boolean {
    return this.#initialized;
  }

  getOperations(): ApolloOperationEntry[] {
    return Array.from(this.#operations.values());
  }

  getOperation(id: string): ApolloOperationEntry | undefined {
    return this.#operations.get(id);
  }

  getCache(): ApolloCacheData | null {
    return this.#cache;
  }

  clearOperations(): void {
    this.#operations.clear();
    this.dispatchEventToListeners(Events.OPERATIONS_CLEARED);
  }

  async getCacheFromPlugin(): Promise<void> {
    await this.#bindingsModel.sendMessage(APOLLO_DOMAIN, {action: 'getCache'});
  }

  async clearCache(): Promise<void> {
    await this.#bindingsModel.sendMessage(APOLLO_DOMAIN, {action: 'clearCache'});
  }

  async executeQuery(query: JSONValue, variables?: Record<string, JSONValue>): Promise<void> {
    const message: Record<string, JSONValue> = {
      action: 'executeQuery',
      query,
    };
    if (variables !== undefined) {
      message.variables = variables as JSONValue;
    }
    await this.#bindingsModel.sendMessage(APOLLO_DOMAIN, message);
  }

  #handleMessage(message: PluginMessage): void {
    if (!message || !message.event) {
      return;
    }

    switch (message.event) {
      case 'operation':
        this.#handleOperation(message.data as ApolloOperation);
        break;
      case 'operationComplete':
        this.#handleOperationComplete(message.data as ApolloOperationComplete);
        break;
      case 'operationError':
        this.#handleOperationError(message.data as ApolloOperationError);
        break;
      case 'cache':
        this.#handleCacheUpdate(message.data as ApolloCacheData);
        break;
      case 'cacheCleared':
        this.#handleCacheCleared();
        break;
      default:
        console.warn(`[RNApolloModel] Unknown event: ${message.event}`);
    }
  }

  #handleOperation(operation: ApolloOperation): void {
    const entry: ApolloOperationEntry = {
      operation,
      status: 'pending',
    };
    this.#operations.set(operation.id, entry);
    this.dispatchEventToListeners(Events.OPERATION_STARTED, entry);
  }

  #handleOperationComplete(complete: ApolloOperationComplete): void {
    const entry = this.#operations.get(complete.id);
    if (entry) {
      entry.result = complete;
      entry.status = 'completed';
      this.dispatchEventToListeners(Events.OPERATION_COMPLETED, entry);
    }
  }

  #handleOperationError(error: ApolloOperationError): void {
    const entry = this.#operations.get(error.id);
    if (entry) {
      entry.error = error;
      entry.status = 'error';
      this.dispatchEventToListeners(Events.OPERATION_ERROR, entry);
    }
  }

  #handleCacheUpdate(cacheData: ApolloCacheData): void {
    this.#cache = cacheData;
    this.dispatchEventToListeners(Events.CACHE_UPDATED, cacheData);
  }

  #handleCacheCleared(): void {
    this.#cache = null;
    this.dispatchEventToListeners(Events.CACHE_CLEARED);
  }

  #handleBackendExecutionContextCreated(): void {
    // Reconnect if needed
    if (!this.#bindingsModel.isEnabled()) {
      this.ensureInitialized();
    }
  }

  #handleBackendExecutionContextUnavailable({data: errorMessage}: BackendExecutionContextUnavailableEvent): void {
    console.error('[RNApolloModel] Backend execution context unavailable:', errorMessage);
  }

  #handleBackendExecutionContextDestroyed(): void {
    // Clear operations on context destruction (app reload)
    this.#operations.clear();
    this.#cache = null;
    this.dispatchEventToListeners(Events.OPERATIONS_CLEARED);
    this.dispatchEventToListeners(Events.CACHE_CLEARED);
  }
}

SDK.SDKModel.SDKModel.register(RNApolloModel, {capabilities: SDK.Target.Capability.JS, autostart: false});

