// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Common from '../../../../front_end/core/common/common.js';
import * as i18n from '../../../../front_end/core/i18n/i18n.js';
import * as Root from '../../../../front_end/core/root/root.js';
import * as SDK from '../../../../front_end/core/sdk/sdk.js';
import type * as Protocol from '../../../../front_end/generated/protocol.js';
import * as UI from '../../../../front_end/ui/legacy/legacy.js';

import type * as RNNetwork from './rn_network.js';

const UIStrings = {
  /**
   * @description Title of the Network panel
   */
  rnNetwork: 'Network',
  /**
   * @description Command for showing the Network panel
   */
  showRnNetwork: 'Show Network panel',
} as const;

const str_ = i18n.i18n.registerUIStrings('panels/rn_network/rn_network-meta.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);

let loadedRNNetworkModule: (typeof RNNetwork | undefined);

async function loadRNNetworkModule(): Promise<typeof RNNetwork> {
  if (!loadedRNNetworkModule) {
    loadedRNNetworkModule = await import('./rn_network.js');
  }
  return loadedRNNetworkModule;
}

/**
 * Check if React Native version is less than 0.83.
 * Returns true if version is < 0.83, false otherwise.
 */
function isRNVersionLessThan083(version: string | undefined | null): boolean {
  if (!version) {
    // If version is unknown, show the panel (safer to show than hide)
    return true;
  }

  const parts = version.split('.');
  const major = parseInt(parts[0] || '0', 10);
  const minor = parseInt(parts[1] || '0', 10);

  // Check if version < 0.83
  return major < 0 || (major === 0 && minor < 83);
}

/**
 * Observer that conditionally shows/hides the RN Network panel based on React Native version.
 * Only shows the panel for RN < 0.83 (when native network inspection isn't available).
 */
class RNNetworkPanelVisibilityObserver implements
    SDK.TargetManager.SDKModelObserver<SDK.ReactNativeApplicationModel.ReactNativeApplicationModel> {
  #panelHidden = false;

  constructor() {
    SDK.TargetManager.TargetManager.instance().observeModels(
        SDK.ReactNativeApplicationModel.ReactNativeApplicationModel, this);
  }

  modelAdded(model: SDK.ReactNativeApplicationModel.ReactNativeApplicationModel): void {
    model.ensureEnabled();
    model.addEventListener(
        SDK.ReactNativeApplicationModel.Events.METADATA_UPDATED, this.#handleMetadataUpdated, this);

    // Check initial version
    if (model.metadataCached) {
      this.#updatePanelVisibility(model.metadataCached.reactNativeVersion);
    }
  }

  modelRemoved(model: SDK.ReactNativeApplicationModel.ReactNativeApplicationModel): void {
    model.removeEventListener(
        SDK.ReactNativeApplicationModel.Events.METADATA_UPDATED, this.#handleMetadataUpdated, this);
  }

  #handleMetadataUpdated(
      event: Common.EventTarget.EventTargetEvent<Protocol.ReactNativeApplication.MetadataUpdatedEvent>): void {
    this.#updatePanelVisibility(event.data.reactNativeVersion);
  }

  #updatePanelVisibility(version: string | undefined | null): void {
    const shouldShow = isRNVersionLessThan083(version);
    const viewManager = UI.ViewManager.ViewManager.instance();

    void viewManager.resolveLocation(UI.ViewManager.ViewLocationValues.PANEL).then(location => {
      const view = viewManager.view('rn-network');
      if (!view || !location) {
        return;
      }

      if (shouldShow && this.#panelHidden) {
        // Show the panel by moving it back to the panel location
        viewManager.moveView('rn-network', UI.ViewManager.ViewLocationValues.PANEL, {
          shouldSelectTab: false,
          overrideSaving: true,
        });
        this.#panelHidden = false;
      } else if (!shouldShow && !this.#panelHidden) {
        // Hide the panel
        location.removeView(view);
        this.#panelHidden = true;
      }
    });
  }
}

// Register the panel (will be conditionally shown/hidden)
UI.ViewManager.registerViewExtension({
  location: UI.ViewManager.ViewLocationValues.PANEL,
  id: 'rn-network',
  title: i18nLazyString(UIStrings.rnNetwork),
  commandPrompt: i18nLazyString(UIStrings.showRnNetwork),
  order: 45,
  persistence: UI.ViewManager.ViewPersistence.PERMANENT,
  async loadView() {
    const RNNetwork = await loadRNNetworkModule();
    return RNNetwork.RNNetworkPanel.RNNetworkPanel.instance();
  },
  experiment: Root.Runtime.ExperimentName.REACT_NATIVE_SPECIFIC_UI,
});

// Start observing React Native version to conditionally show/hide the panel
new RNNetworkPanelVisibilityObserver();

