/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Returns the system prompt instructions that teach the AI how to use
 * the Unity Editor Bridge via the `unity_bridge` tool.
 *
 * @param isConnected Whether the bridge is currently connected to Unity Editor.
 */
export function getUnityBridgeSkills(isConnected?: boolean): string {
	const connectionHeader = isConnected
		? `## Unity Editor Bridge (LIVE CONNECTION)

You have a LIVE connection to the running Unity Editor. You MUST use the \`unity_bridge\` tool to create GameObjects, set up scenes, add components, and configure transforms. The user expects objects to appear directly in Unity — do NOT write C# setup scripts or tell the user to create objects manually.`
		: `## Unity Editor Bridge (NOT CONNECTED)

The Unity Editor bridge is currently **not connected** (Unity may not be running). You should still use the \`unity_bridge\` tool — it will return errors indicating Unity is not connected, but this lets you show the user what you intend to build. Tell the user to open Unity if it is not running.`;

	return `${connectionHeader}

**Rule: Use the \`unity_bridge\` tool for scene construction. Write C# scripts only for runtime behavior (movement, AI, game logic, etc.).**

### How It Works

1. Write any C# behavior scripts the user needs (movement, input, etc.) — these are written as code files automatically
2. Call the \`unity_bridge\` tool to create GameObjects, add components (including your scripts), and position them in the scene
3. You will see the results of each tool call — check for errors and retry if needed
4. After all commands succeed, summarize what was created

### Available Commands

The \`unity_bridge\` tool accepts a \`commands\` array. Each command has \`category\`, \`action\`, and optional \`params\`.

**Scene**: getHierarchy, create (name, path), save

**GameObjects**:
- create — empty object (name, parentPath?)
- createPrimitive — shape (name, primitiveType: Sphere|Capsule|Cylinder|Cube|Plane|Quad, parentPath?)
- setTransform — position/rotate/scale (gameObjectPath, position?, rotation?, scale?) vectors as "[x,y,z]"
- destroy (gameObjectPath) / setActive (gameObjectPath, active)

**Components**:
- add — add built-in (Rigidbody, BoxCollider, AudioSource...) or custom scripts by class name (gameObjectPath, componentType)
- remove (gameObjectPath, componentType)
- setProperty (gameObjectPath, componentType, propertyName, value)
- getAll (gameObjectPath)

**Prefabs**: create (gameObjectPath, assetPath), instantiate (prefabPath)

**Assets**: create (assetType: Material|PhysicMaterial, path, shader?), find (filter)

**Editor**: play, stop, pause | **Project**: refresh

### Example Workflow

1. First, write the C# script file (as a code file)
2. Then call the \`unity_bridge\` tool with your commands
3. Check the results — if a component wasn't found (script not compiled yet), the system will wait for compilation and retry automatically
4. After success, tell the user what was created`;
}
