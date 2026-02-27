# Unity Editor Bridge — Integration Plan

## Overview

A live two-way communication bridge between the GameDev IDE and a running Unity Editor instance. This lets the AI agent go beyond writing code files — it can create GameObjects, scenes, prefabs, configure components, and control the editor directly through Unity's own APIs.

## Architecture

```
┌─────────────────────┐         WebSocket          ┌──────────────────────┐
│     IDE (Browser)    │◄──────(localhost)──────────►│    Unity Editor      │
│                      │                             │                      │
│  UnityBridgeService  │  JSON commands/responses    │  GameDevIDEBridge.cs │
│  GameDevChatService  │  + event stream             │  [InitializeOnLoad]  │
└─────────────────────┘                             └──────────────────────┘
          │                                                    │
          │ reads                                              │ writes
          ▼                                                    ▼
              Library/GameDevIDE/bridge.json (port discovery)
```

**Three components:**

1. **Unity C# Plugin** (`GameDevIDEBridge.cs`) — Auto-deployed to `Assets/Editor/` when the IDE detects a Unity project. Starts a WebSocket server on localhost, writes the port to a discovery file, dispatches JSON commands to Unity Editor APIs. Version-checked and auto-updated.

2. **IDE Bridge Service** (`IUnityBridgeService`) — Discovers the Unity Editor's port, connects via WebSocket, sends commands, handles reconnection on domain reloads.

3. **Chat Agent Integration** — When the bridge is connected, the AI agent can issue structured commands to create objects, configure scenes, and control the editor.

## Protocol

### Port Discovery

Unity plugin writes `Library/GameDevIDE/bridge.json`:
```json
{ "port": 56789, "pid": 12345, "version": "1.0", "timestamp": 1708900000 }
```

The IDE polls for this file every 5 seconds.

### Message Format

```typescript
// IDE → Unity
{ "id": "uuid", "type": "request", "category": "gameObject", "action": "create", "params": { "name": "Player" } }

// Unity → IDE (response)
{ "id": "uuid", "type": "response", "success": true, "result": { "instanceId": 12345 } }

// Unity → IDE (unsolicited event)
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

## Unity C# Plugin Design

### Key Constraints
- **Main thread only** — Unity Editor APIs must be called from the main thread
- **Domain reload** — Unity destroys all managed state when recompiling scripts; `[InitializeOnLoad]` ensures restart
- **No dependencies** — Pure .NET + UnityEditor APIs, no external packages

### Implementation
- `[InitializeOnLoad]` static class
- `HttpListener` on `http://127.0.0.1:0/` (dynamic port) + WebSocket upgrade
- Incoming messages queued to `ConcurrentQueue<string>`
- Processed in `EditorApplication.update` callback (main thread)
- Command dispatch via `category.action` → handler methods
- Cleanup on `EditorApplication.quitting` and `AssemblyReloadEvents.beforeAssemblyReload`

### Unity APIs Used
```csharp
// GameObjects
new GameObject(name), GameObject.CreatePrimitive(), AddComponent<T>()

// Prefabs
PrefabUtility.SaveAsPrefabAsset(), PrefabUtility.InstantiatePrefab()

// Scenes
EditorSceneManager.NewScene(), SaveScene(), SceneManager.GetActiveScene()

// Assets
AssetDatabase.CreateAsset(), AssetDatabase.Refresh()

// Editor
EditorApplication.isPlaying, EditorApplication.isPaused
```

## IDE Service Design

### File Structure
```
src/vs/workbench/contrib/gamedevUnity/
  common/bridgeTypes.ts          — Protocol types, IUnityBridgeService interface
  browser/unityBridgeService.ts  — WebSocket client, discovery, reconnection
```

### Connection Lifecycle
```
IDE opens workspace → Unity project detected → poll for bridge.json
User opens Unity → Plugin starts → writes bridge.json
IDE finds port → WebSocket connect → Connected
Unity recompiles → socket closes → Reconnecting → plugin restarts → reconnect
Unity closes → reconnect fails after 5 attempts → Disconnected
```

### Reconnection Strategy
- Max 5 attempts, 3 second delay between retries
- Covers Unity domain reloads (brief disconnections during script compilation)
- Re-reads bridge.json on each attempt (port may change after reload)

## Chat Agent Integration

When Agent mode is active and the bridge is connected, the AI can output `unity-bridge` fenced code blocks:

````
```unity-bridge
[
  { "category": "gameObject", "action": "create", "params": { "name": "Player", "primitiveType": "Capsule" } },
  { "category": "component", "action": "add", "params": { "gameObjectPath": "Player", "componentType": "Rigidbody" } },
  { "category": "component", "action": "add", "params": { "gameObjectPath": "Player", "componentType": "CapsuleCollider" } },
  { "category": "gameObject", "action": "setTransform", "params": { "gameObjectPath": "Player", "position": [0, 1, 0] } }
]
```
````

The IDE parses these blocks after the response and sends each command through the bridge service. This allows the AI to:

1. Write a C# script (via file writing)
2. Create a GameObject in the scene
3. Attach the script as a component
4. Configure transform, physics, and other settings

All in a single response.

## Implementation Phases

| Phase | Deliverable | Test |
|-------|-------------|------|
| 1 | `bridgeTypes.ts` — protocol types | TypeScript compiles |
| 2 | `GameDevIDEBridge.cs` — Unity plugin | Drop in Unity project, see "Bridge started" in console |
| 3 | `unityBridgeService.ts` — IDE service | Open project in IDE, status shows "Connected" |
| 4 | Chat integration — skills + command execution | Ask "create a player" → object appears in Unity |
| 5 | UI — connection status in project panel | Green/gray dot, connect/disconnect button |
