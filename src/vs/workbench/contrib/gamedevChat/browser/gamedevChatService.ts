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
import { buildSkillsPromptBlock, GameEngine } from './skills/gamedevSkillsRegistry.js';

export const enum StreamingPhase {
	None = 0,
	LoadingContext = 1,
	Thinking = 2,
	Responding = 3,
}

export interface IStreamingChunkEvent {
	readonly messageId: string;
	readonly type: 'thinking_delta' | 'text_delta' | 'phase_change' | 'thinking_complete';
	readonly text?: string;
	readonly phase?: StreamingPhase;
}

export interface IFileAttachment {
	readonly uri: URI;
	readonly name: string;
}

export interface ISendMessageOptions {
	includeProjectContext?: boolean;
	attachments?: IFileAttachment[];
}

export interface IChatMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: number;
	isStreaming?: boolean;
	thinkingContent?: string;
	thinkingDurationMs?: number;
	streamingPhase?: StreamingPhase;
	attachments?: IFileAttachment[];
}

export interface IGameDevChatService {
	readonly _serviceBrand: undefined;

	readonly onDidUpdateMessages: Event<void>;
	readonly onDidStartStreaming: Event<void>;
	readonly onDidStopStreaming: Event<void>;
	readonly onDidReceiveChunk: Event<IStreamingChunkEvent>;

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

	private readonly _onDidReceiveChunk = this._register(new Emitter<IStreamingChunkEvent>());
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
				const parsed: IChatMessage[] = JSON.parse(stored);
				// Revive URI objects from stored JSON
				for (const msg of parsed) {
					if (msg.attachments) {
						for (const attachment of msg.attachments) {
							(attachment as { uri: URI }).uri = URI.revive(attachment.uri);
						}
					}
				}
				this._messages = parsed;
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
		if (!this._apiKey) {
			throw new Error('API key not set. Please set your Anthropic API key in the chat settings.');
		}

		const shouldIncludeContext = options?.includeProjectContext ?? this._includeProjectContext;
		const attachments = options?.attachments;

		// Build augmented content with file attachments for the API
		let augmentedContent: string | undefined;
		if (attachments && attachments.length > 0) {
			const fileBlocks: string[] = [];
			for (const attachment of attachments) {
				try {
					const fileContent = await this.fileService.readFile(attachment.uri, { limits: { size: 100 * 1024 } });
					fileBlocks.push(`--- ${attachment.uri.path} ---\n${fileContent.value.toString()}\n--- end ---`);
				} catch (error) {
					fileBlocks.push(`--- ${attachment.uri.path} ---\n[Error reading file: ${error instanceof Error ? error.message : String(error)}]\n--- end ---`);
				}
			}
			augmentedContent = `[Attached files]\n${fileBlocks.join('\n')}\n\n${content}`;
		}

		// Add user message (display content only, not augmented)
		const userMessage: IChatMessage = {
			id: `user-${Date.now()}`,
			role: 'user',
			content,
			timestamp: Date.now(),
			attachments,
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
			streamingPhase: StreamingPhase.LoadingContext,
		};
		this._messages.push(assistantMessage);
		this._onDidUpdateMessages.fire();

		try {
			await this._streamResponse(assistantMessage, shouldIncludeContext, augmentedContent);
		} catch (error) {
			assistantMessage.content = `Error: ${error instanceof Error ? error.message : String(error)}`;
			assistantMessage.isStreaming = false;
			assistantMessage.streamingPhase = StreamingPhase.None;
			this._onDidUpdateMessages.fire();
		} finally {
			this._isStreaming = false;
			this._onDidStopStreaming.fire();
			this._saveMessages();
		}
	}

	private async _streamResponse(assistantMessage: IChatMessage, includeContext: boolean, augmentedContent?: string): Promise<void> {
		// Build messages array for API
		// Note: thinking blocks require a signature for multi-turn which we don't store,
		// so we only send the text content for previous assistant messages.
		const apiMessages = this._messages
			.filter(m => !m.isStreaming)
			.map(m => ({
				role: m.role as 'user' | 'assistant',
				content: m.content,
			}));

		// Replace the last user message content with augmented content (includes file attachments)
		if (augmentedContent && apiMessages.length > 0) {
			const lastMsg = apiMessages[apiMessages.length - 1];
			if (lastMsg.role === 'user') {
				lastMsg.content = augmentedContent;
			}
		}

		// Build system message as blocks for prompt caching
		const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
			{
				type: 'text',
				text: 'You are an expert AI assistant for game development. You help with Unity, Godot, C#, GDScript, game design, architecture patterns, and general programming questions. Give accurate, production-quality advice. When writing code, follow engine best practices and avoid common pitfalls.',
			}
		];

		// Engine skills knowledge base — sent as a CACHED block
		const detectedEngine = this.unityProjectService.currentProject?.isUnityProject
			? GameEngine.Unity
			: GameEngine.Unknown;
		const skillsBlock = buildSkillsPromptBlock(detectedEngine);
		if (skillsBlock) {
			systemBlocks.push({
				type: 'text',
				text: skillsBlock,
				cache_control: { type: 'ephemeral' },
			});
		}

		// Project context is sent as a CACHED block
		if (includeContext) {
			const projectContext = this.unityProjectService.buildContextMessage();
			if (projectContext) {
				systemBlocks.push({
					type: 'text',
					text: projectContext,
					cache_control: { type: 'ephemeral' },
				});
			}
		}

		// Fire loading context phase
		this._onDidReceiveChunk.fire({
			messageId: assistantMessage.id,
			type: 'phase_change',
			phase: StreamingPhase.LoadingContext,
		});

		// Make API request with streaming, prompt caching, and extended thinking
		// Note: temperature cannot be set when thinking is enabled
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this._apiKey!,
				'anthropic-version': '2023-06-01',
				'anthropic-dangerous-direct-browser-access': 'true',
				'anthropic-beta': 'prompt-caching-2024-07-31,interleaved-thinking-2025-05-14',
			},
			body: JSON.stringify({
				model: 'claude-sonnet-4-20250514',
				max_tokens: 16000,
				system: systemBlocks,
				messages: apiMessages,
				stream: true,
				thinking: {
					type: 'enabled',
					budget_tokens: 10000,
				},
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

		// Extended thinking state tracking
		let currentBlockType: 'thinking' | 'text' | null = null;
		const thinkingStartTime = Date.now();
		let thinkingFinalized = false;

		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.startsWith('data: ')) {
					continue;
				}
				const data = line.slice(6);
				if (data === '[DONE]') {
					continue;
				}

				try {
					const parsed = JSON.parse(data);

					switch (parsed.type) {
						case 'content_block_start': {
							const blockType = parsed.content_block?.type;
							if (blockType === 'thinking') {
								currentBlockType = 'thinking';
								assistantMessage.streamingPhase = StreamingPhase.Thinking;
								this._onDidReceiveChunk.fire({
									messageId: assistantMessage.id,
									type: 'phase_change',
									phase: StreamingPhase.Thinking,
								});
							} else if (blockType === 'text') {
								currentBlockType = 'text';
								if (!thinkingFinalized) {
									thinkingFinalized = true;
									assistantMessage.thinkingDurationMs = Date.now() - thinkingStartTime;
								}
								assistantMessage.streamingPhase = StreamingPhase.Responding;
								this._onDidReceiveChunk.fire({
									messageId: assistantMessage.id,
									type: 'phase_change',
									phase: StreamingPhase.Responding,
								});
							}
							break;
						}

						case 'content_block_delta': {
							if (parsed.delta?.type === 'thinking_delta') {
								const thinkingText = parsed.delta.thinking;
								assistantMessage.thinkingContent = (assistantMessage.thinkingContent || '') + thinkingText;
								this._onDidReceiveChunk.fire({
									messageId: assistantMessage.id,
									type: 'thinking_delta',
									text: thinkingText,
								});
							} else if (parsed.delta?.type === 'text_delta') {
								const text = parsed.delta.text;
								assistantMessage.content += text;
								this._onDidReceiveChunk.fire({
									messageId: assistantMessage.id,
									type: 'text_delta',
									text,
								});
							}
							break;
						}

						case 'content_block_stop': {
							if (currentBlockType === 'thinking') {
								if (!thinkingFinalized) {
									thinkingFinalized = true;
									assistantMessage.thinkingDurationMs = Date.now() - thinkingStartTime;
								}
								this._onDidReceiveChunk.fire({
									messageId: assistantMessage.id,
									type: 'thinking_complete',
								});
							}
							currentBlockType = null;
							break;
						}

						case 'message_delta':
						case 'message_stop': {
							assistantMessage.isStreaming = false;
							assistantMessage.streamingPhase = StreamingPhase.None;
							if (!thinkingFinalized && assistantMessage.thinkingContent) {
								assistantMessage.thinkingDurationMs = Date.now() - thinkingStartTime;
							}
							this._onDidUpdateMessages.fire();
							break;
						}
					}
				} catch {
					// Ignore parse errors for incomplete chunks
				}
			}
		}

		// Finalize message
		assistantMessage.isStreaming = false;
		assistantMessage.streamingPhase = StreamingPhase.None;
		this._onDidUpdateMessages.fire();
	}

	clearMessages(): void {
		this._messages = [];
		this._saveMessages();
		this._onDidUpdateMessages.fire();
	}
}
