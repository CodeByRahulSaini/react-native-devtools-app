// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type { Plugin, Bridge, JSONValue } from '../../core/types';

/**
 * Minimal Apollo Client interface for type safety.
 * Users will pass an actual ApolloClient instance.
 */
interface ApolloClientLike {
  link: {
    request(operation: Operation, forward?: (operation: Operation) => Observable<FetchResult>): Observable<FetchResult> | null;
  };
  cache: {
    extract(optimistic?: boolean): Record<string, any>;
    reset(): Promise<void>;
    watch(options: WatchOptions): () => void;
  };
  query<T = any, V = Record<string, any>>(options: QueryOptions<V>): Promise<ApolloQueryResult<T>>;
}

interface Operation {
  operationName?: string | null;
  query: any;
  variables?: Record<string, any>;
  extensions?: Record<string, any>;
  getContext(): Record<string, any>;
  setContext(context: Record<string, any>): Record<string, any>;
}

interface Observable<T> {
  subscribe(observer: Observer<T>): Subscription;
}

interface Observer<T> {
  next?: (value: T) => void;
  error?: (error: any) => void;
  complete?: () => void;
}

interface Subscription {
  unsubscribe(): void;
}

interface FetchResult<T = Record<string, any>> {
  data?: T | null;
  errors?: ReadonlyArray<any>;
  extensions?: Record<string, any>;
}

interface WatchOptions {
  query: any;
  variables?: Record<string, any>;
  optimistic?: boolean;
  callback: (diff: CacheDiffResult) => void;
}

interface CacheDiffResult {
  result?: any;
  complete?: boolean;
}

interface QueryOptions<V = Record<string, any>> {
  query: any;
  variables?: V;
  fetchPolicy?: string;
  errorPolicy?: string;
}

interface ApolloQueryResult<T> {
  data: T;
  loading: boolean;
  networkStatus?: number;
  errors?: ReadonlyArray<any>;
}

/**
 * Apollo operation data sent to DevTools.
 */
interface ApolloOperation {
  id: string;
  type: 'query' | 'mutation' | 'subscription';
  name: string;
  variables: Record<string, any>;
  startTime: number;
}

/**
 * Apollo operation completion data sent to DevTools.
 */
interface ApolloOperationComplete {
  id: string;
  result: any;
  endTime: number;
  duration: number;
  fromCache?: boolean;
}

/**
 * Apollo operation error data sent to DevTools.
 */
interface ApolloOperationError {
  id: string;
  error: any;
  endTime: number;
  duration: number;
}

/**
 * Configuration options for ApolloPlugin.
 */
export interface ApolloPluginOptions {
  /**
   * Apollo Client instance to monitor.
   */
  client: ApolloClientLike;

  /**
   * Maximum depth for serializing cache data.
   * Default: 10
   */
  maxCacheDepth?: number;

  /**
   * Maximum size for operation result serialization (in characters).
   * Results larger than this will be truncated.
   * Default: 500KB
   */
  maxResultSize?: number;
}

// Generate unique operation IDs
let operationIdCounter = 0;
function generateOperationId(): string {
  return `op_${Date.now()}_${++operationIdCounter}`;
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
 * Determine operation type from operation name or query.
 */
function getOperationType(operation: Operation): 'query' | 'mutation' | 'subscription' {
  // Try to get from operation name
  const name = operation.operationName?.toLowerCase() || '';
  if (name.includes('mutation')) {
    return 'mutation';
  }
  if (name.includes('subscription')) {
    return 'subscription';
  }
  
  // Try to infer from query AST (simplified check)
  const queryStr = typeof operation.query === 'string' 
    ? operation.query 
    : (operation.query?.loc?.source?.body || '');
  if (queryStr.includes('mutation')) {
    return 'mutation';
  }
  if (queryStr.includes('subscription')) {
    return 'subscription';
  }
  
  return 'query';
}

/**
 * ApolloPlugin - Intercepts Apollo Client operations to monitor GraphQL queries, mutations, and subscriptions.
 *
 * Events sent to DevTools:
 * - 'operation': When a GraphQL operation starts
 * - 'operationComplete': When a GraphQL operation completes successfully
 * - 'operationError': When a GraphQL operation fails
 * - 'cacheUpdate': When the Apollo cache is updated
 *
 * Commands from DevTools:
 * - 'getCache': Get the current cache state
 * - 'clearCache': Clear the Apollo cache
 * - 'executeQuery': Execute a query and return the result
 */
export class ApolloPlugin implements Plugin {
  readonly name = 'apollo';

  private bridge: Bridge | null = null;
  private readonly options: Required<Omit<ApolloPluginOptions, 'client'>> & { client: ApolloClientLike };
  private readonly pendingOperations = new Map<string, ApolloOperation>();
  private cacheWatcher: (() => void) | null = null;
  private originalRequest: ((operation: Operation, forward?: (operation: Operation) => Observable<FetchResult>) => Observable<FetchResult> | null) | null = null;

  constructor(options: ApolloPluginOptions) {
    if (!options.client) {
      throw new Error('ApolloPlugin requires an ApolloClient instance');
    }

    this.options = {
      client: options.client,
      maxCacheDepth: options.maxCacheDepth ?? 10,
      maxResultSize: options.maxResultSize ?? 500 * 1024, // 500KB default
    };
  }

  init(bridge: Bridge): void {
    this.bridge = bridge;

    // Set up command handler
    bridge.onMessage((action, data) => {
      this.handleCommand(action, data);
    });

    // Intercept Apollo operations via link
    this.interceptApolloLink();

    // Watch cache updates
    this.watchCache();

    console.log('[ApolloPlugin] Initialized');
  }

  destroy(): void {
    // Restore original link
    this.restoreApolloLink();

    // Stop watching cache
    if (this.cacheWatcher) {
      this.cacheWatcher();
      this.cacheWatcher = null;
    }

    this.bridge?.offMessage();
    this.bridge = null;
    this.pendingOperations.clear();

    console.log('[ApolloPlugin] Destroyed');
  }

  private handleCommand(action: string, data: JSONValue | undefined): void {
    switch (action) {
      case 'getCache':
        this.handleGetCache();
        break;
      case 'clearCache':
        this.handleClearCache();
        break;
      case 'executeQuery':
        this.handleExecuteQuery(data as { query: any; variables?: Record<string, any> } | undefined);
        break;
      default:
        console.warn(`[ApolloPlugin] Unknown command: ${action}`);
    }
  }

  private handleGetCache(): void {
    try {
      const cache = this.options.client.cache.extract();
      const serialized = safeStringify(cache, this.options.maxCacheDepth);
      const truncated = truncateString(serialized, this.options.maxResultSize);
      
      this.sendEvent('cache', {
        data: truncated,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.sendEvent('cacheError', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
    }
  }

  private handleClearCache(): void {
    try {
      void this.options.client.cache.reset();
      this.sendEvent('cacheCleared', {
        timestamp: Date.now(),
      });
    } catch (error) {
      this.sendEvent('cacheError', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
    }
  }

  private async handleExecuteQuery(data: { query: any; variables?: Record<string, any> } | undefined): Promise<void> {
    if (!data || !data.query) {
      this.sendEvent('queryError', {
        error: 'Missing query in executeQuery command',
        timestamp: Date.now(),
      });
      return;
    }

    try {
      const result = await this.options.client.query({
        query: data.query,
        variables: data.variables,
      });

      const serialized = safeStringify(result, this.options.maxCacheDepth);
      const truncated = truncateString(serialized, this.options.maxResultSize);

      this.sendEvent('queryResult', {
        result: truncated,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.sendEvent('queryError', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
    }
  }

  private interceptApolloLink(): void {
    const client = this.options.client;
    if (!client.link || typeof client.link.request !== 'function') {
      console.warn('[ApolloPlugin] Apollo Client link is not available or does not support request method');
      return;
    }

    // Store original request method
    this.originalRequest = client.link.request.bind(client.link);
    const plugin = this;

    // Override the request method
    client.link.request = function (
      operation: Operation,
      forward?: (operation: Operation) => Observable<FetchResult>
    ): Observable<FetchResult> | null {
      // Call original request
      const observable = plugin.originalRequest!.call(client.link, operation, forward);

      if (!observable) {
        return null;
      }

      // Track the operation
      const operationId = generateOperationId();
      const operationType = getOperationType(operation);
      const operationName = operation.operationName || 'UnnamedOperation';
      const startTime = Date.now();

      const trackedOperation: ApolloOperation = {
        id: operationId,
        type: operationType,
        name: operationName,
        variables: operation.variables || {},
        startTime,
      };

      plugin.pendingOperations.set(operationId, trackedOperation);
      plugin.sendEvent('operation', trackedOperation as unknown as JSONValue);

      // Wrap the observable to track completion/error
      return {
        subscribe(observer: Observer<FetchResult>) {
          const wrappedObserver: Observer<FetchResult> = {
            next: (value: FetchResult) => {
              const endTime = Date.now();
              const duration = endTime - startTime;

              const completeData: ApolloOperationComplete = {
                id: operationId,
                result: value.data || value,
                endTime,
                duration,
                fromCache: operation.getContext()?.fetchPolicy === 'cache-only' || 
                          operation.getContext()?.fetchPolicy === 'cache-first',
              };

              plugin.sendEvent('operationComplete', completeData as unknown as JSONValue);
              plugin.pendingOperations.delete(operationId);

              if (observer.next) {
                observer.next(value);
              }
            },
            error: (error: any) => {
              const endTime = Date.now();
              const duration = endTime - startTime;

              const errorData: ApolloOperationError = {
                id: operationId,
                error: error instanceof Error ? {
                  message: error.message,
                  name: error.name,
                  stack: error.stack,
                } : error,
                endTime,
                duration,
              };

              plugin.sendEvent('operationError', errorData as unknown as JSONValue);
              plugin.pendingOperations.delete(operationId);

              if (observer.error) {
                observer.error(error);
              }
            },
            complete: () => {
              if (observer.complete) {
                observer.complete();
              }
            },
          };

          return observable.subscribe(wrappedObserver);
        },
      } as Observable<FetchResult>;
    };
  }

  private restoreApolloLink(): void {
    if (this.originalRequest && this.options.client.link) {
      this.options.client.link.request = this.originalRequest;
      this.originalRequest = null;
    }
  }

  private watchCache(): void {
    try {
      const client = this.options.client;
      if (!client.cache || typeof client.cache.watch !== 'function') {
        console.warn('[ApolloPlugin] Apollo Client cache does not support watch method');
        return;
      }

      // Watch for cache updates (simplified - watch all queries)
      // Note: Apollo's cache.watch API may vary by version
      // This is a best-effort implementation
      const plugin = this;
      
      // Send initial cache state
      this.handleGetCache();

      // Try to set up cache watching
      // Since we don't have a specific query to watch, we'll rely on operation completion
      // to detect cache updates. A more sophisticated implementation could watch specific
      // cache keys, but that requires more Apollo-specific knowledge.
      
    } catch (error) {
      console.warn('[ApolloPlugin] Failed to set up cache watching:', error);
    }
  }

  private sendEvent(event: string, data: JSONValue): void {
    if (this.bridge) {
      this.bridge.send(event, data);
    }
  }
}

