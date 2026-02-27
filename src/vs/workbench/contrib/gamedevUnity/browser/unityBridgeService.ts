/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IUnityProjectService } from '../common/types.js';
import {
	BridgeCommandCategory,
	BridgeDiscoveryInfo,
	BridgeEvent,
	BridgeMessage,
	BridgeRequest,
	BridgeResponse,
	BRIDGE_COMMAND_TIMEOUT_MS,
	BRIDGE_DISCOVERY_PATH,
	BRIDGE_DISCOVERY_POLL_MS,
	BRIDGE_MAX_RECONNECT_ATTEMPTS,
	BRIDGE_PROTOCOL_VERSION,
	BRIDGE_RECONNECT_DELAY_MS,
	IUnityBridgeService,
	UnityBridgeConnectionState,
	UnityConsoleLog,
	UnityPlayModeState,
} from '../common/bridgeTypes.js';
import {
	getBridgePluginSource,
	BRIDGE_PLUGIN_VERSION,
	BRIDGE_PLUGIN_INSTALL_PATH,
} from '../common/bridgePluginSource.js';

export class UnityBridgeService extends Disposable implements IUnityBridgeService {
	declare readonly _serviceBrand: undefined;

	private _connectionState = UnityBridgeConnectionState.Disconnected;
	private _webSocket: WebSocket | undefined;
	private _discoveryPollHandle: ReturnType<typeof setInterval> | undefined;
	private _reconnectAttempts = 0;
	private _discoveredPort: number | undefined;
	private readonly _pendingRequests = new Map<string, { deferred: DeferredPromise<BridgeResponse>; timeout: ReturnType<typeof setTimeout> }>();

	private readonly _onDidChangeConnectionState = this._register(new Emitter<UnityBridgeConnectionState>());
	readonly onDidChangeConnectionState = this._onDidChangeConnectionState.event;

	private readonly _onDidReceiveConsoleLog = this._register(new Emitter<UnityConsoleLog>());
	readonly onDidReceiveConsoleLog = this._onDidReceiveConsoleLog.event;

	private readonly _onDidChangePlayModeState = this._register(new Emitter<UnityPlayModeState>());
	readonly onDidChangePlayModeState = this._onDidChangePlayModeState.event;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IUnityProjectService private readonly unityProjectService: IUnityProjectService,
	) {
		super();

		console.log('[UnityBridgeService] Service created');

		// Auto-deploy plugin and start discovery when a Unity project is detected
		this._register(this.unityProjectService.onDidDetectProject(() => {
			console.log('[UnityBridgeService] Project detected via event');
			this.startDiscovery();
			this._ensurePluginInstalledSafe();
		}));

		// If project already detected at construction time
		if (this.unityProjectService.currentProject?.isUnityProject) {
			console.log('[UnityBridgeService] Project already detected at construction');
			this.startDiscovery();
			this._ensurePluginInstalledSafe();
		}
	}

	private _ensurePluginInstalledSafe(): void {
		// Fire and forget — never block discovery/connection
		this._ensurePluginInstalled().then(
			() => console.log('[UnityBridgeService] Plugin install check complete'),
			(err) => console.warn('[UnityBridgeService] Plugin install failed:', err instanceof Error ? err.message : String(err)),
		);
	}

	get connectionState(): UnityBridgeConnectionState {
		return this._connectionState;
	}

	get isConnected(): boolean {
		return this._connectionState === UnityBridgeConnectionState.Connected;
	}

	// --- Plugin Auto-Deploy ---

	private async _ensurePluginInstalled(): Promise<void> {
		console.log('[UnityBridgeService] Checking plugin installation...');
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			console.log('[UnityBridgeService] No workspace folders, skipping plugin install');
			return;
		}

		const projectRoot = folders[0].uri;
		const pluginUri = URI.joinPath(projectRoot, BRIDGE_PLUGIN_INSTALL_PATH);

		try {
			// Check if plugin already exists
			const existing = await this.fileService.readFile(pluginUri);
			const existingContent = existing.value.toString();

			// Check version — only update if our version is newer
			const versionMatch = existingContent.match(/Plugin version:\s*([^\s*]+)/);
			if (versionMatch && versionMatch[1] === BRIDGE_PLUGIN_VERSION) {
				// Already up to date
				return;
			}

			// Version mismatch or missing — update the plugin
			console.log(`[UnityBridgeService] Updating bridge plugin from ${versionMatch?.[1] ?? 'unknown'} to ${BRIDGE_PLUGIN_VERSION}`);
			await this.fileService.writeFile(pluginUri, VSBuffer.fromString(getBridgePluginSource()));
		} catch {
			// File doesn't exist — install it
			try {
				// Ensure Assets/Editor/ directory exists by creating the file
				console.log(`[UnityBridgeService] Installing bridge plugin v${BRIDGE_PLUGIN_VERSION} to ${BRIDGE_PLUGIN_INSTALL_PATH}`);
				await this.fileService.createFile(pluginUri, VSBuffer.fromString(getBridgePluginSource()));
			} catch (createError) {
				console.error('[UnityBridgeService] Failed to install bridge plugin:', createError instanceof Error ? createError.message : String(createError));
			}
		}
	}

	// --- Discovery ---

	private startDiscovery(): void {
		if (this._discoveryPollHandle) {
			console.log('[UnityBridgeService] Already polling, skipping startDiscovery');
			return;
		}

		console.log('[UnityBridgeService] Starting discovery polling');
		// Poll immediately, then on interval
		this.pollForDiscoveryFile();
		this._discoveryPollHandle = setInterval(() => {
			if (this._connectionState === UnityBridgeConnectionState.Disconnected) {
				this.pollForDiscoveryFile();
			}
		}, BRIDGE_DISCOVERY_POLL_MS);
	}

	private stopDiscovery(): void {
		if (this._discoveryPollHandle) {
			clearInterval(this._discoveryPollHandle);
			this._discoveryPollHandle = undefined;
		}
	}

	private async pollForDiscoveryFile(): Promise<void> {
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return;
		}

		const projectRoot = folders[0].uri;
		const discoveryUri = URI.joinPath(projectRoot, BRIDGE_DISCOVERY_PATH);

		try {
			const content = await this.fileService.readFile(discoveryUri);
			const text = content.value.toString();
			console.log('[UnityBridgeService] Discovery file found:', text);
			const info: BridgeDiscoveryInfo = JSON.parse(text);

			// Validate
			if (!info.port || !info.version) {
				console.warn('[UnityBridgeService] Discovery file missing port or version');
				return;
			}

			// Check version compatibility
			if (info.version !== BRIDGE_PROTOCOL_VERSION) {
				console.warn(`[UnityBridgeService] Protocol version mismatch: expected ${BRIDGE_PROTOCOL_VERSION}, got ${info.version}`);
			}

			const age = Date.now() / 1000 - info.timestamp;
			console.log(`[UnityBridgeService] Discovery file age: ${Math.round(age)}s, port: ${info.port}`);

			this._discoveredPort = info.port;
			await this.connect();
		} catch (error) {
			// File not found or invalid — expected when Unity isn't running
			console.log('[UnityBridgeService] Discovery file not found or invalid:', error instanceof Error ? error.message : String(error));
		}
	}

	// --- Connection ---

	async connect(): Promise<void> {
		if (!this._discoveredPort) {
			return;
		}

		if (this._connectionState === UnityBridgeConnectionState.Connected ||
			this._connectionState === UnityBridgeConnectionState.Connecting) {
			return;
		}

		this.setConnectionState(UnityBridgeConnectionState.Connecting);

		try {
			const ws = new WebSocket(`ws://127.0.0.1:${this._discoveredPort}`);

			await new Promise<void>((resolve, reject) => {
				const onOpen = () => {
					ws.removeEventListener('open', onOpen);
					ws.removeEventListener('error', onError);
					resolve();
				};
				const onError = (e: Event) => {
					ws.removeEventListener('open', onOpen);
					ws.removeEventListener('error', onError);
					reject(new Error(`WebSocket connection failed: ${e}`));
				};
				ws.addEventListener('open', onOpen);
				ws.addEventListener('error', onError);
			});

			this._webSocket = ws;
			this._reconnectAttempts = 0;
			this.setConnectionState(UnityBridgeConnectionState.Connected);

			console.log('[UnityBridgeService] Connected to Unity Editor');

			// Set up message handling
			ws.addEventListener('message', (event) => {
				this.onMessage(event.data as string);
			});

			ws.addEventListener('close', () => {
				console.log('[UnityBridgeService] WebSocket closed');
				this._webSocket = undefined;
				this.rejectAllPending('Connection closed');
				this.attemptReconnect();
			});

			ws.addEventListener('error', () => {
				// Error is followed by close event, which handles reconnection
			});

		} catch (error) {
			console.warn('[UnityBridgeService] Connection failed:', error instanceof Error ? error.message : String(error));
			this.setConnectionState(UnityBridgeConnectionState.Disconnected);
		}
	}

	disconnect(): void {
		this.stopDiscovery();
		this.rejectAllPending('Disconnected by user');

		if (this._webSocket) {
			try {
				this._webSocket.close(1000, 'IDE disconnecting');
			} catch { /* ignore */ }
			this._webSocket = undefined;
		}

		this._reconnectAttempts = 0;
		this.setConnectionState(UnityBridgeConnectionState.Disconnected);
	}

	private attemptReconnect(): void {
		if (this._reconnectAttempts >= BRIDGE_MAX_RECONNECT_ATTEMPTS) {
			console.log('[UnityBridgeService] Max reconnect attempts reached');
			this.setConnectionState(UnityBridgeConnectionState.Disconnected);
			// Resume discovery polling so we can reconnect if Unity restarts
			this.startDiscovery();
			return;
		}

		this._reconnectAttempts++;
		this.setConnectionState(UnityBridgeConnectionState.Reconnecting);
		console.log(`[UnityBridgeService] Reconnecting (attempt ${this._reconnectAttempts}/${BRIDGE_MAX_RECONNECT_ATTEMPTS})...`);

		setTimeout(async () => {
			// Re-read discovery file in case port changed (domain reload)
			await this.pollForDiscoveryFile();

			if (this._connectionState !== UnityBridgeConnectionState.Connected) {
				// pollForDiscoveryFile calls connect() if it finds a valid file,
				// but if it didn't connect, try again
				this.attemptReconnect();
			}
		}, BRIDGE_RECONNECT_DELAY_MS);
	}

	private setConnectionState(state: UnityBridgeConnectionState): void {
		if (this._connectionState !== state) {
			this._connectionState = state;
			this._onDidChangeConnectionState.fire(state);
		}
	}

	// --- Message Handling ---

	private onMessage(raw: string): void {
		try {
			const message: BridgeMessage = JSON.parse(raw);

			switch (message.type) {
				case 'response':
					this.handleResponse(message as BridgeResponse);
					break;
				case 'event':
					this.handleEvent(message as BridgeEvent);
					break;
			}
		} catch (error) {
			console.warn('[UnityBridgeService] Failed to parse message:', error);
		}
	}

	private handleResponse(response: BridgeResponse): void {
		const pending = this._pendingRequests.get(response.id);
		if (pending) {
			clearTimeout(pending.timeout);
			this._pendingRequests.delete(response.id);
			pending.deferred.complete(response);
		}
	}

	private handleEvent(event: BridgeEvent): void {
		switch (event.event) {
			case 'console.log': {
				const data = event.data as { message: string; stackTrace: string; logType: string; timestamp: number };
				this._onDidReceiveConsoleLog.fire({
					message: data.message,
					stackTrace: data.stackTrace,
					logType: data.logType as UnityConsoleLog['logType'],
					timestamp: data.timestamp,
				});
				break;
			}
			case 'playModeChanged': {
				const data = event.data as { state: string };
				const state = data.state === 'playing' ? UnityPlayModeState.Playing
					: data.state === 'paused' ? UnityPlayModeState.Paused
						: UnityPlayModeState.Stopped;
				this._onDidChangePlayModeState.fire(state);
				break;
			}
		}
	}

	private rejectAllPending(reason: string): void {
		for (const [id, pending] of this._pendingRequests) {
			clearTimeout(pending.timeout);
			pending.deferred.error(new Error(reason));
			this._pendingRequests.delete(id);
		}
	}

	// --- Command Sending ---

	async sendCommand(
		category: BridgeCommandCategory,
		action: string,
		params?: Record<string, unknown>,
	): Promise<BridgeResponse> {
		if (!this._webSocket || this._connectionState !== UnityBridgeConnectionState.Connected) {
			throw new Error('Not connected to Unity Editor');
		}

		const id = generateUuid();
		const request: BridgeRequest = {
			id,
			type: 'request',
			category,
			action,
			params: params ?? {},
		};

		const deferred = new DeferredPromise<BridgeResponse>();
		const timeout = setTimeout(() => {
			this._pendingRequests.delete(id);
			deferred.error(new Error(`Command timeout: ${category}.${action}`));
		}, BRIDGE_COMMAND_TIMEOUT_MS);

		this._pendingRequests.set(id, { deferred, timeout });

		try {
			this._webSocket.send(JSON.stringify(request));
		} catch (error) {
			clearTimeout(timeout);
			this._pendingRequests.delete(id);
			throw error;
		}

		return deferred.p;
	}

	// --- Convenience Methods ---

	async getSceneHierarchy(): Promise<BridgeResponse> {
		return this.sendCommand(BridgeCommandCategory.Scene, 'getHierarchy');
	}

	async createGameObject(name: string, parentPath?: string): Promise<BridgeResponse> {
		return this.sendCommand(BridgeCommandCategory.GameObject, 'create', { name, parentPath });
	}

	async createPrimitive(name: string, primitiveType: string, parentPath?: string): Promise<BridgeResponse> {
		return this.sendCommand(BridgeCommandCategory.GameObject, 'createPrimitive', { name, primitiveType, parentPath });
	}

	async setTransform(gameObjectPath: string, position?: number[], rotation?: number[], scale?: number[]): Promise<BridgeResponse> {
		return this.sendCommand(BridgeCommandCategory.GameObject, 'setTransform', { gameObjectPath, position: position?.join(','), rotation: rotation?.join(','), scale: scale?.join(',') });
	}

	async addComponent(gameObjectPath: string, componentType: string): Promise<BridgeResponse> {
		return this.sendCommand(BridgeCommandCategory.Component, 'add', { gameObjectPath, componentType });
	}

	async setComponentProperty(gameObjectPath: string, componentType: string, propertyName: string, value: unknown): Promise<BridgeResponse> {
		return this.sendCommand(BridgeCommandCategory.Component, 'setProperty', { gameObjectPath, componentType, propertyName, value: String(value) });
	}

	async createPrefab(gameObjectPath: string, assetPath: string): Promise<BridgeResponse> {
		return this.sendCommand(BridgeCommandCategory.Prefab, 'create', { gameObjectPath, assetPath });
	}

	async instantiatePrefab(prefabPath: string): Promise<BridgeResponse> {
		return this.sendCommand(BridgeCommandCategory.Prefab, 'instantiate', { prefabPath });
	}

	async getPlayModeState(): Promise<UnityPlayModeState> {
		const response = await this.sendCommand(BridgeCommandCategory.Editor, 'getPlayMode');
		const state = (response.result as { state: string })?.state;
		if (state === 'playing') {
			return UnityPlayModeState.Playing;
		}
		if (state === 'paused') {
			return UnityPlayModeState.Paused;
		}
		return UnityPlayModeState.Stopped;
	}

	async getSelectedObjects(): Promise<BridgeResponse> {
		return this.sendCommand(BridgeCommandCategory.GameObject, 'getSelected');
	}

	// --- Cleanup ---

	override dispose(): void {
		this.disconnect();
		super.dispose();
	}
}
