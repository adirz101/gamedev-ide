/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import * as yaml from '../../../../base/common/yaml.js';
import { UnityScene, UnityGameObject, UNITY_COMPONENT_TYPES } from './types.js';

type YamlValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

/**
 * Unity Scene Parser
 * Parses .unity scene files (YAML format) and extracts GameObject hierarchy
 */
export class UnitySceneParser {

	constructor(
		private readonly fileService: IFileService
	) { }

	/**
	 * Parse a Unity scene file
	 */
	async parseScene(scenePath: string): Promise<UnityScene> {
		const sceneUri = URI.file(scenePath);
		const content = await this.fileService.readFile(sceneUri);
		const text = content.value.toString();

		// Unity scene files contain multiple YAML documents separated by ---
		const documents = text.split('---').filter(doc => doc.trim().length > 0);

		const gameObjects = new Map<string, RawGameObject>();
		const transforms = new Map<string, RawTransform>();
		const components = new Map<string, string>(); // Map of fileID -> component type name

		// First pass: collect all GameObjects and Transforms
		for (const doc of documents) {
			try {
				// Skip YAML directive documents
				if (doc.trim().startsWith('%YAML') || doc.trim().startsWith('%TAG')) {
					continue;
				}

				// Extract fileID BEFORE stripping tags
				const fileID = this.extractFileID(doc);

				// Strip Unity tags before parsing
				const cleanedDoc = this.stripUnityTags(doc);

				// Parse YAML
				const errors: yaml.YamlParseError[] = [];
				const parsed = yaml.parse(cleanedDoc, errors);

				if (!parsed || parsed.type !== 'map') {
					continue;
				}

				// Convert YamlMapNode to a simple object
				const obj = this.yamlNodeToObject(parsed);
				if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
					continue;
				}

				// Type guard: obj is now Record<string, unknown>
				const record = obj as Record<string, unknown>;

				// Check if this is a GameObject
				if (record.GameObject) {
					const go = record.GameObject as Record<string, unknown>;
					gameObjects.set(fileID, {
						fileID,
						name: (go.m_Name as string) || 'GameObject',
						tag: go.m_TagString as string | undefined,
						layer: go.m_Layer as number | undefined,
						isActive: go.m_IsActive !== 0,
						components: (go.m_Component as Array<{ component?: { fileID?: number } }>) || [],
					});
				}

				// Check if this is a Transform
				if (record.Transform || record.RectTransform) {
					const transform = (record.Transform || record.RectTransform) as Record<string, unknown>;
					const componentType = record.Transform ? 'Transform' : 'RectTransform';
					const mGameObject = transform.m_GameObject as { fileID?: number } | undefined;
					transforms.set(fileID, {
						fileID,
						type: componentType,
						gameObjectFileID: mGameObject?.fileID ? String(mGameObject.fileID) : undefined,
						children: (transform.m_Children as unknown[]) || [],
						father: transform.m_Father as { fileID?: number } | undefined,
					});
					components.set(fileID, componentType);
				}

				// Store all other component types
				for (const componentKey of UNITY_COMPONENT_TYPES) {
					if (record[componentKey] && componentKey !== 'Transform' && componentKey !== 'RectTransform') {
						components.set(fileID, componentKey);
						break;
					}
				}
			} catch {
				// Skip invalid YAML documents
			}
		}

		// Build GameObject hierarchy
		const builtGameObjects = new Map<string, UnityGameObject>();
		const rootObjects: UnityGameObject[] = [];

		// Build each GameObject with its components
		for (const [fileID, goData] of gameObjects.entries()) {
			const gameObject: UnityGameObject = {
				fileID,
				name: goData.name,
				tag: goData.tag,
				layer: goData.layer,
				isActive: goData.isActive,
				components: [],
				children: [],
			};

			// Add components
			for (const comp of goData.components) {
				const componentFileID = comp.component?.fileID ? String(comp.component.fileID) : undefined;
				if (componentFileID) {
					const componentType = components.get(componentFileID) || 'Component';
					gameObject.components.push({
						type: componentType,
						fileID: componentFileID,
						properties: {},
					});
				}
			}

			builtGameObjects.set(fileID, gameObject);
		}

		// Build parent-child relationships using Transform data
		for (const [, transformData] of transforms.entries()) {
			const owner = builtGameObjects.get(transformData.gameObjectFileID || '');

			if (!owner) {
				continue;
			}

			// If this transform has no parent, it's a root object
			const fatherID = transformData.father?.fileID ? String(transformData.father.fileID) : null;
			if (!fatherID || fatherID === '0') {
				if (!rootObjects.includes(owner)) {
					rootObjects.push(owner);
				}
			} else {
				// Find parent GameObject
				const parentTransform = transforms.get(fatherID);
				if (parentTransform) {
					const parent = builtGameObjects.get(parentTransform.gameObjectFileID || '');
					if (parent) {
						owner.parentFileID = parent.fileID;
						if (!parent.children.includes(owner)) {
							parent.children.push(owner);
						}
					}
				}
			}
		}

		// If we couldn't identify any roots, show all GameObjects as roots
		if (rootObjects.length === 0 && builtGameObjects.size > 0) {
			rootObjects.push(...Array.from(builtGameObjects.values()));
		}

		const sceneName = scenePath.split('/').pop()?.replace('.unity', '') || 'Scene';

		return {
			name: sceneName,
			path: scenePath,
			rootGameObjects: rootObjects,
			allGameObjects: builtGameObjects,
		};
	}

	/**
	 * Remove Unity tags and anchors from YAML document header
	 * Unity uses tags like !u!1 &12345, !u!4 &67890 stripped, etc.
	 */
	private stripUnityTags(yamlDoc: string): string {
		const lines = yamlDoc.split('\n');
		if (lines[0] && lines[0].trim().match(/^!u!\d+\s+&-?\d+(\s+stripped)?$/)) {
			return lines.slice(1).join('\n');
		}
		return yamlDoc;
	}

	/**
	 * Extract fileID from a YAML document
	 */
	private extractFileID(yamlDoc: string): string {
		const match = yamlDoc.match(/&(-?\d+)/);
		return match ? match[1] : '0';
	}

	/**
	 * Convert YamlNode to a plain JavaScript object
	 */
	private yamlNodeToObject(node: yaml.YamlNode): YamlValue {
		if (node.type === 'scalar') {
			// Try to parse as number or boolean
			const val = node.value;
			if (val === 'true') {
				return true;
			}
			if (val === 'false') {
				return false;
			}
			if (val === 'null' || val === '~' || val === '') {
				return null;
			}
			const num = Number(val);
			if (!isNaN(num) && val.trim() !== '') {
				return num;
			}
			return val;
		}

		if (node.type === 'sequence') {
			return node.items.map(item => this.yamlNodeToObject(item));
		}

		if (node.type === 'map') {
			const result: Record<string, unknown> = {};
			for (const prop of node.properties) {
				const key = prop.key.value;
				result[key] = this.yamlNodeToObject(prop.value);
			}
			return result;
		}

		return null;
	}

	/**
	 * Get scene info (quick scan without full parsing)
	 */
	async getSceneInfo(scenePath: string): Promise<{ gameObjectCount: number; rootCount: number }> {
		const scene = await this.parseScene(scenePath);
		return {
			gameObjectCount: scene.allGameObjects.size,
			rootCount: scene.rootGameObjects.length,
		};
	}
}

/**
 * Internal types for raw parsing
 */
interface RawGameObject {
	fileID: string;
	name: string;
	tag?: string;
	layer?: number;
	isActive: boolean;
	components: Array<{ component?: { fileID?: number } }>;
}

interface RawTransform {
	fileID: string;
	type: string;
	gameObjectFileID?: string;
	children: unknown[];
	father?: { fileID?: number };
}
