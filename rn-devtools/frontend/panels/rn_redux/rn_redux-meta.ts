// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as i18n from '../../../../front_end/core/i18n/i18n.js';
import * as Root from '../../../../front_end/core/root/root.js';
import * as UI from '../../../../front_end/ui/legacy/legacy.js';

import type * as RNRedux from './rn_redux.js';

const UIStrings = {
  /**
   * @description Title of the Redux panel
   */
  rnRedux: 'Redux',
  /**
   * @description Command for showing the Redux panel
   */
  showRnRedux: 'Show Redux panel',
} as const;

const str_ = i18n.i18n.registerUIStrings('panels/rn_redux/rn_redux-meta.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);

let loadedRNReduxModule: (typeof RNRedux | undefined);

async function loadRNReduxModule(): Promise<typeof RNRedux> {
  if (!loadedRNReduxModule) {
    loadedRNReduxModule = await import('./rn_redux.js');
  }
  return loadedRNReduxModule;
}

// Register the panel
UI.ViewManager.registerViewExtension({
  location: UI.ViewManager.ViewLocationValues.PANEL,
  id: 'rn-redux',
  title: i18nLazyString(UIStrings.rnRedux),
  commandPrompt: i18nLazyString(UIStrings.showRnRedux),
  order: 47,
  persistence: UI.ViewManager.ViewPersistence.PERMANENT,
  async loadView() {
    const RNRedux = await loadRNReduxModule();
    return RNRedux.RNReduxPanel.RNReduxPanel.instance();
  },
  experiment: Root.Runtime.ExperimentName.REACT_NATIVE_SPECIFIC_UI,
});

