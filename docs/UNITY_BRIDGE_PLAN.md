# Unity Editor Bridge

## Status: Fully Implemented (v1.2.0)

All phases are complete. The bridge provides live two-way communication between the IDE and a running Unity Editor instance.

## Overview

The Unity Editor Bridge lets the AI agent go beyond writing code files — it can create GameObjects, scenes, prefabs, configure components, and control the editor directly through Unity's own APIs. When the user asks "create a player with a rigidbody", the AI writes the C# script AND creates the objects in Unity's scene.

## Architecture

```
+-----------------------+         WebSocket          +------------------------+
|     IDE (Browser)     |<-------(localhost)--------->|    Unity Editor         |
|                       |                             |                        |
|  UnityBridgeService   |  JSON commands/responses    |  GameDevIDEBridge.cs   |
|  GameDevChatService   |  + event stream             |  [InitializeOnLoad]    |
+-----------------------+                             +------------------------+
          |                                                    |
          | reads                                              | writes
          v                                                    v
              Library/GameDevIDE/bridge.json (port discovery)
```

**Three components:**

1. **Unity C# Plugin** (`GameDevIDEBridge.cs`) — Auto-deployed to `Assets/Editor/` when the IDE detects a Unity project. Starts a WebSocket server on localhost, writes the port to a discovery file, dispatches JSON commands to Unity Editor APIs. Version-checked and auto-updated.

2. **IDE Bridge Service** (`IUnityBridgeService`) — Discovers the Unity Editor's port via polling, connects via WebSocket, sends commands, handles reconnection on domain reloads.

3. **Chat Agent Integration** — When Agent mode is active, the AI outputs structured `unity-bridge` code blocks that the IDE parses and executes through the bridge.

## Protocol

### Port Discovery

Unity plugin writes `Library/GameDevIDE/bridge.json`:
```json
{ "port": 56789, "pid": 12345, "version": "1.0", "timestamp": 1708900000 }
```

The IDE polls for this file every 5 seconds. Stale files (older than 60 seconds) are automatically deleted.

### Message Format

```typescript
// IDE -> Unity (request)
{ "id": "uuid", "type": "request", "category": "gameObject", "action": "create", "params": { "name": "Player" } }

// Unity -> IDE (response)
{ "id": "uuid", "type": "response", "success": true, "result": { "instanceId": 12345 } }

// Unity -> IDE (unsolicited event)
{ "id": "uuid", "type": "event", "event": "console.log", "data": { "message": "...", "logType": "Error" } }
```

### Command Reference

| Category | Action | Description |
|----------|--------|-------------|
| **scene** | `getActive` | Get active scene info |
| | `getHierarchy` | Get full scene hierarchy tree |
| | `create` | Create new scene |
| | `load` | Load scene by path |
| | `save` | Save current scene |
| **gameObject** | `create` | Create empty GameObject |
| | `createPrimitive` | Create primitive (Cube, Sphere, Capsule, etc.) |
| | `find` | Find by name or path |
| | `destroy` | Destroy GameObject |
| | `setActive` | Enable/disable |
| | `setTransform` | Set position, rotation, scale |
| | `getSelected` | Get currently selected objects |
| **component** | `add` | Add component by type name |
| | `remove` | Remove component |
| | `getAll` | List components on a GameObject |
| | `setProperty` | Set a component property value |
| **prefab** | `create` | Create prefab from GameObject |
| | `instantiate` | Instantiate prefab in scene |
| | `getAll` | List all prefabs in project |
| **asset** | `create` | Create Material, ScriptableObject, etc. |
| | `find` | Find assets by type/name |
| | `import` | Trigger asset reimport |
| **project** | `getInfo` | Project name, version, settings |
| | `refresh` | Refresh AssetDatabase |
| **editor** | `getPlayMode` | Current play mode state |
| | `play` / `pause` / `stop` | Control play mode |
| | `getConsoleLogs` | Recent console output |
| | `executeMenuItem` | Execute menu item by path |

## Unity C# Plugin (v1.2.0)

### File: `unity-editor-plugin/GameDevIDEBridge.cs`

### Key Constraints
- **Main thread only** — Unity Editor APIs must be called from the main thread
- **Domain reload** — Unity destroys all managed state when recompiling scripts; `[InitializeOnLoad]` ensures restart
- **No dependencies** — Pure .NET + UnityEditor APIs, no external packages

### Implementation
- `[InitializeOnLoad]` static class
- `TcpListener` on `127.0.0.1:0` (dynamic port) + WebSocket handshake
- Incoming messages queued to `ConcurrentQueue<string>`
- Processed in `EditorApplication.update` callback (main thread)
- Command dispatch via `category.action` -> handler methods
- Cleanup on `EditorApplication.quitting` and `AssemblyReloadEvents.beforeAssemblyReload`

### Type Handling: SmartConvert (v1.2.0)

The `SmartConvert()` method handles converting string values from JSON to Unity types:

| Type | Handling |
|------|----------|
| **Enums** | `Enum.TryParse()` with case-insensitive matching, fallback to integer |
| **Vector2** | Parses `(x, y)` format |
| **Vector3** | Parses `(x, y, z)` format |
| **Vector4** | Parses `(x, y, z, w)` format |
| **Color** | Hex (`#RRGGBB`, `#RRGGBBAA`) and RGBA `(r, g, b, a)` format |
| **bool** | Standard parsing |
| **int/float** | InvariantCulture parsing (avoids locale issues) |
| **string** | Passthrough |

This solves errors like "Invalid cast from String to RenderMode" that occurred with the previous `Convert.ChangeType()` approach.

### Inactive GameObject Finding (v1.2.0)

`FindGameObjectByPath()` walks the scene hierarchy manually to find GameObjects including inactive ones:

1. First tries `GameObject.Find()` (fast, but only finds active objects)
2. If not found, splits the path and searches scene root objects by name
3. Uses `Transform.Find()` for child paths (works for inactive children)

This solves "GameObject not found" errors when the AI creates objects and sets some inactive (e.g., settings panels).

### Property Editing

Two approaches, tried in order:
1. **SerializedProperty** — Undo-safe, handles enum/Vector2/Vector3/Color serialized types
2. **Reflection fallback** — Uses `PropertyInfo.SetValue()` with `SmartConvert()` for type conversion

### Unity APIs Used
```csharp
// GameObjects
new GameObject(name), GameObject.CreatePrimitive(), AddComponent<T>()

// Scene hierarchy (including inactive)
SceneManager.GetActiveScene().GetRootGameObjects(), Transform.Find()

// Prefabs
PrefabUtility.SaveAsPrefabAsset(), PrefabUtility.InstantiatePrefab()

// Scenes
EditorSceneManager.NewScene(), SaveScene(), SceneManager.GetActiveScene()

// Assets
AssetDatabase.CreateAsset(), AssetDatabase.Refresh()

// Editor
EditorApplication.isPlaying, EditorApplication.isPaused

// Property editing
SerializedObject + SerializedProperty, PropertyInfo via reflection

// Component resolution
AppDomain.CurrentDomain.GetAssemblies() -> assembly.GetTypes()
```

## IDE Bridge Service

### File: `src/vs/workbench/contrib/gamedevUnity/browser/unityBridgeService.ts`

### Connection Lifecycle
```
IDE opens workspace
  -> Unity project detected
  -> Auto-deploy plugin to Assets/Editor/GameDevIDEBridge.cs
  -> Poll for Library/GameDevIDE/bridge.json every 5 seconds

User opens Unity
  -> Plugin starts ([InitializeOnLoad])
  -> Writes bridge.json with port

IDE finds bridge.json
  -> Read port
  -> WebSocket connect to ws://127.0.0.1:{port}
  -> State: Connected (green dot)

Unity recompiles scripts
  -> Socket closes
  -> State: Reconnecting (yellow dot)
  -> Plugin restarts after reload
  -> IDE re-reads bridge.json (port may change)
  -> Reconnects

Unity closes
  -> Reconnect fails after 5 attempts
  -> State: Disconnected (red dot, "Click to retry")
```

### Discovery State Tracking

The service tracks discovery file state (`NotFound`, `Stale`, `Fresh`) to avoid log spam. Transitions are only logged once (e.g., "Discovery file not found" logs once, not every 5 seconds).

### Manual Retry

When disconnected, the user can click the bridge status indicator to trigger `retryConnection()`, which re-polls the discovery file and attempts to connect.

## Chat Integration

### How the AI Uses the Bridge

In Agent mode, the AI receives bridge skills instructions in the system prompt. These tell it:
- The `unity-bridge` code block format
- Available commands and their parameters
- Whether the bridge is currently connected or disconnected

The AI outputs commands like:

````
```unity-bridge
[
  { "category": "gameObject", "action": "createPrimitive", "params": { "name": "Player", "primitiveType": "Capsule" } },
  { "category": "component", "action": "add", "params": { "gameObjectPath": "Player", "componentType": "Rigidbody" } },
  { "category": "component", "action": "setProperty", "params": { "gameObjectPath": "Player", "componentType": "Rigidbody", "propertyName": "mass", "value": 2.0 } }
]
```
````

### Execution Flow

1. AI response streams text + bridge blocks
2. During streaming: bridge JSON is stripped from display (user sees explanation text + file cards)
3. After streaming completes, the apply phase starts:
   - File code blocks are written to disk
   - Bridge command blocks are parsed and executed one by one
   - Each command fires an activity event (start/done/error)
4. The chat UI shows an animated "Applying changes..." section with timer and live activity lines
5. After all commands complete, the final render shows bridge result cards

### When Disconnected

Even when the bridge is not connected, the AI still generates bridge command blocks. They are marked as "skipped (Unity not connected)" in the result cards. This means:
- The AI can plan the full scene setup
- Commands are visible in the results
- If the user connects Unity later, they can see what was intended

## Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `BRIDGE_PROTOCOL_VERSION` | `'1.0'` | Protocol compatibility |
| `BRIDGE_COMMAND_TIMEOUT_MS` | `10000` | Command response timeout |
| `BRIDGE_RECONNECT_DELAY_MS` | `3000` | Delay between reconnection attempts |
| `BRIDGE_DISCOVERY_POLL_MS` | `5000` | Discovery file polling interval |
| `BRIDGE_MAX_RECONNECT_ATTEMPTS` | `5` | Max retries before giving up |

## Implementation Phases (All Complete)

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | `bridgeTypes.ts` — protocol types + interface | Done |
| 2 | `GameDevIDEBridge.cs` — Unity plugin (v1.2.0) | Done |
| 3 | `unityBridgeService.ts` — WebSocket client + discovery + reconnection | Done |
| 4 | Chat integration — skills + command execution + content stripping | Done |
| 5 | UI — connection indicator + result cards + applying section | Done |

---

**Last updated:** 2026-02-28 | Plugin version: 1.2.0
