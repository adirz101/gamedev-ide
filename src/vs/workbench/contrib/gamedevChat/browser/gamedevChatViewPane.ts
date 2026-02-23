/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, clearNode, EventType } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
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
import { IChatMessage, IGameDevChatService } from './gamedevChatService.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';

export class GameDevChatViewPane extends ViewPane {

	private chatContainer!: HTMLElement;
	private messagesContainer!: HTMLElement;
	private inputContainer!: HTMLElement;
	private inputElement!: HTMLTextAreaElement;

	private readonly messageDisposables = this._register(new DisposableStore());

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
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Listen to chat service events
		this._register(this.chatService.onDidUpdateMessages(() => this.renderMessages()));
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

		const agentBtn = append(leftTools, $('button'));
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
			cursor: pointer;
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

		const autoBtn = append(leftTools, $('button'));
		autoBtn.style.cssText = `
			display: flex;
			align-items: center;
			gap: 4px;
			background: none;
			border: none;
			color: var(--vscode-foreground);
			padding: 4px 8px;
			font-size: 12px;
			cursor: pointer;
			opacity: 0.7;
		`;
		const autoText = append(autoBtn, $('span'));
		autoText.textContent = 'Auto';
		const autoArrow = append(autoBtn, $('span'));
		// allow-any-unicode-next-line
		autoArrow.textContent = '▾';
		autoArrow.style.fontSize = '10px';

		const rightTools = append(toolbar, $('.right-tools'));
		rightTools.style.cssText = 'display: flex; gap: 8px; align-items: center;';

		const imageBtn = append(rightTools, $('button'));
		// allow-any-unicode-next-line
		imageBtn.textContent = '🖼';
		imageBtn.title = 'Add image';
		imageBtn.style.cssText = `
			background: none;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			font-size: 16px;
			padding: 4px;
			opacity: 0.7;
		`;

		const micBtn = append(rightTools, $('button'));
		// allow-any-unicode-next-line
		micBtn.textContent = '🎤';
		micBtn.title = 'Voice input';
		micBtn.style.cssText = `
			background: none;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			font-size: 16px;
			padding: 4px;
			opacity: 0.7;
		`;

		// Initial render
		this.renderMessages();
	}

	private renderMessages(): void {
		this.messageDisposables.clear();
		clearNode(this.messagesContainer);

		const messages = this.chatService.messages;

		if (messages.length === 0) {
			// Empty state - just show nothing, ready for input
			return;
		}

		for (const message of messages) {
			this.renderMessage(message);
		}

		// Scroll to bottom
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private renderMessage(message: IChatMessage): void {
		const isUser = message.role === 'user';

		const messageEl = append(this.messagesContainer, $('.chat-message'));
		messageEl.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;

		if (isUser) {
			// User message - simple box style like Cursor
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
			// Assistant message - Cursor style with status
			const assistantContainer = append(messageEl, $('.assistant-message'));
			assistantContainer.style.cssText = `display: flex; flex-direction: column; gap: 4px;`;

			// Status line
			if (message.isStreaming) {
				const statusLine = append(assistantContainer, $('.status-line'));
				statusLine.style.cssText = `
					font-size: 12px;
					color: var(--vscode-descriptionForeground);
					display: flex;
					align-items: center;
					gap: 8px;
				`;
				const statusText = append(statusLine, $('span'));
				statusText.textContent = 'Thinking...';
				statusText.style.color = 'var(--vscode-textLink-foreground)';
			}

			// Message content
			const contentEl = append(assistantContainer, $('.message-content'));
			contentEl.style.cssText = `
				font-size: 13px;
				line-height: 1.6;
				color: var(--vscode-foreground);
			`;

			if (message.content) {
				const rendered = this.markdownRendererService.render({
					value: message.content,
					isTrusted: false,
				});
				this.messageDisposables.add(rendered);
				contentEl.appendChild(rendered.element);
			}

			// Actions row (three dots menu)
			if (!message.isStreaming && message.content) {
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
			// Error is handled in service
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.chatContainer.style.height = `${height}px`;
		this.chatContainer.style.width = `${width}px`;
	}
}
