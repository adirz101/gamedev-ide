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
  NOTE: Canvas, EventSystem, and UI elements are NOT primitives. Create them with gameObject.create + component.add (e.g. create "Canvas" then add "Canvas", "CanvasScaler", "GraphicRaycaster" components; create "EventSystem" then add "EventSystem", "StandaloneInputModule")
- setTransform — position/rotate/scale (gameObjectPath, position?, rotation?, scale?) vectors as "[x,y,z]"
- destroy (gameObjectPath) / setActive (gameObjectPath, active)

**Components**:
- add — add built-in (Rigidbody, BoxCollider, AudioSource...) or custom scripts by class name (gameObjectPath, componentType)
- remove (gameObjectPath, componentType)
- setProperty (gameObjectPath, componentType, propertyName, value) — sets ANY serialized field
- getAll (gameObjectPath)

**CRITICAL — Wiring Up References with setProperty:**
When a script has serialized fields (public or [SerializeField]) that reference GameObjects, UI elements, or other components, you MUST use \`component.setProperty\` to assign them AFTER creating all objects. The \`value\` is the **scene hierarchy path** of the target object (e.g. "Canvas/MainMenuPanel") or an asset path (e.g. "Assets/Materials/Red.mat").
- For GameObject fields: value = scene path of the target (e.g. "Canvas/Panel")
- For Component fields (Button, Image, Text, etc.): value = scene path of the GameObject that has that component
- For assets (Sprite, Material, AudioClip): value = asset path (e.g. "Assets/Sprites/Icon.png")
- Example: \`{ category: "component", action: "setProperty", params: { gameObjectPath: "GameManager", componentType: "MainMenuManager", propertyName: "mainMenuPanel", value: "Canvas/MainMenuPanel" } }\`

**Always wire up ALL serialized reference fields** — unassigned references cause runtime errors (UnassignedReferenceException). After creating objects and adding scripts, review each script's serialized fields and set every reference.

**Common enum values for setProperty:**
- TextMeshPro alignment: TopLeft, Top, TopRight, Left, Center, Right, BottomLeft, Bottom, BottomRight, MidlineLeft, Midline, MidlineRight (NOT MiddleLeft/MiddleRight/MiddleCenter)
- Canvas renderMode: ScreenSpaceOverlay, ScreenSpaceCamera, WorldSpace
- Image type: Simple, Sliced, Tiled, Filled

**Prefabs**: create (gameObjectPath, assetPath), instantiate (prefabPath)

**Assets**: create (assetType: Material|PhysicMaterial, path, shader?), find (filter)

**Editor**: play, stop, pause | **Project**: refresh

### Workflow

1. Write any C# script files needed (behavior, managers, etc.)
2. Call \`unity_bridge\` ONCE with ALL commands in a single tool call — include object creation, transforms, component additions, AND reference wiring all together. Do NOT split into multiple tool calls.
3. Check results — if a component wasn't found (script not compiled yet), the system will wait for compilation and retry automatically
4. Only make a second tool call if there were errors that need retrying
5. After ALL commands succeed, summarize what was created

**IMPORTANT: Minimize tool calls.** Each tool call triggers a full API round-trip. Put ALL commands (create objects, add components, set properties, wire references) in ONE commands array.`;
}
