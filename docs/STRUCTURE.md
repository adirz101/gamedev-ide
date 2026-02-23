# GameDev IDE - Project Structure

Complete directory breakdown for the VS Code fork and extension architecture.

---

## Repository Structure

```
gamedev-ide/  (VS Code Fork)
├── src/                         ← VS CODE SOURCE
│   └── vs/
│       └── workbench/
│           └── contrib/
│               └── gamedevChat/ ← BUILT-IN AI CHAT (Cursor-style)
│                   └── browser/
│                       ├── gamedevChat.contribution.ts
│                       ├── gamedevChatService.ts
│                       └── gamedevChatViewPane.ts
│
├── extensions/                   ← OUR GAME DEV EXTENSIONS
│   ├── godot-integration/       Godot scene viewer (to rename to unity-integration)
│   ├── asset-generation/        PixelLab + asset browser
│   ├── pixel-editor/            Pixel art editor (to be created)
│   └── theme-gamedev-dark/      Custom dark theme (Cursor-like)
│
├── docs/                        ← THIS DOCUMENTATION
│   ├── MIGRATION_PLAN.md        Migration strategy (READ THIS FIRST)
│   ├── README.md                Project overview
│   ├── STRUCTURE.md             This file
│   ├── DEVELOPMENT.md           Development workflow
│   ├── UI_CUSTOMIZATION.md      UI/theming changes (Cursor-like design)
│   ├── AI_CHAT.md               AI chat implementation details
│   ├── last_conversation_context.md  Context for next agent
│   └── archive/                 Outdated docs
│
├── product.json                 ← Branding (GameDev IDE)
├── package.json                 ← Dependencies
├── .env                         ← API keys (not in git)
├── run.sh                       ← Launch script
└── [other VSCode files]
```

---

## Our Code: Built-in Contributions + Extensions

Game development features are implemented as either **built-in workbench contributions** (for deep integration) or **extensions** (for modular features).

### Built-in: AI Chat (Cursor-style)

**Location:** `src/vs/workbench/contrib/gamedevChat/browser/`

```
src/vs/workbench/contrib/gamedevChat/browser/
├── gamedevChat.contribution.ts  ← View registration & service binding
├── gamedevChatService.ts        ← Claude API client with streaming
└── gamedevChatViewPane.ts       ← Chat UI (ViewPane)
```

**Why built-in instead of extension?**
- Deeper integration with VS Code UI
- Cursor-like feel (appears in auxiliary bar)
- More control over layout and behavior

**What it does:**
- AI chat panel in right sidebar (auxiliary bar)
- Claude API integration with streaming
- API key from .env file (dynamic loading)
- Message persistence
- Markdown rendering

**See [AI_CHAT.md](./AI_CHAT.md) for complete implementation details.**

---

### Extension: Unity Integration

```
extensions/unity-integration/    (currently named godot-integration)
├── package.json
├── src/
│   ├── extension.ts             ← Entry point
│   ├── sceneParser.ts           ← Parses .unity YAML files
│   ├── projectAnalyzer.ts       ← Analyzes Unity project
│   ├── sceneExplorer.ts         ← TreeDataProvider for GameObjects
│   ├── inspectorPanel.ts        ← Webview for properties
│   ├── models/
│   │   ├── unityScene.ts
│   │   ├── gameObject.ts
│   │   └── component.ts
│   └── webview/                 ← Inspector UI
│       └── Inspector.tsx
├── out/
└── media/
```

**What it does:**
- Parse Unity .unity scene files (YAML format)
- Display GameObject hierarchy in TreeView
- Inspector panel for properties
- Auto-detect Unity projects

**Source to migrate from:**
- `GameDevIDE/src/main/services/engine/unity/SceneParser.ts`
- `GameDevIDE/src/main/services/engine/unity/ProjectAnalyzer.ts`
- `GameDevIDE/src/renderer/components/engine/SceneViewer.tsx`

**TODO**: Rename `godot-integration` → `unity-integration`

---

### Extension: Asset Generation

```
extensions/asset-generation/
├── package.json
├── src/
│   ├── extension.ts             ← Entry point
│   ├── pixellabService.ts       ← PixelLab API client
│   ├── assetBrowser.ts          ← TreeDataProvider for assets
│   ├── generationPanel.ts       ← Webview for asset generation
│   ├── assetImporter.ts         ← Import generated assets
│   └── webview/
│       ├── GenerationForm.tsx
│       └── AssetPreview.tsx
├── out/
└── media/
```

**What it does:**
- Generate game assets via PixelLab API
- Browse project assets (images, audio)
- Asset generation UI
- Auto-import generated assets

**Source to migrate from:**
- `GameDevIDE/src/main/services/pixellab/PixelLabService.ts` (has a bug to fix!)
- `GameDevIDE/src/renderer/components/assets/AssetBrowser.tsx`
- `GameDevIDE/src/renderer/components/assets/GenerationPanel.tsx`

---

### Extension: Pixel Editor

```
extensions/pixel-editor/         (to be created)
├── package.json
├── src/
│   ├── extension.ts             ← Entry point
│   ├── pixelEditorProvider.ts   ← CustomTextEditorProvider
│   ├── pixelDocument.ts         ← Document model
│   └── webview/                 ← Entire pixel editor app
│       ├── index.tsx            ← Entry point
│       ├── PixelEditor.tsx      ← Main editor component
│       ├── Canvas.tsx           ← Canvas rendering
│       ├── tools/               ← Drawing tools
│       │   ├── PencilTool.ts
│       │   ├── EraserTool.ts
│       │   ├── FillTool.ts
│       │   ├── LineTool.ts
│       │   └── ShapeTool.ts
│       ├── ColorPalette.tsx
│       ├── LayerPanel.tsx
│       └── Toolbar.tsx
├── out/
└── media/
```

**What it does:**
- Custom editor for .png files
- Canvas-based pixel art editing
- Drawing tools (pencil, eraser, bucket fill, shapes)
- Color palette
- Grid overlay
- Undo/redo

**Source to migrate from:**
- `GameDevIDE/src/renderer/components/pixel-editor/` (entire directory!)
- All React components can be reused, just wrapped in webview

---

### Extension: Custom Theme

```
extensions/theme-gamedev-dark/
├── package.json                 ← Extension manifest
└── themes/
    └── gamedev-dark-color-theme.json  ← Full color theme
```

**What it does:**
- Provides Cursor-like dark theme as default
- Near-black backgrounds (#181818, #1e1e1e)
- Soft blue accent (#7aa2f7)
- Minimal borders for clean look

**Key design decisions:**
- NOT pure black (#000000) - too harsh
- Softer blue accent instead of bright cyan
- Most borders are transparent
- Consistent backgrounds across UI

**See [UI_CUSTOMIZATION.md](./UI_CUSTOMIZATION.md) for complete UI theming documentation.**

---

## Extension Anatomy

Every VS Code extension has this structure:

### package.json (Extension Manifest)

```json
{
  "name": "gamedev-ai",
  "displayName": "GameDev AI Assistant",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.85.0"
  },
  "activationEvents": [
    "onStartupFinished"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "gamedev-ai",
          "title": "GameDev AI",
          "icon": "media/robot.svg"
        }
      ]
    },
    "views": {
      "gamedev-ai": [
        {
          "id": "gamedev-ai-chat",
          "name": "AI Assistant"
        }
      ]
    },
    "commands": [
      {
        "command": "gamedev-ai.openChat",
        "title": "GameDev AI: Open Chat"
      }
    ],
    "configuration": {
      "title": "GameDev AI",
      "properties": {
        "gamedev.ai.anthropicApiKey": {
          "type": "string",
          "description": "Anthropic API key for Claude"
        }
      }
    }
  }
}
```

### extension.ts (Entry Point)

```typescript
import * as vscode from 'vscode';
import { ChatProvider } from './chatProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('GameDev AI extension activated');

    // Register views
    const chatProvider = new ChatProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('gamedev-ai-chat', chatProvider)
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('gamedev-ai.openChat', () => {
            vscode.commands.executeCommand('gamedev-ai-chat.focus');
        })
    );
}

export function deactivate() {}
```

---

## How Extensions Load

### 1. VS Code Startup
```
./run.sh
  ↓
VS Code starts
  ↓
Reads extensions/ directory
  ↓
Loads all package.json files
  ↓
Activates extensions based on activationEvents
```

### 2. Extension Activation
```
activationEvents triggered (e.g., "onStartupFinished")
  ↓
extension.ts activate() function runs
  ↓
Registers views, commands, providers
  ↓
Extension is now active
```

### 3. User Interaction
```
User clicks GameDev AI icon in sidebar
  ↓
VS Code calls WebviewViewProvider.resolveWebviewView()
  ↓
Extension renders chat UI
  ↓
User types message
  ↓
Extension calls ClaudeService
  ↓
Response displayed in chat
```

---

## Build Process

### TypeScript Compilation

```bash
npm run watch
```

This runs `tsc --watch` in each extension directory:
```
extensions/gamedev-ai/src/extension.ts
  ↓ TypeScript compiler
extensions/gamedev-ai/out/extension.js
```

### Extension Loading

VS Code looks for compiled JavaScript in `out/` directory:
```
extensions/gamedev-ai/package.json
  → "main": "./out/extension.js"
    → VS Code loads this file
```

### Webview Bundling

For extensions with React webviews, need webpack/vite:
```
extensions/gamedev-ai/src/webview/index.tsx
  ↓ webpack/vite
extensions/gamedev-ai/out/webview/bundle.js
  ↓ loaded by webview HTML
Renders React app in webview panel
```

---

## Inter-Extension Communication

Extensions can communicate via VS Code's command system:

```typescript
// In asset-generation extension
vscode.commands.executeCommand('gamedev-ai.sendMessage', 'Generate a sword sprite');

// In gamedev-ai extension
vscode.commands.registerCommand('gamedev-ai.sendMessage', async (message: string) => {
    // Handle message from other extension
    await chatService.sendMessage(message);
});
```

---

## Extension Development Workflow

### 1. Edit Code
```bash
# Edit files in extensions/*/src/
code extensions/gamedev-ai/src/extension.ts
```

### 2. Auto-Compile
```bash
# Watch mode compiles on save
npm run watch
```

### 3. Reload
```bash
# In the running VS Code window
Cmd+R  # or "Developer: Reload Window"
```

### 4. Debug
```bash
# Open DevTools
Cmd+Shift+I

# Check Extension Host logs
Help → Toggle Developer Tools → Console tab
Filter by extension name
```

---

## Configuration Files

### package.json (Root)
- VS Code fork metadata
- Build scripts
- Dependencies

### extensions/*/package.json
- Extension manifests
- Each extension has its own
- Defines commands, views, settings

### product.json
- Branding (GameDev IDE)
- Default settings
- Application name

### tsconfig.json (per extension)
- TypeScript compiler settings
- Target: ES2020
- Module: CommonJS

---

## Naming Conventions

### Files
- `extension.ts` - Extension entry point
- `*Service.ts` - Business logic classes
- `*Provider.ts` - VS Code providers (TreeView, Webview, etc.)
- `*.tsx` - React components (webviews)

### Classes
- `FooService` - Services
- `FooProvider` - Providers
- `FooPanel` - React components

### Commands
- `gamedev-ai.openChat` - Namespaced with extension ID
- `unity.viewScene` - Use category.action pattern

---

## Electron App vs VS Code Extension

### File Reading

**Electron:**
```typescript
import fs from 'fs';
const content = fs.readFileSync('/path/to/file', 'utf-8');
```

**VS Code Extension:**
```typescript
import * as vscode from 'vscode';
const uri = vscode.Uri.file('/path/to/file');
const bytes = await vscode.workspace.fs.readFile(uri);
const content = Buffer.from(bytes).toString('utf-8');
```

### Configuration

**Electron:**
```typescript
import Store from 'electron-store';
const store = new Store();
const apiKey = store.get('anthropic.apiKey');
```

**VS Code Extension:**
```typescript
import * as vscode from 'vscode';
const config = vscode.workspace.getConfiguration('gamedev.ai');
const apiKey = config.get<string>('anthropicApiKey');
```

### UI

**Electron:**
```typescript
// React renders in Electron window
<div className="chat-panel">
    <ChatMessages />
</div>
```

**VS Code Extension:**
```typescript
// React renders in webview
webviewView.webview.html = getWebviewHtml(webviewView.webview, extensionUri);

// Webview HTML loads React bundle
<script src="${webviewUri}"></script>
```

---

## Source Locations

### Electron App (Source)
```
/Users/azechary/Documents/GitHub/GameDevIDE/
├── src/main/services/        ← Business logic to port
├── src/renderer/components/  ← UI components to port
└── STATUS.md                 ← Feature status (~42% done)
```

### VS Code Fork (Target)
```
/Users/azechary/Documents/GitHub/gamedev-ide/
├── extensions/               ← Port features here
└── docs/                     ← Documentation
```

---

## Next Steps

1. **Read** [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) for full strategy
2. **Port** AI Assistant first (Week 1-2)
3. **Port** Unity Integration next (Week 3-4)
4. **Port** Pixel Editor (Week 5-6)
5. **Port** Asset Generation (Week 7-8)

---

**All game dev features live in `extensions/` directory!**
