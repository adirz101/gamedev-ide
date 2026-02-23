# GameDev IDE Documentation

**A Cursor-like IDE for Game Developers** - VS Code fork with deep game development integration

---

## 🎯 Project Purpose

GameDev IDE is a fork of Visual Studio Code designed specifically for game developers. Like how [Cursor](https://cursor.com/) deeply integrates AI into VS Code, we're deeply integrating game development tools.

### What Makes This Different

Instead of switching between:
- VS Code (for coding)
- Unity/Godot Editor (for scenes)
- External tools (for assets)
- ChatGPT (for help)

Game developers get **one unified IDE** with everything integrated.

---

## 📖 Documentation Structure

### Start Here

**1. [MIGRATION_PLAN.md](./MIGRATION_PLAN.md)** - **READ THIS FIRST**
- Migration strategy from Electron prototype
- Feature-by-feature migration map
- Timeline and priorities
- Current status and next steps

**2. [STRUCTURE.md](./STRUCTURE.md)** - Extension Organization
- Where code lives
- Extension architecture
- File naming conventions
- Import patterns

**3. [DEVELOPMENT.md](./DEVELOPMENT.md)** - Development Workflow
- How to build and run
- VS Code extension patterns
- Testing and debugging
- Common APIs

### Feature-Specific Guides

| Guide | Purpose | Status |
|-------|---------|--------|
| **[MIGRATION_PLAN.md](./MIGRATION_PLAN.md)** | Overall migration strategy | ✅ Current |
| **[UI_CUSTOMIZATION.md](./UI_CUSTOMIZATION.md)** | UI/theming changes (Cursor-like design) | ✅ Complete |
| **AI_ASSISTANT.md** | AI chat migration guide | 📝 Coming soon |
| **UNITY_INTEGRATION.md** | Scene viewer migration | 📝 Coming soon |
| **PIXEL_EDITOR.md** | Pixel art editor migration | 📝 Coming soon |
| **ASSET_GENERATION.md** | PixelLab integration | 📝 Coming soon |

---

## 🚀 Quick Start

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

# Install dependencies (already done if you cloned recently)
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

1. Edit files in `extensions/*/src/`
2. Watch mode compiles automatically
3. Reload window in VS Code: **Cmd+R**

---

## 🗺️ Project Overview

### Current State

**We have TWO codebases:**

1. **GameDevIDE (Electron App)** - Working prototype
   - Path: `/Users/azechary/Documents/GitHub/GameDevIDE`
   - Status: ~42% complete with working features
   - Has: Unity parser, Claude AI, Pixel editor, PixelLab client

2. **gamedev-ide (VS Code Fork)** - Target platform
   - Path: `/Users/azechary/Documents/GitHub/gamedev-ide`
   - Status: Scaffolding ready, features need migration
   - Has: Extension structure, branding, build system

**Our Goal**: Migrate all working features from Electron → VS Code extensions

### Architecture: VS Code Extensions

```
gamedev-ide/
└── extensions/
    ├── gamedev-ai/              AI Assistant (Claude integration)
    ├── unity-integration/       Unity scene viewer & parser
    ├── asset-generation/        PixelLab + Asset browser
    └── pixel-editor/            Pixel art canvas editor
```

Each extension is independent but can communicate via VS Code's Extension API.

---

## 🎮 Features Being Migrated

### 1. AI Assistant ✅ (Priority 1)

**What it does:**
- Chat with Claude about your game project
- AI understands Unity project structure
- Context-aware responses (knows your scenes, scripts, assets)
- Tool use: AI can modify files and scenes

**Source:** GameDevIDE's ClaudeService.ts + ContextBuilder.ts
**Status:** Ready to migrate

### 2. Unity Integration ✅ (Priority 2)

**What it does:**
- Parse Unity .unity scene files (YAML format)
- Display GameObject hierarchy
- Inspector panel for properties
- Auto-detect Unity projects

**Source:** GameDevIDE's SceneParser.ts + ProjectAnalyzer.ts
**Status:** Parser fully working in Electron

### 3. Pixel Art Editor 🎨 (Priority 3)

**What it does:**
- Canvas-based pixel art editor
- Drawing tools: pencil, eraser, bucket fill, shapes
- Color palette
- Grid overlay
- Undo/redo
- Save as .png

**Source:** GameDevIDE's pixel-editor components
**Status:** Fully functional in Electron

### 4. Asset Generation 🖼️ (Priority 4)

**What it does:**
- Generate game assets using PixelLab AI
- Asset browser (view project images/audio)
- AI can trigger asset generation
- Auto-import generated assets

**Source:** GameDevIDE's PixelLabService.ts
**Status:** Has parsing bug, but structure is good

---

## 📋 Migration Status

### Week 1-2: AI Assistant
- [ ] Port ClaudeService.ts
- [ ] Port ContextBuilder.ts
- [ ] Implement chat webview
- [ ] Add streaming responses
- [ ] Test with Unity project

### Week 3-4: Unity Integration
- [ ] Port SceneParser.ts
- [ ] Port ProjectAnalyzer.ts
- [ ] Implement GameObject TreeView
- [ ] Create inspector panel
- [ ] Test with real Unity scenes

### Week 5-6: Pixel Editor
- [ ] Port pixel editor React app
- [ ] Implement CustomTextEditorProvider
- [ ] Set up webview build
- [ ] Test all drawing tools

### Week 7-8: Asset Generation
- [ ] Port PixelLabService.ts (fix bug!)
- [ ] Create generation panel
- [ ] Implement asset browser
- [ ] Test full workflow

### Week 9-10: Integration & Polish
- [ ] AI can modify scenes
- [ ] Asset generation workflow
- [ ] End-to-end testing
- [ ] Performance optimization

---

## 🛠️ Development Workflow

### Daily Development

```bash
# Terminal 1: Watch mode (auto-compile)
npm run watch

# Terminal 2: Run GameDev IDE
./run.sh

# Make changes in extensions/*/src/
# Reload window: Cmd+R
# Check DevTools for errors: Cmd+Shift+I
```

### Testing Extensions

1. **Launch Development Build**: `./run.sh`
2. **Open Test Project**: Open a Unity project folder
3. **Test Features**: Try AI chat, scene viewing, etc.
4. **Check Console**: Help → Toggle Developer Tools

### Adding New Features

1. **Read** [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) - Understand what we're porting
2. **Find Source** in GameDevIDE Electron app
3. **Port Logic** to appropriate extension
4. **Adapt APIs** from Electron → VS Code
5. **Test** with real Unity project
6. **Document** what you did

---

## 📚 Key Documentation

### Must-Read (In Order)

1. **[MIGRATION_PLAN.md](./MIGRATION_PLAN.md)** - Overall strategy and timeline
2. **[STRUCTURE.md](./STRUCTURE.md)** - Where everything lives
3. **[DEVELOPMENT.md](./DEVELOPMENT.md)** - How to develop
4. **[UI_CUSTOMIZATION.md](./UI_CUSTOMIZATION.md)** - UI/theming changes and file locations

### Reference

- **Electron App Status**: `/Users/azechary/Documents/GitHub/GameDevIDE/STATUS.md`
- **VS Code Extension API**: https://code.visualstudio.com/api
- **Webview Guide**: https://code.visualstudio.com/api/extension-guides/webview
- **TreeView Guide**: https://code.visualstudio.com/api/extension-guides/tree-view

---

## 🎯 Success Criteria

You'll know the migration is successful when:

- ✅ All Electron features work in VS Code
- ✅ Performance is equal or better
- ✅ Feels native to VS Code (not bolted-on)
- ✅ Can say "add health bar" and AI does it all
- ✅ Unity scenes viewable and editable
- ✅ Pixel art editor fully functional
- ✅ Assets generated and integrated automatically

---

## 🤔 Why This Approach?

### Why Fork VS Code?

**Pros:**
- ✅ Developers already use VS Code
- ✅ Don't have to convince them to switch
- ✅ Full control over experience
- ✅ Can add deep integrations
- ✅ Like Cursor, but for game dev

**vs. Building from Scratch:**
- ❌ Monaco editor alone is months of work
- ❌ Terminal, Git, Extensions - all built-in
- ❌ Mature, stable codebase

### Why Extensions (Not Built-in)?

**Pros:**
- ✅ Faster development
- ✅ Well-documented Extension API
- ✅ Easier to maintain
- ✅ Can iterate quickly
- ✅ Users can configure/disable

**vs. Built-in Contributions:**
- ❌ Built-in requires deep VSCode knowledge
- ❌ Slower iteration (full recompile)
- ❌ Harder to maintain across updates

### Why Migrate from Electron?

**Pros:**
- ✅ Electron prototype already has working features
- ✅ Can reuse 50-90% of code
- ✅ Proven architecture
- ✅ Much faster than starting from scratch

---

## 📞 Getting Help

### Documentation
- Read [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) for strategy
- Check [DEVELOPMENT.md](./DEVELOPMENT.md) for patterns
- Look at Electron app for working examples

### Debugging
- **DevTools**: Cmd+Shift+I
- **Extension Host**: Check extension logs
- **Console**: Look for errors

### Reference Code
- **Electron App**: Working implementation in `/Users/azechary/Documents/GitHub/GameDevIDE`
- **VS Code Extensions**: Look at built-in extensions in `extensions/`

---

## 🚦 Current Status

### ✅ Completed
- VS Code fork set up and compiling
- Custom branding applied (GameDev IDE)
- Cursor-like UI design implemented (see [UI_CUSTOMIZATION.md](./UI_CUSTOMIZATION.md))
  - Activity bar at top with centered icons
  - Custom dark theme (GameDev IDE Dark)
  - Clean welcome page (no walkthroughs)
  - Chat panel removed
  - Extensions marketplace configured (Open VSX)
- Extension scaffolds created
- Build system working
- Documentation written

### 🏗️ In Progress
- Migration planning and documentation
- Preparing AI assistant migration

### 📋 Next Up
- Port AI Assistant (Week 1-2)
- Port Unity Integration (Week 3-4)
- Port Pixel Editor (Week 5-6)
- Port Asset Generation (Week 7-8)

---

## 🎮 Vision

**The Cursor for Game Developers**

A developer says:
```
"Add a health bar UI to the player with smooth animations"
```

GameDev IDE:
1. 🤖 AI analyzes the Unity project
2. 🎨 Generates health bar sprite (PixelLab)
3. 📝 Creates HealthBar.cs script
4. 🎮 Modifies player GameObject
5. ✅ Shows preview of changes
6. 💾 Applies changes on approval

**All in one IDE, no context switching.**

---

## 📖 Next Steps

1. **Read** [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) in full
2. **Understand** the Electron → VS Code migration strategy
3. **Start** with AI Assistant migration (Week 1)
4. **Test** with real Unity project
5. **Iterate** based on what you learn

---

**Let's build the game development IDE developers deserve!** 🎮✨🚀
