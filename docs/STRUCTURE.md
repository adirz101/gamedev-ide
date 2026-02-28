# GameDev IDE - Project Structure

Complete directory breakdown for the VS Code fork with built-in game development contributions.

---

## Repository Structure

```
gamedev-ide/  (VS Code Fork)
├── src/                                 VS CODE SOURCE
│   └── vs/
│       └── workbench/
│           └── contrib/
│               ├── gamedevChat/         BUILT-IN AI CHAT (Cursor-style)
│               │   └── browser/
│               │       ├── gamedevChat.contribution.ts    View + service registration
│               │       ├── gamedevChatService.ts          Claude API, streaming, agent logic
│               │       ├── gamedevChatViewPane.ts         Full chat UI (ViewPane)
│               │       ├── skills/                        AI knowledge injection
│               │       │   ├── gamedevSkillsRegistry.ts   Skills registry + builder
│               │       │   ├── unitySkills.ts             Unity engine knowledge
│               │       │   └── unityBridgeSkills.ts       Bridge command format
│               │       └── media/
│               │           └── gamedevChat.css            Chat styles
│               │
│               └── gamedevUnity/        UNITY PROJECT + BRIDGE
│                   ├── common/
│                   │   ├── types.ts                       IUnityProjectService interface
│                   │   ├── bridgeTypes.ts                 Protocol types, IUnityBridgeService
│                   │   └── bridgePluginSource.ts           Base64-encoded C# plugin (generated)
│                   └── browser/
│                       ├── gamedevUnity.contribution.ts   Service registration
│                       ├── unityProjectService.ts         Project detection + context
│                       └── unityBridgeService.ts          WebSocket client + reconnection
│
├── unity-editor-plugin/                 UNITY C# PLUGIN SOURCE
│   └── GameDevIDEBridge.cs              WebSocket server for Unity Editor (v1.2.0)
│
├── scripts/
│   └── generate-bridge-plugin-source.js Regenerates bridgePluginSource.ts
│
├── extensions/                          EXTENSIONS
│   └── theme-gamedev-dark/              Custom dark theme (Cursor-like)
│       ├── package.json
│       └── themes/
│           └── gamedev-dark-color-theme.json
│
├── docs/                                DOCUMENTATION
│   ├── README.md                        Project overview
│   ├── STRUCTURE.md                     This file
│   ├── DEVELOPMENT.md                   Development workflow
│   ├── UI_CUSTOMIZATION.md              UI/theming changes
│   └── UNITY_BRIDGE_PLAN.md             Unity bridge protocol
│
├── product.json                         Branding (GameDev IDE)
├── package.json                         Dependencies
├── .env                                 API keys (not in git)
├── run.sh                               Launch script
└── [other VS Code files]
```

---

## Built-in Contributions

Game development features are implemented as **built-in workbench contributions** (not extensions) for deeper integration with the VS Code UI.

### AI Chat (`gamedevChat/`)

**Location:** `src/vs/workbench/contrib/gamedevChat/browser/`

| File | Purpose |
|------|---------|
| `gamedevChat.contribution.ts` | Registers the ViewPane, binds services via DI |
| `gamedevChatService.ts` | Claude API client, streaming, file writing, bridge command execution |
| `gamedevChatViewPane.ts` | Full chat UI — messages, streaming, file cards, result cards, input |
| `media/gamedevChat.css` | Styles for shimmer, pulse dots, file cards, code blocks, result cards |

**Skills subdirectory:**

| File | Purpose |
|------|---------|
| `skills/gamedevSkillsRegistry.ts` | Combines all skills into prompt blocks, handles engine detection |
| `skills/unitySkills.ts` | Unity engine knowledge (component patterns, best practices) |
| `skills/unityBridgeSkills.ts` | Bridge command format, examples, connection-aware instructions |

**What it does:**
- Cursor-style AI chat panel in the auxiliary bar (right sidebar)
- Claude API with streaming responses and extended thinking
- Two modes: Ask (code blocks with copy) and Agent (auto-writes files + bridge commands)
- Content stripping in Agent mode (file blocks become file cards, bridge JSON hidden)
- Real-time apply phase with animated section, timer, and live activity lines
- File attachments via drag-and-drop and @ mention popup
- Project context injection from Unity project analysis
- Message persistence in StorageService

### Unity Integration (`gamedevUnity/`)

**Location:** `src/vs/workbench/contrib/gamedevUnity/`

| File | Purpose |
|------|---------|
| `common/types.ts` | `IUnityProjectService` interface, project info types |
| `common/bridgeTypes.ts` | Protocol types, `IUnityBridgeService` interface, constants |
| `common/bridgePluginSource.ts` | Base64-encoded C# plugin source (auto-generated) |
| `browser/gamedevUnity.contribution.ts` | Service registration via DI |
| `browser/unityProjectService.ts` | Unity project detection, structure analysis, context builder |
| `browser/unityBridgeService.ts` | WebSocket client, port discovery, reconnection, plugin deploy |

**What it does:**
- Detects Unity projects by looking for `ProjectSettings/ProjectVersion.txt`
- Analyzes project structure (scenes, scripts, prefabs, assets)
- Builds context message for the AI with project-specific information
- Auto-deploys the C# bridge plugin to `Assets/Editor/GameDevIDEBridge.cs`
- Connects to Unity Editor via WebSocket
- Handles reconnection on Unity domain reloads
- Shows connection status indicator in chat header

### Unity C# Plugin (`unity-editor-plugin/`)

**Location:** `unity-editor-plugin/GameDevIDEBridge.cs`

A single-file C# plugin that runs inside the Unity Editor. Auto-deployed by the IDE.

**Key capabilities:**
- WebSocket server on localhost (dynamic port)
- Writes `Library/GameDevIDE/bridge.json` for port discovery
- Dispatches JSON commands to Unity Editor APIs
- `SmartConvert()` for enum/Vector2/Vector3/Color type handling
- `FindGameObjectByPath()` for inactive GameObject discovery
- `SetSerializedPropertyValue()` for undo-safe property editing
- Component type resolution across all loaded assemblies
- Cleanup on quit and assembly reload

**Regenerate after editing:**
```bash
node scripts/generate-bridge-plugin-source.js
```

---

## Service Architecture

All services use VS Code's dependency injection system (`createDecorator` + `registerSingleton`).

```
IUnityProjectService          Project detection + context
        │
        ├── used by ──► IGameDevChatService      AI chat + streaming + agent logic
        │                       │
        │                       ├── uses ──► IUnityBridgeService   WebSocket bridge
        │                       │
        │                       ├── uses ──► IFileService          File read/write
        │                       │
        │                       ├── uses ──► IBulkEditService      Agent file edits
        │                       │
        │                       └── uses ──► IEditorService        Open files in editor
        │
        └── used by ──► GameDevChatViewPane      Chat UI (ViewPane)
                                │
                                ├── uses ──► IMarkdownRendererService
                                ├── uses ──► ISearchService        @ mention file search
                                └── uses ──► IClipboardService     Copy buttons
```

---

## Key Patterns

### Streaming Architecture

```
Claude API (SSE stream)
    │
    ├── content_block_start (thinking) ──► StreamingPhase.Thinking
    ├── content_block_delta (thinking) ──► onDidReceiveChunk (thinking_delta)
    ├── content_block_stop (thinking) ──► onDidReceiveChunk (thinking_complete)
    ├── content_block_start (text) ──► StreamingPhase.Responding
    ├── content_block_delta (text) ──► onDidReceiveChunk (text_delta)
    ├── message_stop ──► message.isStreaming = false
    │
    └── finally block:
        ├── StreamingPhase.Applying ──► onDidReceiveChunk (phase_change)
        ├── _applyAgentEdits() ──► onDidApplyActivity (per file)
        ├── _applyBridgeCommands() ──► onDidApplyActivity (per command)
        ├── _isStreaming = false
        └── onDidStopStreaming ──► final render
```

### Content Stripping (Agent Mode)

In Agent mode, the AI response is processed before display:
1. File code blocks (`` ```csharp:Assets/Scripts/Foo.cs ... ``` ``) are stripped and replaced with clickable file cards
2. Bridge JSON blocks (`` ```unity-bridge ... ``` ``) are completely hidden
3. Bare bridge JSON arrays are removed
4. The cleaned markdown is rendered

The actual file writing and bridge command execution happen in the apply phase after streaming completes.

### Bridge Command Flow

```
AI outputs ```unity-bridge JSON``` in response
    │
    ├── During streaming: stripped from display, user sees explanation text only
    │
    └── After streaming (apply phase):
        ├── Parse all bridge command blocks from content
        ├── If bridge connected: execute each command via WebSocket
        │   └── Fire onDidApplyActivity for each (start/done/error)
        └── If bridge disconnected: mark all as skipped
            └── Results stored on message and shown as bridge result card
```

---

## Configuration Files

| File | Purpose |
|------|---------|
| `product.json` | Branding, default settings, marketplace URL |
| `package.json` | Root dependencies, build scripts |
| `.env` | `ANTHROPIC_API_KEY` (not in git) |
| `extensions/theme-gamedev-dark/package.json` | Theme extension manifest |

---

## Naming Conventions

### Files
- `*Service.ts` — Business logic services (DI-injected)
- `*ViewPane.ts` — VS Code ViewPane implementations
- `*.contribution.ts` — Service and view registration
- `*Types.ts` or `types.ts` — TypeScript interfaces and types
- `*Skills.ts` — AI skills/knowledge modules

### Interfaces
- `IFooService` — Service interfaces (prefix with I)
- `IFooEvent` — Event payload interfaces

### Enums
- `FooState` or `FooPhase` — State enums (PascalCase values)
- `const enum` preferred for tree-shaking

---

**Last updated:** 2026-02-28
