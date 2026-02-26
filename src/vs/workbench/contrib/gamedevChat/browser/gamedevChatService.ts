/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { FileAccess } from '../../../../base/common/network.js';
import { dirname } from '../../../../base/common/resources.js';
import { IUnityProjectService } from '../../gamedevUnity/common/types.js';

export interface ISendMessageOptions {
	includeProjectContext?: boolean;
}

export interface IChatMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: number;
	isStreaming?: boolean;
}

export interface IGameDevChatService {
	readonly _serviceBrand: undefined;

	readonly onDidUpdateMessages: Event<void>;
	readonly onDidStartStreaming: Event<void>;
	readonly onDidStopStreaming: Event<void>;
	readonly onDidReceiveChunk: Event<string>;

	readonly messages: IChatMessage[];
	readonly isStreaming: boolean;

	sendMessage(content: string, options?: ISendMessageOptions): Promise<void>;
	clearMessages(): void;
	readonly includeProjectContext: boolean;
	setIncludeProjectContext(include: boolean): void;
	hasProjectContext(): boolean;
	getProjectName(): string | undefined;
	setApiKey(apiKey: string): void;
	getApiKey(): string | undefined;
}

export const IGameDevChatService = createDecorator<IGameDevChatService>('gameDevChatService');

const STORAGE_KEY_MESSAGES = 'gamedevChat.messages';
const STORAGE_KEY_API_KEY = 'gamedevChat.apiKey';

export class GameDevChatService extends Disposable implements IGameDevChatService {
	declare readonly _serviceBrand: undefined;

	private _messages: IChatMessage[] = [];
	private _isStreaming = false;
	private _apiKey: string | undefined;
	private _includeProjectContext = true;

	private readonly _onDidUpdateMessages = this._register(new Emitter<void>());
	readonly onDidUpdateMessages = this._onDidUpdateMessages.event;

	private readonly _onDidStartStreaming = this._register(new Emitter<void>());
	readonly onDidStartStreaming = this._onDidStartStreaming.event;

	private readonly _onDidStopStreaming = this._register(new Emitter<void>());
	readonly onDidStopStreaming = this._onDidStopStreaming.event;

	private readonly _onDidReceiveChunk = this._register(new Emitter<string>());
	readonly onDidReceiveChunk = this._onDidReceiveChunk.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IFileService private readonly fileService: IFileService,
		@IUnityProjectService private readonly unityProjectService: IUnityProjectService,
	) {
		super();
		this._loadMessages();
		this._loadApiKey();
	}

	get messages(): IChatMessage[] {
		return this._messages;
	}

	get isStreaming(): boolean {
		return this._isStreaming;
	}

	get includeProjectContext(): boolean {
		return this._includeProjectContext;
	}

	setIncludeProjectContext(include: boolean): void {
		this._includeProjectContext = include;
	}

	private _loadMessages(): void {
		const stored = this.storageService.get(STORAGE_KEY_MESSAGES, StorageScope.PROFILE);
		if (stored) {
			try {
				this._messages = JSON.parse(stored);
			} catch {
				this._messages = [];
			}
		}
	}

	private _saveMessages(): void {
		// Don't save streaming messages
		const toSave = this._messages.filter(m => !m.isStreaming);
		this.storageService.store(STORAGE_KEY_MESSAGES, JSON.stringify(toSave), StorageScope.PROFILE, StorageTarget.USER);
	}

	private _loadApiKey(): void {
		// 1. Check storage (user-set key via settings UI)
		const storedKey = this.storageService.get(STORAGE_KEY_API_KEY, StorageScope.PROFILE);
		if (storedKey) {
			this._apiKey = storedKey;
			return;
		}

		// 2. Try loading from .env file asynchronously
		this._loadApiKeyFromEnvFile();
	}

	private async _loadApiKeyFromEnvFile(): Promise<void> {
		try {
			const appRootUri = dirname(FileAccess.asFileUri(''));
			const envFileUri = URI.joinPath(appRootUri, '.env');
			const content = await this.fileService.readFile(envFileUri);
			const text = content.value.toString();

			for (const line of text.split('\n')) {
				const trimmed = line.trim();
				if (trimmed.startsWith('#') || !trimmed) {
					continue;
				}
				const eqIndex = trimmed.indexOf('=');
				if (eqIndex === -1) {
					continue;
				}
				const key = trimmed.substring(0, eqIndex).trim();
				if (key === 'ANTHROPIC_API_KEY') {
					const value = trimmed.substring(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
					if (value) {
						this._apiKey = value;
						console.log('[GameDevChatService] API key loaded from .env file');
						return;
					}
				}
			}
			console.log('[GameDevChatService] No ANTHROPIC_API_KEY found in .env file');
		} catch (error) {
			console.log('[GameDevChatService] Could not read .env file:', error instanceof Error ? error.message : String(error));
		}
	}

	hasProjectContext(): boolean {
		return !!this.unityProjectService.buildContextMessage();
	}

	getProjectName(): string | undefined {
		return this.unityProjectService.currentProject?.projectName;
	}

	setApiKey(apiKey: string): void {
		this._apiKey = apiKey;
		this.storageService.store(STORAGE_KEY_API_KEY, apiKey, StorageScope.PROFILE, StorageTarget.USER);
	}

	getApiKey(): string | undefined {
		return this._apiKey;
	}

	async sendMessage(content: string, options?: ISendMessageOptions): Promise<void> {
		console.log('[GameDevChatService] sendMessage called, hasApiKey:', !!this._apiKey);

		if (!this._apiKey) {
			console.error('[GameDevChatService] No API key set');
			throw new Error('API key not set. Please set your Anthropic API key in the chat settings.');
		}

		const shouldIncludeContext = options?.includeProjectContext ?? this._includeProjectContext;
		console.log('[GameDevChatService] shouldIncludeContext:', shouldIncludeContext);

		// Add user message
		const userMessage: IChatMessage = {
			id: `user-${Date.now()}`,
			role: 'user',
			content,
			timestamp: Date.now(),
		};
		this._messages.push(userMessage);
		this._onDidUpdateMessages.fire();
		this._saveMessages();

		// Start streaming
		this._isStreaming = true;
		this._onDidStartStreaming.fire();

		// Add placeholder assistant message
		const assistantMessage: IChatMessage = {
			id: `assistant-${Date.now()}`,
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			isStreaming: true,
		};
		this._messages.push(assistantMessage);
		this._onDidUpdateMessages.fire();

		try {
			await this._streamResponse(assistantMessage, shouldIncludeContext);
		} catch (error) {
			// Update assistant message with error
			assistantMessage.content = `Error: ${error instanceof Error ? error.message : String(error)}`;
			assistantMessage.isStreaming = false;
			this._onDidUpdateMessages.fire();
		} finally {
			this._isStreaming = false;
			this._onDidStopStreaming.fire();
			this._saveMessages();
		}
	}

	private async _streamResponse(assistantMessage: IChatMessage, includeContext: boolean): Promise<void> {
		// Build messages array for API
		const apiMessages = this._messages
			.filter(m => !m.isStreaming)
			.map(m => ({
				role: m.role as 'user' | 'assistant',
				content: m.content,
			}));

		// Build system message as blocks for prompt caching
		// Base prompt is tiny and always included
		const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
			{
				type: 'text',
				text: 'You are a helpful AI assistant for game development. You help with Unity projects, C# scripting, game design, and general programming questions.',
			}
		];

		// Project context is sent as a CACHED block — Anthropic caches it
		// after the first call, subsequent calls pay ~10% for cached tokens
		if (includeContext) {
			const projectContext = this.unityProjectService.buildContextMessage();
			if (projectContext) {
				systemBlocks.push({
					type: 'text',
					text: projectContext,
					cache_control: { type: 'ephemeral' },
				});
				console.log('[GameDevChatService] Including cached project context');
			}
		}

		// Make API request with streaming and prompt caching
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this._apiKey!,
				'anthropic-version': '2023-06-01',
				'anthropic-dangerous-direct-browser-access': 'true',
				'anthropic-beta': 'prompt-caching-2024-07-31',
			},
			body: JSON.stringify({
				model: 'claude-sonnet-4-20250514',
				max_tokens: 4096,
				system: systemBlocks,
				messages: apiMessages,
				stream: true,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`API error: ${response.status} - ${errorText}`);
		}

		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error('No response body');
		}

		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const data = line.slice(6);
					if (data === '[DONE]') {
						continue;
					}

					try {
						const parsed = JSON.parse(data);
						if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
							const text = parsed.delta.text;
							assistantMessage.content += text;
							this._onDidReceiveChunk.fire(text);
							this._onDidUpdateMessages.fire();
						} else if (parsed.type === 'message_stop') {
							assistantMessage.isStreaming = false;
							this._onDidUpdateMessages.fire();
						}
					} catch {
						// Ignore parse errors for incomplete chunks
					}
				}
			}
		}

		// Finalize message
		assistantMessage.isStreaming = false;
		this._onDidUpdateMessages.fire();
	}

	clearMessages(): void {
		this._messages = [];
		this._saveMessages();
		this._onDidUpdateMessages.fire();
	}
}
