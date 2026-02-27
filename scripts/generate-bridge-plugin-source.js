/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/**
 * Reads unity-editor-plugin/GameDevIDEBridge.cs and regenerates
 * src/vs/workbench/contrib/gamedevUnity/common/bridgePluginSource.ts
 * with the C# source base64-encoded.
 *
 * Run from repo root:  node scripts/generate-bridge-plugin-source.js
 */

const fs = require('fs');
const path = require('path');

const CS_PATH = path.join(__dirname, '..', 'unity-editor-plugin', 'GameDevIDEBridge.cs');
const TS_PATH = path.join(__dirname, '..', 'src', 'vs', 'workbench', 'contrib', 'gamedevUnity', 'common', 'bridgePluginSource.ts');

// Read C# source
const source = fs.readFileSync(CS_PATH, 'utf-8');

// Extract version from the C# header comment
const versionMatch = source.match(/Plugin version:\s*(\S+)/);
const version = versionMatch ? versionMatch[1] : '0.0.0';

// Base64 encode
const b64 = Buffer.from(source).toString('base64');

// Split into 100-char chunks
const chunks = [];
for (let i = 0; i < b64.length; i += 100) {
	chunks.push(b64.slice(i, i + 100));
}

const tsContent = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Embedded source of the Unity Editor Bridge C# plugin (base64 encoded).
 * Auto-deployed into the user's Unity project at Assets/Editor/GameDevIDEBridge.cs.
 *
 * The readable source is at: unity-editor-plugin/GameDevIDEBridge.cs
 * To regenerate after editing the C# file, run from the repo root:
 *   node scripts/generate-bridge-plugin-source.js
 */

import { VSBuffer } from '../../../../base/common/buffer.js';

/** Version marker — bump when the plugin changes to trigger re-deploy */
export const BRIDGE_PLUGIN_VERSION = '${version}';

/** Path relative to Unity project root where the plugin is installed */
export const BRIDGE_PLUGIN_INSTALL_PATH = 'Assets/Editor/GameDevIDEBridge.cs';

/** Base64-encoded C# source of the Unity Editor Bridge plugin */
const BRIDGE_PLUGIN_BASE64 = '' +
${chunks.map(c => "\t'" + c + "'").join(' +\n')};

/** Decode and return the C# plugin source */
export function getBridgePluginSource(): string {
\treturn VSBuffer.wrap(Uint8Array.from(atob(BRIDGE_PLUGIN_BASE64), c => c.charCodeAt(0))).toString();
}
`;

fs.writeFileSync(TS_PATH, tsContent);
console.log(`Generated ${path.relative(process.cwd(), TS_PATH)}`);
console.log(`  Plugin version: ${version}`);
console.log(`  Base64 size: ${b64.length} chars (${chunks.length} chunks)`);
