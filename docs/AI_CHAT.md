# GameDev IDE - AI Chat Implementation

Built-in AI chat panel using Claude API, implemented as a VS Code workbench contribution (not an extension).

---

## Overview

The AI chat is implemented as a **built-in workbench contribution** rather than an extension. This provides deeper integration with VS Code's UI and allows the chat to appear in the Auxiliary Bar (right sidebar) like Cursor.

### Why Built-in vs Extension?

| Approach | Pros | Cons |
|----------|------|------|
| **Built-in (chosen)** | Native UI, deeper integration, Cursor-like feel | More complex, requires VS Code knowledge |
| **Extension** | Faster development, isolated | Feels bolted-on, limited UI control |

---

## Architecture

### File Structure

```
src/vs/workbench/contrib/gamedevChat/browser/
├── gamedevChat.contribution.ts    # View registration & service binding
├── gamedevChatService.ts          # Claude API service with streaming
└── gamedevChatViewPane.ts         # Chat UI (ViewPane)
```

### Registration

The chat is registered in `workbench.common.main.ts`:
```typescript
import './contrib/gamedevChat/browser/gamedevChat.contribution.js';
```

---

## Files

### 1. gamedevChat.contribution.ts

Registers the view container and service.

**Key IDs:**
```typescript
GAMEDEV_CHAT_VIEW_CONTAINER_ID = 'workbench.view.gamedevChat'
GAMEDEV_CHAT_VIEW_ID = 'workbench.panel.gamedevChat'
GAMEDEV_CHAT_OPEN_COMMAND_ID = 'workbench.action.openGamedevChat'
```

**What it does:**
- Registers view container in `ViewContainerLocation.AuxiliaryBar` (right sidebar)
- Registers the chat view with `GameDevChatViewPane`
- Registers `IGameDevChatService` singleton
- Sets up keyboard shortcut: `Cmd+Shift+A`

### 2. gamedevChatService.ts

Service layer for Claude API communication.

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

**Features:**
- Streaming responses from Claude API
- Message persistence via `IStorageService`
- API key loading from `.env` file (dynamic, not hardcoded)
- Error handling with user-friendly messages

**API Key Loading:**
The service loads the API key in this order:
1. Check `IStorageService` (user-set key)
2. Read from `.env` file in app root (`ANTHROPIC_API_KEY=...`)

**Claude API Configuration:**
```typescript
model: 'claude-sonnet-4-20250514'
max_tokens: 4096
stream: true
```

### 3. gamedevChatViewPane.ts

The UI component extending `ViewPane`.

**UI Components:**
- **Header**: "General chat" badge, New Chat (+), History, More buttons
- **Messages Area**: User messages (box style), Assistant messages (with status)
- **Input Area**: Textarea with placeholder
- **Toolbar**: Agent dropdown (disabled), Auto dropdown (disabled)

**Welcome State:**
When no messages exist, shows:
- "Welcome to GameDev IDE"
- "Ask me anything about your code or game development."

**Message Rendering:**
- User messages: Simple bordered box
- Assistant messages: Status line ("Thinking...") + markdown content
- Uses `IMarkdownRendererService` for rendering markdown

---

## Dependencies

### Services Injected

| Service | Purpose |
|---------|---------|
| `IStorageService` | Persist messages and API key |
| `IFileService` | Read .env file for API key |
| `IWorkbenchEnvironmentService` | Get app root path |
| `IMarkdownRendererService` | Render markdown in messages |

### Imports (ViewPane)

```typescript
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
```

---

## Configuration

### product.json Defaults

```json
{
    "workbench.layoutControl.enabled": true,
    "workbench.layoutControl.type": "toggles",
    "workbench.secondarySideBar.defaultVisibility": "visible"
}
```

### Layout Defaults (layout.ts)

```typescript
AUXILIARYBAR_HIDDEN: false  // Show right sidebar by default
PANEL_HIDDEN: false         // Show bottom panel by default
```

---

## API Key Setup

Create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

The service automatically loads this on startup.

---

## Styling Notes

### Unicode Characters

VS Code's hygiene checks require comments before unicode:
```typescript
// allow-any-unicode-next-line
historyBtn.textContent = '⏱';
```

### Layering Rules

Files in `browser/` cannot import from `electron-browser/`:
- Use `IWorkbenchEnvironmentService` from `common/environmentService.js`
- NOT `INativeWorkbenchEnvironmentService` from `electron-browser/`

---

## Current Status

### Implemented
- [x] Chat UI in auxiliary bar
- [x] Claude API streaming
- [x] Message persistence
- [x] Dynamic API key from .env
- [x] Markdown rendering
- [x] Welcome message
- [x] New chat (clear) button

### Disabled (Future)
- [ ] Agent dropdown (visible but disabled)
- [ ] Auto dropdown (visible but disabled)
- [ ] History button (no functionality yet)
- [ ] More button (no functionality yet)

### TODO
- [ ] Implement agent mode selection
- [ ] Implement auto mode selection
- [ ] Add chat history browsing
- [ ] Add context menu options
- [ ] Add code context awareness
- [ ] Add file/selection context

---

## Troubleshooting

### Chat Not Appearing

1. Check `product.json` has `workbench.secondarySideBar.defaultVisibility: "visible"`
2. Check layout.ts has `AUXILIARYBAR_HIDDEN: false`
3. Check contribution is imported in `workbench.common.main.ts`

### API Errors

1. Check `.env` file exists with `ANTHROPIC_API_KEY`
2. Check console for specific error messages
3. Verify API key is valid

### Compilation Errors

Common issues:
- Wrong import paths (layering violations)
- Missing `// allow-any-unicode-next-line` for special characters
- ViewPane constructor parameter order

---

## Related Files

| File | Purpose |
|------|---------|
| `product.json` | Default configuration |
| `src/vs/workbench/browser/layout.ts` | Layout defaults |
| `src/vs/workbench/workbench.common.main.ts` | Contribution imports |
| `.env` | API key storage |
| `.gitignore` | Excludes .env from git |
