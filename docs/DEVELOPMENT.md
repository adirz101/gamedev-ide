# GameDev IDE - Development & Migration Guide

How to migrate features from the Electron prototype to VS Code extensions.

---

## Quick Start

### Prerequisites
- Node.js 22.22.0 (managed via fnm)
- Git
- Both repositories cloned:
  - Electron app: `/Users/azechary/Documents/GitHub/GameDevIDE`
  - VS Code fork: `/Users/azechary/Documents/GitHub/gamedev-ide`

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

Your custom VS Code fork will launch with the gamedev extensions loaded.

---

## Migration Workflow

### Overview

We're porting working features from **GameDevIDE (Electron)** to **gamedev-ide (VS Code fork)**.

**Process for each feature:**
1. Identify source files in Electron app
2. Create/update extension structure
3. Port core logic (TypeScript classes)
4. Adapt APIs (Electron → VS Code)
5. Port UI (React → Webviews if needed)
6. Test with real Unity project
7. Document what you migrated

---

## Step-by-Step: Migrating a Feature

### Example: AI Assistant

Let's walk through migrating the AI chat feature.

#### Step 1: Identify Source Files

**In Electron App** (`/Users/azechary/Documents/GitHub/GameDevIDE/`):
```
src/main/services/ai/
├── ClaudeService.ts          ← Core AI logic
├── ContextBuilder.ts         ← Project analysis
└── [IPC handlers]

src/renderer/components/ai/
├── ChatPanel.tsx             ← Chat UI
├── ChatMessage.tsx           ← Message component
└── ...
```

#### Step 2: Create Extension Structure

**In VS Code Fork** (`extensions/gamedev-ai/`):
```
extensions/gamedev-ai/
├── package.json              ← Already exists (scaffold)
├── src/
│   ├── extension.ts          ← Entry point (exists)
│   ├── claudeService.ts      ← Port ClaudeService.ts here
│   ├── contextBuilder.ts     ← Port ContextBuilder.ts here
│   ├── chatProvider.ts       ← Webview provider (exists as aiChatProvider.ts)
│   └── webview/              ← Create this directory
│       └── ChatPanel.tsx     ← Port UI here
```

#### Step 3: Port Core Logic

**Copy and adapt `ClaudeService.ts`**:

```bash
# Copy file
cp /Users/azechary/Documents/GitHub/GameDevIDE/src/main/services/ai/ClaudeService.ts \
   /Users/azechary/Documents/GitHub/gamedev-ide/extensions/gamedev-ai/src/claudeService.ts
```

**Adapt the code**:

```typescript
// Original (Electron)
import { app } from 'electron';
import Store from 'electron-store';

class ClaudeService {
  private apiKey: string;

  constructor() {
    const store = new Store();
    this.apiKey = store.get('anthropic.apiKey') as string;
  }
}

// Adapted (VS Code Extension)
import * as vscode from 'vscode';

export class ClaudeService {
  private apiKey: string;

  constructor() {
    const config = vscode.workspace.getConfiguration('gamedev.ai');
    this.apiKey = config.get<string>('anthropicApiKey') || '';
  }
}
```

**Key changes:**
- Replace `electron` imports → `vscode` imports
- Replace `electron-store` → `vscode.workspace.getConfiguration()`
- Replace `fs` → `vscode.workspace.fs`
- Keep Claude API calls unchanged (they work the same)

#### Step 4: Port Context Builder

**Copy and adapt `ContextBuilder.ts`**:

```bash
cp /Users/azechary/Documents/GitHub/GameDevIDE/src/main/services/ai/ContextBuilder.ts \
   /Users/azechary/Documents/GitHub/gamedev-ide/extensions/gamedev-ai/src/contextBuilder.ts
```

**Adapt file reading**:

```typescript
// Original (Electron)
import fs from 'fs';
const content = fs.readFileSync(filePath, 'utf-8');

// Adapted (VS Code)
import * as vscode from 'vscode';
const uri = vscode.Uri.file(filePath);
const bytes = await vscode.workspace.fs.readFile(uri);
const content = Buffer.from(bytes).toString('utf-8');
```

#### Step 5: Port Chat UI

**Set up webview build**:

```bash
cd extensions/gamedev-ai
mkdir -p src/webview
npm install --save-dev webpack webpack-cli ts-loader css-loader
```

**Copy React components**:

```bash
cp -r /Users/azechary/Documents/GitHub/GameDevIDE/src/renderer/components/ai/* \
      extensions/gamedev-ai/src/webview/
```

**Update webview provider to load React app**:

```typescript
// chatProvider.ts
export class ChatProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'index.js')
    );

    return `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
      </head>
      <body>
        <div id="root"></div>
        <script src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}
```

#### Step 6: Test

```bash
# Watch mode compiling
npm run watch

# Launch VS Code
./run.sh

# Test:
# 1. Click GameDev AI icon in sidebar
# 2. Type a message
# 3. Verify Claude responds
# 4. Check project context is included
```

#### Step 7: Document

Update migration checklist in `MIGRATION_PLAN.md`:
```markdown
### Week 1-2: AI Assistant
- [x] Port ClaudeService.ts
- [x] Port ContextBuilder.ts
- [x] Implement chat webview
- [x] Add streaming responses
- [ ] Test with Unity project
```

---

## API Migration Patterns

### File Operations

**Electron:**
```typescript
import fs from 'fs';
import path from 'path';

// Read
const content = fs.readFileSync('/path/to/file', 'utf-8');

// Write
fs.writeFileSync('/path/to/file', content, 'utf-8');

// List directory
const files = fs.readdirSync('/path/to/dir');
```

**VS Code Extension:**
```typescript
import * as vscode from 'vscode';

// Read
const uri = vscode.Uri.file('/path/to/file');
const bytes = await vscode.workspace.fs.readFile(uri);
const content = Buffer.from(bytes).toString('utf-8');

// Write
const content = Buffer.from('text', 'utf-8');
await vscode.workspace.fs.writeFile(uri, content);

// List directory
const dirUri = vscode.Uri.file('/path/to/dir');
const entries = await vscode.workspace.fs.readDirectory(dirUri);
```

### Configuration

**Electron:**
```typescript
import Store from 'electron-store';

const store = new Store();
const apiKey = store.get('ai.apiKey');
store.set('ai.apiKey', 'new-key');
```

**VS Code Extension:**
```typescript
import * as vscode from 'vscode';

const config = vscode.workspace.getConfiguration('gamedev.ai');
const apiKey = config.get<string>('anthropicApiKey');
await config.update('anthropicApiKey', 'new-key', vscode.ConfigurationTarget.Global);
```

### IPC Communication

**Electron:**
```typescript
// Main process
ipcMain.handle('ai:send-message', async (event, message) => {
  const response = await claudeService.sendMessage(message);
  return response;
});

// Renderer
const response = await window.electron.invoke('ai:send-message', message);
```

**VS Code Extension:**
```typescript
// Register command
vscode.commands.registerCommand('gamedev-ai.sendMessage', async (message: string) => {
  const response = await claudeService.sendMessage(message);
  return response;
});

// Call from elsewhere
const response = await vscode.commands.executeCommand('gamedev-ai.sendMessage', message);
```

### Window/Dialog

**Electron:**
```typescript
import { dialog } from 'electron';

const result = await dialog.showOpenDialog({
  properties: ['openDirectory']
});
const folderPath = result.filePaths[0];
```

**VS Code Extension:**
```typescript
import * as vscode from 'vscode';

const uris = await vscode.window.showOpenDialog({
  canSelectFolders: true,
  canSelectMany: false
});
const folderPath = uris?.[0].fsPath;
```

---

## React UI Migration

### Approach 1: Webview with React (Recommended for Complex UIs)

**Use for**: Chat panel, pixel editor, asset generation panel

1. **Create webview directory**:
   ```bash
   cd extensions/my-extension
   mkdir -p src/webview
   ```

2. **Copy React components**:
   ```bash
   cp -r /path/to/electron/components/* src/webview/
   ```

3. **Create webview entry point**:
   ```typescript
   // src/webview/index.tsx
   import React from 'react';
   import ReactDOM from 'react-dom';
   import { ChatPanel } from './ChatPanel';

   ReactDOM.render(<ChatPanel />, document.getElementById('root'));
   ```

4. **Set up webpack** (see pixel editor migration guide for full config)

5. **Load in provider**:
   ```typescript
   webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
   ```

### Approach 2: TreeView (Recommended for Lists/Hierarchies)

**Use for**: GameObject hierarchy, asset browser, scene explorer

```typescript
export class SceneExplorerProvider implements vscode.TreeDataProvider<GameObject> {
  getTreeItem(element: GameObject): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      element.name,
      element.children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    treeItem.iconPath = new vscode.ThemeIcon('symbol-class');
    return treeItem;
  }

  getChildren(element?: GameObject): GameObject[] {
    return element ? element.children : this.rootGameObjects;
  }
}
```

---

## Testing Workflow

### During Development

```bash
# Terminal 1: Watch mode
cd /Users/azechary/Documents/GitHub/gamedev-ide
npm run watch

# Terminal 2: Run VS Code
./run.sh

# After making changes:
# Cmd+R in the running VS Code window to reload
```

### Testing Extensions

1. **Check extension loaded**:
   - Open Command Palette (Cmd+Shift+P)
   - Search for your extension's commands
   - Should appear in list

2. **Check views**:
   - Look for new icons in Activity Bar (left sidebar)
   - Click icon to open your view
   - Verify UI renders correctly

3. **Check functionality**:
   - Test core features (AI chat, scene parsing, etc.)
   - Open DevTools (Cmd+Shift+I) to check for errors
   - Look in Console tab for logs

4. **Test with real project**:
   - Open a Unity project folder
   - Test extension features
   - Verify project context works

### Debugging

**Extension Host Logs**:
```
Help → Toggle Developer Tools → Console
Filter by your extension name
```

**Breakpoints**:
```typescript
// In your TypeScript code
debugger;  // Will pause when DevTools is open
console.log('Debug info:', data);
```

**Webview Debugging**:
```
Right-click in webview → Inspect Element
Opens dedicated DevTools for that webview
```

---

## Common Migration Issues

### Issue 1: "Module not found"

**Problem**: Import paths from Electron don't work
```typescript
import { ClaudeService } from '../../../main/services/ai/ClaudeService';
```

**Solution**: Update to extension-relative imports
```typescript
import { ClaudeService } from './claudeService';
```

### Issue 2: "Cannot read property of undefined"

**Problem**: Configuration not found
```typescript
const apiKey = config.get('anthropic.apiKey');  // undefined
```

**Solution**: Check configuration is registered in `package.json`
```json
"configuration": {
  "properties": {
    "gamedev.ai.anthropicApiKey": {
      "type": "string"
    }
  }
}
```

### Issue 3: Webview not loading

**Problem**: React app doesn't render in webview

**Solution**: Check script URI is correct
```typescript
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'bundle.js')
);
```

### Issue 4: File paths incorrect

**Problem**: `/Users/...` absolute paths don't work

**Solution**: Use workspace-relative paths
```typescript
const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
const filePath = path.join(workspaceRoot, 'Assets', 'Scenes', 'Main.unity');
```

---

## Extension-Specific Migration Guides

### AI Assistant
- **Priority**: 1 (Week 1-2)
- **Complexity**: Medium
- **Reusability**: 70% (API client, context builder reusable)
- **Main challenge**: Webview setup for chat UI

### Unity Integration
- **Priority**: 2 (Week 3-4)
- **Complexity**: Medium
- **Reusability**: 90% (YAML parser works as-is)
- **Main challenge**: TreeView for GameObject hierarchy

### Pixel Editor
- **Priority**: 3 (Week 5-6)
- **Complexity**: High
- **Reusability**: 80% (Canvas code works as-is)
- **Main challenge**: CustomTextEditorProvider setup

### Asset Generation
- **Priority**: 4 (Week 7-8)
- **Complexity**: Medium
- **Reusability**: 70% (API client, fix parsing bug)
- **Main challenge**: Webview for generation form

---

## Performance Tips

### Lazy Loading

```typescript
// Don't load everything at activation
export async function activate(context: vscode.ExtensionContext) {
  // Register provider immediately
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('my-view', provider)
  );

  // But only create heavy objects when needed
  provider.onDidChangeVisibility(() => {
    if (provider.visible && !claudeService) {
      claudeService = new ClaudeService();  // Load heavy service only when visible
    }
  });
}
```

### Webview Optimization

```typescript
// Dispose webview when not visible
webviewView.onDidChangeVisibility(() => {
  if (!webviewView.visible) {
    webviewView.webview.html = '';  // Clear content
  } else {
    webviewView.webview.html = this.getHtmlForWebview();  // Reload
  }
});
```

---

## Next Steps

1. **Start with AI Assistant** ([MIGRATION_PLAN.md](./MIGRATION_PLAN.md) Week 1-2)
2. **Use this guide** to port ClaudeService and ContextBuilder
3. **Set up webview** for chat UI
4. **Test** with Unity project
5. **Move to next feature** (Unity Integration)

---

## Resources

### Documentation
- **[MIGRATION_PLAN.md](./MIGRATION_PLAN.md)** - Overall migration strategy
- **[STRUCTURE.md](./STRUCTURE.md)** - Where everything lives
- **[UI_CUSTOMIZATION.md](./UI_CUSTOMIZATION.md)** - UI/theming changes (Cursor-like design)
- **Electron Source**: `/Users/azechary/Documents/GitHub/GameDevIDE`

### VS Code Extension API
- **Extension Guide**: https://code.visualstudio.com/api/get-started/your-first-extension
- **Extension API**: https://code.visualstudio.com/api/references/vscode-api
- **Webview Guide**: https://code.visualstudio.com/api/extension-guides/webview
- **TreeView Guide**: https://code.visualstudio.com/api/extension-guides/tree-view
- **Custom Editor**: https://code.visualstudio.com/api/extension-guides/custom-editors

---

**Follow this guide for each feature and the migration will go smoothly!** 🚀
