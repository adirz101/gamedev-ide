/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Unity Editor Bridge — Protocol Types
 *
 * Defines the message protocol, command categories, and service interface
 * for live communication between the IDE and a running Unity Editor instance.
 */

// --- Connection State ---

export const enum UnityBridgeConnectionState {
	Disconnected = 'disconnected',
	Connecting = 'connecting',
	Connected = 'connected',
	Reconnecting = 'reconnecting',
}

// --- Command Categories ---

export const enum BridgeCommandCategory {
	Scene = 'scene',
	GameObject = 'gameObject',
	Component = 'component',
	Prefab = 'prefab',
	Asset = 'asset',
	Project = 'project',
	Editor = 'editor',
}

// --- Message Protocol ---

/**
 * Request message sent from IDE to Unity Editor.
 */
export interface BridgeRequest {
	readonly id: string;
	readonly type: 'request';
	readonly category: BridgeCommandCategory;
	readonly action: string;
	readonly params: Record<string, unknown>;
}

/**
 * Response message sent from Unity Editor back to IDE.
 */
export interface BridgeResponse {
	readonly id: string;
	readonly type: 'response';
	readonly success: boolean;
	readonly result?: unknown;
	readonly error?: string;
}

/**
 * Unsolicited event pushed from Unity Editor to IDE
 * (e.g. console logs, play mode changes, selection changes).
 */
export interface BridgeEvent {
	readonly id: string;
	readonly type: 'event';
	readonly event: string;
	readonly data: unknown;
}

export type BridgeMessage = BridgeRequest | BridgeResponse | BridgeEvent;

// --- Port Discovery ---

/**
 * Contents of Library/GameDevIDE/bridge.json written by the Unity plugin.
 */
export interface BridgeDiscoveryInfo {
	readonly port: number;
	readonly pid: number;
	readonly version: string;
	readonly timestamp: number;
}

// --- Unity State Types ---

export interface UnityConsoleLog {
	readonly message: string;
	readonly stackTrace: string;
	readonly logType: 'Log' | 'Warning' | 'Error' | 'Exception' | 'Assert';
	readonly timestamp: number;
}

export const enum UnityPlayModeState {
	Stopped = 'stopped',
	Playing = 'playing',
	Paused = 'paused',
}

// --- Service Interface ---

export interface IUnityBridgeService {
	readonly _serviceBrand: undefined;

	// Connection state
	readonly connectionState: UnityBridgeConnectionState;
	readonly isConnected: boolean;
	readonly onDidChangeConnectionState: Event<UnityBridgeConnectionState>;

	// Unity events
	readonly onDidReceiveConsoleLog: Event<UnityConsoleLog>;
	readonly onDidChangePlayModeState: Event<UnityPlayModeState>;

	// Connection management
	connect(): Promise<void>;
	disconnect(): void;

	// Generic command
	sendCommand(
		category: BridgeCommandCategory,
		action: string,
		params?: Record<string, unknown>,
	): Promise<BridgeResponse>;

	// Convenience — Scene
	getSceneHierarchy(): Promise<BridgeResponse>;

	// Convenience — GameObject
	createGameObject(name: string, parentPath?: string): Promise<BridgeResponse>;
	createPrimitive(name: string, primitiveType: string, parentPath?: string): Promise<BridgeResponse>;
	setTransform(gameObjectPath: string, position?: number[], rotation?: number[], scale?: number[]): Promise<BridgeResponse>;

	// Convenience — Component
	addComponent(gameObjectPath: string, componentType: string): Promise<BridgeResponse>;
	setComponentProperty(gameObjectPath: string, componentType: string, propertyName: string, value: unknown): Promise<BridgeResponse>;

	// Convenience — Prefab
	createPrefab(gameObjectPath: string, assetPath: string): Promise<BridgeResponse>;
	instantiatePrefab(prefabPath: string): Promise<BridgeResponse>;

	// Convenience — Editor
	getPlayModeState(): Promise<UnityPlayModeState>;
	getSelectedObjects(): Promise<BridgeResponse>;
}

export const IUnityBridgeService = createDecorator<IUnityBridgeService>('unityBridgeService');

// --- Constants ---

/** Discovery file path relative to Unity project root */
export const BRIDGE_DISCOVERY_PATH = 'Library/GameDevIDE/bridge.json';

/** Protocol version for compatibility checking */
export const BRIDGE_PROTOCOL_VERSION = '1.0';

/** How long to wait for a command response before timing out */
export const BRIDGE_COMMAND_TIMEOUT_MS = 10_000;

/** Delay between reconnection attempts */
export const BRIDGE_RECONNECT_DELAY_MS = 3_000;

/** How often to poll for the discovery file */
export const BRIDGE_DISCOVERY_POLL_MS = 5_000;

/** Maximum reconnection attempts before giving up */
export const BRIDGE_MAX_RECONNECT_ATTEMPTS = 5;
