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

You have a LIVE connection to the running Unity Editor. You MUST use bridge commands to create GameObjects, set up scenes, add components, and configure transforms. The user expects objects to appear directly in Unity — do NOT write C# setup scripts or tell the user to create objects manually.

**Rule: Use bridge commands for scene construction. Write C# scripts only for runtime behavior (movement, AI, game logic, etc.).**

### How It Works

1. Write any C# behavior scripts the user needs (movement, input, etc.)
2. Then use a \`\`\`unity-bridge code block to create the GameObjects, add components (including your scripts), and position them in the scene
3. The commands execute directly in the Unity Editor — objects appear immediately

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
