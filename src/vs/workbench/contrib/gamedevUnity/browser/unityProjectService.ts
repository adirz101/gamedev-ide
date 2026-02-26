/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { UnityProjectDetector } from '../common/unityProjectDetector.js';
import { ProjectAnalyzer } from '../common/projectAnalyzer.js';
import { UnityProjectInfo, ProjectKnowledge, ProjectKnowledgeExport, IUnityProjectService } from '../common/types.js';

export class UnityProjectService extends Disposable implements IUnityProjectService {
	declare readonly _serviceBrand: undefined;

	private _currentProject: UnityProjectInfo | undefined;
	private _projectKnowledge: ProjectKnowledge | undefined;
	private _isAnalyzing = false;
	private _analyzer: ProjectAnalyzer | undefined;

	private readonly detector: UnityProjectDetector;

	private readonly _onDidDetectProject = this._register(new Emitter<UnityProjectInfo>());
	readonly onDidDetectProject = this._onDidDetectProject.event;

	private readonly _onDidStartAnalysis = this._register(new Emitter<void>());
	readonly onDidStartAnalysis = this._onDidStartAnalysis.event;

	private readonly _onDidFinishAnalysis = this._register(new Emitter<ProjectKnowledge>());
	readonly onDidFinishAnalysis = this._onDidFinishAnalysis.event;

	private readonly _onDidFailAnalysis = this._register(new Emitter<Error>());
	readonly onDidFailAnalysis = this._onDidFailAnalysis.event;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this.detector = new UnityProjectDetector(fileService);

		// Auto-detect Unity project on startup
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this.autoDetectProject();
		}));

		// Initial detection
		this.autoDetectProject();
	}

	get currentProject(): UnityProjectInfo | undefined {
		return this._currentProject;
	}

	get projectKnowledge(): ProjectKnowledge | undefined {
		return this._projectKnowledge;
	}

	get isAnalyzing(): boolean {
		return this._isAnalyzing;
	}

	/**
	 * Auto-detect Unity project in workspace
	 */
	private async autoDetectProject(): Promise<void> {
		const folders = this.workspaceContextService.getWorkspace().folders;

		for (const folder of folders) {
			const projectInfo = await this.detectProject(folder.uri.fsPath);
			if (projectInfo.isUnityProject) {
				// Found a Unity project, start analysis
				this.analyzeProject();
				break;
			}
		}
	}

	/**
	 * Detect if a folder is a Unity project
	 */
	async detectProject(folderPath: string): Promise<UnityProjectInfo> {
		const projectInfo = await this.detector.getProjectInfo(folderPath);

		if (projectInfo.isUnityProject) {
			this._currentProject = projectInfo;
			this._onDidDetectProject.fire(projectInfo);
		}

		return projectInfo;
	}

	/**
	 * Analyze the current Unity project
	 */
	async analyzeProject(): Promise<ProjectKnowledge | undefined> {
		if (!this._currentProject?.isUnityProject) {
			console.log('[UnityProjectService] No Unity project detected, skipping analysis');
			return undefined;
		}

		if (this._isAnalyzing) {
			console.log('[UnityProjectService] Already analyzing, returning cached knowledge');
			return this._projectKnowledge;
		}

		console.log('[UnityProjectService] Starting analysis...');
		this._isAnalyzing = true;
		this._onDidStartAnalysis.fire();

		try {
			this._analyzer = new ProjectAnalyzer(
				this._currentProject.projectPath,
				this.fileService
			);

			this._projectKnowledge = await this._analyzer.analyze();
			console.log('[UnityProjectService] Analysis finished, firing onDidFinishAnalysis');
			this._onDidFinishAnalysis.fire(this._projectKnowledge);

			return this._projectKnowledge;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error('[UnityProjectService] Analysis failed:', err);
			this._onDidFailAnalysis.fire(err);
			return undefined;
		} finally {
			this._isAnalyzing = false;
			console.log('[UnityProjectService] isAnalyzing set to false');
		}
	}

	/**
	 * Export project knowledge for AI context
	 */
	exportForAI(): ProjectKnowledgeExport | undefined {
		if (!this._analyzer) {
			return undefined;
		}
		return this._analyzer.exportForAI();
	}

	/**
	 * Build context message for AI
	 */
	buildContextMessage(): string | undefined {
		if (!this._analyzer) {
			return undefined;
		}
		return this._analyzer.buildContextMessage();
	}

	/**
	 * Refresh analysis
	 */
	async refresh(): Promise<void> {
		this._projectKnowledge = undefined;
		this._analyzer = undefined;
		await this.autoDetectProject();
	}
}
