/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/gamedevChat.css';
import { $, addDisposableListener, append, clearNode, DragAndDropObserver, EventType, getWindow } from '../../../../base/browser/dom.js';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { basename } from '../../../../base/common/resources.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
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
import { ChatMode, IAppliedFileResult, IBridgeCommandResult, IChatMessage, IFileAttachment, IGameDevChatService, IStreamingChunkEvent, StreamingPhase } from './gamedevChatService.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IUnityProjectService } from '../../gamedevUnity/common/types.js';
import { IRenderedMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { ISearchService, QueryType } from '../../../services/search/common/search.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { CodeDataTransfers, containsDragType, extractEditorsDropData } from '../../../../platform/dnd/browser/dnd.js';

export class GameDevChatViewPane extends ViewPane {

	private chatContainer!: HTMLElement;
	private messagesContainer!: HTMLElement;
	private inputContainer!: HTMLElement;
	private inputWrapper!: HTMLElement;
	private inputElement!: HTMLTextAreaElement;
	private apiKeyModal: HTMLElement | undefined;
	private contextBadge: HTMLElement | undefined;

	// Toolbar state
	private stopButton: HTMLElement | undefined;
	private modeButton: HTMLButtonElement | undefined;
	private modeButtonIcon: HTMLElement | undefined;
	private modeButtonText: HTMLElement | undefined;
	private rightToolsContainer: HTMLElement | undefined;

	// Attachment state
	private readonly attachments: IFileAttachment[] = [];
	private attachmentsContainer!: HTMLElement;

	// @ mention popup state
	private mentionPopup: HTMLElement | undefined;
	private mentionItems: { uri: URI; name: string; label: string }[] = [];
	private mentionSelectedIndex = 0;
	private mentionSearchCts: CancellationTokenSource | undefined;
	private mentionQuery = '';
	private readonly mentionSearchScheduler: RunOnceScheduler;

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
	private streamingFileCardsElement: HTMLElement | undefined;
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
		@ISearchService private readonly searchService: ISearchService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILabelService private readonly labelService: ILabelService,
		@IClipboardService private readonly clipboardService: IClipboardService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Structural changes: message added/removed, streaming finished
		this._register(this.chatService.onDidUpdateMessages(() => this.onStructuralUpdate()));

		// Incremental streaming chunks
		this._register(this.chatService.onDidReceiveChunk((chunk) => this.onStreamingChunk(chunk)));

		// Throttled markdown re-render (600ms — higher interval reduces lag during streaming)
		this.markdownRenderScheduler = this._register(new RunOnceScheduler(
			() => this.updateStreamingMarkdown(), 600
		));

		// Debounced @ mention search (150ms)
		this.mentionSearchScheduler = this._register(new RunOnceScheduler(
			() => this.performMentionSearch(), 150
		));

		// Update context badge when analysis finishes
		this._register(this.unityProjectService.onDidFinishAnalysis(() => this.updateContextBadge()));
		this._register(this.unityProjectService.onDidDetectProject(() => this.updateContextBadge()));

		// Stop button visibility
		this._register(this.chatService.onDidStartStreaming(() => this.updateStopButton()));
		this._register(this.chatService.onDidStopStreaming(() => this.updateStopButton()));

		// Mode toggle sync
		this._register(this.chatService.onDidChangeMode(() => this.updateModeButton()));
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
			position: relative;
		`;

		// Text input area
		this.inputWrapper = append(this.inputContainer, $('.input-wrapper'));
		this.inputWrapper.style.cssText = `
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 8px;
			padding: 8px 12px;
			position: relative;
		`;

		// Attachments container (above textarea, inside inputWrapper)
		this.attachmentsContainer = append(this.inputWrapper, $('.gamedev-attachments-container'));
		this.attachmentsContainer.style.cssText = `
			display: none;
			flex-wrap: wrap;
			gap: 4px;
			margin-bottom: 6px;
		`;

		this.inputElement = append(this.inputWrapper, $('textarea')) as HTMLTextAreaElement;
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

		// Auto-resize textarea + check @ mention trigger
		this._register(addDisposableListener(this.inputElement, 'input', () => {
			this.inputElement.style.height = 'auto';
			this.inputElement.style.height = Math.min(this.inputElement.scrollHeight, 200) + 'px';
			this.checkMentionTrigger();
		}));

		// Handle Enter key + keyboard navigation for @ popup
		this._register(addDisposableListener(this.inputElement, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);

			// When popup is open, intercept navigation keys
			if (this.mentionPopup) {
				if (event.keyCode === KeyCode.DownArrow) {
					e.preventDefault();
					this.mentionSelectedIndex = Math.min(this.mentionSelectedIndex + 1, this.mentionItems.length - 1);
					this.renderMentionPopupItems();
					return;
				}
				if (event.keyCode === KeyCode.UpArrow) {
					e.preventDefault();
					this.mentionSelectedIndex = Math.max(this.mentionSelectedIndex - 1, 0);
					this.renderMentionPopupItems();
					return;
				}
				if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Tab) {
					e.preventDefault();
					this.acceptMentionItem();
					return;
				}
				if (event.keyCode === KeyCode.Escape) {
					e.preventDefault();
					this.dismissMentionPopup();
					return;
				}
			}

			if (event.keyCode === KeyCode.Enter && !event.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		}));

		// Drag-and-drop on input wrapper
		this._register(new DragAndDropObserver(this.inputWrapper, {
			onDragOver: (e) => {
				if (containsDragType(e, DataTransfers.FILES, CodeDataTransfers.FILES, CodeDataTransfers.EDITORS)) {
					e.preventDefault();
					this.inputWrapper.style.borderColor = 'var(--vscode-focusBorder)';
					this.inputWrapper.style.borderStyle = 'dashed';
				}
			},
			onDragLeave: () => {
				this.inputWrapper.style.borderColor = 'var(--vscode-input-border)';
				this.inputWrapper.style.borderStyle = 'solid';
			},
			onDrop: async (e) => {
				this.inputWrapper.style.borderColor = 'var(--vscode-input-border)';
				this.inputWrapper.style.borderStyle = 'solid';

				const editors = await extractEditorsDropData(e);
				for (const editor of editors) {
					if (editor.resource) {
						this.addAttachment(editor.resource);
					}
				}
			},
			onDragEnd: () => {
				this.inputWrapper.style.borderColor = 'var(--vscode-input-border)';
				this.inputWrapper.style.borderStyle = 'solid';
			},
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

		// Mode toggle button (Ask / Agent)
		this.modeButton = append(leftTools, $('button.gamedev-mode-btn')) as HTMLButtonElement;
		this.modeButton.style.cssText = `
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
		this.modeButtonIcon = append(this.modeButton, $('span'));
		this.modeButtonIcon.style.fontSize = '14px';
		this.modeButtonText = append(this.modeButton, $('span'));
		const modeArrow = append(this.modeButton, $('span'));
		// allow-any-unicode-next-line
		modeArrow.textContent = '▾';
		modeArrow.style.fontSize = '10px';
		this.updateModeButton();

		this.modeButton.addEventListener('click', () => {
			const current = this.chatService.mode;
			this.chatService.setMode(current === ChatMode.Ask ? ChatMode.Agent : ChatMode.Ask);
		});

		// Right tools container (stop button lives here)
		this.rightToolsContainer = append(toolbar, $('.right-tools'));
		this.rightToolsContainer.style.cssText = 'display: flex; gap: 8px; align-items: center;';

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

	// --- Content stripping for Agent mode ---

	private _prepareDisplayContent(content: string): { displayContent: string; fileCards: { filePath: string; language: string; isComplete: boolean }[] } {
		const fileCards: { filePath: string; language: string; isComplete: boolean }[] = [];
		let cleaned = content;

		// 1. Strip complete file code blocks: ```lang:path/to/file\n...\n```
		cleaned = cleaned.replace(/```(\w+):([^\n]+)\n[\s\S]*?```/g, (_match, lang: string, path: string) => {
			fileCards.push({ filePath: path.trim(), language: lang, isComplete: true });
			return '';
		});

		// 2. Check for incomplete file code block at end (during streaming)
		const incompleteFileMatch = cleaned.match(/```(\w+):([^\n]+)\n[\s\S]*$/);
		if (incompleteFileMatch) {
			fileCards.push({ filePath: incompleteFileMatch[2].trim(), language: incompleteFileMatch[1], isComplete: false });
			cleaned = cleaned.substring(0, incompleteFileMatch.index);
		}

		// 3. Strip complete bridge blocks: ```unity-bridge\n...\n```
		cleaned = cleaned.replace(/```unity-bridge\s*\n[\s\S]*?```/g, '');

		// 4. Strip incomplete bridge block at end
		cleaned = cleaned.replace(/```unity-bridge[\s\S]*$/, '');

		// 5. Strip bare JSON arrays that look like bridge commands
		cleaned = cleaned.replace(/\[\s*\{\s*"category"\s*:\s*"(?:gameObject|component|scene|prefab|asset|editor|project)"[\s\S]*?\}\s*\]/g, '');

		// Clean up excessive blank lines left by stripping
		cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

		return { displayContent: cleaned, fileCards };
	}

	private renderFileCards(container: HTMLElement, cards: { filePath: string; language: string; isComplete: boolean }[], disposables: DisposableStore): void {
		for (const card of cards) {
			const displayLang = GameDevChatViewPane.LANGUAGE_DISPLAY_MAP[card.language] || card.language.toUpperCase();
			const cardEl = append(container, $(`div.gamedev-file-card${card.isComplete ? '' : '.writing'}`));

			const icon = append(cardEl, $('span.file-icon'));
			icon.textContent = card.isComplete ? '\uD83D\uDCC4' : '\u23F3'; // 📄 or ⏳

			const pathEl = append(cardEl, $('span.file-path'));
			pathEl.textContent = card.isComplete ? card.filePath : `Writing ${card.filePath}...`;

			if (displayLang) {
				const langEl = append(cardEl, $('span.file-lang'));
				langEl.textContent = displayLang;
			}

			if (card.isComplete) {
				disposables.add(addDisposableListener(cardEl, EventType.CLICK, () => {
					const folders = this.workspaceContextService.getWorkspace().folders;
					if (folders.length > 0) {
						const fileUri = URI.joinPath(folders[0].uri, card.filePath);
						this.openerService.open(fileUri);
					}
				}));
			}
		}
	}

	private static readonly LANGUAGE_DISPLAY_MAP: Record<string, string> = {
		'csharp': 'C#',
		'cs': 'C#',
		'typescript': 'TypeScript',
		'ts': 'TypeScript',
		'javascript': 'JavaScript',
		'js': 'JavaScript',
		'python': 'Python',
		'py': 'Python',
		'json': 'JSON',
		'xml': 'XML',
		'yaml': 'YAML',
		'yml': 'YAML',
		'html': 'HTML',
		'css': 'CSS',
		'scss': 'SCSS',
		'bash': 'Bash',
		'sh': 'Shell',
		'shell': 'Shell',
		'unity-bridge': 'Unity Bridge',
		'gdscript': 'GDScript',
		'hlsl': 'HLSL',
		'glsl': 'GLSL',
		'shader': 'Shader',
		'cpp': 'C++',
		'c': 'C',
		'lua': 'Lua',
		'rust': 'Rust',
		'go': 'Go',
	};

	private enhanceCodeBlocks(container: HTMLElement, disposables: DisposableStore): void {
		const preElements = container.querySelectorAll('pre');
		for (const pre of preElements) {
			// Skip if already enhanced
			if (pre.parentElement?.classList.contains('gamedev-code-block')) {
				continue;
			}

			const codeEl = pre.querySelector('code');

			// Detect language from code element class
			let language = '';
			if (codeEl) {
				const classes = Array.from(codeEl.classList);
				for (const cls of classes) {
					if (cls.startsWith('language-')) {
						language = cls.substring(9); // remove 'language-' prefix
						break;
					}
				}
			}

			const displayLang = GameDevChatViewPane.LANGUAGE_DISPLAY_MAP[language] || language.toUpperCase() || 'Code';

			// Create wrapper
			const wrapper = document.createElement('div');
			wrapper.className = 'gamedev-code-block';

			// Create header
			const header = document.createElement('div');
			header.className = 'gamedev-code-header';

			const langLabel = document.createElement('span');
			langLabel.className = 'gamedev-code-lang';
			langLabel.textContent = displayLang;
			header.appendChild(langLabel);

			const copyBtn = document.createElement('button');
			copyBtn.className = 'gamedev-code-copy-btn';
			copyBtn.textContent = 'Copy';
			header.appendChild(copyBtn);

			disposables.add(addDisposableListener(copyBtn, 'click', async () => {
				const text = codeEl ? codeEl.textContent || '' : pre.textContent || '';
				await this.clipboardService.writeText(text);
				copyBtn.textContent = 'Copied!';
				copyBtn.classList.add('copied');
				setTimeout(() => {
					copyBtn.textContent = 'Copy';
					copyBtn.classList.remove('copied');
				}, 1500);
			}));

			// Wrap pre element
			pre.parentNode?.insertBefore(wrapper, pre);
			wrapper.appendChild(header);
			wrapper.appendChild(pre);
		}
	}

	private updateStopButton(): void {
		if (this.chatService.isStreaming) {
			if (!this.stopButton && this.rightToolsContainer) {
				this.stopButton = append(this.rightToolsContainer, $('button.gamedev-stop-btn'));
				this.stopButton.style.cssText = `
					display: flex;
					align-items: center;
					gap: 4px;
					background: var(--vscode-button-secondaryBackground);
					border: none;
					color: var(--vscode-errorForeground);
					padding: 4px 10px;
					border-radius: 4px;
					font-size: 12px;
					cursor: pointer;
				`;
				// allow-any-unicode-next-line
				const stopIcon = append(this.stopButton, $('span'));
				stopIcon.textContent = '\u25A0';
				stopIcon.style.fontSize = '10px';
				const stopText = append(this.stopButton, $('span'));
				stopText.textContent = 'Stop';
				this.stopButton.addEventListener('click', () => this.chatService.stopStreaming());
			}
		} else {
			if (this.stopButton) {
				this.stopButton.remove();
				this.stopButton = undefined;
			}
		}
	}

	private updateModeButton(): void {
		if (!this.modeButtonIcon || !this.modeButtonText || !this.modeButton) {
			return;
		}
		const mode = this.chatService.mode;
		if (mode === ChatMode.Agent) {
			// allow-any-unicode-next-line
			this.modeButtonIcon.textContent = '\u221E';
			this.modeButtonText.textContent = 'Agent';
			this.modeButton.title = 'Agent mode: AI writes/edits files in your workspace. Click to switch to Ask mode.';
		} else {
			// allow-any-unicode-next-line
			this.modeButtonIcon.textContent = '\u{1F4AC}';
			this.modeButtonText.textContent = 'Ask';
			this.modeButton.title = 'Ask mode: AI responds in chat with code to copy. Click to switch to Agent mode.';
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

		// File cards container (for Agent mode — shows compact file cards instead of code)
		this.streamingFileCardsElement = append(assistantContainer, $('.streaming-file-cards'));

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
		this.streamingFileCardsElement = undefined;
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

		// In Agent mode, strip file code blocks and bridge commands from display
		const isAgent = this.chatService.mode === ChatMode.Agent;
		let displayContent = content;
		let fileCards: { filePath: string; language: string; isComplete: boolean }[] = [];

		if (isAgent) {
			const prepared = this._prepareDisplayContent(content);
			displayContent = prepared.displayContent;
			fileCards = prepared.fileCards;
		}

		// Dispose previous markdown render
		if (this.streamingMarkdownResult) {
			this.streamingMarkdownResult.dispose();
			this.streamingMarkdownResult = undefined;
		}

		// Render with fillInIncompleteTokens for partial markdown
		if (displayContent) {
			const rendered = this.markdownRendererService.render(
				{ value: displayContent, isTrusted: false },
				{ fillInIncompleteTokens: true },
			);
			this.streamingDisposables.add(rendered);
			this.streamingMarkdownResult = rendered;

			clearNode(this.streamingContentElement);
			this.streamingContentElement.appendChild(rendered.element);
		} else {
			clearNode(this.streamingContentElement);
		}

		// Skip enhanceCodeBlocks during streaming for performance.
		// Code blocks will be enhanced on the final render after streaming completes.

		// Update file cards in Agent mode
		if (isAgent && this.streamingFileCardsElement) {
			clearNode(this.streamingFileCardsElement);
			if (fileCards.length > 0) {
				this.renderFileCards(this.streamingFileCardsElement, fileCards, this.streamingDisposables);
			}
		}

		this.lastRenderedContent = content;
	}

	private autoScrollToBottom(): void {
		if (!this.userHasScrolled && this.messagesContainer) {
			requestAnimationFrame(() => {
				this.messagesContainer.scrollTo({
					top: this.messagesContainer.scrollHeight,
					behavior: 'smooth',
				});
			});
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
			requestAnimationFrame(() => {
				this.messagesContainer.scrollTo({
					top: this.messagesContainer.scrollHeight,
					behavior: 'smooth',
				});
			});
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
			// Show attachment badges above user message
			if (message.attachments && message.attachments.length > 0) {
				const attachBadges = append(messageEl, $('.gamedev-msg-attachments'));
				attachBadges.style.cssText = `
					display: flex;
					flex-wrap: wrap;
					gap: 4px;
				`;
				for (const att of message.attachments) {
					const badge = append(attachBadges, $('span.gamedev-msg-attachment-badge'));
					badge.style.cssText = `
						display: inline-flex;
						align-items: center;
						background: var(--vscode-badge-background);
						color: var(--vscode-badge-foreground);
						padding: 2px 6px;
						border-radius: 4px;
						font-size: 11px;
					`;
					badge.textContent = att.name;
				}
			}

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

				// Message content (markdown) — strip code/bridge blocks in Agent mode
				if (message.content) {
					const isAgent = this.chatService.mode === ChatMode.Agent;
					let displayContent = message.content;
					let fileCards: { filePath: string; language: string; isComplete: boolean }[] = [];

					if (isAgent) {
						const prepared = this._prepareDisplayContent(message.content);
						displayContent = prepared.displayContent;
						fileCards = prepared.fileCards;
					}

					if (displayContent) {
						const contentEl = append(assistantContainer, $('.message-content'));
						const rendered = this.markdownRendererService.render({
							value: displayContent,
							isTrusted: false,
						});
						this.messageDisposables.add(rendered);
						contentEl.appendChild(rendered.element);

						// Only enhance code blocks in Ask mode (Agent mode strips file blocks)
						if (!isAgent) {
							this.enhanceCodeBlocks(contentEl, this.messageDisposables);
						}
					}

					// Render file cards in Agent mode
					if (isAgent && fileCards.length > 0) {
						const fileCardsContainer = append(assistantContainer, $('div.file-cards-container'));
						this.renderFileCards(fileCardsContainer, fileCards, this.messageDisposables);
					}
				}

				// Applied files card
				if (message.appliedFiles && message.appliedFiles.length > 0) {
					this.renderAppliedFiles(assistantContainer, message.appliedFiles);
				}

				// Bridge results card
				if (message.bridgeResults && message.bridgeResults.length > 0) {
					this.renderBridgeResults(assistantContainer, message.bridgeResults);
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
					moreBtn.textContent = '\u22EF';
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

	private renderAppliedFiles(container: HTMLElement, files: IAppliedFileResult[]): void {
		const card = append(container, $('div.gamedev-result-card'));

		const successCount = files.filter(f => f.status !== 'error').length;
		const totalCount = files.length;

		// Header
		const header = append(card, $('div.gamedev-result-card-header'));
		const icon = append(header, $('span.result-icon'));
		icon.textContent = successCount === totalCount ? '\u2705' : '\u26A0\uFE0F'; // checkmark or warning
		const summary = append(header, $('span.result-summary'));
		summary.textContent = `Applied ${totalCount} file ${totalCount === 1 ? 'change' : 'changes'}`;
		const chevron = append(header, $('span.result-chevron'));
		// allow-any-unicode-next-line
		chevron.textContent = '▶';

		// Body (collapsible)
		const body = append(card, $('div.gamedev-result-card-body'));
		const startExpanded = files.length <= 5;
		body.style.display = startExpanded ? 'block' : 'none';
		chevron.style.transform = startExpanded ? 'rotate(90deg)' : 'rotate(0deg)';

		this.messageDisposables.add(addDisposableListener(header, EventType.CLICK, () => {
			const isCollapsed = body.style.display === 'none';
			body.style.display = isCollapsed ? 'block' : 'none';
			chevron.style.transform = isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)';
		}));

		for (const file of files) {
			const isError = file.status === 'error';
			const item = append(body, $(`div.gamedev-result-card-item.${isError ? 'error' : 'success'}.clickable`));

			const itemIcon = append(item, $('span.result-item-icon'));
			itemIcon.textContent = isError ? '\u2717' : '\u2713'; // X or checkmark

			const label = append(item, $('span.result-item-label'));
			const verb = file.status === 'created' ? 'Created' : file.status === 'updated' ? 'Updated' : 'Failed';
			label.textContent = `${verb} ${file.filePath}`;

			if (isError && file.error) {
				const errorText = append(item, $('span.result-item-error'));
				errorText.textContent = file.error;
			}

			if (!isError) {
				this.messageDisposables.add(addDisposableListener(item, EventType.CLICK, () => {
					const folders = this.workspaceContextService.getWorkspace().folders;
					if (folders.length > 0) {
						const fileUri = URI.joinPath(folders[0].uri, file.filePath);
						// Use openerService to open the file in the editor
						this.openerService.open(fileUri);
					}
				}));
			}
		}
	}

	private renderBridgeResults(container: HTMLElement, results: IBridgeCommandResult[]): void {
		const card = append(container, $('div.gamedev-result-card'));

		const successCount = results.filter(r => r.success).length;
		const totalCount = results.length;

		// Header
		const header = append(card, $('div.gamedev-result-card-header'));
		const icon = append(header, $('span.result-icon'));
		icon.textContent = successCount === totalCount ? '\u26A1' : '\u26A0\uFE0F'; // lightning or warning
		const summary = append(header, $('span.result-summary'));
		summary.textContent = `Applied ${totalCount} Unity bridge ${totalCount === 1 ? 'command' : 'commands'}`;
		if (successCount < totalCount) {
			summary.textContent += ` (${totalCount - successCount} failed)`;
		}

		// Copy button
		const copyBtn = append(header, $('button.gamedev-code-copy-btn'));
		copyBtn.textContent = 'Copy';
		this.messageDisposables.add(addDisposableListener(copyBtn, EventType.CLICK, async (e) => {
			e.stopPropagation(); // Don't toggle collapse
			const lines = results.map(r => {
				const status = r.success ? '\u2713' : '\u2717';
				const cmd = `${r.category}.${r.action}`;
				return r.success ? `${status} ${cmd}` : `${status} ${cmd} \u2014 ${r.error ?? 'failed'}`;
			});
			await this.clipboardService.writeText(lines.join('\n'));
			copyBtn.textContent = 'Copied!';
			copyBtn.classList.add('copied');
			setTimeout(() => {
				copyBtn.textContent = 'Copy';
				copyBtn.classList.remove('copied');
			}, 1500);
		}));

		const chevron = append(header, $('span.result-chevron'));
		// allow-any-unicode-next-line
		chevron.textContent = '\u25B6';

		// Body (collapsible)
		const body = append(card, $('div.gamedev-result-card-body'));
		const startExpanded = results.length <= 5;
		body.style.display = startExpanded ? 'block' : 'none';
		chevron.style.transform = startExpanded ? 'rotate(90deg)' : 'rotate(0deg)';

		this.messageDisposables.add(addDisposableListener(header, EventType.CLICK, () => {
			const isCollapsed = body.style.display === 'none';
			body.style.display = isCollapsed ? 'block' : 'none';
			chevron.style.transform = isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)';
		}));

		for (const result of results) {
			const item = append(body, $(`div.gamedev-result-card-item.${result.success ? 'success' : 'error'}`));

			const itemIcon = append(item, $('span.result-item-icon'));
			itemIcon.textContent = result.success ? '\u2713' : '\u2717'; // checkmark or X

			const label = append(item, $('span.result-item-label'));
			label.textContent = `${result.category}.${result.action}`;

			if (!result.success && result.error) {
				const errorSpan = append(item, $('span.result-item-error'));
				errorSpan.textContent = `\u2014 ${result.error}`;
			}
		}
	}

	// --- Attachment management ---

	private addAttachment(uri: URI): void {
		// Avoid duplicates
		if (this.attachments.some(a => a.uri.toString() === uri.toString())) {
			return;
		}
		this.attachments.push({ uri, name: basename(uri) });
		this.renderAttachmentChips();
	}

	private removeAttachment(uri: URI): void {
		const index = this.attachments.findIndex(a => a.uri.toString() === uri.toString());
		if (index >= 0) {
			this.attachments.splice(index, 1);
			this.renderAttachmentChips();
		}
	}

	private clearAttachments(): void {
		this.attachments.length = 0;
		this.renderAttachmentChips();
	}

	private renderAttachmentChips(): void {
		clearNode(this.attachmentsContainer);
		if (this.attachments.length === 0) {
			this.attachmentsContainer.style.display = 'none';
			return;
		}

		this.attachmentsContainer.style.display = 'flex';
		for (const attachment of this.attachments) {
			const chip = append(this.attachmentsContainer, $('.gamedev-attachment-chip'));
			chip.style.cssText = `
				display: inline-flex;
				align-items: center;
				gap: 4px;
				background: var(--vscode-badge-background);
				color: var(--vscode-badge-foreground);
				padding: 2px 6px;
				border-radius: 4px;
				font-size: 11px;
				max-width: 180px;
			`;

			const nameSpan = append(chip, $('span'));
			nameSpan.textContent = attachment.name;
			nameSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

			const removeBtn = append(chip, $('span.gamedev-attachment-remove'));
			// allow-any-unicode-next-line
			removeBtn.textContent = '\u00D7';
			removeBtn.style.cssText = `
				cursor: pointer;
				font-size: 14px;
				line-height: 1;
				opacity: 0.7;
				flex-shrink: 0;
			`;
			removeBtn.addEventListener('click', () => this.removeAttachment(attachment.uri));
		}
	}

	// --- @ mention popup ---

	private checkMentionTrigger(): void {
		const value = this.inputElement.value;
		const cursorPos = this.inputElement.selectionStart ?? value.length;

		// Look backwards from cursor for an unmatched @
		const textBeforeCursor = value.substring(0, cursorPos);
		const atIndex = textBeforeCursor.lastIndexOf('@');

		if (atIndex === -1 || (atIndex > 0 && textBeforeCursor[atIndex - 1] !== ' ' && textBeforeCursor[atIndex - 1] !== '\n')) {
			// No @ or @ is not at word boundary
			this.dismissMentionPopup();
			return;
		}

		const query = textBeforeCursor.substring(atIndex + 1);

		// If there's a space after query started, dismiss (user moved on)
		if (query.includes(' ')) {
			this.dismissMentionPopup();
			return;
		}

		// Show popup and search
		this.showMentionPopup(query);
	}

	private showMentionPopup(query: string): void {
		if (!this.mentionPopup) {
			this.mentionPopup = append(this.inputContainer, $('.gamedev-mention-popup'));
			this.mentionPopup.style.cssText = `
				position: absolute;
				bottom: 100%;
				left: 0;
				right: 0;
				max-height: 250px;
				overflow-y: auto;
				background: var(--vscode-editorSuggestWidget-background, var(--vscode-editor-background));
				border: 1px solid var(--vscode-editorSuggestWidget-border, var(--vscode-panel-border));
				border-radius: 6px;
				margin-bottom: 4px;
				z-index: 100;
				box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
			`;
		}

		// Cancel previous search
		this.mentionSearchCts?.cancel();
		this.mentionSearchCts?.dispose();
		this.mentionSearchCts = new CancellationTokenSource();

		// Store query for the scheduler
		this.mentionQuery = query;
		this.mentionSearchScheduler.schedule();
	}

	private async performMentionSearch(): Promise<void> {
		const query = this.mentionQuery;
		const cts = this.mentionSearchCts;
		if (!cts) {
			return;
		}

		try {
			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) {
				this.mentionItems = [];
				this.renderMentionPopupItems();
				return;
			}

			const results = await this.searchService.fileSearch({
				type: QueryType.File,
				filePattern: query || undefined,
				maxResults: 15,
				sortByScore: true,
				folderQueries: folders.map(f => ({ folder: f.uri })),
			}, cts.token);

			if (cts.token.isCancellationRequested) {
				return;
			}

			this.mentionItems = results.results.map(r => ({
				uri: r.resource,
				name: basename(r.resource),
				label: this.labelService.getUriLabel(r.resource, { relative: true }),
			}));
			this.mentionSelectedIndex = 0;
			this.renderMentionPopupItems();
		} catch {
			// Search cancelled or failed — ignore
		}
	}

	private renderMentionPopupItems(): void {
		if (!this.mentionPopup) {
			return;
		}
		clearNode(this.mentionPopup);

		if (this.mentionItems.length === 0) {
			const emptyEl = append(this.mentionPopup, $('div.gamedev-mention-empty'));
			emptyEl.textContent = 'No files found';
			emptyEl.style.cssText = `
				padding: 8px 12px;
				font-size: 12px;
				color: var(--vscode-descriptionForeground);
			`;
			return;
		}

		for (let i = 0; i < this.mentionItems.length; i++) {
			const item = this.mentionItems[i];
			const itemEl = append(this.mentionPopup, $('div.gamedev-mention-item'));
			itemEl.style.cssText = `
				padding: 6px 10px;
				cursor: pointer;
				display: flex;
				flex-direction: column;
				gap: 1px;
				${i === this.mentionSelectedIndex ? 'background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground);' : ''}
			`;

			const nameEl = append(itemEl, $('span'));
			nameEl.textContent = item.name;
			nameEl.style.cssText = 'font-size: 12px; font-weight: 500;';

			const pathEl = append(itemEl, $('span'));
			pathEl.textContent = item.label;
			pathEl.style.cssText = `
				font-size: 11px;
				opacity: 0.7;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			`;

			itemEl.addEventListener('mouseenter', () => {
				this.mentionSelectedIndex = i;
				this.renderMentionPopupItems();
			});
			itemEl.addEventListener('click', () => {
				this.mentionSelectedIndex = i;
				this.acceptMentionItem();
			});
		}

		// Scroll selected item into view
		const selectedEl = this.mentionPopup.children[this.mentionSelectedIndex] as HTMLElement | undefined;
		selectedEl?.scrollIntoView({ block: 'nearest' });
	}

	private acceptMentionItem(): void {
		if (this.mentionSelectedIndex < 0 || this.mentionSelectedIndex >= this.mentionItems.length) {
			return;
		}

		const item = this.mentionItems[this.mentionSelectedIndex];
		const value = this.inputElement.value;
		const cursorPos = this.inputElement.selectionStart ?? value.length;
		const textBeforeCursor = value.substring(0, cursorPos);
		const atIndex = textBeforeCursor.lastIndexOf('@');

		if (atIndex >= 0) {
			// Replace @query with @filename
			const before = value.substring(0, atIndex);
			const after = value.substring(cursorPos);
			const insertText = `@${item.name} `;
			this.inputElement.value = before + insertText + after;
			this.inputElement.selectionStart = this.inputElement.selectionEnd = before.length + insertText.length;
		}

		this.addAttachment(item.uri);
		this.dismissMentionPopup();
		this.inputElement.focus();
	}

	private dismissMentionPopup(): void {
		if (this.mentionPopup) {
			this.mentionPopup.remove();
			this.mentionPopup = undefined;
		}
		this.mentionItems = [];
		this.mentionSelectedIndex = 0;
		this.mentionSearchCts?.cancel();
		this.mentionSearchCts?.dispose();
		this.mentionSearchCts = undefined;
	}

	// --- User actions ---

	private async sendMessage(): Promise<void> {
		const content = this.inputElement.value.trim();
		if (!content || this.chatService.isStreaming) {
			return;
		}

		// Capture attachments before clearing
		const attachments = this.attachments.length > 0 ? [...this.attachments] : undefined;

		this.inputElement.value = '';
		this.inputElement.style.height = 'auto';
		this.clearAttachments();
		this.dismissMentionPopup();

		try {
			await this.chatService.sendMessage(content, { attachments });
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

	override dispose(): void {
		this.dismissMentionPopup();
		super.dispose();
	}
}
