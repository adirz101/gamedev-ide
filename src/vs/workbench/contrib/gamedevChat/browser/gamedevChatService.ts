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
import { BridgeCommandCategory, IUnityBridgeService, UnityBridgeConnectionState } from '../../gamedevUnity/common/bridgeTypes.js';

export const enum StreamingPhase {
	None = 0,
	LoadingContext = 1,
	Thinking = 2,
	Responding = 3,
	Applying = 4,
	WaitingForCompilation = 5,
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

export interface IApplyActivityEvent {
	readonly messageId: string;
	readonly action: string;
	readonly status: 'start' | 'done' | 'error';
	readonly detail?: string;
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
	status: 'created' | 'updated' | 'error' | 'undone';
	readonly error?: string;
	readonly content?: string;
	readonly previousContent?: string;
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
	readonly onDidApplyActivity: Event<IApplyActivityEvent>;

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
	readonly model: string;
	setModel(modelId: string): void;
	readonly onDidChangeModel: Event<string>;
	hasProjectContext(): boolean;
	getProjectName(): string | undefined;
	setApiKey(apiKey: string): void;
	getApiKey(): string | undefined;
	undoFile(messageId: string, filePath: string): Promise<void>;
}

export const IGameDevChatService = createDecorator<IGameDevChatService>('gameDevChatService');

const STORAGE_KEY_MESSAGES = 'gamedevChat.messages';
const STORAGE_KEY_API_KEY = 'gamedevChat.apiKey';
const STORAGE_KEY_MODE = 'gamedevChat.mode';
const STORAGE_KEY_MODEL = 'gamedevChat.model';

/** Tool definition for the Anthropic API — allows the model to execute Unity bridge commands mid-conversation. */
const UNITY_BRIDGE_TOOL = {
	name: 'unity_bridge',
	description: 'Execute commands in the Unity Editor to create GameObjects, add components, set transforms, manage scenes, and control the editor. Use this for all scene construction.',
	input_schema: {
		type: 'object' as const,
		properties: {
			commands: {
				type: 'array' as const,
				description: 'Array of bridge commands to execute sequentially in Unity',
				items: {
					type: 'object' as const,
					properties: {
						category: {
							type: 'string' as const,
							enum: ['scene', 'gameObject', 'component', 'prefab', 'asset', 'editor', 'project'],
						},
						action: { type: 'string' as const },
						params: { type: 'object' as const },
					},
					required: ['category', 'action'],
				},
			},
		},
		required: ['commands'],
	},
};

/** Content block tracked during streaming — supports thinking (with signature), text, and tool_use blocks. */
interface IStreamedContentBlock {
	type: 'thinking' | 'text' | 'tool_use';
	thinking: string;
	signature: string;
	text: string;
	toolUseId: string;
	toolUseName: string;
	toolInputJson: string;
}

export interface IModelOption {
	readonly id: string;
	readonly label: string;
	readonly description: string;
}

export const AVAILABLE_MODELS: IModelOption[] = [
	{ id: 'claude-opus-4-20250805', label: 'Opus 4', description: 'Most capable, best for complex tasks' },
	{ id: 'claude-sonnet-4-20250514', label: 'Sonnet 4', description: 'Balanced – fast and smart (default)' },
	{ id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', description: 'Fastest and most affordable' },
];

const DEFAULT_MODEL_ID = 'claude-sonnet-4-20250514';

export class GameDevChatService extends Disposable implements IGameDevChatService {
	declare readonly _serviceBrand: undefined;

	private _messages: IChatMessage[] = [];
	private _isStreaming = false;
	private _apiKey: string | undefined;
	private _includeProjectContext = true;
	private _mode: ChatMode = ChatMode.Ask;
	private _model: string = DEFAULT_MODEL_ID;
	private _abortController: AbortController | undefined;
	// Tracks files written during the current stream so we don't double-write in _applyAgentEdits
	private _writtenFilePaths = new Set<string>();

	private readonly _onDidUpdateMessages = this._register(new Emitter<void>());
	readonly onDidUpdateMessages = this._onDidUpdateMessages.event;

	private readonly _onDidStartStreaming = this._register(new Emitter<void>());
	readonly onDidStartStreaming = this._onDidStartStreaming.event;

	private readonly _onDidStopStreaming = this._register(new Emitter<void>());
	readonly onDidStopStreaming = this._onDidStopStreaming.event;

	private readonly _onDidReceiveChunk = this._register(new Emitter<IStreamingChunkEvent>());
	readonly onDidReceiveChunk = this._onDidReceiveChunk.event;

	private readonly _onDidApplyActivity = this._register(new Emitter<IApplyActivityEvent>());
	readonly onDidApplyActivity = this._onDidApplyActivity.event;

	private readonly _onDidChangeMode = this._register(new Emitter<ChatMode>());
	readonly onDidChangeMode = this._onDidChangeMode.event;

	private readonly _onDidChangeModel = this._register(new Emitter<string>());
	readonly onDidChangeModel = this._onDidChangeModel.event;

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
		this._loadModel();
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

	get model(): string {
		return this._model;
	}

	setModel(modelId: string): void {
		if (this._model !== modelId) {
			this._model = modelId;
			this.storageService.store(STORAGE_KEY_MODEL, modelId, StorageScope.PROFILE, StorageTarget.USER);
			this._onDidChangeModel.fire(modelId);
		}
	}

	private _loadModel(): void {
		const stored = this.storageService.get(STORAGE_KEY_MODEL, StorageScope.PROFILE);
		if (stored && AVAILABLE_MODELS.some(m => m.id === stored)) {
			this._model = stored;
		} else {
			this._model = DEFAULT_MODEL_ID;
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
		// Don't save streaming messages; strip large content fields to avoid storage bloat
		const toSave = this._messages.filter(m => !m.isStreaming).map(m => {
			if (!m.appliedFiles) {
				return m;
			}
			return {
				...m,
				appliedFiles: m.appliedFiles.map(f => ({ filePath: f.filePath, status: f.status, error: f.error })),
			};
		});
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
		this._writtenFilePaths = new Set();
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

			// In Agent mode, apply any remaining file edits not written during streaming
			if (this._mode === ChatMode.Agent && assistantMessage.content) {
				assistantMessage.streamingPhase = StreamingPhase.Applying;
				this._onDidReceiveChunk.fire({
					messageId: assistantMessage.id,
					type: 'phase_change',
					phase: StreamingPhase.Applying,
				});

				await this._applyAgentEdits(assistantMessage.content, assistantMessage);
			}

			assistantMessage.isStreaming = false;
			assistantMessage.streamingPhase = StreamingPhase.None;
			this._isStreaming = false;
			this._onDidStopStreaming.fire();
			this._onDidUpdateMessages.fire();
			this._saveMessages();
		}
	}

	/**
	 * Orchestrates the agentic loop: makes API calls, handles tool_use responses
	 * (executes bridge commands), sends tool_result back, and repeats until the
	 * model produces a final end_turn response.
	 */
	private async _streamResponse(assistantMessage: IChatMessage, includeContext: boolean, augmentedContent?: string): Promise<void> {
		// Build messages array for API
		const apiMessages: Array<{ role: string; content: unknown }> = this._messages
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

		// Build system message blocks
		const systemBlocks = this._buildSystemBlocks(includeContext);

		// Tools are only available in Agent mode
		const tools = this._mode === ChatMode.Agent ? [UNITY_BRIDGE_TOOL] : undefined;

		// Fire loading context phase
		this._onDidReceiveChunk.fire({
			messageId: assistantMessage.id,
			type: 'phase_change',
			phase: StreamingPhase.LoadingContext,
		});

		// Thinking timing state (shared across loop iterations)
		const thinkingState = { startTime: Date.now(), finalized: false };

		// Agentic loop — continues while the model wants to call tools
		while (true) {
			if (this._abortController?.signal.aborted) {
				break;
			}

			const { contentBlocks, stopReason } = await this._processApiStream(
				systemBlocks, apiMessages, tools, assistantMessage, thinkingState,
			);

			if (stopReason !== 'tool_use') {
				// Model is done (end_turn, max_tokens, etc.)
				break;
			}

			// Model wants to call tools — build assistant content for the API
			const assistantContent: unknown[] = contentBlocks.map(block => {
				switch (block.type) {
					case 'thinking':
						return { type: 'thinking', thinking: block.thinking, signature: block.signature };
					case 'text':
						return { type: 'text', text: block.text };
					case 'tool_use':
						return {
							type: 'tool_use',
							id: block.toolUseId,
							name: block.toolUseName,
							input: JSON.parse(block.toolInputJson || '{}'),
						};
					default:
						return { type: 'text', text: '' };
				}
			});

			apiMessages.push({ role: 'assistant', content: assistantContent });

			// Execute tool calls and collect results
			const toolResultContent: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = [];

			for (const block of contentBlocks.filter(b => b.type === 'tool_use')) {
				if (this._abortController?.signal.aborted) {
					toolResultContent.push({
						type: 'tool_result',
						tool_use_id: block.toolUseId,
						content: JSON.stringify({ success: false, error: 'Cancelled by user' }),
						is_error: true,
					});
					continue;
				}

				const result = await this._executeBridgeTool(block, assistantMessage);
				toolResultContent.push({
					type: 'tool_result',
					tool_use_id: block.toolUseId,
					content: result.text,
					is_error: result.isError,
				});
			}

			apiMessages.push({ role: 'user', content: toolResultContent });

			if (this._abortController?.signal.aborted) {
				break;
			}
		}

		// Finalize message
		assistantMessage.isStreaming = false;
		assistantMessage.streamingPhase = StreamingPhase.None;
		this._onDidUpdateMessages.fire();
	}

	/** Builds system message blocks for the API request (prompt caching, project context, skills). */
	private _buildSystemBlocks(includeContext: boolean): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
		const projectInfo = this.unityProjectService.currentProject;
		const isUnity = projectInfo?.isUnityProject;
		const projectName = projectInfo?.projectName;

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
			{ type: 'text', text: basePrompt }
		];

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

		if (this._mode === ChatMode.Agent) {
			const isConnected = this.unityBridgeService.isConnected;
			const bridgeSkills = getUnityBridgeSkills(isConnected);
			systemBlocks.push({ type: 'text', text: bridgeSkills });
		}

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

		return systemBlocks;
	}

	/**
	 * Processes a single streaming API call. Returns the content blocks and stop reason.
	 * Updates assistantMessage with text/thinking content as it streams.
	 */
	private async _processApiStream(
		systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>,
		apiMessages: Array<{ role: string; content: unknown }>,
		tools: unknown[] | undefined,
		assistantMessage: IChatMessage,
		thinkingState: { startTime: number; finalized: boolean },
	): Promise<{ contentBlocks: IStreamedContentBlock[]; stopReason: string }> {
		const body: Record<string, unknown> = {
			model: this._model,
			max_tokens: 16000,
			system: systemBlocks,
			messages: apiMessages,
			stream: true,
			thinking: {
				type: 'enabled',
				budget_tokens: 10000,
			},
		};
		if (tools) {
			body.tools = tools;
		}

		// Retry with backoff for rate limit (429) errors
		let response: Response | undefined;
		const maxRetries = 3;
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			response = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': this._apiKey!,
					'anthropic-version': '2023-06-01',
					'anthropic-dangerous-direct-browser-access': 'true',
					'anthropic-beta': 'prompt-caching-2024-07-31,interleaved-thinking-2025-05-14',
				},
				body: JSON.stringify(body),
				signal: this._abortController?.signal,
			});

			if (response.status !== 429 || attempt === maxRetries) {
				break;
			}

			// Parse retry-after header or use exponential backoff
			const retryAfter = response.headers.get('retry-after');
			const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.min(2000 * Math.pow(2, attempt), 60_000);
			await new Promise(resolve => setTimeout(resolve, waitMs));
		}

		const finalResponse = response!;
		if (!finalResponse.ok) {
			const errorText = await finalResponse.text();
			throw new Error(`API error: ${finalResponse.status} - ${errorText}`);
		}

		const reader = finalResponse.body?.getReader();
		if (!reader) {
			throw new Error('No response body');
		}

		const decoder = new TextDecoder();
		let buffer = '';
		let stopReason = 'end_turn';
		const contentBlocks: IStreamedContentBlock[] = [];

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
							const block: IStreamedContentBlock = {
								type: blockType ?? 'text',
								thinking: '',
								signature: '',
								text: '',
								toolUseId: '',
								toolUseName: '',
								toolInputJson: '',
							};

							if (blockType === 'thinking') {
								assistantMessage.streamingPhase = StreamingPhase.Thinking;
								this._onDidReceiveChunk.fire({
									messageId: assistantMessage.id,
									type: 'phase_change',
									phase: StreamingPhase.Thinking,
								});
							} else if (blockType === 'text') {
								if (!thinkingState.finalized) {
									thinkingState.finalized = true;
									assistantMessage.thinkingDurationMs = Date.now() - thinkingState.startTime;
								}
								assistantMessage.streamingPhase = StreamingPhase.Responding;
								this._onDidReceiveChunk.fire({
									messageId: assistantMessage.id,
									type: 'phase_change',
									phase: StreamingPhase.Responding,
								});
							} else if (blockType === 'tool_use') {
								block.toolUseId = parsed.content_block.id ?? '';
								block.toolUseName = parsed.content_block.name ?? '';
								if (!thinkingState.finalized) {
									thinkingState.finalized = true;
									assistantMessage.thinkingDurationMs = Date.now() - thinkingState.startTime;
								}
								assistantMessage.streamingPhase = StreamingPhase.Applying;
								this._onDidReceiveChunk.fire({
									messageId: assistantMessage.id,
									type: 'phase_change',
									phase: StreamingPhase.Applying,
								});
							}

							contentBlocks[parsed.index] = block;
							break;
						}

						case 'content_block_delta': {
							const block = contentBlocks[parsed.index];
							if (!block) {
								break;
							}

							if (parsed.delta?.type === 'thinking_delta') {
								block.thinking += parsed.delta.thinking;
								assistantMessage.thinkingContent = (assistantMessage.thinkingContent || '') + parsed.delta.thinking;
								this._onDidReceiveChunk.fire({
									messageId: assistantMessage.id,
									type: 'thinking_delta',
									text: parsed.delta.thinking,
								});
							} else if (parsed.delta?.type === 'signature_delta') {
								block.signature += parsed.delta.signature;
							} else if (parsed.delta?.type === 'text_delta') {
								block.text += parsed.delta.text;
								assistantMessage.content += parsed.delta.text;
								this._onDidReceiveChunk.fire({
									messageId: assistantMessage.id,
									type: 'text_delta',
									text: parsed.delta.text,
								});
								if (this._mode === ChatMode.Agent) {
									this._tryWriteNewCompletedBlocks(assistantMessage).catch(err => {
										console.error('[GameDevChatService] Incremental write error:', err);
									});
								}
							} else if (parsed.delta?.type === 'input_json_delta') {
								block.toolInputJson += parsed.delta.partial_json;
							}
							break;
						}

						case 'content_block_stop': {
							const block = contentBlocks[parsed.index];
							if (block?.type === 'thinking') {
								if (!thinkingState.finalized) {
									thinkingState.finalized = true;
									assistantMessage.thinkingDurationMs = Date.now() - thinkingState.startTime;
								}
								this._onDidReceiveChunk.fire({
									messageId: assistantMessage.id,
									type: 'thinking_complete',
								});
							}
							break;
						}

						case 'message_delta': {
							if (parsed.delta?.stop_reason) {
								stopReason = parsed.delta.stop_reason;
							}
							break;
						}
					}
				} catch {
					// Ignore parse errors for incomplete chunks
				}
			}
		}

		return { contentBlocks, stopReason };
	}

	/**
	 * Executes bridge commands from a tool_use content block.
	 * Handles compilation retry (waits for Unity domain reload if scripts are not compiled yet).
	 */
	private async _executeBridgeTool(
		block: IStreamedContentBlock,
		assistantMessage: IChatMessage,
	): Promise<{ text: string; isError: boolean }> {
		let input: { commands: Array<{ category: string; action: string; params?: Record<string, unknown> }> };
		try {
			input = JSON.parse(block.toolInputJson || '{}');
		} catch {
			return { text: JSON.stringify({ success: false, error: 'Failed to parse tool input' }), isError: true };
		}

		const commands = input.commands || [];
		if (commands.length === 0) {
			return { text: JSON.stringify({ success: false, error: 'No commands provided' }), isError: true };
		}

		const isConnected = this.unityBridgeService.isConnected;
		if (!isConnected) {
			if (!assistantMessage.bridgeResults) {
				assistantMessage.bridgeResults = [];
			}
			const results = commands.map(cmd => {
				assistantMessage.bridgeResults!.push({
					category: cmd.category,
					action: cmd.action,
					success: false,
					error: 'Unity Editor not connected',
				});
				return { command: `${cmd.category}.${cmd.action}`, success: false, error: 'Unity Editor not connected' };
			});
			this._onDidUpdateMessages.fire();
			return {
				text: JSON.stringify({ success: false, summary: 'Unity Editor not connected', results }),
				isError: true,
			};
		}

		// Fire activity for bridge phase
		this._onDidApplyActivity.fire({
			messageId: assistantMessage.id,
			action: `Running ${commands.length} bridge command${commands.length === 1 ? '' : 's'}`,
			status: 'start',
		});

		// Track script names for compilation retry
		const writtenScriptNames = new Set(
			[...this._writtenFilePaths]
				.filter(p => p.endsWith('.cs'))
				.map(p => (p.split('/').pop() ?? '').replace('.cs', ''))
		);

		const isRetryableError = (error: string | undefined): boolean => {
			if (!error) {
				return false;
			}
			// Connection lost mid-execution (domain reload killed WebSocket)
			if (error.includes('not connected') || error.includes('timeout') || error.includes('WebSocket')) {
				return true;
			}
			// Script not compiled yet
			if (error.includes('Component type not found')) {
				return true;
			}
			if (writtenScriptNames.size > 0) {
				const match = error.match(/Component not found: (\w+)/);
				if (match && writtenScriptNames.has(match[1])) {
					return true;
				}
			}
			return false;
		};

		// Execute commands, collecting results. When we detect a connection drop,
		// stop executing and queue all remaining commands for retry.
		type RetryEntry = { cmd: typeof commands[number]; cmdLabel: string; resultIdx: number };
		const retryQueue: RetryEntry[] = [];
		const results: Array<{ command: string; success: boolean; error?: string; result?: unknown }> = [];
		let connectionLost = false;

		if (!assistantMessage.bridgeResults) {
			assistantMessage.bridgeResults = [];
		}

		for (const cmd of commands) {
			if (this._abortController?.signal.aborted) {
				results.push({ command: `${cmd.category}.${cmd.action}`, success: false, error: 'Cancelled by user' });
				continue;
			}

			const cmdLabel = `${cmd.category}.${cmd.action}`;

			// If connection already dropped, queue remaining commands directly without trying
			if (connectionLost) {
				const resultIdx = results.push({ command: cmdLabel, success: false, error: 'Queued for retry after reconnect' }) - 1;
				retryQueue.push({ cmd, cmdLabel, resultIdx });
				continue;
			}

			this._onDidApplyActivity.fire({ messageId: assistantMessage.id, action: cmdLabel, status: 'start' });

			try {
				const response = await this.unityBridgeService.sendCommand(
					cmd.category as BridgeCommandCategory,
					cmd.action,
					cmd.params,
				);

				const resultIdx = results.push({
					command: cmdLabel,
					success: response.success,
					error: response.error,
					result: response.result,
				}) - 1;

				assistantMessage.bridgeResults!.push({
					category: cmd.category,
					action: cmd.action,
					success: response.success,
					error: response.error,
				});

				if (!response.success && isRetryableError(response.error)) {
					retryQueue.push({ cmd, cmdLabel, resultIdx });
					// Check if this is a connection loss — if so, skip remaining commands
					if (response.error && (response.error.includes('not connected') || response.error.includes('timeout'))) {
						connectionLost = true;
					}
					this._onDidApplyActivity.fire({ messageId: assistantMessage.id, action: cmdLabel, status: 'error', detail: response.error });
				} else {
					this._onDidApplyActivity.fire({
						messageId: assistantMessage.id,
						action: cmdLabel,
						status: response.success ? 'done' : 'error',
						detail: response.error,
					});
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				const resultIdx = results.push({ command: cmdLabel, success: false, error: errorMsg }) - 1;
				assistantMessage.bridgeResults!.push({ category: cmd.category, action: cmd.action, success: false, error: errorMsg });

				if (isRetryableError(errorMsg)) {
					retryQueue.push({ cmd, cmdLabel, resultIdx });
					connectionLost = true;
				}
				this._onDidApplyActivity.fire({ messageId: assistantMessage.id, action: cmdLabel, status: 'error', detail: errorMsg });
			}
		}

		// Retry pass — wait for Unity to reconnect (after domain reload) and replay failed commands
		if (retryQueue.length > 0) {
			// Show "Waiting for compilation" as a visible phase in the chat (like Thinking...)
			assistantMessage.streamingPhase = StreamingPhase.WaitingForCompilation;
			this._onDidReceiveChunk.fire({
				messageId: assistantMessage.id,
				type: 'phase_change',
				phase: StreamingPhase.WaitingForCompilation,
			});
			this._onDidApplyActivity.fire({
				messageId: assistantMessage.id,
				action: `Waiting for Unity to reconnect (${retryQueue.length} commands to retry)`,
				status: 'start',
			});
			this._onDidUpdateMessages.fire();

			const outcome = await this._waitForBridgeReconnect(120_000);

			// Restore the applying phase
			assistantMessage.streamingPhase = StreamingPhase.Applying;
			this._onDidReceiveChunk.fire({
				messageId: assistantMessage.id,
				type: 'phase_change',
				phase: StreamingPhase.Applying,
			});
			this._onDidApplyActivity.fire({
				messageId: assistantMessage.id,
				action: outcome === 'reconnected'
					? `Unity reconnected, retrying ${retryQueue.length} commands`
					: 'Unity reconnection timed out',
				status: 'done',
			});

			if (outcome === 'reconnected') {
				for (const { cmd, cmdLabel, resultIdx } of retryQueue) {
					if (this._abortController?.signal.aborted) {
						break;
					}
					this._onDidApplyActivity.fire({ messageId: assistantMessage.id, action: cmdLabel, status: 'start' });
					try {
						const response = await this.unityBridgeService.sendCommand(
							cmd.category as BridgeCommandCategory,
							cmd.action,
							cmd.params,
						);
						results[resultIdx] = { command: cmdLabel, success: response.success, error: response.error };

						// Update bridge results in the assistant message
						const brIdx = assistantMessage.bridgeResults!.findIndex(
							r => r.category === cmd.category && r.action === cmd.action && !r.success
						);
						if (brIdx >= 0) {
							assistantMessage.bridgeResults![brIdx] = {
								category: cmd.category,
								action: cmd.action,
								success: response.success,
								error: response.error,
							};
						}

						this._onDidApplyActivity.fire({
							messageId: assistantMessage.id,
							action: cmdLabel,
							status: response.success ? 'done' : 'error',
							detail: response.error,
						});
					} catch (error) {
						const errorMsg = error instanceof Error ? error.message : String(error);
						results[resultIdx] = { command: cmdLabel, success: false, error: errorMsg };
						this._onDidApplyActivity.fire({ messageId: assistantMessage.id, action: cmdLabel, status: 'error', detail: errorMsg });
					}
				}
			}
		}

		this._onDidUpdateMessages.fire();

		const allSucceeded = results.every(r => r.success);
		const failedCount = results.filter(r => !r.success).length;
		const summary = allSucceeded
			? `All ${results.length} commands executed successfully.`
			: `${failedCount} of ${results.length} commands failed.`;

		this._onDidApplyActivity.fire({
			messageId: assistantMessage.id,
			action: `Bridge: ${summary}`,
			status: allSucceeded ? 'done' : 'error',
		});

		// Compact results: only include failures (with error) to save tokens.
		// Successes are implied by the summary.
		const compactResults = allSucceeded
			? undefined
			: results.filter(r => !r.success).map(r => ({ command: r.command, error: r.error }));

		return {
			text: JSON.stringify(compactResults
				? { success: false, summary, failed: compactResults }
				: { success: true, summary }),
			isError: !allSucceeded,
		};
	}

	/** Writes any newly completed file blocks found in the current streamed content. Safe to call many times — idempotent via _writtenFilePaths. */
	private async _tryWriteNewCompletedBlocks(assistantMessage: IChatMessage): Promise<void> {
		const blocks = this._parseFileCodeBlocks(assistantMessage.content);
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return;
		}
		const workspaceRoot = folders[0].uri;

		for (const block of blocks) {
			if (this._writtenFilePaths.has(block.filePath)) {
				continue; // already written
			}
			// Mark immediately to prevent concurrent duplicate writes
			this._writtenFilePaths.add(block.filePath);

			const fileUri = URI.joinPath(workspaceRoot, block.filePath);

			this._onDidApplyActivity.fire({
				messageId: assistantMessage.id,
				action: `Writing ${block.filePath}`,
				status: 'start',
			});

			try {
				const exists = await this.fileService.exists(fileUri);
				if (exists) {
					const fileContent = await this.fileService.readFile(fileUri);
					const text = fileContent.value.toString();
					const lines = text.split('\n');
					const fullRange = new Range(1, 1, lines.length, lines[lines.length - 1].length + 1);
					await this.bulkEditService.apply([new ResourceTextEdit(fileUri, { range: fullRange, text: block.code })]);
					if (!assistantMessage.appliedFiles) { assistantMessage.appliedFiles = []; }
					assistantMessage.appliedFiles.push({ filePath: block.filePath, status: 'updated', content: block.code, previousContent: text });
				} else {
					await this.fileService.createFile(fileUri, VSBuffer.fromString(block.code));
					if (!assistantMessage.appliedFiles) { assistantMessage.appliedFiles = []; }
					assistantMessage.appliedFiles.push({ filePath: block.filePath, status: 'created', content: block.code });
				}
				await this.editorService.openEditor({ resource: fileUri });

				this._onDidApplyActivity.fire({
					messageId: assistantMessage.id,
					action: `Writing ${block.filePath}`,
					status: 'done',
				});
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				if (!assistantMessage.appliedFiles) { assistantMessage.appliedFiles = []; }
				assistantMessage.appliedFiles.push({ filePath: block.filePath, status: 'error', error: errorMsg });

				this._onDidApplyActivity.fire({
					messageId: assistantMessage.id,
					action: `Writing ${block.filePath}`,
					status: 'error',
					detail: errorMsg,
				});
			}
		}
	}

	/**
	 * Waits for the Unity bridge to go through a disconnect → reconnect cycle,
	 * which signals that Unity has finished a domain reload (script compilation).
	 * Resolves with 'reconnected' on success or 'timeout' if the wait exceeds timeoutMs.
	 */
	private _waitForBridgeReconnect(timeoutMs: number): Promise<'reconnected' | 'timeout'> {
		return new Promise(resolve => {
			// If already disconnected/reconnecting, we've already seen the disconnect
			let sawDisconnect = this.unityBridgeService.connectionState !== UnityBridgeConnectionState.Connected;

			const timeoutHandle = setTimeout(() => {
				listener.dispose();
				resolve('timeout');
			}, timeoutMs);

			const listener = this.unityBridgeService.onDidChangeConnectionState(state => {
				if (state === UnityBridgeConnectionState.Disconnected || state === UnityBridgeConnectionState.Reconnecting) {
					sawDisconnect = true;
				} else if (state === UnityBridgeConnectionState.Connected && sawDisconnect) {
					clearTimeout(timeoutHandle);
					listener.dispose();
					resolve('reconnected');
				}
			});
		});
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
		// Skip any files already written incrementally during streaming
		const pending = blocks.filter(b => !this._writtenFilePaths.has(b.filePath));
		if (pending.length === 0) {
			return;
		}

		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return;
		}
		const workspaceRoot = folders[0].uri;

		const results: IAppliedFileResult[] = [];

		for (const block of pending) {
			const fileUri = URI.joinPath(workspaceRoot, block.filePath);

			// Fire start activity
			this._onDidApplyActivity.fire({
				messageId: assistantMessage.id,
				action: `Writing ${block.filePath}`,
				status: 'start',
			});

			try {
				const exists = await this.fileService.exists(fileUri);
				if (exists) {
					// Read existing file to get its full range and save for undo
					const fileContent = await this.fileService.readFile(fileUri);
					const text = fileContent.value.toString();
					const lines = text.split('\n');
					const fullRange = new Range(1, 1, lines.length, lines[lines.length - 1].length + 1);
					await this.bulkEditService.apply([new ResourceTextEdit(fileUri, { range: fullRange, text: block.code })]);
					results.push({ filePath: block.filePath, status: 'updated', content: block.code, previousContent: text });
				} else {
					await this.fileService.createFile(fileUri, VSBuffer.fromString(block.code));
					results.push({ filePath: block.filePath, status: 'created', content: block.code });
				}
				await this.editorService.openEditor({ resource: fileUri });

				// Fire done activity
				this._onDidApplyActivity.fire({
					messageId: assistantMessage.id,
					action: `Writing ${block.filePath}`,
					status: 'done',
				});
			} catch (error) {
				console.error(`[GameDevChatService] Failed to apply agent edit to ${block.filePath}:`, error);
				const errorMsg = error instanceof Error ? error.message : String(error);
				results.push({ filePath: block.filePath, status: 'error', error: errorMsg });

				this._onDidApplyActivity.fire({
					messageId: assistantMessage.id,
					action: `Writing ${block.filePath}`,
					status: 'error',
					detail: errorMsg,
				});
			}
		}

		if (results.length > 0) {
			// Merge with files already written incrementally during streaming
			const existing = assistantMessage.appliedFiles ?? [];
			assistantMessage.appliedFiles = [...existing, ...results];
			this._onDidUpdateMessages.fire();
		}
	}

	async undoFile(messageId: string, filePath: string): Promise<void> {
		const message = this._messages.find(m => m.id === messageId);
		if (!message?.appliedFiles) {
			return;
		}

		const fileResult = message.appliedFiles.find(f => f.filePath === filePath);
		if (!fileResult || fileResult.status === 'error' || fileResult.status === 'undone') {
			return;
		}

		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return;
		}
		const workspaceRoot = folders[0].uri;
		const fileUri = URI.joinPath(workspaceRoot, filePath);

		if (fileResult.status === 'created') {
			await this.fileService.del(fileUri);
		} else if (fileResult.status === 'updated' && fileResult.previousContent !== undefined) {
			const lines = fileResult.previousContent.split('\n');
			const fullRange = new Range(1, 1, lines.length, lines[lines.length - 1].length + 1);
			await this.bulkEditService.apply([new ResourceTextEdit(fileUri, { range: fullRange, text: fileResult.previousContent })]);
		}

		fileResult.status = 'undone';
		this._saveMessages();
		this._onDidUpdateMessages.fire();
	}

	clearMessages(): void {
		this._messages = [];
		this._saveMessages();
		this._onDidUpdateMessages.fire();
	}
}
