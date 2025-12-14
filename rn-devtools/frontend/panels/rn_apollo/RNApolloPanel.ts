// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as i18n from '../../../../front_end/core/i18n/i18n.js';
import * as SDK from '../../../../front_end/core/sdk/sdk.js';
import * as UI from '../../../../front_end/ui/legacy/legacy.js';
import {html, render, nothing} from '../../../../front_end/ui/lit/lit.js';

import type {ApolloOperationEntry} from './RNApolloModel.js';
import * as RNApolloModel from './RNApolloModel.js';
import rnApolloStyles from './rnApollo.css.js';

const UIStrings = {
  /**
   * @description Title of the Apollo panel
   */
  rnApollo: 'Apollo',
  /**
   * @description Command for showing the Apollo panel
   */
  showRnApollo: 'Show Apollo panel',
  /**
   * @description Clear button tooltip
   */
  clearLog: 'Clear operation log',
  /**
   * @description Clear cache button tooltip
   */
  clearCache: 'Clear Apollo cache',
  /**
   * @description Refresh cache button tooltip
   */
  refreshCache: 'Refresh cache',
  /**
   * @description Filter placeholder
   */
  filterPlaceholder: 'Filter by operation name...',
  /**
   * @description Empty state title
   */
  emptyTitle: 'No GraphQL operations',
  /**
   * @description Empty state description
   */
  emptyDescription: 'GraphQL operations from your React Native app will appear here. Make sure the ApolloPlugin is initialized in your app.',
  /**
   * @description Pending status
   */
  pending: 'Pending',
  /**
   * @description Error status
   */
  error: 'Error',
  /**
   * @description Operation details tab
   */
  details: 'Details',
  /**
   * @description Variables tab
   */
  variables: 'Variables',
  /**
   * @description Result tab
   */
  result: 'Result',
  /**
   * @description Error tab
   */
  errorTab: 'Error',
  /**
   * @description Cache tab
   */
  cache: 'Cache',
  /**
   * @description Operation name label
   */
  operationName: 'Operation Name',
  /**
   * @description Operation type label
   */
  operationType: 'Type',
  /**
   * @description Duration label
   */
  duration: 'Duration',
  /**
   * @description Cache status label
   */
  cacheStatus: 'Cache',
  /**
   * @description From cache indicator
   */
  fromCache: 'From Cache',
  /**
   * @description Network indicator
   */
  network: 'Network',
  /**
   * @description No data message
   */
  noData: 'No data',
  /**
   * @description Query type
   */
  query: 'Query',
  /**
   * @description Mutation type
   */
  mutation: 'Mutation',
  /**
   * @description Subscription type
   */
  subscription: 'Subscription',
} as const;

const str_ = i18n.i18n.registerUIStrings('panels/rn_apollo/RNApolloPanel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

type DetailTab = 'details' | 'variables' | 'result' | 'error' | 'cache';
type FilterType = 'all' | 'query' | 'mutation' | 'subscription';

let rnApolloPanelInstance: RNApolloPanel;

export class RNApolloPanel extends UI.Widget.VBox implements
    SDK.TargetManager.SDKModelObserver<RNApolloModel.RNApolloModel> {
  #operations: ApolloOperationEntry[] = [];
  #selectedOperation: ApolloOperationEntry | null = null;
  #filterText = '';
  #filterType: FilterType = 'all';
  #activeDetailTab: DetailTab = 'details';
  #model: RNApolloModel.RNApolloModel | null = null;
  #cache: RNApolloModel.ApolloCacheData | null = null;

  static instance(opts: {forceNew: boolean} = {forceNew: false}): RNApolloPanel {
    if (!rnApolloPanelInstance || opts.forceNew) {
      rnApolloPanelInstance = new RNApolloPanel();
    }
    return rnApolloPanelInstance;
  }

  private constructor() {
    super(true, true);
    this.registerRequiredCSS(rnApolloStyles);

    SDK.TargetManager.TargetManager.instance().observeModels(
        RNApolloModel.RNApolloModel, this);
  }

  modelAdded(model: RNApolloModel.RNApolloModel): void {
    if (this.#model) {
      return; // Only track one model
    }

    this.#model = model;
    model.ensureInitialized();

    model.addEventListener(RNApolloModel.Events.OPERATION_STARTED, this.#onOperationStarted, this);
    model.addEventListener(RNApolloModel.Events.OPERATION_COMPLETED, this.#onOperationCompleted, this);
    model.addEventListener(RNApolloModel.Events.OPERATION_ERROR, this.#onOperationError, this);
    model.addEventListener(RNApolloModel.Events.CACHE_UPDATED, this.#onCacheUpdated, this);
    model.addEventListener(RNApolloModel.Events.CACHE_CLEARED, this.#onCacheCleared, this);
    model.addEventListener(RNApolloModel.Events.OPERATIONS_CLEARED, this.#onOperationsCleared, this);

    // Load existing operations and cache
    this.#operations = model.getOperations();
    this.#cache = model.getCache();
    
    // Request initial cache state
    void model.getCacheFromPlugin();
    
    this.#render();
  }

  modelRemoved(model: RNApolloModel.RNApolloModel): void {
    if (this.#model !== model) {
      return;
    }

    model.removeEventListener(RNApolloModel.Events.OPERATION_STARTED, this.#onOperationStarted, this);
    model.removeEventListener(RNApolloModel.Events.OPERATION_COMPLETED, this.#onOperationCompleted, this);
    model.removeEventListener(RNApolloModel.Events.OPERATION_ERROR, this.#onOperationError, this);
    model.removeEventListener(RNApolloModel.Events.CACHE_UPDATED, this.#onCacheUpdated, this);
    model.removeEventListener(RNApolloModel.Events.CACHE_CLEARED, this.#onCacheCleared, this);
    model.removeEventListener(RNApolloModel.Events.OPERATIONS_CLEARED, this.#onOperationsCleared, this);

    this.#model = null;
    this.#operations = [];
    this.#selectedOperation = null;
    this.#cache = null;
    this.#render();
  }

  override wasShown(): void {
    super.wasShown();
    this.#render();
  }

  #onOperationStarted = (): void => {
    if (this.#model) {
      this.#operations = this.#model.getOperations();
      this.#render();
    }
  };

  #onOperationCompleted = (): void => {
    if (this.#model) {
      this.#operations = this.#model.getOperations();
      this.#render();
    }
  };

  #onOperationError = (): void => {
    if (this.#model) {
      this.#operations = this.#model.getOperations();
      this.#render();
    }
  };

  #onCacheUpdated = (): void => {
    if (this.#model) {
      this.#cache = this.#model.getCache();
      this.#render();
    }
  };

  #onCacheCleared = (): void => {
    this.#cache = null;
    this.#render();
  };

  #onOperationsCleared = (): void => {
    this.#operations = [];
    this.#selectedOperation = null;
    this.#render();
  };

  #handleClear = (): void => {
    this.#model?.clearOperations();
  };

  #handleClearCache = (): void => {
    void this.#model?.clearCache();
  };

  #handleRefreshCache = (): void => {
    void this.#model?.getCacheFromPlugin();
  };

  #handleFilterChange = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    this.#filterText = input.value.toLowerCase();
    this.#render();
  };

  #handleFilterTypeChange = (event: Event): void => {
    const select = event.target as HTMLSelectElement;
    this.#filterType = select.value as FilterType;
    this.#render();
  };

  #handleRowClick = (operation: ApolloOperationEntry): void => {
    this.#selectedOperation = operation;
    // Auto-select appropriate tab
    if (operation.status === 'error') {
      this.#activeDetailTab = 'error';
    } else if (operation.status === 'completed') {
      this.#activeDetailTab = 'result';
    } else {
      this.#activeDetailTab = 'details';
    }
    this.#render();
  };

  #handleCloseDetail = (): void => {
    this.#selectedOperation = null;
    this.#render();
  };

  #handleTabClick = (tab: DetailTab): void => {
    this.#activeDetailTab = tab;
    this.#render();
  };

  #getFilteredOperations(): ApolloOperationEntry[] {
    let filtered = this.#operations;

    // Filter by type
    if (this.#filterType !== 'all') {
      filtered = filtered.filter(op => op.operation.type === this.#filterType);
    }

    // Filter by name
    if (this.#filterText) {
      filtered = filtered.filter(op =>
        op.operation.name.toLowerCase().includes(this.#filterText)
      );
    }

    return filtered;
  }

  #formatDuration(ms: number | undefined): string {
    if (ms === undefined) {
      return '-';
    }
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  }

  #isJson(str: string | any): boolean {
    if (typeof str !== 'string') {
      return false;
    }
    if (!str) {
      return false;
    }
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  #formatJson(data: any): string {
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return data;
      }
    }
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  #renderJson(data: any, fallback: string) {
    if (!data) {
      return html`<div class="rn-apollo-detail-body empty">${fallback}</div>`;
    }

    const formatted = this.#formatJson(data);
    return html`<div class="rn-apollo-detail-body rn-apollo-json-container"><pre class="rn-apollo-json">${formatted}</pre></div>`;
  }

  #renderToolbar() {
    const filteredCount = this.#getFilteredOperations().length;
    const totalCount = this.#operations.length;

    return html`
      <div class="rn-apollo-toolbar">
        <button @click=${this.#handleClear} title=${i18nString(UIStrings.clearLog)}>
          Clear
        </button>
        <button @click=${this.#handleClearCache} title=${i18nString(UIStrings.clearCache)}>
          Clear Cache
        </button>
        <button @click=${this.#handleRefreshCache} title=${i18nString(UIStrings.refreshCache)}>
          Refresh Cache
        </button>
        <select
          class="rn-apollo-filter-type"
          .value=${this.#filterType}
          @change=${this.#handleFilterTypeChange}
        >
          <option value="all">All</option>
          <option value="query">${i18nString(UIStrings.query)}</option>
          <option value="mutation">${i18nString(UIStrings.mutation)}</option>
          <option value="subscription">${i18nString(UIStrings.subscription)}</option>
        </select>
        <input
          type="text"
          class="rn-apollo-filter"
          placeholder=${i18nString(UIStrings.filterPlaceholder)}
          .value=${this.#filterText}
          @input=${this.#handleFilterChange}
        />
        <span class="rn-apollo-stats">
          ${filteredCount === totalCount
            ? `${totalCount} operations`
            : `${filteredCount} / ${totalCount} operations`}
        </span>
      </div>
    `;
  }

  #renderEmptyState() {
    return html`
      <div class="rn-apollo-empty">
        <svg class="rn-apollo-empty-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
        <div class="rn-apollo-empty-title">${i18nString(UIStrings.emptyTitle)}</div>
        <div class="rn-apollo-empty-description">${i18nString(UIStrings.emptyDescription)}</div>
      </div>
    `;
  }

  #getOperationTypeLabel(type: string): string {
    switch (type) {
      case 'query':
        return i18nString(UIStrings.query);
      case 'mutation':
        return i18nString(UIStrings.mutation);
      case 'subscription':
        return i18nString(UIStrings.subscription);
      default:
        return type;
    }
  }

  #renderRow(operation: ApolloOperationEntry) {
    const {operation: op, result, error, status} = operation;
    const isSelected = this.#selectedOperation === operation;

    let statusDisplay: string;
    let statusClass = '';
    if (status === 'pending') {
      statusDisplay = i18nString(UIStrings.pending);
      statusClass = 'pending';
    } else if (status === 'error') {
      statusDisplay = i18nString(UIStrings.error);
      statusClass = 'error';
    } else {
      statusDisplay = '✓';
      statusClass = 'success';
    }

    const duration = result?.duration ?? error?.duration;
    const cacheStatus = result?.fromCache ? i18nString(UIStrings.fromCache) : i18nString(UIStrings.network);

    return html`
      <div
        class="rn-apollo-row ${status} ${isSelected ? 'selected' : ''}"
        @click=${() => this.#handleRowClick(operation)}
      >
        <div class="rn-apollo-name" title=${op.name}>${op.name}</div>
        <div class="rn-apollo-type-badge rn-apollo-type-${op.type}">${this.#getOperationTypeLabel(op.type)}</div>
        <div class="rn-apollo-status ${statusClass}">${statusDisplay}</div>
        <div class="rn-apollo-cache">${result ? cacheStatus : '-'}</div>
        <div class="rn-apollo-duration">${this.#formatDuration(duration)}</div>
      </div>
    `;
  }

  #renderList() {
    const operations = this.#getFilteredOperations();

    if (operations.length === 0) {
      return this.#renderEmptyState();
    }

    return html`
      <div class="rn-apollo-list">
        <div class="rn-apollo-list-header">
          <div>Operation</div>
          <div>Type</div>
          <div>Status</div>
          <div>Cache</div>
          <div>Time</div>
        </div>
        <div class="rn-apollo-list-body">
          ${operations.map(op => this.#renderRow(op))}
        </div>
      </div>
    `;
  }

  #renderDetailContent() {
    const operation = this.#selectedOperation;
    if (!operation) return nothing;

    const {operation: op, result, error} = operation;

    switch (this.#activeDetailTab) {
      case 'details':
        return html`
          <div class="rn-apollo-detail-section">
            <div class="rn-apollo-detail-section-title">${i18nString(UIStrings.operationName)}</div>
            <div class="rn-apollo-detail-value">${op.name}</div>
          </div>
          <div class="rn-apollo-detail-section">
            <div class="rn-apollo-detail-section-title">${i18nString(UIStrings.operationType)}</div>
            <div class="rn-apollo-detail-value">${this.#getOperationTypeLabel(op.type)}</div>
          </div>
          <div class="rn-apollo-detail-section">
            <div class="rn-apollo-detail-section-title">${i18nString(UIStrings.duration)}</div>
            <div class="rn-apollo-detail-value">${this.#formatDuration(result?.duration ?? error?.duration)}</div>
          </div>
          ${result ? html`
            <div class="rn-apollo-detail-section">
              <div class="rn-apollo-detail-section-title">${i18nString(UIStrings.cacheStatus)}</div>
              <div class="rn-apollo-detail-value">${result.fromCache ? i18nString(UIStrings.fromCache) : i18nString(UIStrings.network)}</div>
            </div>
          ` : nothing}
        `;

      case 'variables':
        return html`
          <div class="rn-apollo-detail-section">
            <div class="rn-apollo-detail-section-title">Variables</div>
            ${this.#renderJson(op.variables, i18nString(UIStrings.noData))}
          </div>
        `;

      case 'result':
        if (!result) {
          return html`<div class="rn-apollo-detail-body empty">${i18nString(UIStrings.noData)}</div>`;
        }
        return html`
          <div class="rn-apollo-detail-section">
            <div class="rn-apollo-detail-section-title">Result</div>
            ${this.#renderJson(result.result, i18nString(UIStrings.noData))}
          </div>
        `;

      case 'error':
        if (!error) {
          return html`<div class="rn-apollo-detail-body empty">${i18nString(UIStrings.noData)}</div>`;
        }
        return html`
          <div class="rn-apollo-detail-section">
            <div class="rn-apollo-detail-section-title">Error</div>
            ${this.#renderJson(error.error, i18nString(UIStrings.noData))}
          </div>
        `;

      case 'cache':
        if (!this.#cache) {
          return html`<div class="rn-apollo-detail-body empty">${i18nString(UIStrings.noData)}</div>`;
        }
        return html`
          <div class="rn-apollo-detail-section">
            <div class="rn-apollo-detail-section-title">Cache</div>
            ${this.#renderJson(this.#cache.data, i18nString(UIStrings.noData))}
          </div>
        `;

      default:
        return nothing;
    }
  }

  #renderDetail() {
    const operation = this.#selectedOperation;
    const hasError = operation?.status === 'error';
    const hasResult = operation?.status === 'completed';

    return html`
      <div class="rn-apollo-detail">
        <div class="rn-apollo-detail-header">
          <div class="rn-apollo-detail-title" title=${operation?.operation.name || ''}>
            ${operation?.operation.name || ''}
          </div>
          <button class="rn-apollo-detail-close" @click=${this.#handleCloseDetail}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div class="rn-apollo-detail-tabs">
          <button
            class="rn-apollo-detail-tab ${this.#activeDetailTab === 'details' ? 'active' : ''}"
            @click=${() => this.#handleTabClick('details')}
          >
            ${i18nString(UIStrings.details)}
          </button>
          <button
            class="rn-apollo-detail-tab ${this.#activeDetailTab === 'variables' ? 'active' : ''}"
            @click=${() => this.#handleTabClick('variables')}
          >
            ${i18nString(UIStrings.variables)}
          </button>
          ${hasResult ? html`
            <button
              class="rn-apollo-detail-tab ${this.#activeDetailTab === 'result' ? 'active' : ''}"
              @click=${() => this.#handleTabClick('result')}
            >
              ${i18nString(UIStrings.result)}
            </button>
          ` : nothing}
          ${hasError ? html`
            <button
              class="rn-apollo-detail-tab ${this.#activeDetailTab === 'error' ? 'active' : ''}"
              @click=${() => this.#handleTabClick('error')}
            >
              ${i18nString(UIStrings.errorTab)}
            </button>
          ` : nothing}
          <button
            class="rn-apollo-detail-tab ${this.#activeDetailTab === 'cache' ? 'active' : ''}"
            @click=${() => this.#handleTabClick('cache')}
          >
            ${i18nString(UIStrings.cache)}
          </button>
        </div>
        <div class="rn-apollo-detail-content">
          ${this.#renderDetailContent()}
        </div>
      </div>
    `;
  }

  #render(): void {
    render(html`
      <div class="rn-apollo-panel">
        ${this.#renderToolbar()}
        <div class="rn-apollo-content">
          ${this.#renderList()}
          ${this.#renderDetail()}
        </div>
      </div>
    `, this.contentElement, {host: this});
  }
}

