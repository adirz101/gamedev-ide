/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/gamedevChat.css';
import { $, addDisposableListener, append, clearNode, EventType, getWindow } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IChatMessage, IGameDevChatService, IStreamingChunkEvent, StreamingPhase } from './gamedevChatService.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IUnityProjectService } from '../../gamedevUnity/common/types.js';
import { IRenderedMarkdown } from '../../../../base/browser/markdownRenderer.js';

export class GameDevChatViewPane extends ViewPane {

	private chatContainer!: HTMLElement;
	private messagesContainer!: HTMLElement;
	private inputContainer!: HTMLElement;
	private inputElement!: HTMLTextAreaElement;
	private apiKeyModal: HTMLElement | undefined;
	private contextBadge: HTMLElement | undefined;

	private readonly messageDisposables = this._register(new DisposableStore());

	// Streaming state for incremental rendering
	private readonly streamingDisposables = this._register(new DisposableStore());
	private streamingPhaseElement: HTMLElement | undefined;
	private streamingThinkingElement: HTMLElement | undefined;
	private streamingThinkingTextElement: HTMLElement | undefined;
	private streamingThinkingLabelElement: HTMLElement | undefined;
	private streamingThinkingTimerElement: HTMLElement | undefined;
	private streamingThinkingTimerInterval: number | undefined;
	private streamingContentElement: HTMLElement | undefined;
	private streamingMarkdownResult: IRenderedMarkdown | undefined;
	private lastRenderedAssistantContainer: HTMLElement | undefined;
	private currentStreamingMessageId: string | undefined;
	private lastRenderedContent = '';
	private userHasScrolled = false;

	private readonly markdownRenderScheduler: RunOnceScheduler;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IGameDevChatService private readonly chatService: IGameDevChatService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IUnityProjectService private readonly unityProjectService: IUnityProjectService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Structural changes: message added/removed, streaming finished
		this._register(this.chatService.onDidUpdateMessages(() => this.onStructuralUpdate()));

		// Incremental streaming chunks
		this._register(this.chatService.onDidReceiveChunk((chunk) => this.onStreamingChunk(chunk)));

		// Throttled markdown re-render (300ms)
		this.markdownRenderScheduler = this._register(new RunOnceScheduler(
			() => this.updateStreamingMarkdown(), 300
		));

		// Update context badge when analysis finishes
		this._register(this.unityProjectService.onDidFinishAnalysis(() => this.updateContextBadge()));
		this._register(this.unityProjectService.onDidDetectProject(() => this.updateContextBadge()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.chatContainer = append(container, $('.gamedev-chat-container'));
		this.chatContainer.style.cssText = `
			display: flex;
			flex-direction: column;
			height: 100%;
			background: var(--vscode-sideBar-background);
		`;

		// Header
		const header = append(this.chatContainer, $('.gamedev-chat-header'));
		header.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 8px 12px;
			border-bottom: 1px solid var(--vscode-panel-border);
		`;

		const headerTitle = append(header, $('span'));
		headerTitle.textContent = 'General chat';
		headerTitle.style.cssText = `
			font-size: 12px;
			font-weight: 500;
			color: var(--vscode-foreground);
			background: var(--vscode-badge-background);
			padding: 2px 8px;
			border-radius: 4px;
		`;

		const headerActions = append(header, $('.header-actions'));
		headerActions.style.cssText = 'display: flex; gap: 8px;';

		const newChatBtn = append(headerActions, $('button'));
		newChatBtn.textContent = '+';
		newChatBtn.title = 'New chat';
		newChatBtn.style.cssText = `
			background: none;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			font-size: 16px;
			padding: 4px 8px;
			opacity: 0.7;
		`;
		newChatBtn.addEventListener('click', () => this.chatService.clearMessages());

		const historyBtn = append(headerActions, $('button'));
		// allow-any-unicode-next-line
		historyBtn.textContent = '⏱';
		historyBtn.title = 'History';
		historyBtn.style.cssText = `
			background: none;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			font-size: 14px;
			padding: 4px 8px;
			opacity: 0.7;
		`;

		// API Key settings button
		const settingsBtn = append(headerActions, $('button'));
		// allow-any-unicode-next-line
		settingsBtn.textContent = '⚙';
		settingsBtn.title = 'Set API Key';
		settingsBtn.style.cssText = `
			background: none;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			font-size: 14px;
			padding: 4px 8px;
			opacity: 0.7;
		`;
		settingsBtn.addEventListener('click', () => this.promptForApiKey());

		const moreBtn = append(headerActions, $('button'));
		moreBtn.textContent = '⋯';
		moreBtn.title = 'More';
		moreBtn.style.cssText = `
			background: none;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			font-size: 16px;
			padding: 4px 8px;
			opacity: 0.7;
		`;

		// Messages container
		this.messagesContainer = append(this.chatContainer, $('.gamedev-chat-messages'));
		this.messagesContainer.style.cssText = `
			flex: 1;
			overflow-y: auto;
			overflow-x: hidden;
			padding: 16px;
			display: flex;
			flex-direction: column;
			gap: 16px;
		`;

		// Input container
		this.inputContainer = append(this.chatContainer, $('.gamedev-chat-input-container'));
		this.inputContainer.style.cssText = `
			padding: 12px;
			border-top: 1px solid var(--vscode-panel-border);
		`;

		// Text input area
		const inputWrapper = append(this.inputContainer, $('.input-wrapper'));
		inputWrapper.style.cssText = `
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 8px;
			padding: 8px 12px;
		`;

		this.inputElement = append(inputWrapper, $('textarea')) as HTMLTextAreaElement;
		this.inputElement.placeholder = 'Plan, @ for context, / for commands';
		this.inputElement.style.cssText = `
			width: 100%;
			background: transparent;
			border: none;
			outline: none;
			color: var(--vscode-input-foreground);
			font-size: 13px;
			font-family: inherit;
			resize: none;
			min-height: 24px;
			max-height: 200px;
		`;
		this.inputElement.rows = 1;

		// Auto-resize textarea
		this._register(addDisposableListener(this.inputElement, 'input', () => {
			this.inputElement.style.height = 'auto';
			this.inputElement.style.height = Math.min(this.inputElement.scrollHeight, 200) + 'px';
		}));

		// Handle Enter key
		this._register(addDisposableListener(this.inputElement, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Enter && !event.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		}));

		// Bottom toolbar
		const toolbar = append(this.inputContainer, $('.input-toolbar'));
		toolbar.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-top: 8px;
		`;

		const leftTools = append(toolbar, $('.left-tools'));
		leftTools.style.cssText = 'display: flex; gap: 8px; align-items: center;';

		const agentBtn = append(leftTools, $('button')) as HTMLButtonElement;
		agentBtn.disabled = true;
		agentBtn.style.cssText = `
			display: flex;
			align-items: center;
			gap: 4px;
			background: var(--vscode-button-secondaryBackground);
			border: none;
			color: var(--vscode-button-secondaryForeground);
			padding: 4px 10px;
			border-radius: 4px;
			font-size: 12px;
			cursor: not-allowed;
			opacity: 0.5;
		`;
		const agentIcon = append(agentBtn, $('span'));
		// allow-any-unicode-next-line
		agentIcon.textContent = '∞';
		agentIcon.style.fontSize = '14px';
		const agentText = append(agentBtn, $('span'));
		agentText.textContent = 'Agent';
		const agentArrow = append(agentBtn, $('span'));
		// allow-any-unicode-next-line
		agentArrow.textContent = '▾';
		agentArrow.style.fontSize = '10px';

		const autoBtn = append(leftTools, $('button')) as HTMLButtonElement;
		autoBtn.disabled = true;
		autoBtn.style.cssText = `
			display: flex;
			align-items: center;
			gap: 4px;
			background: none;
			border: none;
			color: var(--vscode-foreground);
			padding: 4px 8px;
			font-size: 12px;
			cursor: not-allowed;
			opacity: 0.4;
		`;
		const autoText = append(autoBtn, $('span'));
		autoText.textContent = 'Auto';
		const autoArrow = append(autoBtn, $('span'));
		// allow-any-unicode-next-line
		autoArrow.textContent = '▾';
		autoArrow.style.fontSize = '10px';

		// Project context toggle button
		const contextBtn = append(leftTools, $('button')) as HTMLButtonElement;
		this.contextBadge = contextBtn;
		contextBtn.style.cssText = `
			display: flex;
			align-items: center;
			gap: 5px;
			background: none;
			border: 1px solid transparent;
			color: var(--vscode-foreground);
			padding: 3px 8px;
			border-radius: 4px;
			font-size: 11px;
			cursor: pointer;
			transition: all 0.15s;
		`;

		contextBtn.addEventListener('click', () => {
			const newValue = !this.chatService.includeProjectContext;
			this.chatService.setIncludeProjectContext(newValue);
			this.updateContextBadge();
		});

		this.updateContextBadge();

		// Initial render
		this.renderMessages();
	}

	private updateContextBadge(): void {
		if (!this.contextBadge) {
			return;
		}

		const badge = this.contextBadge;
		const isEnabled = this.chatService.includeProjectContext;
		const hasContext = this.chatService.hasProjectContext();
		const projectName = this.chatService.getProjectName();

		// Clear previous content
		badge.textContent = '';

		if (hasContext && isEnabled) {
			// allow-any-unicode-next-line
			const icon = append(badge, $('span'));
			icon.textContent = '\u{1F3AE}';
			icon.style.fontSize = '12px';
			const label = append(badge, $('span'));
			label.textContent = projectName || 'Unity';
			badge.style.background = 'rgba(122, 162, 247, 0.15)';
			badge.style.borderColor = 'rgba(122, 162, 247, 0.4)';
			badge.style.color = '#7aa2f7';
			badge.style.opacity = '1';
			badge.title = `Project context enabled: ${projectName}\nClick to disable`;
		} else if (hasContext && !isEnabled) {
			// allow-any-unicode-next-line
			const icon = append(badge, $('span'));
			icon.textContent = '\u{1F3AE}';
			icon.style.fontSize = '12px';
			const label = append(badge, $('span'));
			label.textContent = projectName || 'Unity';
			badge.style.background = 'none';
			badge.style.borderColor = 'rgba(255, 255, 255, 0.1)';
			badge.style.color = 'var(--vscode-descriptionForeground)';
			badge.style.opacity = '0.5';
			badge.title = `Project context disabled: ${projectName}\nClick to enable`;
		} else {
			const label = append(badge, $('span'));
			label.textContent = 'No project';
			badge.style.background = 'none';
			badge.style.borderColor = 'transparent';
			badge.style.color = 'var(--vscode-descriptionForeground)';
			badge.style.opacity = '0.4';
			badge.title = 'No Unity project detected in workspace';
			badge.style.pointerEvents = 'none';
		}
	}

	// --- Structural updates (full re-render) ---

	private onStructuralUpdate(): void {
		const messages = this.chatService.messages;
		const lastMessage = messages[messages.length - 1];

		if (lastMessage?.isStreaming && this.currentStreamingMessageId !== lastMessage.id) {
			// New streaming message just appeared — render all then set up streaming
			this.renderMessages();
			this.setupStreamingElements(lastMessage);
		} else if (!lastMessage?.isStreaming) {
			// Streaming finished or messages changed structurally
			this.teardownStreamingElements();
			this.renderMessages();
		}
	}

	// --- Incremental streaming ---

	private onStreamingChunk(chunk: IStreamingChunkEvent): void {
		if (chunk.messageId !== this.currentStreamingMessageId) {
			return;
		}

		switch (chunk.type) {
			case 'phase_change':
				this.updatePhaseIndicator(chunk.phase!);
				break;
			case 'thinking_delta':
				this.appendThinkingText(chunk.text!);
				break;
			case 'thinking_complete':
				this.finalizeThinking();
				break;
			case 'text_delta':
				if (!this.markdownRenderScheduler.isScheduled()) {
					this.markdownRenderScheduler.schedule();
				}
				break;
		}

		this.autoScrollToBottom();
	}

	private setupStreamingElements(message: IChatMessage): void {
		this.teardownStreamingElements();
		this.currentStreamingMessageId = message.id;
		this.lastRenderedContent = '';
		this.userHasScrolled = false;

		// Use the assistant container tracked during renderMessage
		const assistantContainer = this.lastRenderedAssistantContainer;
		if (!assistantContainer) {
			return;
		}
		// Clear the default "Thinking..." placeholder from renderMessage
		clearNode(assistantContainer);

		// Phase indicator
		this.streamingPhaseElement = append(assistantContainer, $('.streaming-phase'));
		this.streamingPhaseElement.style.cssText = `
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 4px 0;
		`;
		this.updatePhaseIndicator(message.streamingPhase ?? StreamingPhase.LoadingContext);

		// Thinking section (hidden until first thinking chunk)
		this.streamingThinkingElement = append(assistantContainer, $('.thinking-section'));
		this.streamingThinkingElement.style.display = 'none';

		// Content area for text streaming
		this.streamingContentElement = append(assistantContainer, $('.message-content'));
		this.streamingContentElement.style.cssText = `
			font-size: 13px;
			line-height: 1.6;
			color: var(--vscode-foreground);
		`;

		// Track user scroll to disable auto-scroll
		this.streamingDisposables.add(addDisposableListener(this.messagesContainer, 'scroll', () => {
			const { scrollTop, scrollHeight, clientHeight } = this.messagesContainer;
			this.userHasScrolled = scrollHeight - scrollTop - clientHeight > 30;
		}));
	}

	private teardownStreamingElements(): void {
		this.streamingDisposables.clear();
		if (this.streamingMarkdownResult) {
			this.messageDisposables.add(this.streamingMarkdownResult);
			this.streamingMarkdownResult = undefined;
		}
		if (this.streamingThinkingTimerInterval) {
			getWindow(this.messagesContainer).clearInterval(this.streamingThinkingTimerInterval);
			this.streamingThinkingTimerInterval = undefined;
		}
		if (this.markdownRenderScheduler.isScheduled()) {
			this.markdownRenderScheduler.cancel();
		}
		this.streamingContentElement = undefined;
		this.streamingThinkingElement = undefined;
		this.streamingThinkingTextElement = undefined;
		this.streamingThinkingLabelElement = undefined;
		this.streamingThinkingTimerElement = undefined;
		this.streamingPhaseElement = undefined;
		this.currentStreamingMessageId = undefined;
		this.lastRenderedContent = '';
		this.userHasScrolled = false;
	}

	private updatePhaseIndicator(phase: StreamingPhase): void {
		if (!this.streamingPhaseElement) {
			return;
		}
		clearNode(this.streamingPhaseElement);

		let text: string;
		switch (phase) {
			case StreamingPhase.LoadingContext:
				text = 'Loading project context...';
				break;
			case StreamingPhase.Thinking:
				text = 'Thinking...';
				break;
			case StreamingPhase.Responding:
				// Hide phase indicator once responding — content speaks for itself
				this.streamingPhaseElement.style.display = 'none';
				return;
			default:
				this.streamingPhaseElement.style.display = 'none';
				return;
		}

		this.streamingPhaseElement.style.display = 'flex';
		const dot = append(this.streamingPhaseElement, $('span.gamedev-pulse-dot'));
		dot.style.cssText = `
			display: inline-block;
			width: 6px;
			height: 6px;
			border-radius: 50%;
			background: var(--vscode-textLink-foreground);
		`;
		const label = append(this.streamingPhaseElement, $('span.gamedev-shimmer'));
		label.textContent = text;
	}

	private appendThinkingText(text: string): void {
		if (!this.streamingThinkingElement) {
			return;
		}

		// Build thinking UI on first chunk
		if (this.streamingThinkingElement.style.display === 'none') {
			this.streamingThinkingElement.style.display = 'block';
			this.buildThinkingUI();
		}

		if (this.streamingThinkingTextElement) {
			this.streamingThinkingTextElement.textContent += text;
			// Auto-scroll thinking content to bottom
			this.streamingThinkingTextElement.scrollTop = this.streamingThinkingTextElement.scrollHeight;
		}
	}

	private buildThinkingUI(): void {
		if (!this.streamingThinkingElement) {
			return;
		}
		clearNode(this.streamingThinkingElement);

		this.streamingThinkingElement.style.cssText = `
			border: 1px solid var(--vscode-panel-border);
			border-radius: 6px;
			margin-bottom: 8px;
			overflow: hidden;
		`;

		// Header
		const header = append(this.streamingThinkingElement, $('.thinking-header'));
		header.style.cssText = `
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 6px 10px;
			cursor: pointer;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
			user-select: none;
		`;

		const chevron = append(header, $('span.thinking-chevron'));
		// allow-any-unicode-next-line
		chevron.textContent = '▶';
		chevron.style.cssText = `
			font-size: 8px;
			transition: transform 0.15s;
		`;

		const label = append(header, $('span.gamedev-shimmer'));
		label.textContent = 'Thinking';
		this.streamingThinkingLabelElement = label;

		this.streamingThinkingTimerElement = append(header, $('span.thinking-timer'));
		this.streamingThinkingTimerElement.style.cssText = `
			margin-left: auto;
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			opacity: 0.7;
		`;
		const startTime = Date.now();
		this.streamingThinkingTimerElement.textContent = '0s';

		const targetWindow = getWindow(this.streamingThinkingElement);
		this.streamingThinkingTimerInterval = targetWindow.setInterval(() => {
			if (this.streamingThinkingTimerElement) {
				const elapsed = Math.floor((Date.now() - startTime) / 1000);
				this.streamingThinkingTimerElement.textContent = `${elapsed}s`;
			}
		}, 1000);

		// Collapsible content area (starts collapsed)
		const contentArea = append(this.streamingThinkingElement, $('div.gamedev-thinking-content'));
		contentArea.style.cssText = `
			padding: 8px 10px;
			font-size: 12px;
			line-height: 1.5;
			color: var(--vscode-descriptionForeground);
			max-height: 200px;
			overflow-y: auto;
			white-space: pre-wrap;
			word-break: break-word;
			display: none;
		`;
		this.streamingThinkingTextElement = contentArea;

		// Toggle collapse
		this.streamingDisposables.add(addDisposableListener(header, EventType.CLICK, () => {
			const isCollapsed = contentArea.style.display === 'none';
			contentArea.style.display = isCollapsed ? 'block' : 'none';
			chevron.style.transform = isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)';
		}));
	}

	private finalizeThinking(): void {
		if (this.streamingThinkingTimerInterval) {
			getWindow(this.messagesContainer).clearInterval(this.streamingThinkingTimerInterval);
			this.streamingThinkingTimerInterval = undefined;
		}

		// Update label from "Thinking" to "Thought for Xs"
		const messages = this.chatService.messages;
		const lastMessage = messages[messages.length - 1];
		if (this.streamingThinkingLabelElement) {
			this.streamingThinkingLabelElement.classList.remove('gamedev-shimmer');
			const seconds = lastMessage?.thinkingDurationMs
				? Math.ceil(lastMessage.thinkingDurationMs / 1000)
				: 0;
			this.streamingThinkingLabelElement.textContent = seconds > 0 ? `Thought for ${seconds}s` : 'Thought';
		}
	}

	private updateStreamingMarkdown(): void {
		if (!this.streamingContentElement) {
			return;
		}

		const messages = this.chatService.messages;
		const lastMessage = messages[messages.length - 1];
		if (!lastMessage || lastMessage.id !== this.currentStreamingMessageId) {
			return;
		}

		const content = lastMessage.content;
		if (!content || content === this.lastRenderedContent) {
			return;
		}

		// Dispose previous markdown render
		if (this.streamingMarkdownResult) {
			this.streamingMarkdownResult.dispose();
			this.streamingMarkdownResult = undefined;
		}

		// Render with fillInIncompleteTokens for partial markdown
		const rendered = this.markdownRendererService.render(
			{ value: content, isTrusted: false },
			{ fillInIncompleteTokens: true },
		);
		this.streamingDisposables.add(rendered);
		this.streamingMarkdownResult = rendered;

		clearNode(this.streamingContentElement);
		this.streamingContentElement.appendChild(rendered.element);

		this.lastRenderedContent = content;
	}

	private autoScrollToBottom(): void {
		if (!this.userHasScrolled && this.messagesContainer) {
			this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
		}
	}

	// --- Static message rendering ---

	private renderMessages(): void {
		this.messageDisposables.clear();
		clearNode(this.messagesContainer);
		this.lastRenderedAssistantContainer = undefined;

		const messages = this.chatService.messages;

		if (messages.length === 0) {
			this.renderWelcome();
			return;
		}

		for (const message of messages) {
			this.renderMessage(message);
		}

		// Scroll to bottom (for non-streaming)
		if (!this.chatService.isStreaming) {
			this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
		}
	}

	private renderWelcome(): void {
		const welcomeContainer = append(this.messagesContainer, $('.welcome-container'));
		welcomeContainer.style.cssText = `
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 100%;
			text-align: center;
			padding: 20px;
		`;

		const welcomeTitle = append(welcomeContainer, $('h2'));
		welcomeTitle.textContent = 'Welcome to GameDev IDE';
		welcomeTitle.style.cssText = `
			font-size: 18px;
			font-weight: 600;
			color: var(--vscode-foreground);
			margin: 0 0 8px 0;
		`;

		const welcomeSubtitle = append(welcomeContainer, $('p'));
		welcomeSubtitle.textContent = 'Ask me anything about your code or game development.';
		welcomeSubtitle.style.cssText = `
			font-size: 13px;
			color: var(--vscode-descriptionForeground);
			margin: 0;
		`;
	}

	private renderMessage(message: IChatMessage): void {
		const isUser = message.role === 'user';

		const messageEl = append(this.messagesContainer, $('.chat-message'));
		messageEl.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

		if (isUser) {
			const userBox = append(messageEl, $('.user-message'));
			userBox.style.cssText = `
				background: var(--vscode-input-background);
				border: 1px solid var(--vscode-input-border);
				border-radius: 8px;
				padding: 10px 14px;
				font-size: 13px;
				color: var(--vscode-foreground);
			`;
			userBox.textContent = message.content;
		} else {
			const assistantContainer = append(messageEl, $('.assistant-message'));
			assistantContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
			this.lastRenderedAssistantContainer = assistantContainer;

			if (message.isStreaming) {
				// Streaming placeholder — setupStreamingElements will replace this
				const statusLine = append(assistantContainer, $('.status-line'));
				statusLine.style.cssText = `
					font-size: 12px;
					color: var(--vscode-descriptionForeground);
					display: flex;
					align-items: center;
					gap: 8px;
				`;
				const dot = append(statusLine, $('span.gamedev-pulse-dot'));
				dot.style.cssText = `
					display: inline-block;
					width: 6px;
					height: 6px;
					border-radius: 50%;
					background: var(--vscode-textLink-foreground);
				`;
				const statusText = append(statusLine, $('span.gamedev-shimmer'));
				statusText.textContent = 'Preparing...';
			} else {
				// Completed message — show thinking section if present
				if (message.thinkingContent) {
					this.renderThinkingSection(assistantContainer, message);
				}

				// Message content (markdown)
				if (message.content) {
					const contentEl = append(assistantContainer, $('.message-content'));
					contentEl.style.cssText = `
						font-size: 13px;
						line-height: 1.6;
						color: var(--vscode-foreground);
					`;

					const rendered = this.markdownRendererService.render({
						value: message.content,
						isTrusted: false,
					});
					this.messageDisposables.add(rendered);
					contentEl.appendChild(rendered.element);
				}

				// Actions row
				if (message.content) {
					const actionsRow = append(assistantContainer, $('.actions-row'));
					actionsRow.style.cssText = `
						display: flex;
						justify-content: flex-end;
						opacity: 0.5;
					`;
					const moreBtn = append(actionsRow, $('button'));
					moreBtn.textContent = '⋯';
					moreBtn.style.cssText = `
						background: none;
						border: none;
						color: var(--vscode-foreground);
						cursor: pointer;
						font-size: 14px;
						padding: 2px 6px;
					`;
				}
			}
		}
	}

	private renderThinkingSection(container: HTMLElement, message: IChatMessage): void {
		const section = append(container, $('.thinking-section-static'));
		section.style.cssText = `
			border: 1px solid var(--vscode-panel-border);
			border-radius: 6px;
			margin-bottom: 8px;
			overflow: hidden;
		`;

		const header = append(section, $('.thinking-header'));
		header.style.cssText = `
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 6px 10px;
			cursor: pointer;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
			user-select: none;
		`;

		const chevron = append(header, $('span'));
		// allow-any-unicode-next-line
		chevron.textContent = '▶';
		chevron.style.cssText = 'font-size: 8px; transition: transform 0.15s;';

		const durationSec = message.thinkingDurationMs
			? Math.ceil(message.thinkingDurationMs / 1000)
			: 0;
		const label = append(header, $('span'));
		label.textContent = durationSec > 0
			? `Thought for ${durationSec}s`
			: 'Thought';

		const contentArea = append(section, $('div.gamedev-thinking-content'));
		contentArea.style.cssText = `
			padding: 8px 10px;
			font-size: 12px;
			line-height: 1.5;
			color: var(--vscode-descriptionForeground);
			max-height: 200px;
			overflow-y: auto;
			white-space: pre-wrap;
			word-break: break-word;
			display: none;
		`;
		contentArea.textContent = message.thinkingContent || '';

		this.messageDisposables.add(addDisposableListener(header, EventType.CLICK, () => {
			const isCollapsed = contentArea.style.display === 'none';
			contentArea.style.display = isCollapsed ? 'block' : 'none';
			chevron.style.transform = isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)';
		}));
	}

	// --- User actions ---

	private async sendMessage(): Promise<void> {
		const content = this.inputElement.value.trim();
		if (!content || this.chatService.isStreaming) {
			return;
		}

		this.inputElement.value = '';
		this.inputElement.style.height = 'auto';

		try {
			await this.chatService.sendMessage(content);
		} catch (error) {
			console.error('[GameDevChatViewPane] sendMessage error:', error);
		}
	}

	private promptForApiKey(): void {
		if (this.apiKeyModal) {
			this.apiKeyModal.remove();
			this.apiKeyModal = undefined;
		}

		const modal = append(this.chatContainer, $('.api-key-modal'));
		this.apiKeyModal = modal;
		modal.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: rgba(0, 0, 0, 0.5);
			display: flex;
			align-items: center;
			justify-content: center;
			z-index: 1000;
		`;

		const dialog = append(modal, $('.api-key-dialog'));
		dialog.style.cssText = `
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 8px;
			padding: 20px;
			width: 300px;
			display: flex;
			flex-direction: column;
			gap: 12px;
		`;

		const title = append(dialog, $('h3'));
		title.textContent = 'Anthropic API Key';
		title.style.cssText = `
			margin: 0;
			font-size: 14px;
			font-weight: 600;
			color: var(--vscode-foreground);
		`;

		const description = append(dialog, $('p'));
		description.textContent = 'Enter your Anthropic API key to enable the AI chat.';
		description.style.cssText = `
			margin: 0;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		`;

		const input = append(dialog, $('input')) as HTMLInputElement;
		input.type = 'password';
		input.placeholder = 'sk-ant-...';
		input.value = this.chatService.getApiKey() || '';
		input.style.cssText = `
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			color: var(--vscode-input-foreground);
			padding: 8px 12px;
			border-radius: 4px;
			font-size: 13px;
		`;

		const buttons = append(dialog, $('.buttons'));
		buttons.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

		const cancelBtn = append(buttons, $('button'));
		cancelBtn.textContent = 'Cancel';
		cancelBtn.style.cssText = `
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: none;
			padding: 6px 12px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
		`;
		const closeModal = () => {
			modal.remove();
			this.apiKeyModal = undefined;
		};

		cancelBtn.addEventListener('click', closeModal);

		const saveBtn = append(buttons, $('button'));
		saveBtn.textContent = 'Save';
		saveBtn.style.cssText = `
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 6px 12px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
		`;
		saveBtn.addEventListener('click', () => {
			const apiKey = input.value.trim();
			if (apiKey) {
				this.chatService.setApiKey(apiKey);
			}
			closeModal();
		});

		modal.addEventListener('click', (e) => {
			if (e.target === modal) {
				closeModal();
			}
		});

		setTimeout(() => input.focus(), 0);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.chatContainer.style.height = `${height}px`;
		this.chatContainer.style.width = `${width}px`;
	}
}
