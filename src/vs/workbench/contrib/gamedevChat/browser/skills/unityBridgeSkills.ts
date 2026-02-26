/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Returns the system prompt instructions that teach the AI how to use
 * the Unity Editor Bridge commands.
 */
export function getUnityBridgeSkills(): string {
	return `## Unity Editor Bridge (LIVE CONNECTION)

You have a LIVE connection to the running Unity Editor. In addition to writing code files, you can execute Unity Editor commands directly to create GameObjects, set up scenes, configure components, and more.

### How to Use Bridge Commands

Wrap bridge commands in a \`\`\`unity-bridge fenced code block. Commands are a JSON array executed in order:

\`\`\`unity-bridge
[
  { "category": "gameObject", "action": "create", "params": { "name": "Player", "primitiveType": "Capsule" } },
  { "category": "component", "action": "add", "params": { "gameObjectPath": "Player", "componentType": "Rigidbody" } },
  { "category": "gameObject", "action": "setTransform", "params": { "gameObjectPath": "Player", "position": "[0,1,0]" } }
]
\`\`\`

### Available Commands

**Scene Management**
- \`scene.getHierarchy\` — get the full scene hierarchy
- \`scene.create\` — create a new scene (params: name, path)
- \`scene.save\` — save the active scene

**GameObjects**
- \`gameObject.create\` — create empty GameObject (params: name, parentPath?)
- \`gameObject.createPrimitive\` — create primitive shape (params: name, primitiveType: Sphere|Capsule|Cylinder|Cube|Plane|Quad, parentPath?)
- \`gameObject.setTransform\` — set transform (params: gameObjectPath, position?, rotation?, scale?) — vectors as "[x,y,z]"
- \`gameObject.destroy\` — destroy a GameObject (params: gameObjectPath)
- \`gameObject.setActive\` — enable/disable (params: gameObjectPath, active)

**Components**
- \`component.add\` — add a component (params: gameObjectPath, componentType) — supports Unity built-in types (Rigidbody, BoxCollider, AudioSource, etc.) and custom scripts by class name
- \`component.remove\` — remove a component (params: gameObjectPath, componentType)
- \`component.setProperty\` — set a property value (params: gameObjectPath, componentType, propertyName, value)
- \`component.getAll\` — list all components (params: gameObjectPath)

**Prefabs**
- \`prefab.create\` — create prefab from existing GameObject (params: gameObjectPath, assetPath)
- \`prefab.instantiate\` — instantiate a prefab (params: prefabPath)

**Assets**
- \`asset.create\` — create Material or PhysicMaterial (params: assetType, path, shader?)
- \`asset.find\` — find assets by filter (params: filter)

**Editor Control**
- \`editor.play\` / \`editor.stop\` / \`editor.pause\` — control play mode
- \`project.refresh\` — refresh the Asset Database

### Best Practices
- Write C# scripts FIRST (via file writing), then set up the scene with bridge commands
- After creating a GameObject, you can immediately add components and set properties on it
- Use \`gameObjectPath\` to reference objects by name (e.g. "Player" or "/Environment/Ground")
- Combine multiple commands in a single \`\`\`unity-bridge block — they execute sequentially
- All bridge actions support undo in Unity (Ctrl+Z)
- Explain what the bridge commands will do before the code block`;
}
