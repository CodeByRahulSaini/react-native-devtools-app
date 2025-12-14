// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as i18n from '../../../../front_end/core/i18n/i18n.js';
import * as SDK from '../../../../front_end/core/sdk/sdk.js';
import * as UI from '../../../../front_end/ui/legacy/legacy.js';
import {html, render, nothing} from '../../../../front_end/ui/lit/lit.js';

import type {ReduxActionEntry} from './RNReduxModel.js';
import * as RNReduxModel from './RNReduxModel.js';
import rnReduxStyles from './rnRedux.css.js';

const UIStrings = {
  /**
   * @description Title of the Redux panel
   */
  rnRedux: 'Redux',
  /**
   * @description Command for showing the Redux panel
   */
  showRnRedux: 'Show Redux panel',
  /**
   * @description Clear button tooltip
   */
  clearLog: 'Clear action log',
  /**
   * @description Refresh state button tooltip
   */
  refreshState: 'Refresh state',
  /**
   * @description Filter placeholder
   */
  filterPlaceholder: 'Filter by action type...',
  /**
   * @description Empty state title
   */
  emptyTitle: 'No Redux actions',
  /**
   * @description Empty state description
   */
  emptyDescription: 'Redux actions from your React Native app will appear here. Make sure the ReduxPlugin is initialized in your app.',
  /**
   * @description Action details tab
   */
  details: 'Details',
  /**
   * @description Payload tab
   */
  payload: 'Payload',
  /**
   * @description State before tab
   */
  stateBefore: 'State Before',
  /**
   * @description State after tab
   */
  stateAfter: 'State After',
  /**
   * @description State tab
   */
  state: 'State',
  /**
   * @description Action type label
   */
  actionType: 'Action Type',
  /**
   * @description Timestamp label
   */
  timestamp: 'Timestamp',
  /**
   * @description No data message
   */
  noData: 'No data',
  /**
   * @description Action type column header
   */
  actionTypeHeader: 'Action Type',
  /**
   * @description Time column header
   */
  timeHeader: 'Time',
  /**
   * @description Index column header
   */
  indexHeader: '#',
} as const;

const str_ = i18n.i18n.registerUIStrings('panels/rn_redux/RNReduxPanel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

type DetailTab = 'details' | 'payload' | 'stateBefore' | 'stateAfter' | 'state';

let rnReduxPanelInstance: RNReduxPanel;

export class RNReduxPanel extends UI.Widget.VBox implements
    SDK.TargetManager.SDKModelObserver<RNReduxModel.RNReduxModel> {
  #actions: ReduxActionEntry[] = [];
  #selectedAction: ReduxActionEntry | null = null;
  #filterText = '';
  #activeDetailTab: DetailTab = 'details';
  #model: RNReduxModel.RNReduxModel | null = null;
  #currentState: RNReduxModel.ReduxStateSnapshot | null = null;

  static instance(opts: {forceNew: boolean} = {forceNew: false}): RNReduxPanel {
    if (!rnReduxPanelInstance || opts.forceNew) {
      rnReduxPanelInstance = new RNReduxPanel();
    }
    return rnReduxPanelInstance;
  }

  private constructor() {
    super(true, true);
    this.registerRequiredCSS(rnReduxStyles);

    SDK.TargetManager.TargetManager.instance().observeModels(
        RNReduxModel.RNReduxModel, this);
  }

  modelAdded(model: RNReduxModel.RNReduxModel): void {
    if (this.#model) {
      return; // Only track one model
    }

    this.#model = model;
    model.ensureInitialized();

    model.addEventListener(RNReduxModel.Events.ACTION_DISPATCHED, this.#onActionDispatched, this);
    model.addEventListener(RNReduxModel.Events.STATE_CHANGED, this.#onStateChanged, this);
    model.addEventListener(RNReduxModel.Events.STATE_SNAPSHOT, this.#onStateSnapshot, this);
    model.addEventListener(RNReduxModel.Events.ACTIONS_CLEARED, this.#onActionsCleared, this);

    // Load existing actions and state
    this.#actions = model.getActions();
    this.#currentState = model.getCurrentState();
    
    // Request initial state
    void model.getStateFromPlugin();
    
    this.#render();
  }

  modelRemoved(model: RNReduxModel.RNReduxModel): void {
    if (this.#model !== model) {
      return;
    }

    model.removeEventListener(RNReduxModel.Events.ACTION_DISPATCHED, this.#onActionDispatched, this);
    model.removeEventListener(RNReduxModel.Events.STATE_CHANGED, this.#onStateChanged, this);
    model.removeEventListener(RNReduxModel.Events.STATE_SNAPSHOT, this.#onStateSnapshot, this);
    model.removeEventListener(RNReduxModel.Events.ACTIONS_CLEARED, this.#onActionsCleared, this);

    this.#model = null;
    this.#actions = [];
    this.#selectedAction = null;
    this.#currentState = null;
    this.#render();
  }

  override wasShown(): void {
    super.wasShown();
    this.#render();
  }

  #onActionDispatched = (): void => {
    if (this.#model) {
      this.#actions = this.#model.getActions();
      this.#render();
    }
  };

  #onStateChanged = (): void => {
    if (this.#model) {
      this.#currentState = this.#model.getCurrentState();
      this.#render();
    }
  };

  #onStateSnapshot = (): void => {
    if (this.#model) {
      this.#currentState = this.#model.getCurrentState();
      this.#render();
    }
  };

  #onActionsCleared = (): void => {
    this.#actions = [];
    this.#selectedAction = null;
    this.#render();
  };

  #handleClear = (): void => {
    this.#model?.clearActions();
  };

  #handleRefreshState = (): void => {
    void this.#model?.getStateFromPlugin();
  };

  #handleFilterChange = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    this.#filterText = input.value.toLowerCase();
    this.#render();
  };

  #handleRowClick = (actionEntry: ReduxActionEntry): void => {
    this.#selectedAction = actionEntry;
    this.#activeDetailTab = 'details';
    this.#render();
  };

  #handleCloseDetail = (): void => {
    this.#selectedAction = null;
    this.#render();
  };

  #handleTabClick = (tab: DetailTab): void => {
    this.#activeDetailTab = tab;
    this.#render();
  };

  #getFilteredActions(): ReduxActionEntry[] {
    let filtered = this.#actions;

    // Filter by action type
    if (this.#filterText) {
      filtered = filtered.filter(entry =>
        entry.action.type.toLowerCase().includes(this.#filterText)
      );
    }

    return filtered;
  }

  #formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString() + '.' + date.getMilliseconds().toString().padStart(3, '0');
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
      return html`<div class="rn-redux-detail-body empty">${fallback}</div>`;
    }

    const formatted = this.#formatJson(data);
    return html`<div class="rn-redux-detail-body rn-redux-json-container"><pre class="rn-redux-json">${formatted}</pre></div>`;
  }

  #renderToolbar() {
    const filteredCount = this.#getFilteredActions().length;
    const totalCount = this.#actions.length;

    return html`
      <div class="rn-redux-toolbar">
        <button @click=${this.#handleClear} title=${i18nString(UIStrings.clearLog)}>
          Clear
        </button>
        <button @click=${this.#handleRefreshState} title=${i18nString(UIStrings.refreshState)}>
          Refresh State
        </button>
        <input
          type="text"
          class="rn-redux-filter"
          placeholder=${i18nString(UIStrings.filterPlaceholder)}
          .value=${this.#filterText}
          @input=${this.#handleFilterChange}
        />
        <span class="rn-redux-stats">
          ${filteredCount === totalCount
            ? `${totalCount} actions`
            : `${filteredCount} / ${totalCount} actions`}
        </span>
      </div>
    `;
  }

  #renderEmptyState() {
    return html`
      <div class="rn-redux-empty">
        <svg class="rn-redux-empty-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
        <div class="rn-redux-empty-title">${i18nString(UIStrings.emptyTitle)}</div>
        <div class="rn-redux-empty-description">${i18nString(UIStrings.emptyDescription)}</div>
      </div>
    `;
  }

  #renderRow(actionEntry: ReduxActionEntry) {
    const {action, index} = actionEntry;
    const isSelected = this.#selectedAction === actionEntry;

    return html`
      <div
        class="rn-redux-row ${isSelected ? 'selected' : ''}"
        @click=${() => this.#handleRowClick(actionEntry)}
      >
        <div class="rn-redux-index">${index}</div>
        <div class="rn-redux-type" title=${action.type}>${action.type}</div>
        <div class="rn-redux-time">${this.#formatTimestamp(action.timestamp)}</div>
      </div>
    `;
  }

  #renderList() {
    const actions = this.#getFilteredActions();

    if (actions.length === 0) {
      return this.#renderEmptyState();
    }

    return html`
      <div class="rn-redux-list">
        <div class="rn-redux-list-header">
          <div>${i18nString(UIStrings.indexHeader)}</div>
          <div>${i18nString(UIStrings.actionTypeHeader)}</div>
          <div>${i18nString(UIStrings.timeHeader)}</div>
        </div>
        <div class="rn-redux-list-body">
          ${actions.map(actionEntry => this.#renderRow(actionEntry))}
        </div>
      </div>
    `;
  }

  #renderDetailContent() {
    const actionEntry = this.#selectedAction;
    if (!actionEntry) return nothing;

    const {action} = actionEntry;

    switch (this.#activeDetailTab) {
      case 'details':
        return html`
          <div class="rn-redux-detail-section">
            <div class="rn-redux-detail-section-title">${i18nString(UIStrings.actionType)}</div>
            <div class="rn-redux-detail-value">${action.type}</div>
          </div>
          <div class="rn-redux-detail-section">
            <div class="rn-redux-detail-section-title">${i18nString(UIStrings.timestamp)}</div>
            <div class="rn-redux-detail-value">${this.#formatTimestamp(action.timestamp)}</div>
          </div>
          <div class="rn-redux-detail-section">
            <div class="rn-redux-detail-section-title">Index</div>
            <div class="rn-redux-detail-value">${actionEntry.index}</div>
          </div>
        `;

      case 'payload':
        return html`
          <div class="rn-redux-detail-section">
            <div class="rn-redux-detail-section-title">Payload</div>
            ${this.#renderJson(action.payload, i18nString(UIStrings.noData))}
          </div>
        `;

      case 'stateBefore':
        return html`
          <div class="rn-redux-detail-section">
            <div class="rn-redux-detail-section-title">${i18nString(UIStrings.stateBefore)}</div>
            ${this.#renderJson(action.stateBefore, i18nString(UIStrings.noData))}
          </div>
        `;

      case 'stateAfter':
        return html`
          <div class="rn-redux-detail-section">
            <div class="rn-redux-detail-section-title">${i18nString(UIStrings.stateAfter)}</div>
            ${this.#renderJson(action.stateAfter, i18nString(UIStrings.noData))}
          </div>
        `;

      case 'state':
        if (!this.#currentState) {
          return html`<div class="rn-redux-detail-body empty">${i18nString(UIStrings.noData)}</div>`;
        }
        return html`
          <div class="rn-redux-detail-section">
            <div class="rn-redux-detail-section-title">${i18nString(UIStrings.state)}</div>
            ${this.#renderJson(this.#currentState.state, i18nString(UIStrings.noData))}
          </div>
        `;

      default:
        return nothing;
    }
  }

  #renderDetail() {
    const actionEntry = this.#selectedAction;

    return html`
      <div class="rn-redux-detail">
        <div class="rn-redux-detail-header">
          <div class="rn-redux-detail-title" title=${actionEntry?.action.type || ''}>
            ${actionEntry?.action.type || ''}
          </div>
          <button class="rn-redux-detail-close" @click=${this.#handleCloseDetail}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div class="rn-redux-detail-tabs">
          <button
            class="rn-redux-detail-tab ${this.#activeDetailTab === 'details' ? 'active' : ''}"
            @click=${() => this.#handleTabClick('details')}
          >
            ${i18nString(UIStrings.details)}
          </button>
          <button
            class="rn-redux-detail-tab ${this.#activeDetailTab === 'payload' ? 'active' : ''}"
            @click=${() => this.#handleTabClick('payload')}
          >
            ${i18nString(UIStrings.payload)}
          </button>
          <button
            class="rn-redux-detail-tab ${this.#activeDetailTab === 'stateBefore' ? 'active' : ''}"
            @click=${() => this.#handleTabClick('stateBefore')}
          >
            ${i18nString(UIStrings.stateBefore)}
          </button>
          <button
            class="rn-redux-detail-tab ${this.#activeDetailTab === 'stateAfter' ? 'active' : ''}"
            @click=${() => this.#handleTabClick('stateAfter')}
          >
            ${i18nString(UIStrings.stateAfter)}
          </button>
          <button
            class="rn-redux-detail-tab ${this.#activeDetailTab === 'state' ? 'active' : ''}"
            @click=${() => this.#handleTabClick('state')}
          >
            ${i18nString(UIStrings.state)}
          </button>
        </div>
        <div class="rn-redux-detail-content">
          ${this.#renderDetailContent()}
        </div>
      </div>
    `;
  }

  #render(): void {
    render(html`
      <div class="rn-redux-panel">
        ${this.#renderToolbar()}
        <div class="rn-redux-content">
          ${this.#renderList()}
          ${this.#renderDetail()}
        </div>
      </div>
    `, this.contentElement, {host: this});
  }
}

