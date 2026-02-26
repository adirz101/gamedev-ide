/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Unity Project Service Interface
 * Lives in common/ so it can be imported by other contributions (e.g. gamedevChat).
 */
export interface IUnityProjectService {
	readonly _serviceBrand: undefined;

	readonly onDidDetectProject: Event<UnityProjectInfo>;
	readonly onDidStartAnalysis: Event<void>;
	readonly onDidFinishAnalysis: Event<ProjectKnowledge>;
	readonly onDidFailAnalysis: Event<Error>;

	readonly currentProject: UnityProjectInfo | undefined;
	readonly projectKnowledge: ProjectKnowledge | undefined;
	readonly isAnalyzing: boolean;

	detectProject(folderPath: string): Promise<UnityProjectInfo>;
	analyzeProject(): Promise<ProjectKnowledge | undefined>;
	exportForAI(): ProjectKnowledgeExport | undefined;
	buildContextMessage(): string | undefined;
	refresh(): Promise<void>;
}

export const IUnityProjectService = createDecorator<IUnityProjectService>('unityProjectService');

/**
 * Unity Project Detection
 */
export interface UnityProjectInfo {
	isUnityProject: boolean;
	unityVersion?: string;
	projectName?: string;
	projectPath: string;
}

/**
 * Complete Project Knowledge Graph
 */
export interface ProjectKnowledge {
	projectPath: string;
	projectName: string;
	scenes: Map<string, SceneInfo>;
	scripts: Map<string, ScriptInfo>;
	prefabs: Map<string, PrefabInfo>;
	assets: Map<string, AssetInfo>;
	scriptToGameObjects: Map<string, string[]>;
	gameObjectToScripts: Map<string, string[]>;
	prefabInstances: Map<string, string[]>;
	lastAnalyzed: Date;
}

/**
 * Scene Information
 */
export interface SceneInfo {
	name: string;
	path: string;
	gameObjectCount: number;
	rootObjectCount: number;
}

/**
 * Script Information
 */
export interface ScriptInfo {
	path: string;
	fileName: string;
	namespace?: string;
	classes: ClassInfo[];
	imports: string[];
}

export interface ClassInfo {
	name: string;
	extends?: string;
	fields: FieldInfo[];
	methods: MethodInfo[];
	properties: PropertyInfo[];
	isMonoBehaviour: boolean;
}

export interface FieldInfo {
	name: string;
	type: string;
	accessModifier: 'public' | 'private' | 'protected' | 'internal';
	isSerializeField: boolean;
}

export interface MethodInfo {
	name: string;
	returnType: string;
	accessModifier: 'public' | 'private' | 'protected' | 'internal';
	parameters: ParameterInfo[];
	isUnityCallback: boolean;
}

export interface ParameterInfo {
	name: string;
	type: string;
}

export interface PropertyInfo {
	name: string;
	type: string;
	hasGetter: boolean;
	hasSetter: boolean;
}

/**
 * Prefab Information
 */
export interface PrefabInfo {
	path: string;
	fileName: string;
	rootGameObject?: string;
}

/**
 * Asset Information
 */
export interface AssetInfo {
	path: string;
	fileName: string;
	type: 'sprite' | 'material' | 'audio' | 'prefab' | 'animation' | 'shader' | 'other';
	guid?: string;
}

/**
 * Unity Scene Parsing
 */
export interface UnityScene {
	name: string;
	path: string;
	rootGameObjects: UnityGameObject[];
	allGameObjects: Map<string, UnityGameObject>;
}

export interface UnityGameObject {
	name: string;
	fileID: string;
	tag?: string;
	layer?: number;
	isActive: boolean;
	components: UnityComponent[];
	children: UnityGameObject[];
	parentFileID?: string;
}

export interface UnityComponent {
	type: string;
	properties: Record<string, unknown>;
	fileID: string;
	scriptName?: string;
	scriptGuid?: string;
}

/**
 * AI Export Format - Simplified for Claude context
 */
export interface ProjectKnowledgeExport {
	projectName: string;
	overview: {
		sceneCount: number;
		scriptCount: number;
		prefabCount: number;
		assetCount: number;
	};
	scenes: Array<{
		name: string;
		gameObjectCount: number;
		rootCount: number;
	}>;
	scripts: Array<{
		fileName: string;
		classes: Array<{
			name: string;
			isMonoBehaviour: boolean;
			methodCount: number;
			methods: string[];
		}>;
	}>;
	prefabs: string[];
	lastAnalyzed: string;
}

/**
 * Unity callback methods (for detection)
 */
export const UNITY_CALLBACKS = [
	'Awake', 'Start', 'Update', 'FixedUpdate', 'LateUpdate',
	'OnEnable', 'OnDisable', 'OnDestroy',
	'OnCollisionEnter', 'OnCollisionExit', 'OnCollisionStay',
	'OnCollisionEnter2D', 'OnCollisionExit2D', 'OnCollisionStay2D',
	'OnTriggerEnter', 'OnTriggerExit', 'OnTriggerStay',
	'OnTriggerEnter2D', 'OnTriggerExit2D', 'OnTriggerStay2D',
	'OnMouseDown', 'OnMouseUp', 'OnMouseEnter', 'OnMouseExit',
	'OnGUI', 'OnDrawGizmos', 'OnDrawGizmosSelected',
	'OnApplicationPause', 'OnApplicationQuit', 'OnApplicationFocus',
	'OnBecameVisible', 'OnBecameInvisible',
	'OnAnimatorMove', 'OnAnimatorIK',
];

/**
 * Folders to ignore when scanning
 */
export const IGNORED_FOLDERS = [
	'Library', 'Temp', 'Obj', 'Build', 'Builds', 'Logs',
	'.vs', '.vscode', '.idea', 'UserSettings', 'node_modules',
	'.git', 'Packages',
];

/**
 * Unity component types
 */
export const UNITY_COMPONENT_TYPES = [
	'Transform', 'RectTransform',
	'MonoBehaviour',
	'Camera', 'Light',
	'MeshRenderer', 'MeshFilter', 'SkinnedMeshRenderer',
	'BoxCollider', 'SphereCollider', 'CapsuleCollider', 'MeshCollider',
	'BoxCollider2D', 'CircleCollider2D', 'PolygonCollider2D',
	'Rigidbody', 'Rigidbody2D',
	'AudioSource', 'AudioListener',
	'Animator', 'Animation',
	'ParticleSystem',
	'Canvas', 'CanvasRenderer', 'CanvasScaler', 'GraphicRaycaster',
	'Image', 'Text', 'TextMeshProUGUI', 'TMP_Text',
	'Button', 'InputField', 'Slider', 'Toggle', 'Dropdown', 'ScrollRect',
	'GridLayoutGroup', 'HorizontalLayoutGroup', 'VerticalLayoutGroup',
	'ContentSizeFitter', 'AspectRatioFitter',
	'SpriteRenderer', 'LineRenderer', 'TrailRenderer',
	'NavMeshAgent', 'NavMeshObstacle',
];
