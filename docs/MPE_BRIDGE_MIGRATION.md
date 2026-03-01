# Unity Bridge: Architecture Notes

## Current State

### Transport: v1.0 Custom WebSocket Server

The C# plugin (`GameDevIDEBridge.cs`) uses a custom WebSocket server built on `TcpListener` with manual handshake and frame encoding. This is the proven, working transport layer.

### Agent Architecture: Tool-Use Agentic Loop

Bridge commands are executed as **Claude API tool calls** (`unity_bridge` tool) instead of post-hoc code block parsing. The model calls the tool mid-conversation, sees results, and can retry on failure before summarizing. This is the standard AI agent pattern.

**Key files:**
- `gamedevChatService.ts` — agentic loop (`_streamResponse` → `_processApiStream` → `_executeBridgeTool`)
- `unityBridgeSkills.ts` — system prompt describes the `unity_bridge` tool

### Origin Header Fix

An `onBeforeSendHeaders` interceptor in `windowImpl.ts` overrides the `Origin` header to `http://127.0.0.1` for localhost WebSocket connections. This is a generic fix (not Unity-specific) that prevents Electron's `vscode-file://vscode-app` origin from being rejected.

---

## MPE ChannelService (v2.0) — Attempted, Reverted

### Why MPE Was Attempted

The v1.0 custom WebSocket server has known issues:
- Port changes on every domain reload (script compilation)
- Discovery file race conditions
- Reconnection failures after Unity recompiles

MPE ChannelService would solve these (server survives domain reloads, stable port, ~500 fewer lines of C#).

### Why It Was Reverted

MPE ChannelService caused all bridge commands to time out. The root cause was not fully diagnosed — potential issues included binary vs text WebSocket frames (`ChannelService.Send(connectionId, byte[])` sends binary frames received as `Blob` by the browser) and possible limitations with external WebSocket clients (MPE is designed for Unity-to-Unity communication).

### TypeScript Backward Compatibility

The TypeScript side retains v2.0 support:
- `BridgeDiscoveryInfo` has optional `channel?: string` field
- `unityBridgeService.ts` conditionally builds `ws://127.0.0.1:{port}/{channel}` or bare URL
- If MPE is revisited, only the C# plugin needs to be rewritten
