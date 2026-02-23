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
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';

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

	sendMessage(content: string): Promise<void>;
	clearMessages(): void;
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
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this._loadMessages();
		this._loadApiKeyAsync();
	}

	get messages(): IChatMessage[] {
		return this._messages;
	}

	get isStreaming(): boolean {
		return this._isStreaming;
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

	private async _loadApiKeyAsync(): Promise<void> {
		// First check storage
		this._apiKey = this.storageService.get(STORAGE_KEY_API_KEY, StorageScope.PROFILE);
		if (this._apiKey) {
			return;
		}

		// Try to load from .env file in the app root
		try {
			const appRoot = this.environmentService.appRoot;
			const envFileUri = URI.file(`${appRoot}/.env`);
			const content = await this.fileService.readFile(envFileUri);
			const envContent = content.value.toString();

			// Parse .env file to find ANTHROPIC_API_KEY
			const lines = envContent.split('\n');
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed.startsWith('ANTHROPIC_API_KEY=')) {
					this._apiKey = trimmed.substring('ANTHROPIC_API_KEY='.length).trim();
					break;
				}
			}
		} catch {
			// .env file not found or couldn't be read, that's ok
		}
	}

	setApiKey(apiKey: string): void {
		this._apiKey = apiKey;
		this.storageService.store(STORAGE_KEY_API_KEY, apiKey, StorageScope.PROFILE, StorageTarget.USER);
	}

	getApiKey(): string | undefined {
		return this._apiKey;
	}

	async sendMessage(content: string): Promise<void> {
		if (!this._apiKey) {
			throw new Error('API key not set. Please set your Anthropic API key in the chat settings.');
		}

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
			await this._streamResponse(assistantMessage);
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

	private async _streamResponse(assistantMessage: IChatMessage): Promise<void> {
		// Build messages array for API
		const apiMessages = this._messages
			.filter(m => !m.isStreaming)
			.map(m => ({
				role: m.role as 'user' | 'assistant',
				content: m.content,
			}));

		// Make API request with streaming
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this._apiKey!,
				'anthropic-version': '2023-06-01',
				'anthropic-dangerous-direct-browser-access': 'true',
			},
			body: JSON.stringify({
				model: 'claude-sonnet-4-20250514',
				max_tokens: 4096,
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
