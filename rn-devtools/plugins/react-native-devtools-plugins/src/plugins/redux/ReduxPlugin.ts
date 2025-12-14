// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type { Plugin, Bridge, JSONValue } from '../../core/types';

/**
 * Minimal Redux Store interface for type safety.
 * Users will pass an actual Redux store instance.
 */
export interface ReduxStoreLike {
  dispatch(action: any): any;
  getState(): any;
  subscribe(listener: () => void): () => void;
}

/**
 * Redux action data sent to DevTools.
 */
interface ReduxAction {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
  stateBefore: string;  // Serialized state before action
  stateAfter: string;   // Serialized state after action
}

/**
 * Configuration options for ReduxPlugin.
 */
export interface ReduxPluginOptions {
  /**
   * Redux store instance to monitor.
   */
  store: ReduxStoreLike;

  /**
   * Maximum depth for serializing state data.
   * Default: 10
   */
  maxStateDepth?: number;

  /**
   * Maximum size for state serialization (in characters).
   * States larger than this will be truncated.
   * Default: 500KB
   */
  maxStateSize?: number;

  /**
   * Optional transformer function to redact sensitive data from state before serialization.
   * Receives the state object and returns a transformed version.
   */
  stateTransformer?: (state: any) => any;

  /**
   * Optional transformer function to redact sensitive data from action payloads.
   * Receives the action and returns a transformed version.
   */
  actionTransformer?: (action: any) => any;
}

// Generate unique action IDs
let actionIdCounter = 0;
function generateActionId(): string {
  return `action_${Date.now()}_${++actionIdCounter}`;
}

/**
 * Safe JSON stringify that handles circular references and limits depth.
 */
function safeStringify(obj: any, maxDepth: number = 10, currentDepth: number = 0): string {
  if (currentDepth >= maxDepth) {
    return '... [max depth reached]';
  }

  if (obj === null || obj === undefined) {
    return String(obj);
  }

  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return '[]';
    }
    const items = obj.slice(0, 100).map(item => safeStringify(item, maxDepth, currentDepth + 1));
    if (obj.length > 100) {
      items.push('... [truncated]');
    }
    return `[${items.join(', ')}]`;
  }

  try {
    const seen = new WeakSet();
    const replacer = (key: string, value: any) => {
      if (currentDepth >= maxDepth) {
        return '... [max depth]';
      }
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    };
    return JSON.stringify(obj, replacer, 2);
  } catch (error) {
    return `[Error serializing: ${error instanceof Error ? error.message : String(error)}]`;
  }
}

/**
 * Truncate string to maximum size.
 */
function truncateString(str: string, maxSize: number): string {
  if (str.length <= maxSize) {
    return str;
  }
  return str.slice(0, maxSize) + '... [truncated]';
}

/**
 * ReduxPlugin - Intercepts Redux store dispatches to monitor actions and state changes.
 *
 * Events sent to DevTools:
 * - 'action': When a Redux action is dispatched (includes state before/after)
 * - 'stateChange': When state changes (via store subscription)
 * - 'stateSnapshot': Current state snapshot (sent on request)
 *
 * Commands from DevTools:
 * - 'getState': Get the current state snapshot
 * - 'dispatch': Dispatch an action to the store
 */
export class ReduxPlugin implements Plugin {
  readonly name = 'redux';

  private bridge: Bridge | null = null;
  private readonly options: Required<Omit<ReduxPluginOptions, 'store' | 'stateTransformer' | 'actionTransformer'>> & {
    store: ReduxStoreLike;
    stateTransformer?: (state: any) => any;
    actionTransformer?: (action: any) => any;
  };
  private unsubscribe: (() => void) | null = null;
  private originalDispatch: ((action: any) => any) | null = null;
  private actionIndex = 0;

  constructor(options: ReduxPluginOptions) {
    if (!options.store) {
      throw new Error('ReduxPlugin requires a Redux store instance');
    }

    this.options = {
      store: options.store,
      maxStateDepth: options.maxStateDepth ?? 10,
      maxStateSize: options.maxStateSize ?? 500 * 1024, // 500KB default
      stateTransformer: options.stateTransformer,
      actionTransformer: options.actionTransformer,
    };
  }

  init(bridge: Bridge): void {
    this.bridge = bridge;

    // Set up command handler
    bridge.onMessage((action, data) => {
      this.handleCommand(action, data);
    });

    // Intercept store.dispatch
    this.interceptDispatch();

    // Subscribe to state changes
    this.subscribeToStore();

    // Send initial state snapshot
    this.sendStateSnapshot();

    console.log('[ReduxPlugin] Initialized');
  }

  destroy(): void {
    // Restore original dispatch
    this.restoreDispatch();

    // Unsubscribe from store
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.bridge?.offMessage();
    this.bridge = null;
    this.actionIndex = 0;

    console.log('[ReduxPlugin] Destroyed');
  }

  private handleCommand(action: string, data: JSONValue | undefined): void {
    switch (action) {
      case 'getState':
        this.handleGetState();
        break;
      case 'dispatch':
        this.handleDispatch(data as { type: string; payload?: any } | undefined);
        break;
      default:
        console.warn(`[ReduxPlugin] Unknown command: ${action}`);
    }
  }

  private handleGetState(): void {
    this.sendStateSnapshot();
  }

  private handleDispatch(data: { type: string; payload?: any } | undefined): void {
    if (!data || !data.type) {
      this.sendEvent('dispatchError', {
        error: 'Missing action type in dispatch command',
        timestamp: Date.now(),
      });
      return;
    }

    try {
      const action = data.payload !== undefined
        ? { type: data.type, ...data.payload }
        : { type: data.type };

      this.options.store.dispatch(action);
      this.sendEvent('dispatchSuccess', {
        type: data.type,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.sendEvent('dispatchError', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
    }
  }

  private interceptDispatch(): void {
    const store = this.options.store;
    if (!store || typeof store.dispatch !== 'function') {
      console.warn('[ReduxPlugin] Store dispatch is not available');
      return;
    }

    // Store original dispatch
    this.originalDispatch = store.dispatch.bind(store);
    const plugin = this;

    // Wrap dispatch to intercept actions
    store.dispatch = function (action: any): any {
      const actionId = generateActionId();
      const timestamp = Date.now();

      // Transform action if transformer is provided
      const transformedAction = plugin.options.actionTransformer
        ? plugin.options.actionTransformer(action)
        : action;

      // Get state before dispatch
      const stateBefore = plugin.getStateSnapshot();

      // Call original dispatch
      const result = plugin.originalDispatch!.call(store, action);

      // Get state after dispatch (synchronously, as Redux updates synchronously)
      const stateAfter = plugin.getStateSnapshot();

      // Send action event
      const actionData: ReduxAction = {
        id: actionId,
        type: transformedAction.type || String(transformedAction),
        payload: transformedAction.payload !== undefined ? transformedAction.payload : transformedAction,
        timestamp,
        stateBefore,
        stateAfter,
      };

      plugin.actionIndex++;
      plugin.sendEvent('action', actionData as unknown as JSONValue);

      return result;
    };
  }

  private restoreDispatch(): void {
    if (this.originalDispatch && this.options.store) {
      this.options.store.dispatch = this.originalDispatch;
      this.originalDispatch = null;
    }
  }

  private subscribeToStore(): void {
    const store = this.options.store;
    if (!store || typeof store.subscribe !== 'function') {
      console.warn('[ReduxPlugin] Store subscribe is not available');
      return;
    }

    const plugin = this;
    this.unsubscribe = store.subscribe(() => {
      // State changed - send update
      plugin.sendEvent('stateChange', {
        state: plugin.getStateSnapshot(),
        timestamp: Date.now(),
      });
    });
  }

  private getStateSnapshot(): string {
    try {
      const state = this.options.store.getState();
      const transformedState = this.options.stateTransformer
        ? this.options.stateTransformer(state)
        : state;

      const serialized = safeStringify(transformedState, this.options.maxStateDepth);
      return truncateString(serialized, this.options.maxStateSize);
    } catch (error) {
      return `[Error getting state: ${error instanceof Error ? error.message : String(error)}]`;
    }
  }

  private sendStateSnapshot(): void {
    const stateSnapshot = this.getStateSnapshot();
    this.sendEvent('stateSnapshot', {
      state: stateSnapshot,
      timestamp: Date.now(),
    });
  }

  private sendEvent(event: string, data: JSONValue): void {
    if (this.bridge) {
      this.bridge.send(event, data);
    }
  }
}

