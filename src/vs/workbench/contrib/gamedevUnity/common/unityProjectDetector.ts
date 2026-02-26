/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { UnityProjectInfo, IGNORED_FOLDERS } from './types.js';

/**
 * Unity Project Detection and Metadata Parsing
 * Detects Unity projects and extracts project information
 */
export class UnityProjectDetector {

	constructor(
		private readonly fileService: IFileService
	) { }

	/**
	 * Detects if a folder is a Unity project
	 * Checks for ProjectSettings/ProjectVersion.txt
	 */
	async isUnityProject(projectPath: string): Promise<boolean> {
		try {
			const projectVersionUri = URI.file(`${projectPath}/ProjectSettings/ProjectVersion.txt`);
			const exists = await this.fileService.exists(projectVersionUri);
			return exists;
		} catch {
			return false;
		}
	}

	/**
	 * Parse Unity version from ProjectVersion.txt
	 * Format: m_EditorVersion: 2022.3.10f1
	 */
	async parseUnityVersion(projectPath: string): Promise<string | undefined> {
		try {
			const projectVersionUri = URI.file(`${projectPath}/ProjectSettings/ProjectVersion.txt`);
			const content = await this.fileService.readFile(projectVersionUri);
			const text = content.value.toString();

			// Extract version from "m_EditorVersion: 2022.3.10f1"
			const versionMatch = text.match(/m_EditorVersion:\s*(.+)/);
			if (versionMatch && versionMatch[1]) {
				return versionMatch[1].trim();
			}

			return undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * Get Unity project name from folder path
	 * Unity doesn't store project name in a single file, so we use the folder name
	 */
	getProjectName(projectPath: string): string {
		const parts = projectPath.split('/');
		return parts[parts.length - 1] || 'Unity Project';
	}

	/**
	 * Get complete Unity project information
	 */
	async getProjectInfo(projectPath: string): Promise<UnityProjectInfo> {
		const isUnityProject = await this.isUnityProject(projectPath);

		if (!isUnityProject) {
			return {
				isUnityProject: false,
				projectPath,
			};
		}

		const unityVersion = await this.parseUnityVersion(projectPath);
		const projectName = this.getProjectName(projectPath);

		return {
			isUnityProject: true,
			unityVersion,
			projectName,
			projectPath,
		};
	}

	/**
	 * Check if a folder should be ignored during scanning
	 */
	shouldIgnoreFolder(folderName: string): boolean {
		return IGNORED_FOLDERS.includes(folderName) || folderName.startsWith('.');
	}

	/**
	 * Check if a file should be ignored during scanning
	 */
	shouldIgnoreFile(fileName: string): boolean {
		return fileName.startsWith('.') && fileName !== '.gitignore';
	}
}
