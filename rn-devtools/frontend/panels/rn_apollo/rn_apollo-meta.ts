// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as i18n from '../../../../front_end/core/i18n/i18n.js';
import * as Root from '../../../../front_end/core/root/root.js';
import * as UI from '../../../../front_end/ui/legacy/legacy.js';

import type * as RNApollo from './rn_apollo.js';

const UIStrings = {
  /**
   * @description Title of the Apollo panel
   */
  rnApollo: 'Apollo',
  /**
   * @description Command for showing the Apollo panel
   */
  showRnApollo: 'Show Apollo panel',
} as const;

const str_ = i18n.i18n.registerUIStrings('panels/rn_apollo/rn_apollo-meta.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);

let loadedRNApolloModule: (typeof RNApollo | undefined);

async function loadRNApolloModule(): Promise<typeof RNApollo> {
  if (!loadedRNApolloModule) {
    loadedRNApolloModule = await import('./rn_apollo.js');
  }
  return loadedRNApolloModule;
}

// Register the panel
UI.ViewManager.registerViewExtension({
  location: UI.ViewManager.ViewLocationValues.PANEL,
  id: 'rn-apollo',
  title: i18nLazyString(UIStrings.rnApollo),
  commandPrompt: i18nLazyString(UIStrings.showRnApollo),
  order: 46,
  persistence: UI.ViewManager.ViewPersistence.PERMANENT,
  async loadView() {
    const RNApollo = await loadRNApolloModule();
    return RNApollo.RNApolloPanel.RNApolloPanel.instance();
  },
  experiment: Root.Runtime.ExperimentName.REACT_NATIVE_SPECIFIC_UI,
});

