/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { FileAccess } from '../../../../base/common/network.js';
import { dirname } from '../../../../base/common/resources.js';
import { IUnityProjectService } from '../../gamedevUnity/common/types.js';
import { buildSkillsPromptBlock, GameEngine, getUnityBridgeSkills } from './skills/gamedevSkillsRegistry.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Range } from '../../../../editor/common/core/range.js';
import { BridgeCommandCategory, IUnityBridgeService } from '../../gamedevUnity/common/bridgeTypes.js';

export const enum StreamingPhase {
	None = 0,
	LoadingContext = 1,
	Thinking = 2,
	Responding = 3,
}

export const enum ChatMode {
	Ask = 'ask',
	Agent = 'agent',
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

export interface IBridgeCommandResult {
	readonly category: string;
	readonly action: string;
	readonly success: boolean;
	readonly error?: string;
}

export interface IAppliedFileResult {
	readonly filePath: string;
	readonly status: 'created' | 'updated' | 'error';
	readonly error?: string;
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
	bridgeResults?: IBridgeCommandResult[];
	appliedFiles?: IAppliedFileResult[];
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
	stopStreaming(): void;
	clearMessages(): void;
	readonly includeProjectContext: boolean;
	setIncludeProjectContext(include: boolean): void;
	readonly mode: ChatMode;
	setMode(mode: ChatMode): void;
	readonly onDidChangeMode: Event<ChatMode>;
	hasProjectContext(): boolean;
	getProjectName(): string | undefined;
	setApiKey(apiKey: string): void;
	getApiKey(): string | undefined;
}

export const IGameDevChatService = createDecorator<IGameDevChatService>('gameDevChatService');

const STORAGE_KEY_MESSAGES = 'gamedevChat.messages';
const STORAGE_KEY_API_KEY = 'gamedevChat.apiKey';
const STORAGE_KEY_MODE = 'gamedevChat.mode';

export class GameDevChatService extends Disposable implements IGameDevChatService {
	declare readonly _serviceBrand: undefined;

	private _messages: IChatMessage[] = [];
	private _isStreaming = false;
	private _apiKey: string | undefined;
	private _includeProjectContext = true;
	private _mode: ChatMode = ChatMode.Ask;
	private _abortController: AbortController | undefined;

	private readonly _onDidUpdateMessages = this._register(new Emitter<void>());
	readonly onDidUpdateMessages = this._onDidUpdateMessages.event;

	private readonly _onDidStartStreaming = this._register(new Emitter<void>());
	readonly onDidStartStreaming = this._onDidStartStreaming.event;

	private readonly _onDidStopStreaming = this._register(new Emitter<void>());
	readonly onDidStopStreaming = this._onDidStopStreaming.event;

	private readonly _onDidReceiveChunk = this._register(new Emitter<IStreamingChunkEvent>());
	readonly onDidReceiveChunk = this._onDidReceiveChunk.event;

	private readonly _onDidChangeMode = this._register(new Emitter<ChatMode>());
	readonly onDidChangeMode = this._onDidChangeMode.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IFileService private readonly fileService: IFileService,
		@IUnityProjectService private readonly unityProjectService: IUnityProjectService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IUnityBridgeService private readonly unityBridgeService: IUnityBridgeService,
	) {
		super();
		this._loadMessages();
		this._loadApiKey();
		this._loadMode();
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

	get mode(): ChatMode {
		return this._mode;
	}

	setMode(mode: ChatMode): void {
		if (this._mode !== mode) {
			this._mode = mode;
			this.storageService.store(STORAGE_KEY_MODE, mode, StorageScope.PROFILE, StorageTarget.USER);
			this._onDidChangeMode.fire(mode);
		}
	}

	stopStreaming(): void {
		if (this._abortController) {
			this._abortController.abort();
			this._abortController = undefined;
		}
	}

	private _loadMode(): void {
		const stored = this.storageService.get(STORAGE_KEY_MODE, StorageScope.PROFILE);
		if (stored === ChatMode.Agent) {
			this._mode = ChatMode.Agent;
		} else {
			this._mode = ChatMode.Ask;
		}
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
		this._abortController = new AbortController();
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
			if (error instanceof DOMException && error.name === 'AbortError') {
				// User stopped streaming — keep partial content
				if (!assistantMessage.content) {
					assistantMessage.content = '[Stopped by user]';
				}
			} else {
				assistantMessage.content = `Error: ${error instanceof Error ? error.message : String(error)}`;
			}
			assistantMessage.isStreaming = false;
			assistantMessage.streamingPhase = StreamingPhase.None;
			this._onDidUpdateMessages.fire();
		} finally {
			this._abortController = undefined;
			this._isStreaming = false;
			this._onDidStopStreaming.fire();

			// In Agent mode, apply file edits and bridge commands from code blocks
			if (this._mode === ChatMode.Agent && assistantMessage.content) {
				await this._applyAgentEdits(assistantMessage.content, assistantMessage);
				console.log('[GameDevChatService] Post-stream: Agent mode, bridge connected:', this.unityBridgeService.isConnected);
				if (this.unityBridgeService.isConnected) {
					await this._applyBridgeCommands(assistantMessage.content, assistantMessage);
				}
			}

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
		const projectInfo = this.unityProjectService.currentProject;
		const isUnity = projectInfo?.isUnityProject;
		const projectName = projectInfo?.projectName;

		// Build project-awareness preamble
		let projectPreamble = '';
		if (isUnity && projectName) {
			projectPreamble = `\n\nYou are working directly inside the user's Unity project "${projectName}". You have full access to the project structure, scripts, and configuration. Reference specific project files and structures when relevant. The user trusts you as their expert Unity co-developer — be confident and specific, not generic.`;
		} else if (isUnity) {
			projectPreamble = '\n\nYou are working directly inside the user\'s Unity project. You have full access to the project structure, scripts, and configuration. Reference specific project files and structures when relevant. The user trusts you as their expert Unity co-developer — be confident and specific, not generic.';
		}

		let modeInstructions: string;
		if (this._mode === ChatMode.Agent) {
			modeInstructions = `\n\nYou are in AGENT mode. When you write or edit code, your files are AUTOMATICALLY written to the project — the user does NOT need to copy anything manually. Output each file as a fenced code block with the language and file path in the format \`\`\`language:path/to/file. Include the COMPLETE file contents. For example:\n\`\`\`csharp:Assets/Scripts/Player.cs\nusing UnityEngine;\npublic class Player : MonoBehaviour { }\n\`\`\`\nNever tell the user to "copy" or "create" files — they are applied automatically. Just explain what you changed and why.`;
		} else {
			modeInstructions = '\n\nYou are in ASK mode. Present code in standard fenced code blocks. Each code block has a copy button the user can use. Never tell the user to "create a file at..." or give manual file path instructions — just present the code naturally and explain it. The user can copy what they need directly from the code blocks.';
		}

		const basePrompt = 'You are an expert AI assistant for game development, embedded directly in the user\'s IDE. You help with Unity, Godot, C#, GDScript, game design, architecture patterns, and general programming questions. Give accurate, production-quality advice. When writing code, follow engine best practices and avoid common pitfalls.' + projectPreamble + modeInstructions;
		const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
			{
				type: 'text',
				text: basePrompt,
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

		// Unity Bridge skills — when connected in Agent mode
		if (this._mode === ChatMode.Agent && this.unityBridgeService.isConnected) {
			const bridgeSkills = getUnityBridgeSkills();
			systemBlocks.push({
				type: 'text',
				text: bridgeSkills,
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
			signal: this._abortController?.signal,
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

	private async _applyBridgeCommands(content: string, assistantMessage: IChatMessage): Promise<void> {
		console.log('[GameDevChatService] Scanning for bridge commands, bridge connected:', this.unityBridgeService.isConnected);

		const results: IBridgeCommandResult[] = [];

		// Try multiple patterns — the agent may format bridge commands differently
		const patterns = [
			/```unity-bridge\n([\s\S]*?)```/g,                  // Standard: ```unity-bridge\n...\n```
			/```unity-bridge\s*\n([\s\S]*?)```/g,               // With extra whitespace
			/```\s*\n(\[\s*\{\s*"category"[\s\S]*?\}\s*\])```/g, // Generic code block with bridge-shaped JSON
		];

		let foundCommands = false;

		for (const regex of patterns) {
			let match: RegExpExecArray | null;
			while ((match = regex.exec(content)) !== null) {
				foundCommands = true;
				const commandText = match[1].trim();
				console.log('[GameDevChatService] Found bridge commands block:', commandText.substring(0, 100) + '...');
				try {
					const commands: Array<{ category: string; action: string; params?: Record<string, unknown> }> = JSON.parse(commandText);
					console.log(`[GameDevChatService] Executing ${commands.length} bridge commands`);
					for (const cmd of commands) {
						console.log(`[GameDevChatService] Bridge command: ${cmd.category}.${cmd.action}`);
						try {
							const response = await this.unityBridgeService.sendCommand(
								cmd.category as BridgeCommandCategory,
								cmd.action,
								cmd.params,
							);
							console.log(`[GameDevChatService] Bridge response:`, response.success ? 'OK' : response.error);
							results.push({ category: cmd.category, action: cmd.action, success: response.success, error: response.error });
						} catch (cmdError) {
							const errorMsg = cmdError instanceof Error ? cmdError.message : String(cmdError);
							results.push({ category: cmd.category, action: cmd.action, success: false, error: errorMsg });
						}
					}
				} catch (error) {
					console.error('[GameDevChatService] Failed to execute bridge commands:', error);
				}
			}
			if (foundCommands) {
				break; // Found commands with this pattern, don't try others
			}
		}

		// Last resort: look for a JSON array with "category" fields anywhere in the content
		if (!foundCommands) {
			const jsonArrayMatch = content.match(/\[\s*\{\s*"category"\s*:\s*"(?:gameObject|component|scene|prefab|asset|editor|project)"[\s\S]*?\}\s*\]/);
			if (jsonArrayMatch) {
				console.log('[GameDevChatService] Found bridge commands via JSON detection');
				try {
					const commands: Array<{ category: string; action: string; params?: Record<string, unknown> }> = JSON.parse(jsonArrayMatch[0]);
					console.log(`[GameDevChatService] Executing ${commands.length} bridge commands (auto-detected)`);
					for (const cmd of commands) {
						console.log(`[GameDevChatService] Bridge command: ${cmd.category}.${cmd.action}`);
						try {
							const response = await this.unityBridgeService.sendCommand(
								cmd.category as BridgeCommandCategory,
								cmd.action,
								cmd.params,
							);
							console.log(`[GameDevChatService] Bridge response:`, response.success ? 'OK' : response.error);
							results.push({ category: cmd.category, action: cmd.action, success: response.success, error: response.error });
						} catch (cmdError) {
							const errorMsg = cmdError instanceof Error ? cmdError.message : String(cmdError);
							results.push({ category: cmd.category, action: cmd.action, success: false, error: errorMsg });
						}
					}
				} catch (error) {
					console.error('[GameDevChatService] Failed to execute auto-detected bridge commands:', error);
				}
			} else {
				console.log('[GameDevChatService] No bridge commands found in response');
			}
		}

		if (results.length > 0) {
			assistantMessage.bridgeResults = results;
			this._onDidUpdateMessages.fire();
		}
	}

	private _parseFileCodeBlocks(content: string): { filePath: string; language: string; code: string }[] {
		const results: { filePath: string; language: string; code: string }[] = [];
		const regex = /```(\w+):([^\n]+)\n([\s\S]*?)```/g;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(content)) !== null) {
			results.push({
				language: match[1],
				filePath: match[2].trim(),
				code: match[3],
			});
		}
		return results;
	}

	private async _applyAgentEdits(content: string, assistantMessage: IChatMessage): Promise<void> {
		const blocks = this._parseFileCodeBlocks(content);
		if (blocks.length === 0) {
			return;
		}

		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return;
		}
		const workspaceRoot = folders[0].uri;

		const results: IAppliedFileResult[] = [];

		for (const block of blocks) {
			const fileUri = URI.joinPath(workspaceRoot, block.filePath);
			try {
				const exists = await this.fileService.exists(fileUri);
				if (exists) {
					// Read existing file to get its full range
					const fileContent = await this.fileService.readFile(fileUri);
					const text = fileContent.value.toString();
					const lines = text.split('\n');
					const fullRange = new Range(1, 1, lines.length, lines[lines.length - 1].length + 1);
					await this.bulkEditService.apply([new ResourceTextEdit(fileUri, { range: fullRange, text: block.code })]);
					results.push({ filePath: block.filePath, status: 'updated' });
				} else {
					await this.fileService.createFile(fileUri, VSBuffer.fromString(block.code));
					results.push({ filePath: block.filePath, status: 'created' });
				}
				await this.editorService.openEditor({ resource: fileUri });
			} catch (error) {
				console.error(`[GameDevChatService] Failed to apply agent edit to ${block.filePath}:`, error);
				results.push({ filePath: block.filePath, status: 'error', error: error instanceof Error ? error.message : String(error) });
			}
		}

		if (results.length > 0) {
			assistantMessage.appliedFiles = results;
			this._onDidUpdateMessages.fire();
		}
	}

	clearMessages(): void {
		this._messages = [];
		this._saveMessages();
		this._onDidUpdateMessages.fire();
	}
}
