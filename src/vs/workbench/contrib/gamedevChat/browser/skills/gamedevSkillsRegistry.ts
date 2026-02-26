/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getUnitySkills, getUnitySkillsCompact } from './unitySkills.js';
import { getGodotSkills, getGodotSkillsCompact } from './godotSkills.js';

export const enum GameEngine {
	Unknown = 'unknown',
	Unity = 'unity',
	Godot = 'godot',
}

/**
 * Returns the full skill set for the given engine.
 * Used as part of the system prompt to give the AI deep knowledge.
 */
export function getSkillsForEngine(engine: GameEngine, compact?: boolean): string | undefined {
	switch (engine) {
		case GameEngine.Unity:
			return compact ? getUnitySkillsCompact() : getUnitySkills();
		case GameEngine.Godot:
			return compact ? getGodotSkillsCompact() : getGodotSkills();
		default:
			return undefined;
	}
}

/**
 * Builds a system prompt block with engine-specific skills.
 * Returns undefined if no engine is detected or no skills are available.
 */
export function buildSkillsPromptBlock(engine: GameEngine, compact?: boolean): string | undefined {
	const skills = getSkillsForEngine(engine, compact);
	if (!skills) {
		return undefined;
	}

	const engineName = engine === GameEngine.Unity ? 'Unity' : engine === GameEngine.Godot ? 'Godot' : engine;
	return `# ${engineName} Engine Knowledge Base\n\nUse this knowledge to give accurate, production-quality advice for ${engineName} game development. Apply these patterns, avoid the listed pitfalls, and follow the best practices when writing or reviewing code.\n\n${skills}`;
}
