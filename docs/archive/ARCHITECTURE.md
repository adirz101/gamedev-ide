# GameDev IDE - Built-in Architecture

> **IMPORTANT**: This is a VSCode fork with game development features **built INTO the core**, not as extensions. Like Cursor integrates AI deeply into VSCode, we integrate game development tools directly into the workbench.

## Philosophy: Built-in, Not Bolted-on

We forked VSCode specifically to build game development features **INTO** the product, not as plugins. Users get a cohesive, integrated game development IDE - not VSCode with add-ons.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    GAMEDEV IDE (VSCode Fork)                 │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              VSCode Core (Untouched)                │    │
│  │  • Monaco Editor                                    │    │
│  │  • File System                                      │    │
│  │  • Terminal                                         │    │
│  │  • Git                                              │    │
│  │  • Settings                                         │    │
│  └─────────────────────────────────────────────────────┘    │
│                           ↕                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │          Built-in Game Dev Features (OUR CODE)      │    │
│  │                                                       │    │
│  │  ┌────────────────┐  ┌────────────────┐            │    │
│  │  │  AI Assistant  │  │ Godot          │            │    │
│  │  │  (Chat Panel)  │  │ Integration    │            │    │
│  │  │  • Claude API  │  │ • Scene Viewer │            │    │
│  │  │  • Context     │  │ • Node Tree    │            │    │
│  │  │  • Tools       │  │ • .tscn Parser │            │    │
│  │  └────────────────┘  └────────────────┘            │    │
│  │                                                       │    │
│  │  ┌────────────────┐  ┌────────────────┐            │    │
│  │  │ Pixel Editor   │  │ Asset Gen      │            │    │
│  │  │ (Canvas-based) │  │ (PixelLab)     │            │    │
│  │  │ • Draw Tools   │  │ • AI Generate  │            │    │
│  │  │ • Layers       │  │ • Import       │            │    │
│  │  │ • Animation    │  │ • Browser      │            │    │
│  │  └────────────────┘  └────────────────┘            │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Core Principles

### 1. Deep Integration
- Features are **workbench contributions** (`src/vs/workbench/contrib/gamedev/`)
- Not extensions that can be uninstalled
- Ship with the product by default
- Use VSCode's internal APIs, not extension API

### 2. Native Feel
- Match VSCode's UI patterns
- Use VSCode's theming system
- Follow VSCode's architecture patterns
- Feel like part of the product, not plugins

### 3. Game-First Design
- Auto-detect game projects (Godot, Unity, etc.)
- Context-aware AI that understands game structure
- Asset pipeline integrated into workflow
- Scene editing alongside code editing

## Directory Structure

```
gamedev-ide/ (VSCode fork)
├── src/
│   └── vs/
│       └── workbench/
│           └── contrib/
│               └── gamedev/               ← OUR CODE
│                   ├── aiAssistant/        Built-in AI chat
│                   │   ├── browser/
│                   │   │   ├── aiAssistant.contribution.ts
│                   │   │   ├── aiChatView.ts
│                   │   │   ├── aiChatService.ts
│                   │   │   └── claudeClient.ts
│                   │   └── common/
│                   │       └── aiAssistant.ts
│                   │
│                   ├── godotIntegration/    Built-in Godot support
│                   │   ├── browser/
│                   │   │   ├── godot.contribution.ts
│                   │   │   ├── sceneExplorerView.ts
│                   │   │   ├── nodeInspectorView.ts
│                   │   │   └── tscnParser.ts
│                   │   └── common/
│                   │       └── godotProject.ts
│                   │
│                   ├── assetGeneration/     Built-in asset tools
│                   │   ├── browser/
│                   │   │   ├── assetGen.contribution.ts
│                   │   │   ├── assetGenPanel.ts
│                   │   │   ├── assetBrowser.ts
│                   │   │   └── pixellabClient.ts
│                   │   └── common/
│                   │       └── assetService.ts
│                   │
│                   └── pixelEditor/         Built-in pixel art editor
│                       ├── browser/
│                       │   ├── pixelEditor.contribution.ts
│                       │   ├── pixelEditorInput.ts
│                       │   ├── pixelEditorModel.ts
│                       │   ├── pixelEditorWidget.ts
│                       │   ├── tools/
│                       │   │   ├── pencilTool.ts
│                       │   │   ├── eraserTool.ts
│                       │   │   └── fillTool.ts
│                       │   └── layers/
│                       │       └── layerManager.ts
│                       └── common/
│                           └── pixelEditor.ts
│
├── docs/                                  ← DOCUMENTATION
│   ├── ARCHITECTURE.md                     This file
│   ├── STRUCTURE.md                        Directory details
│   ├── DEVELOPMENT.md                      How to develop
│   ├── AI_ASSISTANT.md                     AI feature docs
│   ├── GODOT_INTEGRATION.md                Godot feature docs
│   ├── ASSET_GENERATION.md                 Asset feature docs
│   └── PIXEL_EDITOR.md                     Pixel editor docs
│
├── product.json                            Branding
└── package.json                            GameDev IDE v0.1.0
```

## Feature Architecture

### 1. AI Assistant (Built-in Chat)

**Location**: `src/vs/workbench/contrib/gamedev/aiAssistant/`

**What it is**: A native chat panel in the workbench, like VSCode's built-in terminal or debug console.

**Integration Points**:
- **View**: Registered as workbench view container
- **Service**: `IAIAssistantService` - injectable service
- **Commands**: Native workbench commands
- **Keybindings**: Built-in keyboard shortcuts
- **Settings**: Native configuration contribution

**Key Files**:
```typescript
// aiAssistant.contribution.ts - Registers everything
class AIAssistantContribution implements IWorkbenchContribution {
  constructor(
    @IInstantiationService instantiationService: IInstantiationService,
    @IViewsService viewsService: IViewsService
  ) {
    // Register AI chat view
    // Register commands
    // Register keybindings
  }
}

// aiChatView.ts - The chat UI
class AIChatView extends ViewPane {
  // Renders chat interface
  // Handles message sending
  // Displays AI responses
}

// aiChatService.ts - Business logic
class AIChatService implements IAIChatService {
  async sendMessage(message: string): Promise<string> {
    // Call Claude API
    // Manage conversation history
    // Apply tools (file edits, scene mods)
  }
}
```

**Why Built-in**:
- Always available (like terminal)
- Deep integration with workspace
- Can access internal APIs
- Project context automatically available
- No extension installation needed

### 2. Godot Integration (Built-in Scene Viewer)

**Location**: `src/vs/workbench/contrib/gamedev/godotIntegration/`

**What it is**: Native support for Godot projects - scene explorer, node inspector, .tscn parser.

**Integration Points**:
- **Tree View**: Native tree view (like file explorer)
- **Editor**: Custom editor for .tscn files
- **Language**: GDScript syntax highlighting
- **Project Detection**: Auto-detect project.godot

**Key Files**:
```typescript
// godot.contribution.ts
class GodotContribution implements IWorkbenchContribution {
  // Register scene explorer view
  // Register .tscn editor
  // Add GDScript language support
}

// sceneExplorerView.ts
class SceneExplorerView extends TreeView {
  // Show .tscn files
  // Parse and display node hierarchy
  // Click to inspect nodes
}

// tscnParser.ts
class TscnParser {
  parse(content: string): GodotScene {
    // Parse Godot's text-based scene format
    // Return structured scene tree
  }
}
```

**Why Built-in**:
- Feels like native IDE feature
- Integrated with file explorer
- Can modify editor behavior for .tscn files
- Scene viewing is core functionality

### 3. Asset Generation (Built-in Panel)

**Location**: `src/vs/workbench/contrib/gamedev/assetGeneration/`

**What it is**: Native panel for generating game assets via AI.

**Integration Points**:
- **Panel**: Webview-based panel (like welcome screen)
- **Browser**: Tree view of project assets
- **Service**: Asset generation service
- **Import**: Auto-import generated assets

**Key Files**:
```typescript
// assetGen.contribution.ts
class AssetGenContribution implements IWorkbenchContribution {
  // Register asset generation panel
  // Register asset browser
  // Add asset commands
}

// assetGenPanel.ts
class AssetGenPanel extends WebviewPanel {
  // UI for asset generation
  // Prompt input
  // Preview generated assets
  // Import to project
}

// pixellabClient.ts
class PixelLabClient {
  async generate(prompt: string, style: string): Promise<Blob> {
    // Call PixelLab API
    // Return generated image
  }
}
```

**Why Built-in**:
- Asset creation is core game dev workflow
- Tight integration with file system
- Can auto-import to correct locations
- Native UI feels professional

### 4. Pixel Editor (Built-in Editor Type)

**Location**: `src/vs/workbench/contrib/gamedev/pixelEditor/`

**What it is**: A custom editor for .png files that provides pixel art editing.

**Integration Points**:
- **Editor**: Custom editor input/model (like notebook editor)
- **Canvas**: HTML5 Canvas-based drawing
- **Tools**: Pencil, eraser, fill, shapes
- **Layers**: Layer management system

**Key Files**:
```typescript
// pixelEditor.contribution.ts
class PixelEditorContribution implements IWorkbenchContribution {
  constructor(
    @IEditorResolverService editorResolverService: IEditorResolverService
  ) {
    // Register .png files to open in pixel editor
    editorResolverService.registerEditor(
      '*.png',
      { id: 'pixelEditor', priority: RegisteredEditorPriority.builtin }
    );
  }
}

// pixelEditorInput.ts
class PixelEditorInput extends EditorInput {
  // Represents a pixel art file being edited
}

// pixelEditorWidget.ts
class PixelEditorWidget {
  // Canvas rendering
  // Tool handling
  // Layer management
  // Export functionality
}
```

**Why Built-in**:
- Custom editor behavior requires core integration
- Needs to override default image viewer
- Layer system requires complex state management
- Professional pixel editor is unique selling point

## VSCode Contribution Pattern

All our features follow VSCode's contribution pattern:

```typescript
// Every feature has a .contribution.ts file
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';

class MyFeatureContribution implements IWorkbenchContribution {
  constructor(
    // Inject VSCode services via dependency injection
    @IViewDescriptorService private viewDescriptorService: IViewDescriptorService,
    @IInstantiationService private instantiationService: IInstantiationService
  ) {
    this.registerViews();
    this.registerCommands();
  }

  private registerViews(): void {
    // Register UI elements
  }

  private registerCommands(): void {
    // Register commands
  }
}

// Register the contribution to run at workbench startup
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
  .registerWorkbenchContribution(MyFeatureContribution, LifecyclePhase.Restored);
```

## Development Workflow

### 1. File Organization
- `browser/` - UI code (runs in browser/renderer process)
- `common/` - Shared code (runs everywhere)
- `*.contribution.ts` - Registration and wiring

### 2. Building
```bash
npm run watch  # Compiles TypeScript
./scripts/code.sh  # Run development build
```

### 3. Testing
- Changes reflected immediately with watch mode
- Reload window: Cmd+R
- Check DevTools for errors

## Key Differences from Extension Approach

| Aspect | Extension | Built-in (Our Approach) |
|--------|-----------|-------------------------|
| **Location** | `extensions/` | `src/vs/workbench/contrib/` |
| **APIs** | Extension API only | Full internal APIs |
| **Installation** | User installs | Ships with product |
| **Integration** | Loose | Deep |
| **Performance** | Separate process | Same process |
| **Updates** | Separate versioning | Bundled with IDE |
| **Uninstall** | Can be removed | Core feature |

## Benefits of Built-in Approach

✅ **Deep Integration**: Access to VSCode internals, not just public API
✅ **Performance**: No IPC overhead, direct function calls
✅ **Cohesive UX**: Feels like one product, not plugins
✅ **Reliability**: Versioned with IDE, no compatibility issues
✅ **Professional**: Users see this as a game dev IDE, not VSCode + plugins
✅ **Control**: We own the entire experience

## Next Steps

1. ✅ Create directory structure
2. ⏳ Implement AI Assistant contribution
3. ⏳ Implement Godot Integration contribution
4. ⏳ Implement Asset Generation contribution
5. ⏳ Implement Pixel Editor contribution
6. ⏳ Wire everything into workbench

---

**This is a game development IDE built on VSCode, not VSCode with game dev extensions.**
