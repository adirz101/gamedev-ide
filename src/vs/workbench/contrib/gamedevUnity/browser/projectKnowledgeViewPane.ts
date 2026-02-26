/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode } from '../../../../base/browser/dom.js';
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
import { IUnityProjectService } from '../common/types.js';
import { IUnityBridgeService, UnityBridgeConnectionState } from '../common/bridgeTypes.js';

export class ProjectKnowledgeViewPane extends ViewPane {

	private container!: HTMLElement;
	private contentContainer!: HTMLElement;
	private bridgeStatusElement: HTMLElement | undefined;
	private readonly viewDisposables = this._register(new DisposableStore());

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
		@IUnityProjectService private readonly unityService: IUnityProjectService,
		@IUnityBridgeService private readonly bridgeService: IUnityBridgeService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		console.log('[ProjectKnowledgeViewPane] Constructor - registering event handlers');

		// Listen to service events
		this._register(this.unityService.onDidDetectProject(() => {
			console.log('[ProjectKnowledgeViewPane] onDidDetectProject event received');
			this.updateContent();
		}));
		this._register(this.unityService.onDidStartAnalysis(() => {
			console.log('[ProjectKnowledgeViewPane] onDidStartAnalysis event received');
			this.renderAnalyzing();
		}));
		this._register(this.unityService.onDidFinishAnalysis(() => {
			console.log('[ProjectKnowledgeViewPane] onDidFinishAnalysis event received');
			this.updateContent();
		}));
		this._register(this.unityService.onDidFailAnalysis(() => {
			console.log('[ProjectKnowledgeViewPane] onDidFailAnalysis event received');
			this.renderError();
		}));

		// Bridge connection state
		this._register(this.bridgeService.onDidChangeConnectionState(() => {
			this.updateBridgeStatus();
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = append(container, $('.gamedev-project-container'));
		this.container.style.cssText = `
			display: flex;
			flex-direction: column;
			height: 100%;
			background: var(--vscode-sideBar-background);
			overflow-y: auto;
		`;

		// Bridge connection status bar
		this.bridgeStatusElement = append(this.container, $('.bridge-status'));
		this.bridgeStatusElement.style.cssText = `
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 6px 12px;
			font-size: 11px;
			border-bottom: 1px solid var(--vscode-panel-border);
			cursor: pointer;
		`;
		this.bridgeStatusElement.addEventListener('click', () => {
			if (this.bridgeService.isConnected) {
				this.bridgeService.disconnect();
			} else {
				this.bridgeService.connect();
			}
		});
		this.updateBridgeStatus();

		this.contentContainer = append(this.container, $('.content'));
		this.contentContainer.style.cssText = `
			padding: 16px;
			display: flex;
			flex-direction: column;
			gap: 16px;
		`;

		console.log('[ProjectKnowledgeViewPane] renderBody called, updating content');
		this.updateContent();

		// Also poll for state changes in case events were missed during initialization
		setTimeout(() => {
			console.log('[ProjectKnowledgeViewPane] Delayed updateContent check');
			this.updateContent();
		}, 1000);

		setTimeout(() => {
			console.log('[ProjectKnowledgeViewPane] Second delayed updateContent check');
			this.updateContent();
		}, 6000); // After the 5s analysis timeout
	}

	private updateBridgeStatus(): void {
		if (!this.bridgeStatusElement) {
			return;
		}
		clearNode(this.bridgeStatusElement);

		const state = this.bridgeService.connectionState;

		// Status dot
		const dot = append(this.bridgeStatusElement, $('span'));
		dot.style.cssText = `
			display: inline-block;
			width: 8px;
			height: 8px;
			border-radius: 50%;
			flex-shrink: 0;
		`;

		const label = append(this.bridgeStatusElement, $('span'));
		label.style.cssText = 'flex: 1;';

		switch (state) {
			case UnityBridgeConnectionState.Connected:
				dot.style.background = '#73c991';
				label.textContent = 'Unity Editor connected';
				this.bridgeStatusElement.title = 'Click to disconnect from Unity Editor';
				break;
			case UnityBridgeConnectionState.Connecting:
			case UnityBridgeConnectionState.Reconnecting:
				dot.style.background = '#cca700';
				label.textContent = state === UnityBridgeConnectionState.Reconnecting ? 'Reconnecting...' : 'Connecting...';
				this.bridgeStatusElement.title = 'Attempting to connect to Unity Editor';
				break;
			default:
				dot.style.background = '#666';
				label.textContent = 'Unity Editor disconnected';
				this.bridgeStatusElement.title = 'Click to connect to Unity Editor\nMake sure GameDevIDEBridge.cs is in Assets/Editor/';
				break;
		}
	}

	private updateContent(): void {
		if (!this.contentContainer) {
			console.log('[ProjectKnowledgeViewPane] updateContent: contentContainer not ready');
			return; // Not yet rendered
		}
		this.viewDisposables.clear();
		clearNode(this.contentContainer);

		const project = this.unityService.currentProject;
		const knowledge = this.unityService.projectKnowledge;

		console.log('[ProjectKnowledgeViewPane] updateContent: project=', project?.isUnityProject, 'isAnalyzing=', this.unityService.isAnalyzing, 'hasKnowledge=', !!knowledge);

		if (!project?.isUnityProject) {
			console.log('[ProjectKnowledgeViewPane] Rendering: No Project');
			this.renderNoProject();
			return;
		}

		if (this.unityService.isAnalyzing) {
			console.log('[ProjectKnowledgeViewPane] Rendering: Analyzing');
			this.renderAnalyzing();
			return;
		}

		if (!knowledge) {
			console.log('[ProjectKnowledgeViewPane] Rendering: No Knowledge');
			this.renderNoKnowledge();
			return;
		}

		console.log('[ProjectKnowledgeViewPane] Rendering: Full content with', knowledge.scenes.size, 'scenes,', knowledge.scripts.size, 'scripts');

		// Project header
		const header = append(this.contentContainer, $('.project-header'));
		header.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 4px;
			padding-bottom: 12px;
			border-bottom: 1px solid var(--vscode-panel-border);
		`;

		const projectName = append(header, $('h3'));
		projectName.textContent = project.projectName || 'Unity Project';
		projectName.style.cssText = `
			margin: 0;
			font-size: 14px;
			font-weight: 600;
			color: var(--vscode-foreground);
		`;

		if (project.unityVersion) {
			const version = append(header, $('span'));
			version.textContent = `Unity ${project.unityVersion}`;
			version.style.cssText = `
				font-size: 11px;
				color: var(--vscode-descriptionForeground);
			`;
		}

		// Stats grid
		const stats = append(this.contentContainer, $('.stats-grid'));
		stats.style.cssText = `
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 8px;
		`;

		this.renderStatCard(stats, 'Scenes', knowledge.scenes.size.toString());
		this.renderStatCard(stats, 'Scripts', knowledge.scripts.size.toString());
		this.renderStatCard(stats, 'Prefabs', knowledge.prefabs.size.toString());
		this.renderStatCard(stats, 'Assets', knowledge.assets.size.toString());

		// Scenes section
		if (knowledge.scenes.size > 0) {
			this.renderSection('Scenes', Array.from(knowledge.scenes.values()).map(s =>
				`${s.name} (${s.gameObjectCount} objects)`
			));
		}

		// Scripts section
		if (knowledge.scripts.size > 0) {
			const scriptSummary: string[] = [];
			for (const script of Array.from(knowledge.scripts.values()).slice(0, 10)) {
				for (const cls of script.classes) {
					const mbTag = cls.isMonoBehaviour ? ' [MB]' : '';
					scriptSummary.push(`${cls.name}${mbTag}`);
				}
			}
			if (knowledge.scripts.size > 10) {
				scriptSummary.push(`... +${knowledge.scripts.size - 10} more`);
			}
			this.renderSection('Classes', scriptSummary);
		}

		// Prefabs section
		if (knowledge.prefabs.size > 0) {
			this.renderSection('Prefabs', Array.from(knowledge.prefabs.values()).slice(0, 10).map(p => p.fileName));
		}

		// Refresh button
		const refreshBtn = append(this.contentContainer, $('button'));
		refreshBtn.textContent = 'Refresh Analysis';
		refreshBtn.style.cssText = `
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: none;
			padding: 8px 16px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
			margin-top: 8px;
		`;
		refreshBtn.addEventListener('click', () => this.unityService.refresh());

		// Last analyzed
		const lastAnalyzed = append(this.contentContainer, $('span'));
		lastAnalyzed.textContent = `Last analyzed: ${knowledge.lastAnalyzed.toLocaleTimeString()}`;
		lastAnalyzed.style.cssText = `
			font-size: 10px;
			color: var(--vscode-descriptionForeground);
			text-align: center;
		`;
	}

	private renderStatCard(parent: HTMLElement, label: string, value: string): void {
		const card = append(parent, $('.stat-card'));
		card.style.cssText = `
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 6px;
			padding: 10px;
			text-align: center;
		`;

		const valueEl = append(card, $('div'));
		valueEl.textContent = value;
		valueEl.style.cssText = `
			font-size: 20px;
			font-weight: 600;
			color: var(--vscode-foreground);
		`;

		const labelEl = append(card, $('div'));
		labelEl.textContent = label;
		labelEl.style.cssText = `
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-top: 2px;
		`;
	}

	private renderSection(title: string, items: string[]): void {
		const section = append(this.contentContainer, $('.section'));
		section.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 6px;
		`;

		const titleEl = append(section, $('h4'));
		titleEl.textContent = title;
		titleEl.style.cssText = `
			margin: 0;
			font-size: 12px;
			font-weight: 600;
			color: var(--vscode-foreground);
			text-transform: uppercase;
			letter-spacing: 0.5px;
		`;

		const list = append(section, $('ul'));
		list.style.cssText = `
			margin: 0;
			padding: 0;
			list-style: none;
		`;

		for (const item of items) {
			const li = append(list, $('li'));
			li.textContent = item;
			li.style.cssText = `
				font-size: 12px;
				color: var(--vscode-descriptionForeground);
				padding: 2px 0;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			`;
		}
	}

	private renderNoProject(): void {
		if (!this.contentContainer) {
			return;
		}
		clearNode(this.contentContainer);

		const message = append(this.contentContainer, $('.no-project'));
		message.style.cssText = `
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 200px;
			text-align: center;
			gap: 8px;
		`;

		const title = append(message, $('h3'));
		title.textContent = 'No Unity Project';
		title.style.cssText = `
			margin: 0;
			font-size: 14px;
			font-weight: 500;
			color: var(--vscode-foreground);
		`;

		const subtitle = append(message, $('p'));
		subtitle.textContent = 'Open a folder containing a Unity project to see its structure.';
		subtitle.style.cssText = `
			margin: 0;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		`;
	}

	private renderAnalyzing(): void {
		if (!this.contentContainer) {
			return;
		}
		clearNode(this.contentContainer);

		const message = append(this.contentContainer, $('.analyzing'));
		message.style.cssText = `
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 200px;
			text-align: center;
			gap: 12px;
		`;

		const spinner = append(message, $('div'));
		spinner.textContent = 'Analyzing...';
		spinner.style.cssText = `
			font-size: 14px;
			color: var(--vscode-textLink-foreground);
		`;

		const subtitle = append(message, $('p'));
		subtitle.textContent = 'Scanning scenes, scripts, prefabs, and assets...';
		subtitle.style.cssText = `
			margin: 0;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		`;
	}

	private renderNoKnowledge(): void {
		if (!this.contentContainer) {
			return;
		}
		clearNode(this.contentContainer);

		const message = append(this.contentContainer, $('.no-knowledge'));
		message.style.cssText = `
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 200px;
			text-align: center;
			gap: 12px;
		`;

		const title = append(message, $('h3'));
		title.textContent = 'Unity Project Detected';
		title.style.cssText = `
			margin: 0;
			font-size: 14px;
			font-weight: 500;
			color: var(--vscode-foreground);
		`;

		const analyzeBtn = append(message, $('button'));
		analyzeBtn.textContent = 'Analyze Project';
		analyzeBtn.style.cssText = `
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 8px 16px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
		`;
		analyzeBtn.addEventListener('click', () => this.unityService.analyzeProject());
	}

	private renderError(): void {
		if (!this.contentContainer) {
			return;
		}
		clearNode(this.contentContainer);

		const message = append(this.contentContainer, $('.error'));
		message.style.cssText = `
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 200px;
			text-align: center;
			gap: 12px;
		`;

		const title = append(message, $('h3'));
		title.textContent = 'Analysis Failed';
		title.style.cssText = `
			margin: 0;
			font-size: 14px;
			font-weight: 500;
			color: var(--vscode-errorForeground);
		`;

		const retryBtn = append(message, $('button'));
		retryBtn.textContent = 'Retry';
		retryBtn.style.cssText = `
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 8px 16px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
		`;
		retryBtn.addEventListener('click', () => this.unityService.analyzeProject());
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.container.style.height = `${height}px`;
		this.container.style.width = `${width}px`;
	}
}
