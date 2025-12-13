// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type { Plugin, Bridge, JSONValue } from '../../core/types';

/**
 * Network request data sent to DevTools.
 */
interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  startTime: number;
}

/**
 * Network response data sent to DevTools.
 */
interface NetworkResponse {
  id: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body?: string;
  endTime: number;
  duration: number;
}

/**
 * Configuration options for NetworkPlugin.
 */
export interface NetworkPluginOptions {
  /**
   * URL patterns to ignore (e.g., Metro bundler URLs).
   * Supports string prefix matching.
   */
  ignorePatterns?: string[];

  /**
   * Maximum body size to capture (in bytes).
   * Bodies larger than this will be truncated.
   * Default: 100KB
   */
  maxBodySize?: number;
}

// Generate unique request IDs
let requestIdCounter = 0;
function generateRequestId(): string {
  return `req_${Date.now()}_${++requestIdCounter}`;
}

/**
 * NetworkPlugin - Intercepts fetch and XMLHttpRequest to monitor network traffic.
 *
 * Events sent to DevTools:
 * - 'request': When a network request starts
 * - 'response': When a network request completes
 * - 'error': When a network request fails
 *
 * Commands from DevTools:
 * - 'clear': Clear the request history
 */
export class NetworkPlugin implements Plugin {
  readonly name = 'network';

  private bridge: Bridge | null = null;
  private readonly options: Required<NetworkPluginOptions>;

  // Store original implementations for cleanup
  private originalFetch: typeof fetch | null = null;
  private originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
  private originalXHRSend: typeof XMLHttpRequest.prototype.send | null = null;

  // Track pending requests for potential replay
  private readonly pendingRequests = new Map<string, NetworkRequest>();

  constructor(options: NetworkPluginOptions = {}) {
    this.options = {
      ignorePatterns: options.ignorePatterns ?? [],
      maxBodySize: options.maxBodySize ?? 100 * 1024, // 100KB default
    };
  }

  init(bridge: Bridge): void {
    this.bridge = bridge;

    // Set up command handler
    bridge.onMessage((action, data) => {
      this.handleCommand(action, data);
    });

    // Intercept network APIs
    this.interceptFetch();
    this.interceptXHR();

    console.log('[NetworkPlugin] Initialized');
  }

  destroy(): void {
    // Restore original implementations
    this.restoreFetch();
    this.restoreXHR();

    this.bridge?.offMessage();
    this.bridge = null;
    this.pendingRequests.clear();

    console.log('[NetworkPlugin] Destroyed');
  }

  private handleCommand(action: string, _data: JSONValue | undefined): void {
    switch (action) {
      case 'clear':
        this.pendingRequests.clear();
        break;
      default:
        console.warn(`[NetworkPlugin] Unknown command: ${action}`);
    }
  }

  private shouldIgnoreUrl(url: string): boolean {
    return this.options.ignorePatterns.some(pattern => url.startsWith(pattern));
  }

  private truncateBody(body: string | undefined): string | undefined {
    if (!body) return undefined;
    if (body.length <= this.options.maxBodySize) return body;
    return body.slice(0, this.options.maxBodySize) + '... [truncated]';
  }

  private headersToRecord(headers: Headers | Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        result[key] = value;
      });
    } else {
      Object.assign(result, headers);
    }
    return result;
  }

  // ============================================
  // Fetch interception
  // ============================================

  private interceptFetch(): void {
    if (typeof globalThis.fetch !== 'function') {
      return;
    }

    this.originalFetch = globalThis.fetch;
    const plugin = this;

    globalThis.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      // Skip ignored URLs
      if (plugin.shouldIgnoreUrl(url)) {
        return plugin.originalFetch!.call(globalThis, input, init);
      }

      const requestId = generateRequestId();
      const startTime = Date.now();

      // Extract request details
      const method = init?.method ?? 'GET';
      const headers = plugin.headersToRecord(new Headers(init?.headers));
      let body: string | undefined;
      if (init?.body) {
        if (typeof init.body === 'string') {
          body = init.body;
        } else if (init.body instanceof ArrayBuffer) {
          body = '[ArrayBuffer]';
        } else if (init.body instanceof FormData) {
          body = '[FormData]';
        } else {
          body = '[Binary]';
        }
      }

      const request: NetworkRequest = {
        id: requestId,
        url,
        method,
        headers,
        body: plugin.truncateBody(body),
        startTime,
      };

      plugin.pendingRequests.set(requestId, request);
      plugin.sendEvent('request', request as unknown as JSONValue);

      try {
        const response = await plugin.originalFetch!.call(globalThis, input, init);
        const endTime = Date.now();

        // Clone response to read body without consuming it
        const clonedResponse = response.clone();
        let responseBody: string | undefined;
        try {
          const text = await clonedResponse.text();
          responseBody = plugin.truncateBody(text);
        } catch {
          responseBody = '[Unable to read body]';
        }

        const responseData: NetworkResponse = {
          id: requestId,
          status: response.status,
          statusText: response.statusText,
          headers: plugin.headersToRecord(response.headers),
          body: responseBody,
          endTime,
          duration: endTime - startTime,
        };

        plugin.sendEvent('response', responseData as unknown as JSONValue);
        plugin.pendingRequests.delete(requestId);

        return response;
      } catch (error) {
        const endTime = Date.now();
        plugin.sendEvent('error', {
          id: requestId,
          error: error instanceof Error ? error.message : String(error),
          endTime,
          duration: endTime - startTime,
        });
        plugin.pendingRequests.delete(requestId);
        throw error;
      }
    };
  }

  private restoreFetch(): void {
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
      this.originalFetch = null;
    }
  }

  // ============================================
  // XMLHttpRequest interception
  // ============================================

  private interceptXHR(): void {
    if (typeof XMLHttpRequest === 'undefined') {
      return;
    }

    this.originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalXHRSend = XMLHttpRequest.prototype.send;
    const plugin = this;

    // Extend XMLHttpRequest type for our tracking
    interface TrackedXHR extends XMLHttpRequest {
      _devtools_id?: string;
      _devtools_method?: string;
      _devtools_url?: string;
      _devtools_startTime?: number;
      _devtools_headers?: Record<string, string>;
    }

    XMLHttpRequest.prototype.open = function (
      this: TrackedXHR,
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null
    ): void {
      this._devtools_method = method;
      this._devtools_url = typeof url === 'string' ? url : url.href;
      this._devtools_headers = {};

      // Intercept setRequestHeader
      const originalSetRequestHeader = this.setRequestHeader.bind(this);
      this.setRequestHeader = (name: string, value: string) => {
        this._devtools_headers![name] = value;
        originalSetRequestHeader(name, value);
      };

      plugin.originalXHROpen!.call(this, method, url, async ?? true, username, password);
    };

    XMLHttpRequest.prototype.send = function (
      this: TrackedXHR,
      body?: Document | XMLHttpRequestBodyInit | null
    ): void {
      const url = this._devtools_url;

      // Skip ignored URLs
      if (!url || plugin.shouldIgnoreUrl(url)) {
        plugin.originalXHRSend!.call(this, body);
        return;
      }

      const requestId = generateRequestId();
      this._devtools_id = requestId;
      this._devtools_startTime = Date.now();

      let bodyStr: string | undefined;
      if (body) {
        if (typeof body === 'string') {
          bodyStr = body;
        } else if (body instanceof FormData) {
          bodyStr = '[FormData]';
        } else if (body instanceof ArrayBuffer) {
          bodyStr = '[ArrayBuffer]';
        } else if (body instanceof Document) {
          bodyStr = '[Document]';
        } else {
          bodyStr = '[Binary]';
        }
      }

      const request: NetworkRequest = {
        id: requestId,
        url,
        method: this._devtools_method ?? 'GET',
        headers: this._devtools_headers ?? {},
        body: plugin.truncateBody(bodyStr),
        startTime: this._devtools_startTime,
      };

      plugin.pendingRequests.set(requestId, request);
      plugin.sendEvent('request', request as unknown as JSONValue);

      // Listen for completion
      this.addEventListener('loadend', function (this: TrackedXHR) {
        const endTime = Date.now();
        const startTime = this._devtools_startTime ?? endTime;

        if (this.status > 0) {
          // Get response headers
          const responseHeaders: Record<string, string> = {};
          const headerString = this.getAllResponseHeaders();
          if (headerString) {
            const headerLines = headerString.trim().split(/[\r\n]+/);
            for (const line of headerLines) {
              const colonIndex = line.indexOf(':');
              if (colonIndex > 0) {
                const name = line.slice(0, colonIndex).trim();
                const value = line.slice(colonIndex + 1).trim();
                responseHeaders[name] = value;
              }
            }
          }

          const response: NetworkResponse = {
            id: this._devtools_id!,
            status: this.status,
            statusText: this.statusText,
            headers: responseHeaders,
            body: plugin.truncateBody(this.responseText),
            endTime,
            duration: endTime - startTime,
          };

          plugin.sendEvent('response', response as unknown as JSONValue);
        } else {
          plugin.sendEvent('error', {
            id: this._devtools_id,
            error: 'Request failed',
            endTime,
            duration: endTime - startTime,
          });
        }

        plugin.pendingRequests.delete(this._devtools_id!);
      });

      plugin.originalXHRSend!.call(this, body);
    };
  }

  private restoreXHR(): void {
    if (typeof XMLHttpRequest !== 'undefined') {
      if (this.originalXHROpen) {
        XMLHttpRequest.prototype.open = this.originalXHROpen;
        this.originalXHROpen = null;
      }
      if (this.originalXHRSend) {
        XMLHttpRequest.prototype.send = this.originalXHRSend;
        this.originalXHRSend = null;
      }
    }
  }

  // ============================================
  // Helper methods
  // ============================================

  private sendEvent(event: string, data: JSONValue): void {
    if (this.bridge) {
      this.bridge.send(event, data);
    }
  }
}

