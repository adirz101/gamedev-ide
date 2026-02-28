# GameDev IDE Documentation

**A Cursor-like IDE for Game Developers** - VS Code fork with deep game development integration

---

## Project Purpose

GameDev IDE is a fork of Visual Studio Code designed specifically for game developers. Like how [Cursor](https://cursor.com/) deeply integrates AI into VS Code, we're deeply integrating game development tools — AI chat, live Unity Editor control, asset generation, and more.

### What Makes This Different

Instead of switching between:
- VS Code (for coding)
- Unity/Godot Editor (for scenes)
- External tools (for assets)
- ChatGPT (for help)

Game developers get **one unified IDE** with everything integrated.

---

## Documentation Structure

| Guide | Purpose | Status |
|-------|---------|--------|
| **[README.md](./README.md)** | Project overview (this file) | Current |
| **[STRUCTURE.md](./STRUCTURE.md)** | File organization and architecture | Current |
| **[DEVELOPMENT.md](./DEVELOPMENT.md)** | Development workflow and build process | Current |
| **[UI_CUSTOMIZATION.md](./UI_CUSTOMIZATION.md)** | UI/theming changes (Cursor-like design) | Complete |
| **[UNITY_BRIDGE_PLAN.md](./UNITY_BRIDGE_PLAN.md)** | Unity Editor Bridge protocol and architecture | Complete |

---

## Quick Start

### Prerequisites
- Node.js 22.22.0 (use fnm: `fnm use 22.22.0`)
- Git
- ~10GB disk space

### Setup Development Environment

```bash
# Navigate to the repo
cd /Users/azechary/Documents/GitHub/gamedev-ide

# Ensure correct Node version
eval "$(fnm env)" && fnm use 22.22.0

# Install dependencies
npm install

# Start watch mode (auto-compiles on changes)
npm run watch
```

### Run GameDev IDE

```bash
# In another terminal
./run.sh
```

### Make Changes

1. Edit files in `src/vs/workbench/contrib/gamedev*/`
2. Watch mode compiles automatically
3. Reload window in VS Code: **Cmd+R**

---

## Architecture

GameDev IDE features are implemented as **built-in workbench contributions** inside the VS Code source tree (not as extensions). This gives deeper integration with the VS Code UI — Cursor-style chat in the sidebar, native service injection, and direct access to the editor APIs.

```
gamedev-ide/
└── src/vs/workbench/contrib/
    ├── gamedevChat/        AI Chat (Cursor-style sidebar panel)
    │   └── browser/
    │       ├── gamedevChat.contribution.ts
    │       ├── gamedevChatService.ts
    │       ├── gamedevChatViewPane.ts
    │       ├── skills/
    │       │   ├── gamedevSkillsRegistry.ts
    │       │   ├── unityBridgeSkills.ts
    │       │   └── unitySkills.ts
    │       └── media/gamedevChat.css
    │
    ├── gamedevUnity/       Unity Project Detection & Bridge
    │   ├── common/
    │   │   ├── types.ts
    │   │   ├── bridgeTypes.ts
    │   │   └── bridgePluginSource.ts
    │   └── browser/
    │       ├── gamedevUnity.contribution.ts
    │       ├── unityProjectService.ts
    │       └── unityBridgeService.ts
    │
    └── [future contributions...]
```

### Unity Editor Plugin

```
unity-editor-plugin/
└── GameDevIDEBridge.cs     C# plugin auto-deployed to Unity projects
```

The plugin source is maintained in the repo root and embedded (base64-encoded) in `bridgePluginSource.ts` for auto-deployment. Regenerate after editing:

```bash
node scripts/generate-bridge-plugin-source.js
```

---

## Implemented Features

### 1. AI Chat (Cursor-style)

**Status: Complete**

A full-featured AI chat panel in the right sidebar (auxiliary bar), powered by Claude.

- **Two modes:**
  - **Ask mode** — AI responds with code blocks that have copy buttons
  - **Agent mode** — AI writes files directly to the project and executes Unity bridge commands
- **Streaming** with real-time markdown rendering (600ms throttle)
- **Extended thinking** — collapsible "Thought for Xs" section with timer
- **Phase indicators** — Loading context, Thinking, Responding, Applying changes
- **File attachments** via drag-and-drop or @ mentions (file search popup)
- **Content stripping** in Agent mode — file code blocks become compact clickable file cards, bridge JSON is hidden
- **Bridge result cards** — collapsible cards showing command results with copy button
- **Applied files cards** — clickable cards showing written/updated files
- **Applying section** — dedicated section with animated header, timer, and live activity lines during file writes and bridge command execution
- **Stop button** — cancels streaming mid-response
- **API key management** — settings dialog, `.env` file support
- **Message persistence** — chat history stored across sessions
- **Project context** — Unity project structure, scripts, and configuration injected into system prompt
- **Auto-scroll** to bottom during streaming and apply phases

**Key files:**
- `gamedevChatService.ts` — Claude API client, streaming, file writing, bridge command execution
- `gamedevChatViewPane.ts` — Full chat UI with all rendering logic
- `gamedevChat.css` — Styles for shimmer, pulse dots, file cards, result cards, code blocks

### 2. Unity Project Detection

**Status: Complete**

Automatically detects Unity projects in the workspace and analyzes their structure.

- Detects `ProjectSettings/ProjectVersion.txt` to identify Unity projects
- Parses project structure: scenes, scripts, prefabs, assets
- Builds context message for the AI with project-specific information
- Project name shown in context badge on chat input

**Key files:**
- `unityProjectService.ts` — Project detection, analysis, context building
- `types.ts` — `IUnityProjectService` interface

### 3. Unity Editor Bridge

**Status: Complete (v1.2.0)**

Live two-way communication between the IDE and a running Unity Editor instance via WebSocket.

- **Auto-deploy C# plugin** to `Assets/Editor/GameDevIDEBridge.cs` when Unity project detected
- **Port discovery** — Unity plugin writes `Library/GameDevIDE/bridge.json`, IDE polls every 5 seconds
- **WebSocket connection** with automatic reconnection on Unity domain reloads
- **Connection status indicator** — green (connected), yellow (connecting), red (disconnected, click to retry)
- **Stale discovery file detection** — files older than 60s are deleted
- **Log deduplication** — discovery state transitions only logged once
- **Manual retry** — click the bridge status indicator when disconnected

**Bridge commands (executed by AI in Agent mode):**

| Category | Actions |
|----------|---------|
| **scene** | getActive, getHierarchy, create, load, save |
| **gameObject** | create, createPrimitive, find, destroy, setActive, setTransform, getSelected |
| **component** | add, remove, getAll, setProperty |
| **prefab** | create, instantiate, getAll |
| **asset** | create, find, import |
| **editor** | getPlayMode, play, pause, stop, getConsoleLogs, executeMenuItem |

**C# Plugin features (v1.2.0):**
- `SmartConvert()` — handles enum types (RenderMode, ScaleMode, TextAlignmentOptions), Vector2/3/4, Color (hex + RGBA), bool, int, float
- `FindGameObjectByPath()` — finds inactive GameObjects by walking the scene hierarchy (Unity's `GameObject.Find()` only finds active objects)
- `SetSerializedPropertyValue()` — undo-safe property editing via SerializedObject
- Component type resolution across all loaded assemblies
- Locale-invariant float parsing

**Key files:**
- `unityBridgeService.ts` — WebSocket client, discovery polling, reconnection
- `bridgeTypes.ts` — Protocol types, `IUnityBridgeService` interface, constants
- `bridgePluginSource.ts` — Base64-encoded C# plugin source (auto-generated)
- `unity-editor-plugin/GameDevIDEBridge.cs` — The actual C# plugin

### 4. AI Skills System

**Status: Complete**

Structured knowledge base injected into the AI system prompt based on detected engine and connection state.

- **Engine skills** — Unity-specific knowledge (component patterns, best practices)
- **Bridge skills** — Bridge command format and examples, sent in Agent mode
  - When connected: tells AI to use bridge commands for scene setup
  - When disconnected: tells AI to still output bridge commands (marked as pending)
- **Skills registry** — combines all skills into cached prompt blocks

**Key files:**
- `gamedevSkillsRegistry.ts` — Registry that builds the full skills prompt
- `unitySkills.ts` — Unity engine knowledge
- `unityBridgeSkills.ts` — Bridge command format and instructions

---

## UI Customization

The IDE has a Cursor-like appearance with:
- Activity bar at the top with centered icons
- Custom dark theme (GameDev IDE Dark)
- Clean welcome page
- VS Code's built-in Copilot chat panel removed

See [UI_CUSTOMIZATION.md](./UI_CUSTOMIZATION.md) for complete details.

---

## Development Workflow

```bash
# Terminal 1: Watch mode (auto-compile)
npm run watch

# Terminal 2: Run GameDev IDE
./run.sh

# Make changes in src/vs/workbench/contrib/gamedev*/
# Reload window: Cmd+R
# Check DevTools for errors: Cmd+Shift+I
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for complete development guide.

---

## Success Criteria

- [x] VS Code fork compiling and running
- [x] Cursor-like UI design
- [x] AI chat with streaming and extended thinking
- [x] Agent mode with file writing
- [x] Unity project detection and context
- [x] Unity Editor Bridge (live scene manipulation)
- [x] Bridge command execution from AI responses
- [ ] Pixel art editor
- [ ] Asset generation (PixelLab integration)
- [ ] Can say "add health bar" and AI does it all (end-to-end)

---

## Vision

**The Cursor for Game Developers**

A developer says:
```
"Create a main menu with play, settings, and quit buttons"
```

GameDev IDE:
1. AI analyzes the Unity project
2. Creates C# scripts (MainMenuManager.cs, SettingsManager.cs)
3. Creates GameObjects in the scene (Canvas, Buttons, Panels)
4. Attaches scripts as components
5. Configures properties (colors, sizes, layout)
6. All in one response, visible in real-time

**All in one IDE, no context switching.**

---

**Last updated:** 2026-02-28
