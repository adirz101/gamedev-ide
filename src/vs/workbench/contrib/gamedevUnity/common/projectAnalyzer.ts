/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import {
	ProjectKnowledge,
	ScriptInfo,
	ClassInfo,
	FieldInfo,
	MethodInfo,
	ParameterInfo,
	PropertyInfo,
	AssetInfo,
	SceneInfo,
	ProjectKnowledgeExport,
	UNITY_CALLBACKS,
	IGNORED_FOLDERS,
} from './types.js';

/**
 * Unity Project Analyzer
 * Scans entire Unity project and builds complete knowledge graph
 */
export class ProjectAnalyzer {
	private knowledge: ProjectKnowledge;

	constructor(
		private readonly projectPath: string,
		private readonly fileService: IFileService
	) {
		const projectName = projectPath.split('/').pop() || 'Unity Project';
		this.knowledge = {
			projectPath,
			projectName,
			scenes: new Map(),
			scripts: new Map(),
			prefabs: new Map(),
			assets: new Map(),
			scriptToGameObjects: new Map(),
			gameObjectToScripts: new Map(),
			prefabInstances: new Map(),
			lastAnalyzed: new Date(),
		};
	}

	/**
	 * Analyze the entire Unity project
	 */
	async analyze(): Promise<ProjectKnowledge> {
		console.log('[ProjectAnalyzer] Starting analysis for:', this.projectPath);

		// Quick test - scan with timeout protection
		const scanPromise = this.scanAssetsFolder();
		const timeoutPromise = new Promise<void>((resolve) => {
			setTimeout(() => {
				console.log('[ProjectAnalyzer] Timeout reached (5s)');
				resolve();
			}, 5000); // 5 second timeout
		});

		await Promise.race([scanPromise, timeoutPromise]);

		this.knowledge.lastAnalyzed = new Date();
		console.log('[ProjectAnalyzer] Analysis complete. Scenes:', this.knowledge.scenes.size, 'Scripts:', this.knowledge.scripts.size, 'Prefabs:', this.knowledge.prefabs.size);
		return this.knowledge;
	}

	/**
	 * Scan the entire Assets folder for all relevant files
	 */
	private async scanAssetsFolder(): Promise<void> {
		const assetsPath = `${this.projectPath}/Assets`;

		try {
			await this.scanDirectory(assetsPath);
		} catch {
			// Assets folder not found
		}
	}

	/**
	 * Recursively scan a directory and categorize files
	 */
	private async scanDirectory(dir: string, depth: number = 0): Promise<void> {
		// Limit depth to prevent infinite recursion
		if (depth > 10) {
			return;
		}

		try {
			const dirUri = URI.file(dir);
			const stat = await this.fileService.resolve(dirUri);

			if (!stat.children) {
				return;
			}

			for (const entry of stat.children) {
				const entryName = entry.name;
				const entryPath = entry.resource.fsPath;

				// Skip ignored folders
				if (entry.isDirectory) {
					if (IGNORED_FOLDERS.includes(entryName)) {
						continue;
					}
					// Recurse into subdirectory
					await this.scanDirectory(entryPath, depth + 1);
				} else {
					// Categorize file by extension
					await this.categorizeFile(entryPath, entryName);
				}
			}
		} catch {
			// Directory doesn't exist or can't be read
		}
	}

	/**
	 * Categorize a file based on its extension
	 */
	private async categorizeFile(filePath: string, fileName: string): Promise<void> {
		const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

		switch (ext) {
			case '.unity':
				this.knowledge.scenes.set(fileName, {
					name: fileName.replace('.unity', ''),
					path: filePath,
					gameObjectCount: 0,
					rootObjectCount: 0,
				});
				break;

			case '.cs':
				try {
					const scriptInfo = await this.parseScript(filePath);
					this.knowledge.scripts.set(filePath, scriptInfo);
				} catch {
					// Failed to parse script
				}
				break;

			case '.prefab':
				this.knowledge.prefabs.set(filePath, {
					path: filePath,
					fileName,
					rootGameObject: fileName.replace('.prefab', ''),
				});
				break;

			case '.png':
			case '.jpg':
			case '.jpeg':
				this.knowledge.assets.set(filePath, { path: filePath, fileName, type: 'sprite' });
				break;

			case '.mp3':
			case '.wav':
			case '.ogg':
				this.knowledge.assets.set(filePath, { path: filePath, fileName, type: 'audio' });
				break;

			case '.mat':
				this.knowledge.assets.set(filePath, { path: filePath, fileName, type: 'material' });
				break;

			case '.anim':
			case '.controller':
				this.knowledge.assets.set(filePath, { path: filePath, fileName, type: 'animation' });
				break;

			case '.shader':
				this.knowledge.assets.set(filePath, { path: filePath, fileName, type: 'shader' });
				break;
		}
	}

	/**
	 * Parse a C# script file
	 */
	private async parseScript(scriptPath: string): Promise<ScriptInfo> {
		const uri = URI.file(scriptPath);
		const fileContent = await this.fileService.readFile(uri);
		const content = fileContent.value.toString();
		const fileName = scriptPath.split('/').pop() || 'script.cs';

		// Extract namespace
		const namespaceMatch = content.match(/namespace\s+([\w.]+)/);
		const namespace = namespaceMatch ? namespaceMatch[1] : undefined;

		// Extract imports
		const importMatches = content.matchAll(/using\s+([\w.]+);/g);
		const imports = Array.from(importMatches).map((m) => m[1]);

		// Extract classes
		const classes = this.extractClasses(content);

		return {
			path: scriptPath,
			fileName,
			namespace,
			classes,
			imports,
		};
	}

	/**
	 * Extract class information from C# code
	 */
	private extractClasses(content: string): ClassInfo[] {
		const classes: ClassInfo[] = [];
		const classMatches = content.matchAll(
			/(?:public|private|protected|internal)?\s*(?:partial\s+)?class\s+(\w+)\s*(?::\s*([\w,\s<>]+))?/g
		);

		for (const match of classMatches) {
			const className = match[1];
			const extendsClause = match[2]?.trim();
			const isMonoBehaviour = extendsClause?.includes('MonoBehaviour') || false;

			// Extract fields
			const fields = this.extractFields(content);

			// Extract methods
			const methods = this.extractMethods(content);

			// Extract properties
			const properties = this.extractProperties(content);

			classes.push({
				name: className,
				extends: extendsClause,
				fields,
				methods,
				properties,
				isMonoBehaviour,
			});
		}

		return classes;
	}

	/**
	 * Extract field information
	 */
	private extractFields(content: string): FieldInfo[] {
		const fields: FieldInfo[] = [];
		const fieldMatches = content.matchAll(
			/(?:\[SerializeField\]\s*)?(public|private|protected|internal)\s+([\w<>[\],\s]+)\s+(\w+)(?:\s*=\s*[^;]+)?;/g
		);

		for (const match of fieldMatches) {
			const isSerializeField = match[0].includes('[SerializeField]');
			const visibility = match[1] as 'public' | 'private' | 'protected' | 'internal';
			const type = match[2].trim();
			const name = match[3];

			fields.push({
				name,
				type,
				accessModifier: visibility,
				isSerializeField,
			});
		}

		return fields;
	}

	/**
	 * Extract method information
	 */
	private extractMethods(content: string): MethodInfo[] {
		const methods: MethodInfo[] = [];
		const methodMatches = content.matchAll(
			/(public|private|protected|internal)\s+(?:static\s+)?(?:virtual\s+)?(?:override\s+)?(?:async\s+)?([\w<>[\]]+)\s+(\w+)\s*\(([^)]*)\)/g
		);

		for (const match of methodMatches) {
			const visibility = match[1] as 'public' | 'private' | 'protected' | 'internal';
			const returnType = match[2];
			const name = match[3];
			const paramsStr = match[4];

			// Check if this is a Unity callback
			const isUnityCallback = UNITY_CALLBACKS.includes(name);

			// Parse parameters
			const parameters: ParameterInfo[] = [];
			if (paramsStr.trim()) {
				const paramParts = paramsStr.split(',');
				for (const part of paramParts) {
					const paramMatch = part.trim().match(/([\w<>[\]]+)\s+(\w+)/);
					if (paramMatch) {
						parameters.push({
							type: paramMatch[1],
							name: paramMatch[2],
						});
					}
				}
			}

			methods.push({
				name,
				returnType,
				parameters,
				accessModifier: visibility,
				isUnityCallback,
			});
		}

		return methods;
	}

	/**
	 * Extract property information
	 */
	private extractProperties(content: string): PropertyInfo[] {
		const properties: PropertyInfo[] = [];
		const propertyMatches = content.matchAll(
			/(?:public|private|protected|internal)\s+([\w<>[\]]+)\s+(\w+)\s*{\s*(get[^}]*)?;?\s*(set[^}]*)?;?\s*}/g
		);

		for (const match of propertyMatches) {
			const type = match[1];
			const name = match[2];
			const hasGetter = !!match[3];
			const hasSetter = !!match[4];

			properties.push({
				name,
				type,
				hasGetter,
				hasSetter,
			});
		}

		return properties;
	}

	/**
	 * Get the project knowledge
	 */
	getKnowledge(): ProjectKnowledge {
		return this.knowledge;
	}

	/**
	 * Export knowledge for AI agent context
	 */
	exportForAI(): ProjectKnowledgeExport {
		const scripts = Array.from(this.knowledge.scripts.values());
		const limitedScripts = scripts.slice(0, 20);

		return {
			projectName: this.knowledge.projectName,
			overview: {
				sceneCount: this.knowledge.scenes.size,
				scriptCount: this.knowledge.scripts.size,
				prefabCount: this.knowledge.prefabs.size,
				assetCount: this.knowledge.assets.size,
			},
			scenes: Array.from(this.knowledge.scenes.values()).map(scene => ({
				name: scene.name,
				gameObjectCount: scene.gameObjectCount,
				rootCount: scene.rootObjectCount,
			})),
			scripts: limitedScripts.map(script => ({
				fileName: script.fileName,
				classes: script.classes.map(c => ({
					name: c.name,
					isMonoBehaviour: c.isMonoBehaviour,
					methodCount: c.methods.length,
					methods: c.methods.slice(0, 10).map(m => m.name),
				})),
			})),
			prefabs: Array.from(this.knowledge.prefabs.values()).map(p => p.fileName),
			lastAnalyzed: this.knowledge.lastAnalyzed.toISOString(),
		};
	}

	/**
	 * Build context message for AI
	 */
	buildContextMessage(): string {
		const data = this.exportForAI();

		let context = `You are an AI assistant helping with a Unity game development project.\n`;
		context += `Project: ${data.projectName}\n\n`;

		context += `## Project Overview\n`;
		context += `- Scenes: ${data.overview.sceneCount}\n`;
		context += `- Scripts: ${data.overview.scriptCount}\n`;
		context += `- Prefabs: ${data.overview.prefabCount}\n`;
		context += `- Total Assets: ${data.overview.assetCount}\n\n`;

		if (data.scenes.length > 0) {
			context += `## Scenes\n`;
			for (const scene of data.scenes) {
				context += `- ${scene.name}: ${scene.gameObjectCount} GameObjects (${scene.rootCount} root)\n`;
			}
			context += `\n`;
		}

		if (data.scripts.length > 0) {
			context += `## Scripts\n`;
			for (const script of data.scripts.slice(0, 10)) {
				context += `- ${script.fileName}\n`;
				for (const cls of script.classes) {
					const mbTag = cls.isMonoBehaviour ? ' (MonoBehaviour)' : '';
					context += `  - Class: ${cls.name}${mbTag}\n`;
					if (cls.methods.length > 0) {
						context += `    Methods: ${cls.methods.join(', ')}\n`;
					}
				}
			}
			if (data.scripts.length > 10) {
				context += `  ... and ${data.scripts.length - 10} more scripts\n`;
			}
			context += `\n`;
		}

		if (data.prefabs.length > 0) {
			context += `## Prefabs\n`;
			for (const prefab of data.prefabs.slice(0, 10)) {
				context += `- ${prefab}\n`;
			}
			if (data.prefabs.length > 10) {
				context += `... and ${data.prefabs.length - 10} more prefabs\n`;
			}
			context += `\n`;
		}

		context += `Please help me work on this Unity project.\n`;

		return context;
	}
}
