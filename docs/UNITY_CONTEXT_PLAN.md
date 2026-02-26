# Unity Project Context System - Implementation Plan

## Overview

Port the Unity project scanning and context building system from the Electron GameDevIDE to the VS Code fork. This enables the AI to understand the user's Unity project structure.

---

## Source Files (from GameDevIDE)

| File | Lines | Purpose |
|------|-------|---------|
| `UnityProjectDetector.ts` | 129 | Detect Unity projects, parse version |
| `ProjectAnalyzer.ts` | 481 | Scan scenes, scripts, prefabs, assets |
| `UnitySceneParser.ts` | 254 | Parse .unity YAML files to GameObject tree |
| `ClaudeService.ts` | 229 | Build context message for AI |
| `ProjectKnowledgePanel.tsx` | 386 | UI to display project analysis |

---

## Architecture Decision

### Option A: Built-in Workbench Contribution (Recommended)
Like the AI chat, implement as a built-in contribution for:
- Deeper VS Code integration
- Native TreeViews for GameObject hierarchy
- Automatic workspace detection
- Shared services with AI chat

### Option B: Extension
Implement as a separate extension for:
- Modularity
- Easier maintenance
- Can be disabled independently

**Recommendation:** Option A - keeps all GameDev features unified and allows tighter integration with the AI chat service.

---

## Implementation Plan

### Phase 1: Core Services (No UI)

**Files to create:**
```
src/vs/workbench/contrib/gamedevUnity/common/
├── unityProjectDetector.ts    # Detect Unity projects
├── unitySceneParser.ts        # Parse .unity YAML files
├── projectAnalyzer.ts         # Full project scanning
└── types.ts                   # Interfaces and types
```

**Key interfaces:**
```typescript
interface UnityProjectInfo {
  isUnityProject: boolean;
  unityVersion?: string;
  projectName?: string;
  projectPath: string;
}

interface ProjectKnowledge {
  projectPath: string;
  projectName: string;
  scenes: Map<string, SceneInfo>;
  scripts: Map<string, ScriptInfo>;
  prefabs: Map<string, PrefabInfo>;
  assets: Map<string, AssetInfo>;
  lastAnalyzed: Date;
}

interface ScriptInfo {
  path: string;
  fileName: string;
  namespace?: string;
  classes: ClassInfo[];
}

interface ClassInfo {
  name: string;
  extends?: string;
  fields: FieldInfo[];
  methods: MethodInfo[];
  isMonoBehaviour: boolean;
}
```

### Phase 2: Service Layer

**Files to create:**
```
src/vs/workbench/contrib/gamedevUnity/browser/
├── gamedevUnity.contribution.ts   # Registration
└── unityProjectService.ts         # Main service
```

**Service interface:**
```typescript
interface IUnityProjectService {
  readonly onDidAnalyzeProject: Event<ProjectKnowledge>;
  readonly onDidDetectUnityProject: Event<UnityProjectInfo>;

  readonly currentProject: ProjectKnowledge | undefined;
  readonly isAnalyzing: boolean;

  detectProject(folderPath: string): Promise<UnityProjectInfo>;
  analyzeProject(folderPath: string): Promise<ProjectKnowledge>;
  exportForAI(): string;  // Context message for Claude
}
```

### Phase 3: Integration with AI Chat

**Modify existing files:**
```
src/vs/workbench/contrib/gamedevChat/browser/
├── gamedevChatService.ts   # Add project context support
└── gamedevChatViewPane.ts  # Add "Include context" toggle
```

**New features:**
- Checkbox: "Include project context"
- Auto-detect Unity project in workspace
- Build context message from ProjectKnowledge
- Show indicator when context is included

### Phase 4: Project Knowledge UI

**Files to create:**
```
src/vs/workbench/contrib/gamedevUnity/browser/
├── projectKnowledgeViewPane.ts   # ViewPane for knowledge display
└── gameObjectTreeView.ts         # TreeDataProvider for scene hierarchy
```

**UI Components:**
1. **Project Knowledge Panel** (ViewPane in auxiliary bar)
   - Overview tab: Stats (scenes, scripts, prefabs count)
   - Scenes tab: List with GameObject counts
   - Scripts tab: Classes and methods
   - Assets tab: Sprites, materials, audio

2. **Scene Hierarchy Tree** (TreeView)
   - Shows GameObject tree when .unity file is open
   - Expand/collapse hierarchy
   - Shows components on each GameObject

### Phase 5: Automatic Detection

**Integration points:**
- Listen to `IWorkspaceContextService` for folder changes
- Auto-scan when Unity project detected
- Cache results in `IStorageService`
- Re-scan on file changes (debounced)

---

## File Structure (Final)

```
src/vs/workbench/contrib/gamedevUnity/
├── common/
│   ├── types.ts                    # Interfaces
│   ├── unityProjectDetector.ts     # Project detection
│   ├── unitySceneParser.ts         # Scene parsing
│   └── projectAnalyzer.ts          # Full analysis
│
└── browser/
    ├── gamedevUnity.contribution.ts    # Registration
    ├── unityProjectService.ts          # Main service
    ├── projectKnowledgeViewPane.ts     # Knowledge UI
    └── gameObjectTreeView.ts           # Scene tree
```

---

## Dependencies

**Need to add:**
- `js-yaml` - For parsing Unity YAML files (may already be available)

**VS Code services to use:**
- `IFileService` - Read project files
- `IWorkspaceContextService` - Detect workspace folders
- `IStorageService` - Cache analysis results
- `ILogService` - Logging

---

## Integration with Existing Chat

**Changes to gamedevChatService.ts:**
```typescript
// Add dependency
@IUnityProjectService private readonly unityService: IUnityProjectService

// New method
async sendMessageWithContext(content: string): Promise<void> {
  const contextMessage = this.unityService.exportForAI();
  // Prepend context to conversation
}
```

**Changes to gamedevChatViewPane.ts:**
- Add checkbox for "Include project context"
- Show project name badge when context available
- Visual indicator when sending with context

---

## Implementation Order

1. **Phase 1** - Port core parsing logic (types, detector, parser, analyzer)
2. **Phase 2** - Create UnityProjectService with DI
3. **Phase 3** - Integrate with AI chat (context toggle)
4. **Phase 4** - Add Project Knowledge UI panel
5. **Phase 5** - Auto-detection and caching

---

## Questions to Resolve

1. **Auto-scan vs Manual?**
   - Should we auto-scan when Unity project opened?
   - Or require user to click "Analyze Project"?

2. **Where to show Knowledge Panel?**
   - Same auxiliary bar as chat?
   - Separate view container?
   - Tabs within chat panel?

3. **Scene Tree location?**
   - Primary sidebar (like Explorer)?
   - Secondary sidebar (with chat)?
   - Only when .unity file is open?

4. **Performance considerations?**
   - Large projects may have 100+ scripts
   - Should we analyze incrementally?
   - File watcher for changes?

---

## Estimated Effort

| Phase | Effort | Description |
|-------|--------|-------------|
| Phase 1 | Medium | Port 3 files, adapt to VS Code APIs |
| Phase 2 | Small | Service wrapper with DI |
| Phase 3 | Small | Add toggle to existing chat |
| Phase 4 | Large | New ViewPane with tabs |
| Phase 5 | Medium | Workspace detection, caching |

**Total: ~800-1000 lines of new code**

---

## Success Criteria

- [ ] Unity projects auto-detected when folder opened
- [ ] Full project analysis (scenes, scripts, prefabs, assets)
- [ ] AI chat can include project context
- [ ] User can view project knowledge in panel
- [ ] Scene hierarchy viewable in tree
- [ ] Analysis cached and updated on changes
