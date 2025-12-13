// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export type {
  Plugin,
  Bridge,
  DevToolsConfig,
  JSONValue,
  PluginMessage,
  PluginCommand,
} from './types';

export { getDispatcher, destroyDispatcher, DISPATCHER_GLOBAL_NAME } from './dispatcher';
export { BridgeImpl } from './bridge';
export { getRegistry, resetRegistry } from './registry';

