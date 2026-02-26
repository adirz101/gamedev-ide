# Last Conversation Context

This file contains context from the most recent development session for continuity with future agents.

**Last Updated:** 2026-02-23

---

## Session Summary

Implemented a Cursor-style AI chat panel in the GameDev IDE using Claude API. The chat appears in the right sidebar (auxiliary bar) and supports streaming responses.

---

## What Was Done

### 1. AI Chat Implementation (Built-in Workbench Contribution)

Created a new built-in contribution (NOT an extension) for the AI chat:

**Files Created:**
```
src/vs/workbench/contrib/gamedevChat/browser/
├── gamedevChat.contribution.ts    # View registration
├── gamedevChatService.ts          # Claude API service
└── gamedevChatViewPane.ts         # Chat UI
```

**Key Design Decisions:**
- Used **built-in contribution** instead of extension for deeper Cursor-like integration
- Chat appears in **AuxiliaryBar** (right sidebar)
- API key loaded **dynamically from `.env` file** (NOT hardcoded)
- UI styled to match **Cursor's chat design**

### 2. Layout Configuration

Modified `src/vs/workbench/browser/layout.ts`:
- Set `AUXILIARYBAR_HIDDEN` default to `false`
- Set `PANEL_HIDDEN` default to `false`

Modified `product.json`:
```json
"workbench.layoutControl.enabled": true,
"workbench.layoutControl.type": "toggles",
"workbench.secondarySideBar.defaultVisibility": "visible"
```

### 3. Registration

Added import to `src/vs/workbench/workbench.common.main.ts`:
```typescript
import './contrib/gamedevChat/browser/gamedevChat.contribution.js';
```

---

## Key Technical Details

### Service Layer (gamedevChatService.ts)

**Interface:**
```typescript
interface IGameDevChatService {
    readonly messages: IChatMessage[];
    readonly isStreaming: boolean;
    sendMessage(content: string): Promise<void>;
    clearMessages(): void;
    setApiKey(apiKey: string): void;
    getApiKey(): string | undefined;
}
```

**API Key Loading:**
```typescript
// Loads from .env file using IFileService
const appRoot = this.environmentService.appRoot;
const envFileUri = URI.file(`${appRoot}/.env`);
const content = await this.fileService.readFile(envFileUri);
// Parses ANTHROPIC_API_KEY=...
```

**Claude API:**
- Model: `claude-sonnet-4-20250514`
- Streaming enabled
- Headers include `anthropic-dangerous-direct-browser-access: true`

### View Pane (gamedevChatViewPane.ts)

**UI Components:**
- Header: "General chat" badge + action buttons
- Messages: User (box style) + Assistant (with status line)
- Input: Textarea with placeholder
- Toolbar: Agent/Auto dropdowns (currently disabled)

**Welcome State:**
Shows "Welcome to GameDev IDE" message when no chat history.

### Layering Compliance

**Important:** Files in `browser/` folder cannot import from `electron-browser/`:
- Use `IWorkbenchEnvironmentService` from `common/environmentService.js`
- NOT `INativeWorkbenchEnvironmentService` from `electron-browser/`

### Unicode Characters

VS Code hygiene requires special comments:
```typescript
// allow-any-unicode-next-line
historyBtn.textContent = '⏱';
```

---

## Issues Encountered & Solutions

| Issue | Solution |
|-------|----------|
| `addEventListener` not returning disposable | Use `addDisposableListener` from dom.js |
| Wrong MarkdownRenderer path | Use `IMarkdownRendererService` from `platform/markdown/browser/markdownRenderer.js` |
| ViewPane constructor params wrong | Match exact order from base class, add `IContextMenuService` |
| Layering violation (electron-browser import) | Use `IWorkbenchEnvironmentService` from common layer |
| TrustedHTML blocking innerHTML | Use DOM manipulation (`append`, `$()`) instead |
| Unicode characters in hygiene check | Add `// allow-any-unicode-next-line` comments |
| Hardcoded API key rejected | Implemented dynamic loading from .env file |

---

## Current State

### Working Features
- Chat UI visible in right sidebar
- Claude API streaming responses
- Message persistence
- New chat button (clears messages)
- Markdown rendering in responses
- Welcome message when empty
- API key from .env file

### Disabled (Placeholder for Future)
- Agent dropdown (visible but disabled, opacity 0.5)
- Auto dropdown (visible but disabled, opacity 0.4)
- History button (no functionality)
- More button (no functionality)

### Removed
- Image button (was in toolbar)
- Mic button (was in toolbar)
- API key input UI (loads from .env now)

---

## Files Modified

| File | Changes |
|------|---------|
| `src/vs/workbench/workbench.common.main.ts` | Added gamedevChat import |
| `src/vs/workbench/browser/layout.ts` | AUXILIARYBAR_HIDDEN=false, PANEL_HIDDEN=false |
| `product.json` | Layout control enabled, secondary sidebar visible |
| `.gitignore` | Added .env |

---

## API Key Setup

Create `.env` in project root:
```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

---

## Development Workflow

**DO NOT run `npm run compile` or `gulp compile`** when watch is running!

The user has a watch task running that auto-compiles changes. Running a full compile will clean the `out/` directory and break the app until watch rebuilds.

### To Test Changes:
1. Wait for watch to show "Finished compilation... with 0 errors"
2. Run `./scripts/code.sh`

### To Commit:
Run `git commit` - husky pre-commit hooks will run hygiene checks.

---

## Next Steps (Suggested)

1. **Implement Agent Mode** - The dropdown is visible but disabled
2. **Implement Auto Mode** - The dropdown is visible but disabled
3. **Add Chat History** - History button exists but has no functionality
4. **Add Context Awareness** - Make chat aware of open files, selections
5. **Port Unity Integration** - From Electron prototype
6. **Port Pixel Editor** - From Electron prototype

---

## Reference: Constructor Parameter Order

ViewPane requires parameters in this exact order:
```typescript
constructor(
    options: IViewPaneOptions,
    @IKeybindingService keybindingService: IKeybindingService,
    @IContextMenuService contextMenuService: IContextMenuService,
    @IConfigurationService configurationService: IConfigurationService,
    @IContextKeyService contextKeyService: IContextKeyService,
    @IViewDescriptorService viewDescriptorService: IViewDescriptorService,
    @IInstantiationService instantiationService: IInstantiationService,
    @IOpenerService openerService: IOpenerService,
    @IThemeService themeService: IThemeService,
    @IHoverService hoverService: IHoverService,
    // ... additional custom services after
)
```

---

## Reference: Creating Workbench Contributions

To create a new workbench contribution:

1. Create folder: `src/vs/workbench/contrib/{name}/browser/`
2. Create files:
   - `{name}.contribution.ts` - Registration
   - `{name}Service.ts` - Service with `createDecorator`
   - `{name}ViewPane.ts` - UI extending ViewPane
3. Add import to `src/vs/workbench/workbench.common.main.ts`
4. Register service with `registerSingleton()`
5. Register view container with `ViewContainersRegistry`

---

## User Preferences Noted

- Prefers **watch mode** for development (not manual compile)
- Wants **Cursor-like design** aesthetic
- Wants API keys from **environment files, not hardcoded**
- Wants **disabled UI elements visible** as placeholders for future features
- Prefers **built-in contributions** over extensions for deep integration

---

## Important Paths

```
Project Root: /Users/azechary/Documents/GitHub/gamedev-ide
AI Chat:      src/vs/workbench/contrib/gamedevChat/browser/
Layout:       src/vs/workbench/browser/layout.ts
Config:       product.json
API Key:      .env (in project root)
Docs:         docs/
```

---

**End of Context**
