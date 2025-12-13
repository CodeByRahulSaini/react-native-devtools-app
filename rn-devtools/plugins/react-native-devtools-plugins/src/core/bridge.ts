// Copyright 2025 Rahul Saini. All rights reserved.
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type { Bridge, JSONValue, PluginCommand } from './types';
import { getDispatcher } from './dispatcher';

type CommandHandler = (action: string, data: JSONValue | undefined) => void;

/**
 * BridgeImpl - Concrete implementation of the Bridge interface.
 *
 * Each plugin receives its own Bridge instance, scoped to its domain.
 * The bridge handles:
 * - Sending events to DevTools
 * - Receiving commands from DevTools
 * - Message serialization
 */
export class BridgeImpl implements Bridge {
  private readonly domain: string;
  private commandHandler: CommandHandler | null = null;

  constructor(domain: string) {
    this.domain = domain;
  }

  /**
   * Send an event to DevTools.
   */
  send(event: string, data: JSONValue): void {
    const dispatcher = getDispatcher();
    dispatcher.sendToDevTools(this.domain, event, data);
  }

  /**
   * Register a handler for commands from DevTools.
   */
  onMessage(handler: CommandHandler): void {
    this.commandHandler = handler;
  }

  /**
   * Remove the message handler.
   */
  offMessage(): void {
    this.commandHandler = null;
  }

  /**
   * Internal: Handle a command from the dispatcher.
   * Called by PluginRegistry when a command arrives for this domain.
   */
  handleCommand(command: PluginCommand): void {
    if (this.commandHandler) {
      this.commandHandler(command.action, command.data);
    }
  }
}

