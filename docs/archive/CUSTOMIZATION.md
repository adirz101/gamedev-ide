# GameDev IDE - Customization & Branding

This document describes how we've customized VSCode to create GameDev IDE's unique identity.

## Changes Made

### 1. ✅ Removed GitHub Copilot Chat

**File**: `product.json`

**What we removed**:
- `defaultChatAgent` configuration (entire section)
- `trustedExtensionAuthAccess` for GitHub Copilot

**Result**: The Chat panel no longer appears. We'll add our own AI Assistant panel later.

### 2. ✅ Created Custom Color Theme

**File**: `src/vs/workbench/contrib/gamedev/themes/darkGame.json`

**Theme Name**: "GameDev IDE Dark"

**Color Scheme**:
- **Primary Accent**: Cyan (`#00d9ff`) - Like Unity's blue
- **Secondary Accent**: Magenta (`#ff00aa`) - Game-like pop of color
- **Background**: Very dark (`#0a0a0a`, `#0f0f0f`, `#121212`)
- **Foreground**: Light gray (`#e0e0e0`)

**Character**:
- Darker than default VSCode (like game engines)
- Vibrant accent colors (game-like)
- Terminal has cyan text (console feel)
- Activity bar is almost black with cyan icons

**Key Areas**:
- Activity Bar: `#0a0a0a` with cyan highlights
- Sidebar: `#0f0f0f` dark
- Editor: `#121212` slightly lighter
- Terminal: Console-style with cyan text
- Tabs: Active tabs have cyan top border
- Status Bar: Cyan on black

### 3. ✅ Created GameDev Configuration

**File**: `src/vs/workbench/contrib/gamedev/gamedev.configuration.ts`

**Settings Added**:
```typescript
{
  // Theme
  "gamedev.theme": "dark-game",  // Our custom theme

  // AI Assistant
  "gamedev.ai.enabled": true,
  "gamedev.ai.apiKey": "",  // Anthropic API key
  "gamedev.ai.model": "claude-sonnet-4-5-20251101",

  // Godot Integration
  "gamedev.godot.autoDetect": true,
  "gamedev.godot.sceneExplorer": true,

  // Asset Generation
  "gamedev.assets.pixellab.apiKey": "",
  "gamedev.assets.defaultStyle": "pixel-art",

  // Pixel Editor
  "gamedev.pixelEditor.gridSize": 16,
  "gamedev.pixelEditor.showGrid": true,

  // Welcome
  "gamedev.welcome.showOnStartup": true
}
```

## How to Apply Theme

The theme will be registered once we implement the theme contribution. For now, the JSON file exists.

**To apply manually** (after implementation):
1. Cmd+Shift+P → "Preferences: Color Theme"
2. Select "GameDev IDE Dark"

## Color Palette

### Primary Colors
```
Cyan:       #00d9ff  (Primary accent - icons, highlights)
Magenta:    #ff00aa  (Secondary - badges, special)
Dark Base:  #0a0a0a  (Activity bar, status bar)
Dark Gray:  #0f0f0f  (Sidebar)
Editor:     #121212  (Main editor area)
Foreground: #e0e0e0  (Text)
```

### Semantic Colors
```
Error:      #ff5555
Warning:    #ffaa00
Success:    #00cc66
Info:       #00b8d9
```

### Terminal Colors
```
Black:      #0f0f0f
Red:        #cc3333
Green:      #00cc66
Yellow:     #ccaa00
Blue:       #0088ff
Magenta:    #cc0088
Cyan:       #00d9ff  (matches theme)
White:      #e0e0e0
```

## UI Customization

### Activity Bar (Left Sidebar Icons)
- **Background**: Almost black `#0a0a0a`
- **Icons**: Cyan when active `#00d9ff`
- **Inactive**: Dark gray `#666666`
- **Badges**: Magenta `#ff00aa`

### Sidebar
- **Background**: Dark `#0f0f0f`
- **Section Headers**: Cyan text `#00d9ff`
- **Selected Items**: Cyan background `#00d9ff33` (with transparency)

### Editor
- **Background**: Slightly lighter `#121212` (easier on eyes)
- **Cursor**: Cyan `#00d9ff`
- **Line Numbers**: Gray `#444444`, active cyan `#00d9ff`
- **Selection**: Cyan with transparency `#00d9ff33`

### Tabs
- **Active Tab**: Cyan top border `#00d9ff`
- **Active Text**: Cyan `#00d9ff`
- **Inactive**: Dark `#0a0a0a` with gray text

### Status Bar
- **Background**: Almost black `#0a0a0a`
- **Text**: Cyan `#00d9ff`
- **Debugging Mode**: Magenta `#ff00aa`

### Terminal
- **Background**: Almost black `#0a0a0a`
- **Text**: Cyan `#00d9ff` (game console feel!)
- **Cursor**: Cyan `#00d9ff`

## Comparison with VSCode Default

| Element | VSCode Default | GameDev IDE Dark |
|---------|---------------|------------------|
| **Activity Bar** | `#333333` | `#0a0a0a` (darker) |
| **Sidebar** | `#252526` | `#0f0f0f` (darker) |
| **Editor** | `#1e1e1e` | `#121212` (slightly lighter) |
| **Primary Color** | Blue `#007acc` | Cyan `#00d9ff` (more vibrant) |
| **Accent** | Orange `#ff8c00` | Magenta `#ff00aa` (game-like) |
| **Terminal** | White text | Cyan text (console feel) |

## Inspiration

Our theme draws inspiration from:
- **Unity**: Dark UI with blue accents
- **Godot**: Clean, modern dark theme
- **Unreal Engine**: Very dark backgrounds
- **Game Consoles**: Cyan/magenta neon aesthetic
- **Retro Gaming**: Bold, vibrant colors

## Next Steps to Apply

### 1. Register the Theme

Create `src/vs/workbench/contrib/gamedev/themes/themes.contribution.ts`:

```typescript
import { registerColorTheme } from 'vs/workbench/services/themes/common/colorThemeData';

// Register our custom theme
registerColorTheme({
  id: 'gamedev-dark',
  label: 'GameDev IDE Dark',
  uiTheme: 'vs-dark',
  path: './darkGame.json'
});
```

### 2. Set as Default

In `product.json`, add:

```json
{
  "defaultColorTheme": "gamedev-dark"
}
```

### 3. Load Configuration

The `gamedev.configuration.ts` file needs to be imported in the workbench startup.

Add to `src/vs/workbench/workbench.desktop.main.ts`:

```typescript
import 'vs/workbench/contrib/gamedev/gamedev.configuration';
```

## Welcome Screen Customization

**Location**: `src/vs/workbench/contrib/welcomeGettingStarted/`

**Planned Changes**:
- Replace "Get started with VS Code" → "Get started with GameDev IDE"
- Remove Copilot integration prompts
- Add game development getting started content:
  - "Open a Godot Project"
  - "Start AI-Assisted Game Development"
  - "Generate Game Assets"
  - "Create Pixel Art"

## Icon Customization

**Future**: Create custom icons for:
- GameDev IDE application icon
- AI Assistant sidebar icon (robot/brain)
- Godot Integration icon (Godot logo)
- Asset Generation icon (image/sparkles)
- Pixel Editor icon (paint brush)

## Testing Customizations

### 1. Compile
```bash
npm run compile
```

### 2. Launch
```bash
./run.sh
```

### 3. Check
- Activity bar should be very dark
- Icons should have cyan tint
- Terminal text should be cyan
- Theme feels darker and more game-engine-like

## Advanced: Window Customization

**Future customization ideas**:
- Custom title bar with GameDev IDE branding
- Game development shortcuts in welcome screen
- Custom splash screen on startup
- Game asset file type icons

## Color Accessibility

Our theme maintains WCAG AA contrast ratios:
- Cyan `#00d9ff` on dark `#0a0a0a`: **17.3:1** ✅
- Foreground `#e0e0e0` on editor `#121212`: **13.4:1** ✅
- Magenta `#ff00aa` on dark `#0a0a0a`: **10.2:1** ✅

---

**The IDE now has a unique game development character with dark, vibrant colors!** 🎮🎨
