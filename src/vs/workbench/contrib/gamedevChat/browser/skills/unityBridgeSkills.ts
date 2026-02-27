/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Returns the system prompt instructions that teach the AI how to use
 * the Unity Editor Bridge commands.
 *
 * @param isConnected Whether the bridge is currently connected to Unity Editor.
 *                    When false, the AI is told to still emit bridge commands but
 *                    note they will be queued for when Unity connects.
 */
export function getUnityBridgeSkills(isConnected?: boolean): string {
	const connectionHeader = isConnected
		? `## Unity Editor Bridge (LIVE CONNECTION)

You have a LIVE connection to the running Unity Editor. You MUST use bridge commands to create GameObjects, set up scenes, add components, and configure transforms. The user expects objects to appear directly in Unity — do NOT write C# setup scripts or tell the user to create objects manually.`
		: `## Unity Editor Bridge (NOT CONNECTED — still output commands)

The Unity Editor bridge is currently **not connected** (Unity may not be running). You MUST still output \`\`\`unity-bridge code blocks with your scene-construction commands. They will be shown to the user as "pending" so they can see what will be applied once Unity is open and connected. Tell the user to open Unity if it is not running. Do NOT skip bridge commands just because the bridge is disconnected — the user needs to see the intended scene setup.`;

	return `${connectionHeader}

**Rule: Use bridge commands for scene construction. Write C# scripts only for runtime behavior (movement, AI, game logic, etc.).**

### How It Works

1. Write any C# behavior scripts the user needs (movement, input, etc.)
2. Then use a \`\`\`unity-bridge code block to create the GameObjects, add components (including your scripts), and position them in the scene
3. ${isConnected ? 'The commands execute directly in the Unity Editor — objects appear immediately' : 'When the bridge is connected, the commands execute directly in the Unity Editor — objects appear immediately'}

**IMPORTANT: The user does NOT see your unity-bridge JSON commands in the chat. They are hidden and executed automatically. Instead of describing the JSON, describe what you're creating in natural language.** For example, say "I'll set up a Player capsule with Rigidbody and your controller script, plus a ground plane." — NOT "Here are the bridge commands:". The execution results are shown automatically.

### Command Format

\`\`\`unity-bridge
[
  { "category": "gameObject", "action": "createPrimitive", "params": { "name": "Player", "primitiveType": "Capsule" } },
  { "category": "component", "action": "add", "params": { "gameObjectPath": "Player", "componentType": "Rigidbody" } },
  { "category": "component", "action": "setProperty", "params": { "gameObjectPath": "Player", "componentType": "Rigidbody", "propertyName": "mass", "value": "1" } },
  { "category": "component", "action": "add", "params": { "gameObjectPath": "Player", "componentType": "PlayerMovement" } },
  { "category": "gameObject", "action": "setTransform", "params": { "gameObjectPath": "Player", "position": "[0,1,0]" } }
]
\`\`\`

### Available Commands

**Scene**: \`scene.getHierarchy\`, \`scene.create\` (name, path), \`scene.save\`

**GameObjects**:
- \`gameObject.create\` — empty object (name, parentPath?)
- \`gameObject.createPrimitive\` — shape (name, primitiveType: Sphere|Capsule|Cylinder|Cube|Plane|Quad, parentPath?)
- \`gameObject.setTransform\` — position/rotate/scale (gameObjectPath, position?, rotation?, scale?) vectors as "[x,y,z]"
- \`gameObject.destroy\` (gameObjectPath) / \`gameObject.setActive\` (gameObjectPath, active)

**Components**:
- \`component.add\` — add built-in (Rigidbody, BoxCollider, AudioSource...) or custom scripts by class name (gameObjectPath, componentType)
- \`component.remove\` (gameObjectPath, componentType)
- \`component.setProperty\` (gameObjectPath, componentType, propertyName, value)
- \`component.getAll\` (gameObjectPath)

**Prefabs**: \`prefab.create\` (gameObjectPath, assetPath), \`prefab.instantiate\` (prefabPath)

**Assets**: \`asset.create\` (assetType: Material|PhysicMaterial, path, shader?), \`asset.find\` (filter)

**Editor**: \`editor.play\`, \`editor.stop\`, \`editor.pause\`, \`project.refresh\`

### Example: "Create a player with movement"

1. First, write the C# script file:
\`\`\`csharp
// Assets/Scripts/PlayerMovement.cs
using UnityEngine;
public class PlayerMovement : MonoBehaviour { ... }
\`\`\`

2. Then, create the scene objects via bridge:
\`\`\`unity-bridge
[
  { "category": "gameObject", "action": "createPrimitive", "params": { "name": "Player", "primitiveType": "Capsule" } },
  { "category": "component", "action": "add", "params": { "gameObjectPath": "Player", "componentType": "Rigidbody" } },
  { "category": "component", "action": "add", "params": { "gameObjectPath": "Player", "componentType": "PlayerMovement" } },
  { "category": "gameObject", "action": "setTransform", "params": { "gameObjectPath": "Player", "position": "[0,1,0]" } },
  { "category": "gameObject", "action": "createPrimitive", "params": { "name": "Ground", "primitiveType": "Plane" } },
  { "category": "gameObject", "action": "setTransform", "params": { "gameObjectPath": "Ground", "position": "[0,0,0]", "scale": "[5,1,5]" } }
]
\`\`\`

This creates the objects directly in Unity. The user sees them appear in the Hierarchy immediately. ALWAYS use this pattern — scripts for behavior, bridge commands for scene setup.`;
}
