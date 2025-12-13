# React Native DevTools - Electron App

An Electron wrapper for React Native DevTools that provides a native desktop experience for debugging React Native applications.

## Features

- **Target Discovery**: Automatically scans configured ports to find running React Native apps
- **Multi-App Support**: Open separate DevTools windows for each app
- **Responsive UI**: Clean, dark-themed interface that adapts to window size
- **Native Experience**: Runs as a standalone desktop application
- **Plugin Architecture Ready**: Designed to support the extensible plugin system

## Prerequisites

1. Build the DevTools frontend first (from the repo root):
   ```bash
   npm run prebuild
   npm run build
   ```

2. Have one or more React Native apps running with Metro bundler

## Getting Started

### Install Dependencies

```bash
cd rn-devtools/electron-app
npm install
```

### Run in Development

```bash
npm start
```

### Build for Distribution

```bash
# Build for current platform
npm run build

# Build for specific platform
npm run build:mac
npm run build:win
npm run build:linux
```

Built applications will be in the `dist/` directory.

## Usage

1. Start your React Native app(s) with Metro bundler
2. Launch the Electron app
3. The Target Picker will scan for available debug targets
4. Click on a target to open its DevTools window
5. Use "Open All DevTools" to open windows for all discovered targets

### Configuring Ports

By default, the app scans ports `8081`, `8082`, and `8083`. You can modify this in the port input field and press Enter or click the refresh button to rescan.

## Project Structure

```
electron-app/
├── main.js           # Electron main process
├── preload.js        # Secure IPC bridge
├── package.json      # Dependencies and build config
├── README.md         # This file
└── src/
    ├── target-picker.html   # Target picker UI
    ├── target-picker.css    # Styles
    └── target-picker.js     # UI logic
```

## How It Works

1. The Target Picker queries `http://localhost:{port}/json` on each configured port
2. Metro bundler responds with a list of available debug targets
3. Each target includes a WebSocket URL for the debugging connection
4. When you select a target, a new window opens loading `rn_fusebox.html` with the WebSocket URL

## Architecture

This Electron app is part of the larger React Native DevTools platform:

```
┌─────────────────────────────────────────────────────────────────┐
│                    React Native App                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           NPM Package (Plugin Architecture)               │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │   │
│  │  │  Redux  │ │ Apollo  │ │ Network │ │ Custom  │         │   │
│  │  │ Plugin  │ │ Plugin  │ │ Plugin  │ │ Plugin  │         │   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘         │   │
│  │       └───────────┴──────────┬┴───────────┘              │   │
│  │                    CDP Bridge                             │   │
│  └─────────────────────────────┼────────────────────────────┘   │
└────────────────────────────────┼─────────────────────────────────┘
                                 │
                    WebSocket (CDP Connection)
                                 │
┌────────────────────────────────┼─────────────────────────────────┐
│                                ▼                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              DevTools Frontend (Panel System)             │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │   │
│  │  │  Redux  │ │ Apollo  │ │ Network │ │ Custom  │         │   │
│  │  │  Panel  │ │  Panel  │ │  Panel  │ │  Panel  │         │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│                    Electron Application (this)                   │
└──────────────────────────────────────────────────────────────────┘
```

## License

BSD-3-Clause - See the LICENSE file in the root directory.

