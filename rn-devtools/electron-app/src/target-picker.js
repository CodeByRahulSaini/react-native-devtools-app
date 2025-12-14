// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Target Picker UI Logic
 * Handles discovery and display of React Native debug targets
 */

// State
let discoveredTargets = [];
let isLoading = false;

// DOM Elements
const portsInput = document.getElementById('ports-input');
const refreshBtn = document.getElementById('refresh-btn');
const targetsContainer = document.getElementById('targets-container');
const openAllBtn = document.getElementById('open-all-btn');

/**
 * Parse comma-separated port numbers from input
 * @returns {number[]} Array of valid port numbers
 */
function getPorts() {
  const input = portsInput.value.trim();
  if (!input) {return [8081];}

  return input
    .split(',')
    .map(p => parseInt(p.trim(), 10))
    .filter(p => !isNaN(p) && p > 0 && p < 65536);
}

/**
 * Render loading state
 */
function renderLoading() {
  targetsContainer.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Scanning for debug targets...</p>
    </div>
  `;
  openAllBtn.disabled = true;
}

/**
 * Render empty state when no targets found
 */
function renderEmpty() {
  targetsContainer.innerHTML = `
    <div class="empty">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4M12 16h.01"/>
      </svg>
      <p class="empty-title">No debug targets found</p>
      <p class="empty-description">
        Make sure your React Native app is running with Metro bundler on one of the configured ports.
      </p>
    </div>
  `;
  openAllBtn.disabled = true;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (!str) {return '';}
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Render the list of discovered targets
 * @param {Array} targets - Array of debug targets
 */
function renderTargets(targets) {
  if (targets.length === 0) {
    renderEmpty();
    return;
  }

  const html = `
    <div class="target-list">
      ${targets
        .map(
          (target, index) => `
        <div class="target-card" data-index="${index}" role="button" tabindex="0">
          <div class="target-header">
            <span class="target-title">${escapeHtml(target.title || 'React Native App')}</span>
            <span class="target-port">:${target.port}</span>
          </div>
          <div class="target-description">${escapeHtml(target.description || 'No description available')}</div>
          ${
            target.url
              ? `
          <div class="target-meta">
            <span class="target-meta-item">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
              </svg>
              ${escapeHtml(new URL(target.url).hostname || target.url)}
            </span>
          </div>
          `
              : ''
          }
        </div>
      `
        )
        .join('')}
    </div>
  `;

  targetsContainer.innerHTML = html;
  openAllBtn.disabled = false;

  // Add click and keyboard handlers
  targetsContainer.querySelectorAll('.target-card').forEach(card => {
    const handleActivate = () => {
      const index = parseInt(card.dataset.index, 10);
      const target = targets[index];
      if (target) {
        window.devtools.openDevTools(target);
      }
    };

    card.addEventListener('click', handleActivate);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleActivate();
      }
    });
  });
}

/**
 * Filter out unwanted targets (e.g., Reanimated UI runtime)
 * @param {Array} targets - Array of debug targets
 * @returns {Array} Filtered array of targets
 */
function filterTargets(targets) {
  return targets.filter(target => {
    const title = (target.title || '').toLowerCase();
    const description = (target.description || '').toLowerCase();
    const type = (target.type || '').toLowerCase();
    
    // Filter out Reanimated UI runtime (check title, description, and type)
    if (title.includes('reanimated ui runtime') ||
        description.includes('reanimated ui runtime') ||
        description.includes('reanimated') && description.includes('c++')) {
      return false;
    }
    
    return true;
  });
}

/**
 * Discover debug targets from Metro bundlers
 */
async function discoverTargets() {
  if (isLoading) {return;}

  isLoading = true;
  refreshBtn.disabled = true;
  renderLoading();

  try {
    const ports = getPorts();
    const allTargets = await window.devtools.discoverTargets(ports);
    discoveredTargets = filterTargets(allTargets);
    renderTargets(discoveredTargets);
  } catch (error) {
    console.error('Failed to discover targets:', error);
    renderEmpty();
  } finally {
    isLoading = false;
    refreshBtn.disabled = false;
  }
}

/**
 * Open DevTools for all discovered targets
 */
function openAllDevTools() {
  if (discoveredTargets.length > 0) {
    window.devtools.openAllDevTools(discoveredTargets);
  }
}

// Event Listeners
refreshBtn.addEventListener('click', discoverTargets);

openAllBtn.addEventListener('click', openAllDevTools);

portsInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    discoverTargets();
  }
});

// Handle window focus - refresh targets when window gains focus
let lastFocusTime = 0;
window.addEventListener('focus', () => {
  const now = Date.now();
  // Only refresh if at least 5 seconds have passed since last focus
  if (now - lastFocusTime > 5000) {
    lastFocusTime = now;
    discoverTargets();
  }
});

// Initial discovery
discoverTargets();

