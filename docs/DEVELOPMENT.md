# GameDev IDE - Development Guide

How to build, run, and develop features for GameDev IDE.

---

## Quick Start

### Prerequisites
- Node.js 22.22.0 (managed via fnm)
- Git

### Setup

```bash
cd /Users/azechary/Documents/GitHub/gamedev-ide

# Ensure correct Node version
eval "$(fnm env)" && fnm use 22.22.0

# Install dependencies (if not already done)
npm install

# Start watch mode (auto-compiles TypeScript)
npm run watch
```

### Launch GameDev IDE

```bash
# In another terminal
./run.sh
```

### Make Changes

1. Edit files in `src/vs/workbench/contrib/gamedev*/`
2. Watch mode compiles automatically
3. Reload window: **Cmd+R**
4. Check DevTools for errors: **Cmd+Shift+I**

---

## Project Architecture

GameDev IDE features are **built-in workbench contributions** — they live inside the VS Code source tree at `src/vs/workbench/contrib/` and use VS Code's dependency injection system.

### Why Built-in (Not Extensions)?

- Deeper integration with VS Code UI (ViewPane in auxiliary bar)
- Native access to all VS Code services (IFileService, IBulkEditService, etc.)
- Better performance (no extension host overhead)
- Cursor-like feel (chat appears as a native sidebar panel)

### Key Directories

```
src/vs/workbench/contrib/gamedevChat/    AI Chat
src/vs/workbench/contrib/gamedevUnity/   Unity project detection + bridge
unity-editor-plugin/                     C# Unity plugin source
scripts/                                 Build/generation scripts
```

See [STRUCTURE.md](./STRUCTURE.md) for the complete file breakdown.

---

## Adding a New Feature

### Step 1: Create the Contribution

Create a new directory under `src/vs/workbench/contrib/`:

```
src/vs/workbench/contrib/gamedevMyFeature/
  common/
    types.ts              Interfaces and types
  browser/
    gamedevMyFeature.contribution.ts   Service registration
    myFeatureService.ts   Business logic
```

### Step 2: Define the Service Interface

```typescript
// common/types.ts
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IMyFeatureService {
    readonly _serviceBrand: undefined;
    // ... methods
}

export const IMyFeatureService = createDecorator<IMyFeatureService>('myFeatureService');
```

### Step 3: Implement the Service

```typescript
// browser/myFeatureService.ts
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IMyFeatureService } from '../common/types.js';

export class MyFeatureService extends Disposable implements IMyFeatureService {
    declare readonly _serviceBrand: undefined;

    constructor(
        @IFileService private readonly fileService: IFileService,
        // ... other injected services
    ) {
        super();
    }
}
```

### Step 4: Register the Service

```typescript
// browser/gamedevMyFeature.contribution.ts
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IMyFeatureService } from '../common/types.js';
import { MyFeatureService } from './myFeatureService.js';

registerSingleton(IMyFeatureService, MyFeatureService, InstantiationType.Delayed);
```

### Step 5: Wire Into the Workbench

Add the contribution import to the workbench entry point so it loads:

```
src/vs/workbench/workbench.common.main.ts
```

Add a line like:
```typescript
import './contrib/gamedevMyFeature/browser/gamedevMyFeature.contribution.js';
```

---

## Working with the AI Chat

### Service: `GameDevChatService`

The chat service (`IGameDevChatService`) handles:
- Claude API calls with streaming
- Message management and persistence
- Agent mode file writing
- Bridge command parsing and execution
- Activity event emission

### ViewPane: `GameDevChatViewPane`

The view pane handles all UI rendering:
- Messages (user + assistant)
- Streaming with incremental markdown rendering
- Thinking sections (collapsible, with timer)
- File cards and bridge result cards
- Input with @ mentions and attachments
- Phase indicators and applying section

### Adding AI Skills

To teach the AI about a new feature, add a skills file:

```typescript
// skills/myFeatureSkills.ts
export function getMyFeatureSkills(): string {
    return `## My Feature\n\nInstructions for the AI...\n`;
}
```

Then register it in `gamedevSkillsRegistry.ts`:

```typescript
import { getMyFeatureSkills } from './myFeatureSkills.js';

export function buildSkillsPromptBlock(engine: GameEngine): string {
    // ... existing skills ...
    result += getMyFeatureSkills();
    return result;
}
```

---

## Working with the Unity Bridge

### Modifying the C# Plugin

1. Edit `unity-editor-plugin/GameDevIDEBridge.cs`
2. Bump the version in the header comment
3. Regenerate the embedded source:
   ```bash
   node scripts/generate-bridge-plugin-source.js
   ```
4. The IDE will auto-deploy the new version to Unity projects

### Adding a New Bridge Command

1. Add a handler method in `GameDevIDEBridge.cs`:
   ```csharp
   private string HandleMyAction(JsonNode paramsNode)
   {
       // ... Unity Editor API calls ...
       return CreateSuccessResponse(requestId, result);
   }
   ```

2. Register it in the command dispatch switch:
   ```csharp
   case "myCategory.myAction":
       response = HandleMyAction(paramsNode);
       break;
   ```

3. Add convenience method to `IUnityBridgeService` if useful:
   ```typescript
   // bridgeTypes.ts
   myAction(param: string): Promise<BridgeResponse>;
   ```

4. Update the bridge skills to tell the AI about the new command:
   ```typescript
   // unityBridgeSkills.ts - add to command reference
   ```

5. Regenerate: `node scripts/generate-bridge-plugin-source.js`

### Testing Bridge Commands

1. Open GameDev IDE with a Unity project workspace
2. Open the same project in Unity Editor
3. Wait for green dot in chat header (Connected)
4. Use Agent mode and ask the AI to create something
5. Watch Unity Editor — objects should appear in the scene
6. Check Unity Console for any errors

---

## Testing

### TypeScript Compilation

Monitor the build watch task for compilation errors:
```bash
npm run watch
```

Check specific files:
```bash
npx tsc --noEmit --project src/tsconfig.json 2>&1 | grep gamedev
```

### Manual Testing

1. Launch with `./run.sh`
2. Open a Unity project folder
3. Test chat in both Ask and Agent modes
4. Test with Unity Editor connected and disconnected
5. Check DevTools console for errors (Cmd+Shift+I)

### Key Things to Test

- [ ] Chat streaming renders smoothly (no visible lag)
- [ ] Thinking section expands/collapses correctly
- [ ] Agent mode strips code blocks and shows file cards
- [ ] File cards are clickable and open the file
- [ ] Bridge commands execute and show result cards
- [ ] Bridge status indicator reflects connection state
- [ ] Stop button cancels streaming
- [ ] @ mention popup shows file results
- [ ] Drag-and-drop attaches files
- [ ] Mode toggle switches between Ask and Agent
- [ ] Messages persist across window reloads

---

## Debugging

### DevTools Console

```
Cmd+Shift+I -> Console tab
```

Filter by:
- `[GameDevChatService]` — Chat API calls, bridge commands
- `[UnityBridgeService]` — Connection state, discovery
- `[UnityProjectService]` — Project detection, analysis

### Common Issues

**Chat not sending:** Check API key is set (gear icon in chat header)

**Bridge not connecting:** Check:
1. Unity Editor is open with the project
2. `Library/GameDevIDE/bridge.json` exists in the Unity project
3. No firewall blocking localhost WebSocket
4. Check Unity Console for "GameDev IDE Bridge started" message

**Bridge commands failing:** Check Unity Console for errors. Common causes:
- Component type not found (custom script not yet compiled)
- GameObject path wrong (inactive objects need full hierarchy path)
- Type conversion error (check SmartConvert handles the type)

**Agent mode not writing files:** Check:
1. Mode is set to Agent (not Ask)
2. AI response contains `` ```language:path `` code blocks
3. Workspace folder is open (not just a single file)

---

## Performance Notes

### Streaming Markdown

The markdown render throttle is set to 600ms to balance responsiveness and performance. During streaming:
- `enhanceCodeBlocks()` is skipped (expensive DOM mutations)
- Content stripping in Agent mode reduces rendered content significantly
- Code blocks are enhanced only on the final render

### Bridge Command Execution

Commands are executed sequentially (not in parallel) to avoid race conditions in Unity. Each command waits for a response before the next is sent.

---

## Resources

### Documentation
- [STRUCTURE.md](./STRUCTURE.md) — File organization
- [UI_CUSTOMIZATION.md](./UI_CUSTOMIZATION.md) — UI/theming changes
- [UNITY_BRIDGE_PLAN.md](./UNITY_BRIDGE_PLAN.md) — Bridge protocol details

### VS Code Internals
- VS Code source: `src/vs/` directory
- Service injection: `createDecorator` + `registerSingleton`
- ViewPane: `src/vs/workbench/browser/parts/views/viewPane.ts`
- Events: `Emitter<T>` from `src/vs/base/common/event.ts`
- Disposables: `DisposableStore`, `MutableDisposable`

---

**Last updated:** 2026-02-28
