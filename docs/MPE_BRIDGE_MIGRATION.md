# Unity Bridge: MPE ChannelService Migration

## Status: COMPLETE

### What We Did

Rewrote `GameDevIDEBridge.cs` to replace the custom WebSocket server (~550 lines of TcpListener, handshake, frame encode/decode) with Unity's built-in `MPE.ChannelService` (~30 lines). The MPE approach survives domain reloads (script recompilation), uses a stable port, and eliminates discovery file race conditions.

### Origin Header Fix

Unity's MPE `ChannelService` validates the `Origin` HTTP header and only accepts `127.0.0.1` or `localhost`. Fixed by adding an `onBeforeSendHeaders` interceptor in `windowImpl.ts` that overrides the Origin header for localhost WebSocket connections.

### Tool-Use Agentic Loop

Bridge commands are now executed as **Claude API tool calls** instead of post-hoc code block parsing. The model calls the `unity_bridge` tool mid-conversation, sees results, and can retry on failure before summarizing. This is the standard AI agent pattern.

### Why MPE Is Worth Pursuing

With the custom WebSocket server (current v1.0):
- Port changes on every domain reload (script compilation)
- Discovery file race conditions (file written then deleted before IDE reads it)
- WebSocket hangs without timeout
- Reconnection failures after Unity recompiles

With MPE ChannelService (target v2.0):
- Server survives domain reloads — no connection drop, no orange flash
- Stable port managed by Unity
- ~500 fewer lines of C# code

---

## Current State of the Code

### Files Already Modified (MPE v2.0 — C# side done, TS partially done)

1. **`unity-editor-plugin/GameDevIDEBridge.cs`** — Fully rewritten to use MPE
   - Uses `Unity.MPE.ChannelService.GetOrCreateChannel()`
   - `SendResponse()` calls `ChannelService.Send()`
   - Discovery file includes `"channel":"gamedev_bridge"`
   - Protocol version `2.0`, plugin version `2.0.0`
   - All command handlers, utilities, JSON parsing unchanged

2. **`src/vs/workbench/contrib/gamedevUnity/common/bridgeTypes.ts`** — Updated
   - `BridgeDiscoveryInfo` has `channel?: string` field
   - `BRIDGE_PROTOCOL_VERSION = '2.0'`
   - `BRIDGE_CHANNEL_NAME = 'gamedev_bridge'`
   - `BRIDGE_SUPPORTED_VERSIONS = new Set(['1.0', '2.0'])`

3. **`src/vs/workbench/contrib/gamedevUnity/browser/unityBridgeService.ts`** — Updated
   - `_discoveredChannel` field extracts channel from discovery file
   - WebSocket URL includes channel path when present: `ws://127.0.0.1:{port}/{channel}`
   - Falls back to bare URL for v1.0 backward compat
   - Verbose debug logging cleaned up

4. **`src/vs/workbench/contrib/gamedevUnity/common/bridgePluginSource.ts`** — Regenerated
   - Version `2.0.0`, base64 content matches new C# source

### Additional Files Modified

5. **`src/vs/platform/windows/electron-main/windowImpl.ts`** — Origin header interceptor
   - Added `ws://127.0.0.1/*` to `onBeforeSendHeaders` URL filter
   - Overrides Origin to `http://127.0.0.1` for localhost WebSocket connections
   - Generic fix — not Unity-specific

6. **`src/vs/workbench/contrib/gamedevChat/browser/gamedevChatService.ts`** — Agentic tool-use loop
   - Added `UNITY_BRIDGE_TOOL` definition (Anthropic API tool schema)
   - `_streamResponse` now orchestrates an agentic loop (call API → tool_use → execute → tool_result → call API again)
   - Added `_processApiStream` (single streaming API call with content block tracking)
   - Added `_executeBridgeTool` (executes bridge commands, handles compilation retry)
   - Captures `signature_delta` for thinking blocks (required for multi-turn tool-use)
   - Removed post-hoc `_applyBridgeCommands` method (no longer needed)
   - Removed follow-up turn mechanism for failures (model sees failures inline via tool_result)
   - Simplified `sendMessage` finally block

7. **`src/vs/workbench/contrib/gamedevChat/browser/skills/unityBridgeSkills.ts`** — Updated for tool-use
   - System prompt now describes the `unity_bridge` tool instead of code block format
   - Removed instructions about code blocks, post-hoc execution, and not writing summaries
   - Model is told to check results and retry on failure

---

## To Revert (if needed)

If you need to revert to the working v1.0 custom WebSocket server:

```bash
git checkout HEAD -- unity-editor-plugin/GameDevIDEBridge.cs
node scripts/generate-bridge-plugin-source.js
```

The TypeScript changes in `bridgeTypes.ts` and `unityBridgeService.ts` are backward compatible (version set includes `'1.0'`, channel URL is conditional) and don't need reverting.
