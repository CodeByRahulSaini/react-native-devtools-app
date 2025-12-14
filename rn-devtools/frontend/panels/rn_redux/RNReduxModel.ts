// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Common from '../../../../front_end/core/common/common.js';
import * as SDK from '../../../../front_end/core/sdk/sdk.js';
import * as PluginsBindings from '../../models/plugins_bindings/plugins_bindings.js';

const REDUX_DOMAIN = 'redux';

type JSONValue = null | string | number | boolean | {[key: string]: JSONValue} | JSONValue[];

/**
 * Redux action data received from the plugin.
 */
export interface ReduxAction {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
  stateBefore: string;  // Serialized state before action
  stateAfter: string;   // Serialized state after action
}

/**
 * Redux action entry tracking action and its index.
 */
export interface ReduxActionEntry {
  action: ReduxAction;
  index: number;
}

/**
 * State snapshot data received from the plugin.
 */
export interface ReduxStateSnapshot {
  state: string;
  timestamp: number;
}

/**
 * Message format from Redux plugin.
 */
interface PluginMessage {
  event: string;
  data: ReduxAction | ReduxStateSnapshot | { error: string; timestamp: number } | { type: string; timestamp: number };
}

export const enum Events {
  ACTION_DISPATCHED = 'ActionDispatched',
  STATE_CHANGED = 'StateChanged',
  STATE_SNAPSHOT = 'StateSnapshot',
  ACTIONS_CLEARED = 'ActionsCleared',
}

export interface EventTypes {
  [Events.ACTION_DISPATCHED]: ReduxActionEntry;
  [Events.STATE_CHANGED]: ReduxStateSnapshot;
  [Events.STATE_SNAPSHOT]: ReduxStateSnapshot;
  [Events.ACTIONS_CLEARED]: void;
}

type BackendExecutionContextUnavailableEvent = Common.EventTarget.EventTargetEvent<
    PluginsBindings.PluginsBindingsModel.EventTypes[PluginsBindings.PluginsBindingsModel.Events.BACKEND_EXECUTION_CONTEXT_UNAVAILABLE]>;

/**
 * RNReduxModel - Model for managing Redux action and state from the Redux plugin.
 *
 * This model:
 * - Subscribes to "redux" domain messages from PluginsBindingsModel
 * - Tracks actions and state changes
 * - Exposes events for UI updates
 */
export class RNReduxModel extends SDK.SDKModel.SDKModel<EventTypes> {
  readonly #bindingsModel: PluginsBindings.PluginsBindingsModel.PluginsBindingsModel;
  readonly #actions: ReduxActionEntry[] = [];
  #currentState: ReduxStateSnapshot | null = null;
  #initializeCalled = false;
  #initialized = false;

  constructor(target: SDK.Target.Target) {
    super(target);

    const bindingsModel = target.model(PluginsBindings.PluginsBindingsModel.PluginsBindingsModel);
    if (bindingsModel === null) {
      throw new Error('Failed to construct RNReduxModel: PluginsBindingsModel was null');
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

    this.#actions.length = 0;
    this.#currentState = null;
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
        REDUX_DOMAIN,
        message => this.#handleMessage(message as unknown as PluginMessage),
      );

      await bindingsModel.initializeDomain(REDUX_DOMAIN);

      this.#initialized = true;

      // Request initial state snapshot
      await this.getStateFromPlugin();
    } catch (e) {
      console.error('[RNReduxModel] Failed to initialize:', e);
    }
  }

  isInitialized(): boolean {
    return this.#initialized;
  }

  getActions(): ReduxActionEntry[] {
    return this.#actions.slice();
  }

  getAction(index: number): ReduxActionEntry | undefined {
    return this.#actions[index];
  }

  getCurrentState(): ReduxStateSnapshot | null {
    return this.#currentState;
  }

  clearActions(): void {
    this.#actions.length = 0;
    this.dispatchEventToListeners(Events.ACTIONS_CLEARED);
  }

  async getStateFromPlugin(): Promise<void> {
    await this.#bindingsModel.sendMessage(REDUX_DOMAIN, {action: 'getState'});
  }

  async dispatchAction(type: string, payload?: any): Promise<void> {
    const message: Record<string, JSONValue> = {
      action: 'dispatch',
      type,
    };
    if (payload !== undefined) {
      message.payload = payload as JSONValue;
    }
    await this.#bindingsModel.sendMessage(REDUX_DOMAIN, message);
  }

  #handleMessage(message: PluginMessage): void {
    if (!message || !message.event) {
      return;
    }

    switch (message.event) {
      case 'action':
        this.#handleAction(message.data as ReduxAction);
        break;
      case 'stateChange':
        this.#handleStateChange(message.data as ReduxStateSnapshot);
        break;
      case 'stateSnapshot':
        this.#handleStateSnapshot(message.data as ReduxStateSnapshot);
        break;
      case 'dispatchSuccess':
        // Action was successfully dispatched from DevTools
        // The 'action' event will follow with the action details
        break;
      case 'dispatchError':
        console.error('[RNReduxModel] Dispatch error:', message.data);
        break;
      default:
        console.warn(`[RNReduxModel] Unknown event: ${message.event}`);
    }
  }

  #handleAction(action: ReduxAction): void {
    const entry: ReduxActionEntry = {
      action,
      index: this.#actions.length,
    };
    this.#actions.push(entry);
    this.dispatchEventToListeners(Events.ACTION_DISPATCHED, entry);
  }

  #handleStateChange(stateData: ReduxStateSnapshot): void {
    this.#currentState = stateData;
    this.dispatchEventToListeners(Events.STATE_CHANGED, stateData);
  }

  #handleStateSnapshot(stateData: ReduxStateSnapshot): void {
    this.#currentState = stateData;
    this.dispatchEventToListeners(Events.STATE_SNAPSHOT, stateData);
  }

  #handleBackendExecutionContextCreated(): void {
    // Reconnect if needed
    if (!this.#bindingsModel.isEnabled()) {
      this.ensureInitialized();
    }
  }

  #handleBackendExecutionContextUnavailable({data: errorMessage}: BackendExecutionContextUnavailableEvent): void {
    console.error('[RNReduxModel] Backend execution context unavailable:', errorMessage);
  }

  #handleBackendExecutionContextDestroyed(): void {
    // Clear actions on context destruction (app reload)
    this.#actions.length = 0;
    this.#currentState = null;
    this.dispatchEventToListeners(Events.ACTIONS_CLEARED);
  }
}

SDK.SDKModel.SDKModel.register(RNReduxModel, {capabilities: SDK.Target.Capability.JS, autostart: false});

