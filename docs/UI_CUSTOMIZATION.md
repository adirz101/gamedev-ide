# GameDev IDE - UI Customization & Theming

This document describes all UI/theming changes made to transform VS Code into a Cursor-like GameDev IDE.

---

## Overview

GameDev IDE has been customized to look like [Cursor](https://cursor.com/) - a minimal, modern dark IDE with:
- Activity bar at the TOP (horizontal icons)
- Near-black dark theme
- Clean welcome page
- No chat panel (VS Code's built-in Copilot removed)
- Centered activity bar icons

---

## Files Modified

### 1. Branding & Configuration

**File: `/product.json`**

Key changes:
```json
{
  "nameShort": "GameDev IDE",
  "nameLong": "GameDev IDE",
  "applicationName": "gamedev-ide",
  "dataFolderName": ".gamedev-ide",
  "darwinBundleIdentifier": "com.gamedev.ide",

  "extensionsGallery": {
    "serviceUrl": "https://open-vsx.org/vscode/gallery",
    "itemUrl": "https://open-vsx.org/vscode/item"
  },

  "configurationDefaults": {
    "workbench.colorTheme": "GameDev IDE Dark",
    "workbench.activityBar.location": "top",
    "workbench.startupEditor": "welcomePage",
    "window.restoreWindows": "none",
    "editor.minimap.enabled": false,
    "breadcrumbs.enabled": false
  }
}
```

**What was changed:**
- All naming/branding to "GameDev IDE"
- Added Open VSX marketplace (open-source alternative to Microsoft's)
- Default configuration for Cursor-like appearance
- Activity bar at top
- Welcome page shows on startup
- Windows don't restore previous state

---

### 2. Dark Theme Extension

**Location: `/extensions/theme-gamedev-dark/`**

**Files:**
- `package.json` - Extension manifest
- `themes/gamedev-dark-color-theme.json` - Full color theme

**Color Palette:**
| Element | Color | Description |
|---------|-------|-------------|
| Background | `#181818` | Main UI background |
| Editor background | `#1e1e1e` | Slightly lighter |
| Sidebar | `#1a1a1a` | Panel backgrounds |
| Accent | `#7aa2f7` | Soft blue (not bright cyan) |
| Text | `#cccccc` | Main text color |
| Muted text | `#888888` | Secondary text |
| Borders | `#333333` or transparent | Subtle or none |

**Key design decisions:**
- NOT pure black (`#000000`) - too harsh
- Softer blue accent instead of bright cyan
- Most borders are transparent for seamless look
- Consistent background colors across UI

---

### 3. Activity Bar (Top Position)

**File: `/src/vs/workbench/browser/parts/activitybar/activitybarPart.ts`**

Changed COMPACT sizes (used when activity bar is at top):
```typescript
static readonly COMPACT_ACTION_HEIGHT = 40;  // was 32
static readonly COMPACT_ACTIVITYBAR_WIDTH = 42;  // was 36
static readonly COMPACT_ICON_SIZE = 20;  // was 16
```

**File: `/src/vs/workbench/browser/parts/media/paneCompositePart.css`**

Centered the activity bar icons:
```css
.monaco-workbench .pane-composite-part > .title > .composite-bar-container,
.monaco-workbench .pane-composite-part > .header-or-footer > .composite-bar-container {
  display: flex;
  justify-content: center;  /* Added */
}
```

---

### 4. Welcome Page Customization

**File: `/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts`**

Changed subtitle:
```typescript
// Line ~924
$('p.subtitle.description', {}, localize(..., "Build amazing games"))
// Was: "Editing evolved"
```

**File: `/src/vs/workbench/contrib/welcomeGettingStarted/common/gettingStartedContent.ts`**

Removed/hidden entries:
- "Connect to..." - Set `when: 'false'`
- "Generate New Workspace..." - Set `when: 'false'`

Changed walkthrough titles:
- "Get started with VS Code" → "Get Started"
- "Get Started with VS Code for the Web" → "Get Started"

**File: `/src/vs/workbench/contrib/welcomeGettingStarted/browser/media/gettingStarted.css`**

CSS changes for Cursor-like layout:
- Single-column centered layout (max-width: 700px)
- Start entries display as horizontal cards
- Smaller, uppercase section headers
- Walkthroughs section hidden

Key CSS additions:
```css
/* Center the layout */
.gettingStartedCategoriesContainer {
  max-width: 700px;
  grid-template-columns: 1fr;
  padding-top: 60px;
}

/* Card-style start entries */
.index-list.start-container ul {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.index-list.start-container li .button-link {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--vscode-welcomePage-tileBackground);
  border-radius: 8px;
  min-height: 80px;
}

/* Hide walkthroughs */
.index-list.getting-started {
  display: none;
}
```

---

### 5. Chat Panel Removal

**File: `/src/vs/workbench/contrib/chat/browser/chatParticipant.contribution.ts`**

Wrapped chat registration in conditional:
```typescript
function registerChatViewIfEnabled(): ViewContainer | undefined {
  if (!product.defaultChatAgent?.chatExtensionId) {
    return undefined;  // Don't register if no chat agent configured
  }
  // ... registration code
}
registerChatViewIfEnabled();
```

**File: `/product.json`**

Empty `defaultChatAgent` configuration:
```json
"defaultChatAgent": {
  "extensionId": "",
  "chatExtensionId": "",
  // ... all fields empty
}
```

---

### 6. Empty Editor Watermark

**File: `/src/vs/workbench/browser/parts/editor/editorGroupWatermark.ts`**

Removed "Open Chat" from watermark entries:
```typescript
const baseEntries: WatermarkEntry[] = [
  // openChat,  <-- Removed
  showCommands,
];
```

---

### 7. Default Account Logging

**File: `/src/vs/workbench/services/accounts/browser/defaultAccount.ts`**

Changed log level to suppress info message:
```typescript
// Line ~412
this.logService.debug(`[DefaultAccount] Authentication provider...`);
// Was: this.logService.info(...)
```

---

### 8. Configuration Defaults Loading

**File: `/src/vs/base/common/product.ts`**

Added type definition:
```typescript
readonly configurationDefaults?: IStringDictionary<unknown>;
```

**File: `/src/vs/workbench/browser/workbench.contribution.ts`**

Added registration:
```typescript
// Register product configuration defaults
if (product.configurationDefaults) {
  registry.registerDefaultConfigurations([{ overrides: product.configurationDefaults }]);
}
```

---

### 9. Panel Alignment (Full Width)

**File: `/src/vs/workbench/browser/layout.ts`**

Changed default panel alignment from `'center'` to `'justify'`:
```typescript
// Line ~2795
PANEL_ALIGNMENT: new RuntimeStateKey<PanelAlignment>('panel.alignment', StorageScope.PROFILE, StorageTarget.USER, 'justify'),
// Was: 'center'
```

**Why this matters:**
- `'center'` = Panel only spans editor width (gap between sidebar and panel)
- `'justify'` = Panel spans full width, connects with sidebar (standard VS Code behavior)

---

### 10. Hygiene Check Bypass

**File: `/build/hygiene.ts`**

Removed extensionsGallery check for OSS builds:
```typescript
const productJson = es.through(function (file: VinylFile) {
  // extensionsGallery check removed for GameDev IDE fork
  this.emit('data', file);
});
```

---

## How to Test Changes

1. **Delete cached settings** (important for testing defaults):
   ```bash
   rm -rf ~/.gamedev-ide
   rm -rf ~/.gamedev-ide-dev
   ```

2. **Rebuild**:
   ```bash
   npm run watch
   ```

3. **Launch**:
   ```bash
   ./run.sh
   ```

4. **Verify**:
   - Activity bar at top with centered icons
   - Dark theme applied
   - Welcome page shows on startup
   - No chat panel
   - Extensions search works (Open VSX)

---

## Configuration Defaults

These settings are applied by default via `product.json`:

| Setting | Value | Purpose |
|---------|-------|---------|
| `workbench.colorTheme` | `"GameDev IDE Dark"` | Custom dark theme |
| `workbench.activityBar.location` | `"top"` | Horizontal activity bar |
| `workbench.startupEditor` | `"welcomePage"` | Show welcome on start |
| `window.restoreWindows` | `"none"` | Don't restore previous |
| `editor.minimap.enabled` | `false` | Hide minimap |
| `breadcrumbs.enabled` | `false` | Hide breadcrumbs |
| `workbench.layoutControl.enabled` | `false` | Hide layout control |
| `window.commandCenter` | `true` | Show command center |

---

## Future Improvements

### Not Yet Implemented
- [ ] Custom GameDev IDE logo/icon
- [ ] Custom welcome page with logo (like Cursor has)
- [ ] Recent projects list styled like Cursor
- [ ] Custom "Open project", "Clone repo" cards

### Known Issues
- Activity bar icons could be slightly larger
- Welcome page doesn't have custom logo yet
- Recent projects styling is basic

---

## Summary for Future Claude Agents

When working on GameDev IDE UI:

1. **Theme colors** are in `/extensions/theme-gamedev-dark/themes/gamedev-dark-color-theme.json`
2. **Activity bar size** is in `/src/vs/workbench/browser/parts/activitybar/activitybarPart.ts`
3. **Welcome page content** is in `/src/vs/workbench/contrib/welcomeGettingStarted/`
4. **Welcome page CSS** is in `.../welcomeGettingStarted/browser/media/gettingStarted.css`
5. **Default settings** are in `/product.json` under `configurationDefaults`
6. **Chat removal** is in `/src/vs/workbench/contrib/chat/browser/chatParticipant.contribution.ts`
7. **Panel alignment** is in `/src/vs/workbench/browser/layout.ts` (PANEL_ALIGNMENT default)

**Always delete `~/.gamedev-ide-dev` when testing default settings changes!**

---

## References

- Cursor IDE: https://cursor.com/ (design inspiration)
- VS Code theming: https://code.visualstudio.com/api/extension-guides/color-theme
- VS Code product.json: Internal configuration for branding

---

**Last updated**: Session where Cursor-like design was implemented
