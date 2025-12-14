// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as i18n from '../../../../front_end/core/i18n/i18n.js';
import * as SDK from '../../../../front_end/core/sdk/sdk.js';
import * as UI from '../../../../front_end/ui/legacy/legacy.js';
import {html, render, nothing} from '../../../../front_end/ui/lit/lit.js';

import type {NetworkEntry} from './RNNetworkModel.js';
import * as RNNetworkModel from './RNNetworkModel.js';
import rnNetworkStyles from './rnNetwork.css.js';

const UIStrings = {
  /**
   * @description Title of the Network panel
   */
  rnNetwork: 'Network',
  /**
   * @description Command for showing the Network panel
   */
  showRnNetwork: 'Show Network panel',
  /**
   * @description Clear button tooltip
   */
  clearLog: 'Clear network log',
  /**
   * @description Filter placeholder
   */
  filterPlaceholder: 'Filter by URL...',
  /**
   * @description Empty state title
   */
  emptyTitle: 'No network requests',
  /**
   * @description Empty state description
   */
  emptyDescription: 'Network requests from your React Native app will appear here. Make sure the NetworkPlugin is initialized in your app.',
  /**
   * @description Pending status
   */
  pending: 'Pending',
  /**
   * @description Error status
   */
  error: 'Error',
  /**
   * @description Request details tab
   */
  headers: 'Headers',
  /**
   * @description Request body tab
   */
  requestBody: 'Request',
  /**
   * @description Response body tab
   */
  responseBody: 'Response',
  /**
   * @description Request headers section
   */
  requestHeaders: 'Request Headers',
  /**
   * @description Response headers section
   */
  responseHeaders: 'Response Headers',
  /**
   * @description General section
   */
  general: 'General',
  /**
   * @description No body message
   */
  noBody: 'No body',
} as const;

const str_ = i18n.i18n.registerUIStrings('panels/rn_network/RNNetworkPanel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

type DetailTab = 'headers' | 'request' | 'response';

let rnNetworkPanelInstance: RNNetworkPanel;

export class RNNetworkPanel extends UI.Widget.VBox implements
    SDK.TargetManager.SDKModelObserver<RNNetworkModel.RNNetworkModel> {
  #entries: NetworkEntry[] = [];
  #selectedEntry: NetworkEntry | null = null;
  #filterText = '';
  #activeDetailTab: DetailTab = 'headers';
  #model: RNNetworkModel.RNNetworkModel | null = null;

  static instance(opts: {forceNew: boolean} = {forceNew: false}): RNNetworkPanel {
    if (!rnNetworkPanelInstance || opts.forceNew) {
      rnNetworkPanelInstance = new RNNetworkPanel();
    }
    return rnNetworkPanelInstance;
  }

  private constructor() {
    super(true, true);
    this.registerRequiredCSS(rnNetworkStyles);

    SDK.TargetManager.TargetManager.instance().observeModels(
        RNNetworkModel.RNNetworkModel, this);
  }

  modelAdded(model: RNNetworkModel.RNNetworkModel): void {
    if (this.#model) {
      return; // Only track one model
    }

    this.#model = model;
    model.ensureInitialized();

    model.addEventListener(RNNetworkModel.Events.REQUEST_STARTED, this.#onRequestStarted, this);
    model.addEventListener(RNNetworkModel.Events.REQUEST_COMPLETED, this.#onRequestCompleted, this);
    model.addEventListener(RNNetworkModel.Events.REQUEST_ERROR, this.#onRequestError, this);
    model.addEventListener(RNNetworkModel.Events.ENTRIES_CLEARED, this.#onEntriesCleared, this);

    // Load existing entries
    this.#entries = model.getEntries();
    this.#render();
  }

  modelRemoved(model: RNNetworkModel.RNNetworkModel): void {
    if (this.#model !== model) {
      return;
    }

    model.removeEventListener(RNNetworkModel.Events.REQUEST_STARTED, this.#onRequestStarted, this);
    model.removeEventListener(RNNetworkModel.Events.REQUEST_COMPLETED, this.#onRequestCompleted, this);
    model.removeEventListener(RNNetworkModel.Events.REQUEST_ERROR, this.#onRequestError, this);
    model.removeEventListener(RNNetworkModel.Events.ENTRIES_CLEARED, this.#onEntriesCleared, this);

    this.#model = null;
    this.#entries = [];
    this.#selectedEntry = null;
    this.#render();
  }

  override wasShown(): void {
    super.wasShown();
    this.#render();
  }

  #onRequestStarted = (): void => {
    if (this.#model) {
      this.#entries = this.#model.getEntries();
      this.#render();
    }
  };

  #onRequestCompleted = (): void => {
    if (this.#model) {
      this.#entries = this.#model.getEntries();
      this.#render();
    }
  };

  #onRequestError = (): void => {
    if (this.#model) {
      this.#entries = this.#model.getEntries();
      this.#render();
    }
  };

  #onEntriesCleared = (): void => {
    this.#entries = [];
    this.#selectedEntry = null;
    this.#render();
  };

  #handleClear = (): void => {
    this.#model?.clearEntries();
  };

  #handleFilterChange = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    this.#filterText = input.value.toLowerCase();
    this.#render();
  };

  #handleRowClick = (entry: NetworkEntry): void => {
    this.#selectedEntry = entry;
    this.#render();
  };

  #handleCloseDetail = (): void => {
    this.#selectedEntry = null;
    this.#render();
  };

  #handleTabClick = (tab: DetailTab): void => {
    this.#activeDetailTab = tab;
    this.#render();
  };

  #getFilteredEntries(): NetworkEntry[] {
    if (!this.#filterText) {
      return this.#entries;
    }
    return this.#entries.filter(entry =>
      entry.request.url.toLowerCase().includes(this.#filterText)
    );
  }

  #getStatusClass(status: number): string {
    if (status >= 200 && status < 300) return 'success';
    if (status >= 300 && status < 400) return 'redirect';
    if (status >= 400 && status < 500) return 'client-error';
    if (status >= 500) return 'server-error';
    return '';
  }

  #formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  }

  #formatUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.pathname + parsed.search;
    } catch {
      return url;
    }
  }

  #isJson(str: string): boolean {
    if (!str) {
      return false;
    }
    // Skip placeholder strings like [Blob: X bytes], [FormData], [ArrayBuffer], etc.
    if (str.startsWith('[') && str.endsWith(']') && !str.includes('{') && !str.includes(',')) {
      return false;
    }
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  #formatBody(body: string): string {
    // Try to format as JSON, otherwise return as-is
    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return body;
    }
  }

  #renderBody(body: string | undefined, fallback: string) {
    if (!body) {
      return html`<div class="rn-network-detail-body empty">${fallback}</div>`;
    }

    if (this.#isJson(body)) {
      const formatted = this.#formatBody(body);
      return html`<div class="rn-network-detail-body rn-network-json-container"><pre class="rn-network-json">${formatted}</pre></div>`;
    }

    return html`<div class="rn-network-detail-body">${body}</div>`;
  }

  #renderToolbar() {
    const filteredCount = this.#getFilteredEntries().length;
    const totalCount = this.#entries.length;

    return html`
      <div class="rn-network-toolbar">
        <button @click=${this.#handleClear} title=${i18nString(UIStrings.clearLog)}>
          Clear
        </button>
        <input
          type="text"
          class="rn-network-filter"
          placeholder=${i18nString(UIStrings.filterPlaceholder)}
          .value=${this.#filterText}
          @input=${this.#handleFilterChange}
        />
        <span class="rn-network-stats">
          ${filteredCount === totalCount
            ? `${totalCount} requests`
            : `${filteredCount} / ${totalCount} requests`}
        </span>
      </div>
    `;
  }

  #renderEmptyState() {
    return html`
      <div class="rn-network-empty">
        <svg class="rn-network-empty-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
        <div class="rn-network-empty-title">${i18nString(UIStrings.emptyTitle)}</div>
        <div class="rn-network-empty-description">${i18nString(UIStrings.emptyDescription)}</div>
      </div>
    `;
  }

  #renderRow(entry: NetworkEntry) {
    const {request, response, status} = entry;
    const isSelected = this.#selectedEntry === entry;

    let statusDisplay: string;
    let statusClass = '';
    if (status === 'pending') {
      statusDisplay = i18nString(UIStrings.pending);
    } else if (status === 'error') {
      statusDisplay = i18nString(UIStrings.error);
      statusClass = 'server-error';
    } else if (response) {
      statusDisplay = `${response.status}`;
      statusClass = this.#getStatusClass(response.status);
    } else {
      statusDisplay = '-';
    }

    const duration = response?.duration ?? entry.error?.duration;

    return html`
      <div
        class="rn-network-row ${status} ${isSelected ? 'selected' : ''}"
        @click=${() => this.#handleRowClick(entry)}
      >
        <div class="rn-network-url" title=${request.url}>${this.#formatUrl(request.url)}</div>
        <div class="rn-network-method">${request.method}</div>
        <div class="rn-network-status ${statusClass}">${statusDisplay}</div>
        <div class="rn-network-type">fetch</div>
        <div class="rn-network-duration">${duration != null ? this.#formatDuration(duration) : '-'}</div>
      </div>
    `;
  }

  #renderList() {
    const entries = this.#getFilteredEntries();

    if (entries.length === 0) {
      return this.#renderEmptyState();
    }

    return html`
      <div class="rn-network-list">
        <div class="rn-network-list-header">
          <div>URL</div>
          <div>Method</div>
          <div>Status</div>
          <div>Type</div>
          <div>Time</div>
        </div>
        <div class="rn-network-list-body">
          ${entries.map(entry => this.#renderRow(entry))}
        </div>
      </div>
    `;
  }

  #renderHeaders(headers: Record<string, string>) {
    const entries = Object.entries(headers);
    if (entries.length === 0) {
      return html`<div class="rn-network-detail-body empty">No headers</div>`;
    }

    return html`
      <div class="rn-network-detail-headers">
        ${entries.map(([name, value]) => html`
          <div class="rn-network-detail-header-item">
            <span class="rn-network-detail-header-name">${name}</span>
            <span class="rn-network-detail-header-value">${value}</span>
          </div>
        `)}
      </div>
    `;
  }

  #renderDetailContent() {
    const entry = this.#selectedEntry;
    if (!entry) return nothing;

    const {request, response} = entry;

    switch (this.#activeDetailTab) {
      case 'headers':
        return html`
          <div class="rn-network-detail-section">
            <div class="rn-network-detail-section-title">${i18nString(UIStrings.general)}</div>
            <div class="rn-network-detail-row">
              <span class="rn-network-detail-key">Request URL</span>
              <span class="rn-network-detail-value">${request.url}</span>
            </div>
            <div class="rn-network-detail-row">
              <span class="rn-network-detail-key">Request Method</span>
              <span class="rn-network-detail-value">${request.method}</span>
            </div>
            ${response ? html`
              <div class="rn-network-detail-row">
                <span class="rn-network-detail-key">Status Code</span>
                <span class="rn-network-detail-value">${response.status} ${response.statusText}</span>
              </div>
            ` : nothing}
          </div>
          ${response ? html`
            <div class="rn-network-detail-section">
              <div class="rn-network-detail-section-title">${i18nString(UIStrings.responseHeaders)}</div>
              ${this.#renderHeaders(response.headers)}
            </div>
          ` : nothing}
          <div class="rn-network-detail-section">
            <div class="rn-network-detail-section-title">${i18nString(UIStrings.requestHeaders)}</div>
            ${this.#renderHeaders(request.headers)}
          </div>
        `;

      case 'request':
        return html`
          <div class="rn-network-detail-section">
            <div class="rn-network-detail-section-title">Request Body</div>
            ${this.#renderBody(request.body, i18nString(UIStrings.noBody))}
          </div>
        `;

      case 'response':
        return html`
          <div class="rn-network-detail-section">
            <div class="rn-network-detail-section-title">Response Body</div>
            ${this.#renderBody(response?.body || entry.error?.error, i18nString(UIStrings.noBody))}
          </div>
        `;

      default:
        return nothing;
    }
  }

  #renderDetail() {
    const entry = this.#selectedEntry;
    if (!entry) return nothing;

    return html`
      <div class="rn-network-detail">
        <div class="rn-network-detail-header">
          <div class="rn-network-detail-title" title=${entry.request.url}>
            ${this.#formatUrl(entry.request.url)}
          </div>
          <button class="rn-network-detail-close" @click=${this.#handleCloseDetail}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div class="rn-network-detail-tabs">
          <button
            class="rn-network-detail-tab ${this.#activeDetailTab === 'headers' ? 'active' : ''}"
            @click=${() => this.#handleTabClick('headers')}
          >
            ${i18nString(UIStrings.headers)}
          </button>
          <button
            class="rn-network-detail-tab ${this.#activeDetailTab === 'request' ? 'active' : ''}"
            @click=${() => this.#handleTabClick('request')}
          >
            ${i18nString(UIStrings.requestBody)}
          </button>
          <button
            class="rn-network-detail-tab ${this.#activeDetailTab === 'response' ? 'active' : ''}"
            @click=${() => this.#handleTabClick('response')}
          >
            ${i18nString(UIStrings.responseBody)}
          </button>
        </div>
        <div class="rn-network-detail-content">
          ${this.#renderDetailContent()}
        </div>
      </div>
    `;
  }

  #render(): void {
    render(html`
      <div class="rn-network-panel">
        ${this.#renderToolbar()}
        <div class="rn-network-content">
          ${this.#renderList()}
          ${this.#renderDetail()}
        </div>
      </div>
    `, this.contentElement, {host: this});
  }
}

