// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure bridge between renderer process and main process.
 * Exposes only the necessary APIs for target discovery and DevTools launching.
 */
contextBridge.exposeInMainWorld('devtools', {
  /**
   * Discover available debug targets from Metro bundlers running on specified ports.
   * @param {number[]} ports - Array of port numbers to scan
   * @returns {Promise<Array>} Array of discovered debug targets
   */
  discoverTargets: ports => ipcRenderer.invoke('discover-targets', ports),

  /**
   * Open a DevTools window for a specific debug target.
   * @param {Object} target - The debug target object
   */
  openDevTools: target => ipcRenderer.send('open-devtools', target),

  /**
   * Open DevTools windows for all specified targets.
   * @param {Array} targets - Array of debug target objects
   */
  openAllDevTools: targets => ipcRenderer.send('open-all-devtools', targets),
});

