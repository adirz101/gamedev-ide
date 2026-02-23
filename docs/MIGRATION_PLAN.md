# GameDev IDE - Migration Plan

## Executive Summary

**Purpose**: Migrate working features from GameDevIDE (Electron app) to gamedev-ide (VS Code fork)

**Why**: Create a Cursor-like experience for game developers - a VS Code fork with deep game development integration

**Status**: Electron prototype is ~42% complete with working features. VS Code fork has scaffolding but needs feature implementation.

---

## Overview

### What We Have

**1. GameDevIDE (Electron App)** - `/Users/azechary/Documents/GitHub/GameDevIDE`
- ✅ **Working prototype** with ~42% of MVP complete
- ✅ Unity scene parser (YAML-based .unity files)
- ✅ Claude AI integration (streaming chat, context-aware)
- ✅ Pixel art editor (LibreSprite-inspired, canvas-based)
- ✅ PixelLab API client (has a parsing bug, but structure is there)
- ✅ Project analyzer (scans Unity projects)
- ✅ Monaco editor integration
- ✅ Multi-view layout (Code/Pixel/Scene tabs)

**2. gamedev-ide (VS Code Fork)** - `/Users/azechary/Documents/GitHub/gamedev-ide`
- ✅ VS Code successfully forked and compiling
- ✅ Custom branding applied
- ✅ Extension scaffolding created
- ❌ **No actual functionality yet** - just placeholder UIs

### What We're Building

**A Cursor-like IDE for game developers** - VS Code fork with:
- AI assistance specialized for game development
- Unity/Godot scene visualization and editing
- AI-powered asset generation (PixelLab integration)
- Built-in pixel art editor
- Deep project understanding (scripts, scenes, assets)

---

## Migration Strategy

### Architecture Decision: Extensions vs Built-in

After reviewing the current state, we'll use **VS Code Extensions** approach:

**Why Extensions:**
- ✅ Faster development (Extension API is well-documented)
- ✅ Can iterate quickly without rebuilding entire VS Code
- ✅ Easier to maintain and update
- ✅ Can still deeply integrate (webviews, custom editors, etc.)
- ✅ Users can disable features if needed

**Not Built-in Because:**
- ❌ Requires deep VSCode internals knowledge
- ❌ Slower iteration (full recompile each change)
- ❌ Harder to maintain across VSCode updates
- ❌ Overkill for our needs - extensions can do everything we want

### Extension Architecture

```
gamedev-ide/
└── extensions/
    ├── gamedev-ai/              ← AI Assistant (Claude integration)
    ├── unity-integration/       ← Unity scene viewer & parser
    ├── asset-generation/        ← PixelLab + Asset browser
    └── pixel-editor/            ← Pixel art canvas editor
```

Each extension is independent but can communicate via VS Code's API.

---

## Feature Migration Map

### 1. AI Assistant Extension

**Source (Electron):**
```
GameDevIDE/src/main/services/ai/
├── ClaudeService.ts              ✅ Working Claude API client
├── ContextBuilder.ts             ✅ Project context generation
└── [IPC handlers]
```

**Target (VS Code Extension):**
```
extensions/gamedev-ai/
├── src/
│   ├── extension.ts              ← Entry point
│   ├── claudeService.ts          ← Port ClaudeService.ts
│   ├── contextBuilder.ts         ← Port ContextBuilder.ts
│   ├── chatProvider.ts           ← Webview for chat UI
│   └── tools/                    ← AI tools (file edit, scene mod)
```

**Migration Tasks:**
- [x] Extension scaffold created
- [ ] Port ClaudeService.ts → claudeService.ts
- [ ] Port ContextBuilder.ts → contextBuilder.ts
- [ ] Implement chat webview with React (can reuse Electron UI)
- [ ] Add streaming response handling
- [ ] Implement conversation history
- [ ] Add tool use (file modifications, scene edits)

**Key Changes:**
- Replace Electron IPC → VS Code Extension API
- Replace `src/main/services` structure → Extension structure
- Configuration: Electron's electron-store → VS Code settings

---

### 2. Unity Integration Extension

**Source (Electron):**
```
GameDevIDE/src/main/services/engine/unity/
├── SceneParser.ts                ✅ Parses .unity YAML files
├── ProjectAnalyzer.ts            ✅ Analyzes Unity project structure
└── [Scene/GameObject models]
```

**Target (VS Code Extension):**
```
extensions/unity-integration/
├── src/
│   ├── extension.ts              ← Entry point
│   ├── sceneParser.ts            ← Port SceneParser.ts
│   ├── projectAnalyzer.ts        ← Port ProjectAnalyzer.ts
│   ├── sceneExplorer.ts          ← TreeView provider
│   ├── inspectorPanel.ts         ← Properties webview
│   └── models/                   ← Scene/GameObject types
```

**Migration Tasks:**
- [x] Extension scaffold created (as godot-integration, needs rename)
- [ ] Rename godot-integration → unity-integration
- [ ] Port SceneParser.ts (YAML parsing logic)
- [ ] Port ProjectAnalyzer.ts
- [ ] Implement TreeView for GameObject hierarchy
- [ ] Create inspector panel webview
- [ ] Add .unity file association

**Key Changes:**
- YAML parsing library (js-yaml) works same in both
- File reading: Electron's fs → VS Code's workspace.fs
- UI: React components → VS Code TreeView + Webview

---

### 3. Pixel Editor Extension

**Source (Electron):**
```
GameDevIDE/src/renderer/components/pixel-editor/
├── PixelEditor.tsx               ✅ Main editor component
├── Canvas.tsx                    ✅ Canvas rendering
├── tools/                        ✅ Drawing tools (pencil, eraser, etc.)
├── ColorPalette.tsx              ✅ Color picker
└── [Drawing logic]
```

**Target (VS Code Extension):**
```
extensions/pixel-editor/
├── src/
│   ├── extension.ts              ← Entry point, custom editor provider
│   ├── pixelEditorProvider.ts   ← CustomTextEditorProvider
│   ├── webview/                  ← React app (port entire pixel editor!)
│   │   ├── PixelEditor.tsx       ← Port from Electron
│   │   ├── Canvas.tsx            ← Port from Electron
│   │   ├── tools/                ← Port all tools
│   │   └── ColorPalette.tsx      ← Port from Electron
│   └── pixelDocument.ts          ← Document model
```

**Migration Tasks:**
- [ ] Create extension scaffold
- [ ] Implement CustomTextEditorProvider
- [ ] Port entire React pixel editor to webview
- [ ] Set up webview build process (webpack/vite)
- [ ] Implement save/load for .png files
- [ ] Add .png file association

**Key Changes:**
- Canvas logic stays identical (HTML5 Canvas)
- File I/O: Electron's fs → VS Code's CustomDocument
- React app runs in webview (same code, different container)

---

### 4. Asset Generation Extension

**Source (Electron):**
```
GameDevIDE/src/main/services/pixellab/
├── PixelLabService.ts            ✅ API client (has bug, but structure good)
└── [Asset generation handlers]
```

**Target (VS Code Extension):**
```
extensions/asset-generation/
├── src/
│   ├── extension.ts              ← Entry point
│   ├── pixellabService.ts        ← Port PixelLabService.ts
│   ├── assetBrowser.ts           ← TreeView of assets
│   ├── generationPanel.ts        ← Webview for generation UI
│   └── assetImporter.ts          ← Import generated assets
```

**Migration Tasks:**
- [x] Extension scaffold created
- [ ] Port PixelLabService.ts (fix the parsing bug!)
- [ ] Implement asset browser TreeView
- [ ] Create generation panel webview
- [ ] Add asset import workflow
- [ ] Integrate with AI assistant extension

**Key Changes:**
- HTTP client: Works same (fetch/axios)
- Fix the base64 parsing bug while porting
- File writing: Electron's fs → VS Code's workspace.fs

---

## Technical Migration Details

### Electron → VS Code API Mappings

| Electron App | VS Code Extension |
|--------------|-------------------|
| **IPC Communication** | Extension API (commands, events) |
| `ipcRenderer.invoke()` | `vscode.commands.executeCommand()` |
| `ipcMain.handle()` | Command registration |
| **File Operations** | |
| `fs.readFile()` | `vscode.workspace.fs.readFile()` |
| `fs.writeFile()` | `vscode.workspace.fs.writeFile()` |
| **Configuration** | |
| `electron-store` | `vscode.workspace.getConfiguration()` |
| **UI Components** | |
| React in Electron | React in Webview |
| Custom windows | Webview panels |
| **State Management** | |
| Zustand stores | Extension context + workspace state |

### Code Reuse Opportunities

**High Reusability (90%+):**
- ✅ SceneParser.ts - Pure TypeScript, YAML parsing
- ✅ ContextBuilder.ts - Pure logic, just change file reading
- ✅ Pixel editor canvas logic - HTML5 Canvas works anywhere
- ✅ Drawing tools - Pure TypeScript classes
- ✅ PixelLabService.ts - HTTP client, works same

**Medium Reusability (50-70%):**
- ⚠️ React UI components - Need to wrap in webviews
- ⚠️ ClaudeService.ts - API client works, just change config source
- ⚠️ ProjectAnalyzer.ts - Logic same, file reading API changes

**Low Reusability (Needs Rewrite):**
- ❌ IPC handlers - Replace with VS Code commands
- ❌ Electron-specific file dialogs - Use VS Code's native ones
- ❌ Window management - VS Code handles this
- ❌ Main process services - Move to extension hosts

---

## Implementation Priority

### Phase 1: AI Assistant (Week 1-2)
**Goal**: Working AI chat in VS Code

**Tasks:**
1. Port ClaudeService.ts to extension
2. Implement chat webview (can reuse Electron UI)
3. Add streaming responses
4. Integrate with workspace context
5. Test with real Unity project

**Success Criteria:**
- Can chat with Claude in VS Code sidebar
- AI understands Unity project structure
- Streaming responses work smoothly

---

### Phase 2: Unity Integration (Week 3-4)
**Goal**: Unity scene viewing in VS Code

**Tasks:**
1. Port SceneParser.ts and ProjectAnalyzer.ts
2. Implement GameObject hierarchy TreeView
3. Create inspector panel webview
4. Add .unity file click-to-view
5. Test with sample Unity project

**Success Criteria:**
- Can open .unity files and see hierarchy
- GameObject properties visible in inspector
- Tree view shows nested GameObjects correctly

---

### Phase 3: Pixel Editor (Week 5-6)
**Goal**: Full-featured pixel art editor

**Tasks:**
1. Port entire pixel editor React app
2. Implement CustomTextEditorProvider
3. Set up webview build system
4. Implement save/load for .png files
5. Test all drawing tools

**Success Criteria:**
- Can open .png files in pixel editor
- All tools work (pencil, eraser, fill, etc.)
- Can save changes to .png files
- Undo/redo works

---

### Phase 4: Asset Generation (Week 7-8)
**Goal**: AI asset generation working

**Tasks:**
1. Port PixelLabService.ts (fix parsing bug!)
2. Create generation panel UI
3. Implement asset browser
4. Add import workflow
5. Integrate with AI chat

**Success Criteria:**
- Can generate assets via PixelLab API
- Assets import to project automatically
- Can open generated assets in pixel editor
- AI can trigger asset generation

---

### Phase 5: Polish & Integration (Week 9-10)
**Goal**: All features working together seamlessly

**Tasks:**
1. AI can modify Unity scenes
2. AI can generate and import assets
3. Pixel editor integrated with asset browser
4. Project analyzer feeds context to AI
5. End-to-end workflow testing

**Success Criteria:**
- User can say "add health bar" and AI does it all
- Assets generated and placed in project automatically
- Unity scenes can be edited via AI
- Everything feels cohesive

---

## Current Status

### What's Done
- ✅ VS Code fork compiles and runs
- ✅ Extension scaffolds created (3 out of 4)
- ✅ Custom branding applied
- ✅ Documentation structure created

### What's Next
1. **Immediate**: Port AI assistant (ClaudeService.ts → extension)
2. **Then**: Port Unity scene parser
3. **Then**: Port pixel editor
4. **Finally**: Port asset generation (fix bug!)

---

## File Migration Checklist

### High-Priority Files to Port

**AI Assistant:**
- [ ] `ClaudeService.ts` - Claude API client
- [ ] `ContextBuilder.ts` - Project context builder
- [ ] `AIChatPanel.tsx` - Chat UI (convert to webview)

**Unity Integration:**
- [ ] `SceneParser.ts` - .unity YAML parser
- [ ] `ProjectAnalyzer.ts` - Project structure analyzer
- [ ] `SceneViewer.tsx` - GameObject hierarchy UI

**Pixel Editor:**
- [ ] `PixelEditor.tsx` - Main editor component
- [ ] `Canvas.tsx` - Canvas rendering
- [ ] `tools/` directory - All drawing tools
- [ ] `ColorPalette.tsx` - Color picker

**Asset Generation:**
- [ ] `PixelLabService.ts` - API client (fix bug!)
- [ ] `AssetGenerationPanel.tsx` - Generation UI

---

## Testing Strategy

### Per-Feature Testing

**For each feature:**
1. Unit tests for core logic (parsers, services)
2. Integration tests for VS Code API usage
3. Manual testing with real Unity projects
4. Performance testing with large projects

### End-to-End Testing

**Full workflow tests:**
1. Open Unity project
2. AI analyzes project structure
3. Chat with AI about game mechanics
4. Generate asset via AI
5. Edit asset in pixel editor
6. AI modifies Unity scene
7. Verify all changes persisted

---

## Migration Workflow (Per Feature)

### Step 1: Identify Source Files
Find all relevant Electron app files for the feature.

### Step 2: Create Extension Structure
Set up extension directory with proper structure.

### Step 3: Port Core Logic
Copy business logic (pure TypeScript) to extension.

### Step 4: Adapt APIs
Replace Electron APIs with VS Code APIs.

### Step 5: Port UI
Convert React components to webviews (if needed).

### Step 6: Test
Verify feature works in VS Code.

### Step 7: Integrate
Connect with other extensions if needed.

---

## Risk Mitigation

### Known Challenges

**1. PixelLab API Bug**
- **Risk**: Base64 parsing fails in Electron app
- **Mitigation**: Fix while porting to VS Code
- **Status**: Bug is well-documented, should be quick fix

**2. Webview Performance**
- **Risk**: Pixel editor might be slow in webview
- **Mitigation**: Optimize canvas rendering, use offscreen canvas
- **Status**: Low risk, Canvas API same everywhere

**3. Context Window Limits**
- **Risk**: Large Unity projects exceed Claude's context
- **Mitigation**: Smart file selection, already implemented in Electron
- **Status**: Solution exists, just need to port

**4. Extension Communication**
- **Risk**: Extensions need to talk to each other
- **Mitigation**: Use VS Code's command API for inter-extension communication
- **Status**: Standard pattern, well-documented

---

## Success Metrics

### Technical Metrics
- ✅ All Electron features ported to VS Code
- ✅ No regression in functionality
- ✅ Performance equal or better than Electron app
- ✅ All tests passing

### User Experience Metrics
- ✅ Feels like native VS Code (not bolted-on)
- ✅ Faster than switching between tools
- ✅ AI assistance actually helpful
- ✅ Asset generation works reliably

### Business Metrics
- 🎯 Ship MVP in 10 weeks
- 🎯 Support Unity and Godot
- 🎯 Feature parity with Electron prototype
- 🎯 Ready for beta testing

---

## Next Actions

### This Week
1. ✅ Create migration documentation (this doc!)
2. [ ] Port ClaudeService.ts to gamedev-ai extension
3. [ ] Implement chat webview with streaming
4. [ ] Test AI chat with sample Unity project

### Next Week
1. [ ] Port SceneParser.ts to unity-integration
2. [ ] Implement GameObject TreeView
3. [ ] Test scene viewing with real Unity scenes

### This Month
1. [ ] Complete AI Assistant migration
2. [ ] Complete Unity Integration migration
3. [ ] Start Pixel Editor migration
4. [ ] Fix PixelLab parsing bug during migration

---

## Resources

### Source Code Locations

**Electron App:**
- Path: `/Users/azechary/Documents/GitHub/GameDevIDE`
- Key files: `src/main/services/`, `src/renderer/components/`
- Status doc: `STATUS.md` (~42% complete)

**VS Code Fork:**
- Path: `/Users/azechary/Documents/GitHub/gamedev-ide`
- Extensions: `extensions/`
- Docs: `docs/` (you're reading this!)

### Documentation

**Electron App Docs:**
- `STATUS.md` - Current implementation status
- `PLAN.md` - Original implementation plan
- `docs/ARCHITECTURE.md` - Electron architecture

**VS Code Fork Docs:**
- This file: `MIGRATION_PLAN.md` - Migration strategy
- `STRUCTURE.md` - VS Code extension structure
- `DEVELOPMENT.md` - Development workflow

---

## Conclusion

We have a solid foundation in both codebases:
- Electron app has working features (~42% done)
- VS Code fork is set up and ready for extensions

The migration path is clear:
1. Port core logic (high reusability)
2. Adapt APIs (Electron → VS Code)
3. Wrap UIs in webviews
4. Test and integrate

**Estimated timeline**: 10 weeks to feature parity

**Next step**: Port AI Assistant (Week 1 priority)

---

**Let's migrate these features and create the Cursor for game developers!** 🎮🚀
