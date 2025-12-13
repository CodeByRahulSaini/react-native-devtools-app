// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Store references to DevTools windows
const devToolsWindows = new Map();

/**
 * Get the path to DevTools frontend.
 * In development, use the build output from the parent directory.
 * In production (packaged app), use the extraResources location.
 */
function getDevToolsPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'devtools', 'rn_fusebox.html');
  }
  return path.join(__dirname, '..', '..', 'out', 'Default', 'gen', 'front_end', 'rn_fusebox.html');
}

/**
 * Create the target picker window.
 * This is the main window that shows available debug targets.
 */
function createTargetPicker() {
  const picker = new BrowserWindow({
    width: 480,
    height: 640,
    minWidth: 320,
    minHeight: 400,
    title: 'React Native DevTools',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  picker.loadFile(path.join(__dirname, 'src', 'target-picker.html'));

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    picker.webContents.openDevTools({ mode: 'detach' });
  }

  return picker;
}

/**
 * Create a DevTools window for a specific target.
 * @param {Object} target - The debug target object containing webSocketDebuggerUrl
 */
function createDevToolsWindow(target) {
  const windowId = `${target.port}-${target.id}`;

  // Don't open duplicate windows - focus existing one instead
  if (devToolsWindows.has(windowId)) {
    const existingWindow = devToolsWindows.get(windowId);
    if (!existingWindow.isDestroyed()) {
      existingWindow.focus();
      return;
    }
    devToolsWindows.delete(windowId);
  }

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: `DevTools - ${target.title || 'React Native'}`,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // Extract WebSocket URL and load DevTools
  const wsUrl = target.webSocketDebuggerUrl.replace(/^wss?:\/\//, '');
  const devToolsPath = getDevToolsPath();

  win.loadFile(devToolsPath, {
    query: { ws: wsUrl },
  });

  // Update window title when inspected URL changes
  win.webContents.on('page-title-updated', (event, title) => {
    win.setTitle(title);
  });

  // Track window
  devToolsWindows.set(windowId, win);
  win.on('closed', () => {
    devToolsWindows.delete(windowId);
  });

  return win;
}

/**
 * Discover debug targets from Metro bundler.
 * @param {number[]} ports - Array of port numbers to scan
 * @returns {Promise<Array>} Array of discovered debug targets
 */
async function discoverTargets(ports) {
  const allTargets = [];

  for (const port of ports) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`http://localhost:${port}/json`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const targets = await response.json();

      allTargets.push(
        ...targets.map(t => ({
          ...t,
          port,
          displayName: `${t.title || 'React Native'} (port ${port})`,
        }))
      );
    } catch {
      // Metro not running on this port, or timeout - skip silently
    }
  }

  return allTargets;
}

// IPC handlers for renderer process
ipcMain.handle('discover-targets', async (event, ports) => {
  return discoverTargets(ports);
});

ipcMain.on('open-devtools', (event, target) => {
  createDevToolsWindow(target);
});

ipcMain.on('open-all-devtools', (event, targets) => {
  targets.forEach(target => createDevToolsWindow(target));
});

// App lifecycle
app.whenReady().then(() => {
  createTargetPicker();

  app.on('activate', () => {
    // On macOS, re-create a window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createTargetPicker();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation from renderer
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});

