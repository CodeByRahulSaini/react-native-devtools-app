# React Native DevTools - Custom Code

This directory contains all custom code for the React Native DevTools platform. Following the code isolation strategy, all our additions are kept separate from the upstream Chrome DevTools code in `front_end/`.

## Directory Structure

```
rn-devtools/
├── electron-app/           # Electron shell application
│   ├── main.js             # Main process
│   ├── preload.js          # Secure IPC bridge
│   ├── package.json        # Dependencies + build config
│   └── src/                # Target picker UI
│
├── plugins/                # NPM package for React Native apps (coming soon)
│   └── react-native-devtools-plugins/
│       ├── src/
│       │   ├── core/       # CDP bridge, plugin registry
│       │   └── plugins/    # Redux, Apollo, Network plugins
│       └── package.json
│
├── frontend/               # Custom DevTools panels (coming soon)
│   ├── panels/
│   │   ├── rn_redux/       # Redux debugging panel
│   │   ├── rn_apollo/      # Apollo GraphQL panel
│   │   ├── rn_network/     # Network monitoring panel
│   │   └── rn_welcome/     # Welcome panel
│   ├── models/
│   │   └── plugins_bindings/
│   └── BUILD.gn
│
└── README.md               # This file
```

## Why Isolation?

This project is a fork of Chrome DevTools. By keeping all our custom code in this single directory:

1. **Easy Upstream Merges** - Only 3 files in `front_end/` are modified (import statements)
2. **Clear Ownership** - Everything in `rn-devtools/` is ours
3. **Safe Refactoring** - We can reorganize our code freely
4. **Simple Backup** - Copy this folder = all our custom code

## Getting Started

### Electron App

```bash
cd electron-app
npm install
npm start
```

See [electron-app/README.md](electron-app/README.md) for details.

### Building the DevTools Frontend

From the repository root:

```bash
npm run prebuild
npm run build
```

## Copyright

All files in this directory use the following header:

```
// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
```

