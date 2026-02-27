/*---------------------------------------------------------------------------------------------
 *  GameDev IDE Bridge — Unity Editor Plugin  (AUTO-INSTALLED by GameDev IDE)
 *
 *  This file is automatically managed by GameDev IDE. Do not edit manually.
 *  It opens a WebSocket server on localhost so the IDE can communicate with
 *  the running Unity Editor to create GameObjects, scenes, prefabs, etc.
 *
 *  Protocol version: 1.0
 *  Plugin version: 1.2.0
 *--------------------------------------------------------------------------------------------*/

using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Reflection;
using System.Linq;

[InitializeOnLoad]
public static class GameDevIDEBridge
{
    private const string PROTOCOL_VERSION = "1.0";
    private const string DISCOVERY_DIR = "Library/GameDevIDE";
    private const string DISCOVERY_FILE = "Library/GameDevIDE/bridge.json";

    private static TcpListener _listener;
    private static TcpClient _tcpClient;
    private static NetworkStream _clientStream;
    private static CancellationTokenSource _cts;
    private static readonly ConcurrentQueue<string> _incomingMessages = new ConcurrentQueue<string>();
    private static readonly ConcurrentQueue<string> _outgoingMessages = new ConcurrentQueue<string>();
    private static int _port;
    private static bool _running;
    private static bool _clientConnected;

    static GameDevIDEBridge()
    {
        EditorApplication.update += ProcessMessages;
        EditorApplication.quitting += Shutdown;
        AssemblyReloadEvents.beforeAssemblyReload += OnBeforeReload;
        Application.logMessageReceived += OnLogMessage;
        EditorApplication.playModeStateChanged += OnPlayModeChanged;
        StartServer();
    }

    // --- Server Lifecycle (TcpListener + manual WebSocket handshake) ---

    private static async void StartServer()
    {
        if (_running) return;

        try
        {
            _cts = new CancellationTokenSource();

            // Bind to port 0 for auto-assignment
            _listener = new TcpListener(IPAddress.Loopback, 0);
            _listener.Start();
            _port = ((IPEndPoint)_listener.LocalEndpoint).Port;
            _running = true;

            WriteDiscoveryFile();
            Debug.Log($"[GameDevIDE Bridge] Started on port {_port} (v{PROTOCOL_VERSION})");

            // Accept connections in background
            await AcceptConnections(_cts.Token);
        }
        catch (Exception ex)
        {
            Debug.LogError($"[GameDevIDE Bridge] Failed to start: {ex.Message}");
            _running = false;
        }
    }

    private static async Task AcceptConnections(CancellationToken token)
    {
        while (!token.IsCancellationRequested && _running)
        {
            try
            {
                var client = await _listener.AcceptTcpClientAsync();
                var stream = client.GetStream();

                // Read the HTTP upgrade request
                var buffer = new byte[4096];
                int bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length, token);
                var request = Encoding.UTF8.GetString(buffer, 0, bytesRead);

                if (request.Contains("Upgrade: websocket") || request.Contains("Upgrade: WebSocket"))
                {
                    // Only allow one client at a time
                    if (_clientConnected)
                    {
                        var reject = Encoding.UTF8.GetBytes("HTTP/1.1 409 Conflict\r\n\r\n");
                        await stream.WriteAsync(reject, 0, reject.Length, token);
                        client.Close();
                        continue;
                    }

                    // Perform WebSocket handshake
                    if (PerformWebSocketHandshake(stream, request))
                    {
                        _tcpClient = client;
                        _clientStream = stream;
                        _clientConnected = true;
                        Debug.Log("[GameDevIDE Bridge] IDE connected");

                        _ = ReceiveMessages(stream, token);
                        _ = SendMessages(stream, token);
                    }
                    else
                    {
                        client.Close();
                    }
                }
                else
                {
                    // Simple health check
                    var body = "{\"status\":\"ok\",\"version\":\"" + PROTOCOL_VERSION + "\"}";
                    var response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + body.Length + "\r\nConnection: close\r\n\r\n" + body;
                    var responseBytes = Encoding.UTF8.GetBytes(response);
                    await stream.WriteAsync(responseBytes, 0, responseBytes.Length, token);
                    client.Close();
                }
            }
            catch (ObjectDisposedException) { break; }
            catch (SocketException) { break; }
            catch (Exception ex)
            {
                if (!token.IsCancellationRequested)
                    Debug.LogWarning($"[GameDevIDE Bridge] Connection error: {ex.Message}");
            }
        }
    }

    private static bool PerformWebSocketHandshake(NetworkStream stream, string request)
    {
        try
        {
            // Extract Sec-WebSocket-Key from the request headers
            var keyMatch = Regex.Match(request, @"Sec-WebSocket-Key:\s*(.+?)\r\n");
            if (!keyMatch.Success) return false;

            var key = keyMatch.Groups[1].Value.Trim();
            var acceptKey = Convert.ToBase64String(
                SHA1.Create().ComputeHash(
                    Encoding.UTF8.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
                )
            );

            var response =
                "HTTP/1.1 101 Switching Protocols\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                "Sec-WebSocket-Accept: " + acceptKey + "\r\n\r\n";

            var responseBytes = Encoding.UTF8.GetBytes(response);
            stream.Write(responseBytes, 0, responseBytes.Length);
            return true;
        }
        catch (Exception ex)
        {
            Debug.LogWarning($"[GameDevIDE Bridge] Handshake failed: {ex.Message}");
            return false;
        }
    }

    private static async Task ReceiveMessages(NetworkStream stream, CancellationToken token)
    {
        var buffer = new byte[8192];

        try
        {
            while (_clientConnected && !token.IsCancellationRequested)
            {
                if (!stream.DataAvailable)
                {
                    await Task.Delay(8, token);
                    continue;
                }

                int bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length, token);
                if (bytesRead == 0)
                {
                    Debug.Log("[GameDevIDE Bridge] IDE disconnected");
                    break;
                }

                // Decode WebSocket frame(s)
                int offset = 0;
                while (offset < bytesRead)
                {
                    var frame = DecodeWebSocketFrame(buffer, offset, bytesRead - offset);
                    if (frame == null) break;

                    offset += frame.TotalLength;

                    if (frame.Opcode == 0x8) // Close
                    {
                        // Send close frame back
                        var closeFrame = new byte[] { 0x88, 0x00 };
                        await stream.WriteAsync(closeFrame, 0, closeFrame.Length, token);
                        Debug.Log("[GameDevIDE Bridge] IDE disconnected (close frame)");
                        DisconnectClient();
                        return;
                    }

                    if (frame.Opcode == 0x9) // Ping
                    {
                        // Send pong
                        var pong = EncodeWebSocketFrame(frame.Payload, 0xA);
                        await stream.WriteAsync(pong, 0, pong.Length, token);
                        continue;
                    }

                    if (frame.Opcode == 0x1 || frame.Opcode == 0x2) // Text or Binary
                    {
                        var message = Encoding.UTF8.GetString(frame.Payload);
                        _incomingMessages.Enqueue(message);
                    }
                }
            }
        }
        catch (IOException) { /* Client disconnected */ }
        catch (OperationCanceledException) { /* Shutting down */ }
        catch (Exception ex)
        {
            Debug.LogWarning($"[GameDevIDE Bridge] Receive error: {ex.Message}");
        }

        DisconnectClient();
    }

    private static async Task SendMessages(NetworkStream stream, CancellationToken token)
    {
        try
        {
            while (_clientConnected && !token.IsCancellationRequested)
            {
                if (_outgoingMessages.TryDequeue(out var message))
                {
                    var payload = Encoding.UTF8.GetBytes(message);
                    var frame = EncodeWebSocketFrame(payload, 0x1); // Text frame
                    await stream.WriteAsync(frame, 0, frame.Length, token);
                }
                else
                {
                    await Task.Delay(16, token); // ~60Hz poll
                }
            }
        }
        catch (IOException) { }
        catch (OperationCanceledException) { }
    }

    private static void DisconnectClient()
    {
        _clientConnected = false;
        try { _clientStream?.Close(); } catch { }
        try { _tcpClient?.Close(); } catch { }
        _clientStream = null;
        _tcpClient = null;
    }

    // --- WebSocket Frame Encoding/Decoding ---

    private class WebSocketFrame
    {
        public byte Opcode;
        public byte[] Payload;
        public int TotalLength; // Total bytes consumed from buffer
    }

    private static WebSocketFrame DecodeWebSocketFrame(byte[] buffer, int offset, int length)
    {
        if (length < 2) return null;

        var opcode = (byte)(buffer[offset] & 0x0F);
        var masked = (buffer[offset + 1] & 0x80) != 0;
        long payloadLen = buffer[offset + 1] & 0x7F;
        int headerLen = 2;

        if (payloadLen == 126)
        {
            if (length < 4) return null;
            payloadLen = (buffer[offset + 2] << 8) | buffer[offset + 3];
            headerLen = 4;
        }
        else if (payloadLen == 127)
        {
            if (length < 10) return null;
            payloadLen = 0;
            for (int i = 0; i < 8; i++)
                payloadLen = (payloadLen << 8) | buffer[offset + 2 + i];
            headerLen = 10;
        }

        byte[] maskKey = null;
        if (masked)
        {
            if (length < headerLen + 4) return null;
            maskKey = new byte[4];
            Array.Copy(buffer, offset + headerLen, maskKey, 0, 4);
            headerLen += 4;
        }

        if (length < headerLen + payloadLen) return null;

        var payload = new byte[payloadLen];
        Array.Copy(buffer, offset + headerLen, payload, 0, (int)payloadLen);

        if (masked && maskKey != null)
        {
            for (int i = 0; i < payload.Length; i++)
                payload[i] ^= maskKey[i % 4];
        }

        return new WebSocketFrame
        {
            Opcode = opcode,
            Payload = payload,
            TotalLength = headerLen + (int)payloadLen
        };
    }

    private static byte[] EncodeWebSocketFrame(byte[] payload, byte opcode)
    {
        var len = payload.Length;
        byte[] frame;

        if (len < 126)
        {
            frame = new byte[2 + len];
            frame[0] = (byte)(0x80 | opcode); // FIN + opcode
            frame[1] = (byte)len;
            Array.Copy(payload, 0, frame, 2, len);
        }
        else if (len < 65536)
        {
            frame = new byte[4 + len];
            frame[0] = (byte)(0x80 | opcode);
            frame[1] = 126;
            frame[2] = (byte)(len >> 8);
            frame[3] = (byte)(len & 0xFF);
            Array.Copy(payload, 0, frame, 4, len);
        }
        else
        {
            frame = new byte[10 + len];
            frame[0] = (byte)(0x80 | opcode);
            frame[1] = 127;
            for (int i = 0; i < 8; i++)
                frame[2 + i] = (byte)((len >> (56 - i * 8)) & 0xFF);
            Array.Copy(payload, 0, frame, 10, len);
        }

        return frame;
    }

    private static void WriteDiscoveryFile()
    {
        try
        {
            if (!Directory.Exists(DISCOVERY_DIR))
                Directory.CreateDirectory(DISCOVERY_DIR);

            var json = $"{{\"port\":{_port},\"pid\":{System.Diagnostics.Process.GetCurrentProcess().Id},\"version\":\"{PROTOCOL_VERSION}\",\"timestamp\":{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}}}";
            File.WriteAllText(DISCOVERY_FILE, json);
        }
        catch (Exception ex)
        {
            Debug.LogError($"[GameDevIDE Bridge] Failed to write discovery file: {ex.Message}");
        }
    }

    private static void Shutdown()
    {
        _running = false;
        _cts?.Cancel();

        DisconnectClient();

        try { _listener?.Stop(); }
        catch { }

        try { if (File.Exists(DISCOVERY_FILE)) File.Delete(DISCOVERY_FILE); }
        catch { }

        Debug.Log("[GameDevIDE Bridge] Stopped");
    }

    private static void OnBeforeReload()
    {
        // Clean up before domain reload (script recompilation)
        Shutdown();
    }

    // --- Unity Event Forwarding ---

    private static void OnLogMessage(string condition, string stackTrace, LogType type)
    {
        if (!_clientConnected) return;

        var logType = type switch
        {
            LogType.Error => "Error",
            LogType.Warning => "Warning",
            LogType.Exception => "Exception",
            LogType.Assert => "Assert",
            _ => "Log"
        };

        var eventJson = $"{{\"id\":\"{Guid.NewGuid()}\",\"type\":\"event\",\"event\":\"console.log\",\"data\":{{\"message\":{EscapeJson(condition)},\"stackTrace\":{EscapeJson(stackTrace ?? "")},\"logType\":\"{logType}\",\"timestamp\":{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}}}}}";
        _outgoingMessages.Enqueue(eventJson);
    }

    private static void OnPlayModeChanged(PlayModeStateChange state)
    {
        if (!_clientConnected) return;

        var playState = state switch
        {
            PlayModeStateChange.EnteredPlayMode => "playing",
            PlayModeStateChange.ExitingPlayMode => "stopped",
            PlayModeStateChange.EnteredEditMode => "stopped",
            PlayModeStateChange.ExitingEditMode => "playing",
            _ => "stopped"
        };

        var eventJson = $"{{\"id\":\"{Guid.NewGuid()}\",\"type\":\"event\",\"event\":\"playModeChanged\",\"data\":{{\"state\":\"{playState}\"}}}}";
        _outgoingMessages.Enqueue(eventJson);
    }

    // --- Message Processing (Main Thread) ---

    private static void ProcessMessages()
    {
        // Process up to 10 messages per frame to avoid blocking
        int processed = 0;
        while (_incomingMessages.TryDequeue(out var message) && processed < 10)
        {
            processed++;
            string requestId = "unknown";
            try
            {
                var request = ParseRequest(message);
                requestId = request.id;
                var response = HandleCommand(request);
                _outgoingMessages.Enqueue(response);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[GameDevIDE Bridge] Error processing message: {ex.Message}");
                _outgoingMessages.Enqueue(MakeError(requestId, ex.Message));
            }
        }
    }

    /// <summary>
    /// Manually parse a JSON request since Unity's JsonUtility can't handle
    /// nested dictionaries or the 'params' field properly.
    /// </summary>
    private static SerializableRequest ParseRequest(string json)
    {
        var req = new SerializableRequest();
        req.id = ExtractJsonString(json, "id") ?? Guid.NewGuid().ToString();
        req.type = ExtractJsonString(json, "type") ?? "request";
        req.category = ExtractJsonString(json, "category") ?? "";
        req.action = ExtractJsonString(json, "action") ?? "";

        // Extract the params object as a raw JSON substring
        var paramsIdx = json.IndexOf("\"params\"");
        if (paramsIdx >= 0)
        {
            var colonIdx = json.IndexOf(':', paramsIdx);
            if (colonIdx >= 0)
            {
                req.paramsJson = ExtractJsonObject(json, colonIdx + 1);
            }
        }

        return req;
    }

    private static string ExtractJsonString(string json, string key)
    {
        var pattern = $"\"{key}\"";
        var idx = json.IndexOf(pattern);
        if (idx < 0) return null;

        var colonIdx = json.IndexOf(':', idx + pattern.Length);
        if (colonIdx < 0) return null;

        // Skip whitespace
        var startIdx = colonIdx + 1;
        while (startIdx < json.Length && char.IsWhiteSpace(json[startIdx])) startIdx++;

        if (startIdx >= json.Length || json[startIdx] != '"') return null;

        // Read until closing quote (handling escapes)
        var sb = new StringBuilder();
        for (int i = startIdx + 1; i < json.Length; i++)
        {
            if (json[i] == '\\' && i + 1 < json.Length)
            {
                sb.Append(json[i + 1]);
                i++;
            }
            else if (json[i] == '"')
            {
                break;
            }
            else
            {
                sb.Append(json[i]);
            }
        }
        return sb.ToString();
    }

    private static string ExtractJsonObject(string json, int startIdx)
    {
        // Skip whitespace
        while (startIdx < json.Length && char.IsWhiteSpace(json[startIdx])) startIdx++;
        if (startIdx >= json.Length || json[startIdx] != '{') return "{}";

        var depth = 0;
        var inString = false;
        for (int i = startIdx; i < json.Length; i++)
        {
            if (json[i] == '"' && (i == 0 || json[i - 1] != '\\'))
                inString = !inString;
            else if (!inString)
            {
                if (json[i] == '{') depth++;
                else if (json[i] == '}')
                {
                    depth--;
                    if (depth == 0)
                        return json.Substring(startIdx, i - startIdx + 1);
                }
            }
        }
        return "{}";
    }

    // --- Command Dispatch ---

    private static string HandleCommand(SerializableRequest request)
    {
        var key = $"{request.category}.{request.action}";
        var p = request.GetParams();

        switch (key)
        {
            // --- Scene ---
            case "scene.getActive":
                return HandleGetActiveScene(request.id);
            case "scene.getHierarchy":
                return HandleGetHierarchy(request.id);
            case "scene.create":
                return HandleCreateScene(request.id, p);
            case "scene.save":
                return HandleSaveScene(request.id);

            // --- GameObject ---
            case "gameObject.create":
                return HandleCreateGameObject(request.id, p);
            case "gameObject.createPrimitive":
                return HandleCreatePrimitive(request.id, p);
            case "gameObject.find":
                return HandleFindGameObject(request.id, p);
            case "gameObject.destroy":
                return HandleDestroyGameObject(request.id, p);
            case "gameObject.setActive":
                return HandleSetActive(request.id, p);
            case "gameObject.setTransform":
                return HandleSetTransform(request.id, p);
            case "gameObject.getSelected":
                return HandleGetSelected(request.id);

            // --- Component ---
            case "component.add":
                return HandleAddComponent(request.id, p);
            case "component.remove":
                return HandleRemoveComponent(request.id, p);
            case "component.getAll":
                return HandleGetComponents(request.id, p);
            case "component.setProperty":
                return HandleSetProperty(request.id, p);

            // --- Prefab ---
            case "prefab.create":
                return HandleCreatePrefab(request.id, p);
            case "prefab.instantiate":
                return HandleInstantiatePrefab(request.id, p);
            case "prefab.getAll":
                return HandleGetAllPrefabs(request.id);

            // --- Asset ---
            case "asset.create":
                return HandleCreateAsset(request.id, p);
            case "asset.find":
                return HandleFindAssets(request.id, p);
            case "asset.import":
                AssetDatabase.Refresh();
                return MakeSuccess(request.id, "{}");

            // --- Project ---
            case "project.getInfo":
                return HandleGetProjectInfo(request.id);
            case "project.refresh":
                AssetDatabase.Refresh();
                return MakeSuccess(request.id, "{}");

            // --- Editor ---
            case "editor.getPlayMode":
                return HandleGetPlayMode(request.id);
            case "editor.play":
                EditorApplication.isPlaying = true;
                return MakeSuccess(request.id, "{\"state\":\"playing\"}");
            case "editor.pause":
                EditorApplication.isPaused = !EditorApplication.isPaused;
                return MakeSuccess(request.id, $"{{\"paused\":{EditorApplication.isPaused.ToString().ToLower()}}}");
            case "editor.stop":
                EditorApplication.isPlaying = false;
                return MakeSuccess(request.id, "{\"state\":\"stopped\"}");
            case "editor.executeMenuItem":
                return HandleExecuteMenuItem(request.id, p);

            default:
                return MakeError(request.id, $"Unknown command: {key}");
        }
    }

    // --- Scene Handlers ---

    private static string HandleGetActiveScene(string id)
    {
        var scene = SceneManager.GetActiveScene();
        return MakeSuccess(id, $"{{\"name\":{EscapeJson(scene.name)},\"path\":{EscapeJson(scene.path)},\"rootCount\":{scene.rootCount},\"isDirty\":{scene.isDirty.ToString().ToLower()}}}");
    }

    private static string HandleGetHierarchy(string id)
    {
        var scene = SceneManager.GetActiveScene();
        var roots = scene.GetRootGameObjects();
        var sb = new StringBuilder();
        sb.Append("{\"scene\":");
        sb.Append(EscapeJson(scene.name));
        sb.Append(",\"hierarchy\":[");
        for (int i = 0; i < roots.Length; i++)
        {
            if (i > 0) sb.Append(",");
            BuildHierarchyJson(roots[i], sb);
        }
        sb.Append("]}");
        return MakeSuccess(id, sb.ToString());
    }

    private static void BuildHierarchyJson(GameObject go, StringBuilder sb)
    {
        sb.Append("{\"name\":");
        sb.Append(EscapeJson(go.name));
        sb.Append(",\"active\":");
        sb.Append(go.activeSelf.ToString().ToLower());
        sb.Append(",\"components\":[");
        var components = go.GetComponents<Component>();
        for (int c = 0; c < components.Length; c++)
        {
            if (components[c] == null) continue;
            if (c > 0) sb.Append(",");
            sb.Append(EscapeJson(components[c].GetType().Name));
        }
        sb.Append("],\"children\":[");
        for (int i = 0; i < go.transform.childCount; i++)
        {
            if (i > 0) sb.Append(",");
            BuildHierarchyJson(go.transform.GetChild(i).gameObject, sb);
        }
        sb.Append("]}");
    }

    private static string HandleCreateScene(string id, Dictionary<string, string> p)
    {
        var name = p.GetValueOrDefault("name", "New Scene");
        var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
        if (p.TryGetValue("path", out var path))
        {
            EditorSceneManager.SaveScene(scene, path);
        }
        return MakeSuccess(id, $"{{\"name\":{EscapeJson(scene.name)},\"path\":{EscapeJson(scene.path)}}}");
    }

    private static string HandleSaveScene(string id)
    {
        var scene = SceneManager.GetActiveScene();
        EditorSceneManager.SaveScene(scene);
        return MakeSuccess(id, $"{{\"name\":{EscapeJson(scene.name)},\"path\":{EscapeJson(scene.path)}}}");
    }

    // --- GameObject Handlers ---

    private static string HandleCreateGameObject(string id, Dictionary<string, string> p)
    {
        var name = p.GetValueOrDefault("name", "GameObject");
        var go = new GameObject(name);

        if (p.TryGetValue("parentPath", out var parentPath) && !string.IsNullOrEmpty(parentPath))
        {
            var parent = FindGameObjectByPath(parentPath);
            if (parent != null)
                go.transform.SetParent(parent.transform, false);
        }

        Undo.RegisterCreatedObjectUndo(go, $"Create {name}");
        Selection.activeGameObject = go;
        return MakeSuccess(id, $"{{\"name\":{EscapeJson(go.name)},\"instanceId\":{go.GetInstanceID()}}}");
    }

    private static string HandleCreatePrimitive(string id, Dictionary<string, string> p)
    {
        var name = p.GetValueOrDefault("name", "Primitive");
        var typeStr = p.GetValueOrDefault("primitiveType", "Cube");

        if (!Enum.TryParse<PrimitiveType>(typeStr, true, out var primitiveType))
            return MakeError(id, $"Unknown primitive type: {typeStr}. Valid: Sphere, Capsule, Cylinder, Cube, Plane, Quad");

        var go = GameObject.CreatePrimitive(primitiveType);
        go.name = name;

        if (p.TryGetValue("parentPath", out var parentPath) && !string.IsNullOrEmpty(parentPath))
        {
            var parent = FindGameObjectByPath(parentPath);
            if (parent != null)
                go.transform.SetParent(parent.transform, false);
        }

        Undo.RegisterCreatedObjectUndo(go, $"Create {name}");
        Selection.activeGameObject = go;
        return MakeSuccess(id, $"{{\"name\":{EscapeJson(go.name)},\"instanceId\":{go.GetInstanceID()}}}");
    }

    private static string HandleFindGameObject(string id, Dictionary<string, string> p)
    {
        var name = p.GetValueOrDefault("name", "");
        var go = FindGameObjectByPath(name);
        if (go == null)
            return MakeError(id, $"GameObject not found: {name}");

        return MakeSuccess(id, $"{{\"name\":{EscapeJson(go.name)},\"instanceId\":{go.GetInstanceID()},\"active\":{go.activeSelf.ToString().ToLower()}}}");
    }

    private static string HandleDestroyGameObject(string id, Dictionary<string, string> p)
    {
        var name = p.GetValueOrDefault("gameObjectPath", p.GetValueOrDefault("name", ""));
        var go = FindGameObjectByPath(name);
        if (go == null)
            return MakeError(id, $"GameObject not found: {name}");

        Undo.DestroyObjectImmediate(go);
        return MakeSuccess(id, "{}");
    }

    private static string HandleSetActive(string id, Dictionary<string, string> p)
    {
        var path = p.GetValueOrDefault("gameObjectPath", "");
        var go = FindGameObjectByPath(path);
        if (go == null)
            return MakeError(id, $"GameObject not found: {path}");

        var active = p.GetValueOrDefault("active", "true") == "true";
        Undo.RecordObject(go, $"Set Active {go.name}");
        go.SetActive(active);
        return MakeSuccess(id, $"{{\"name\":{EscapeJson(go.name)},\"active\":{go.activeSelf.ToString().ToLower()}}}");
    }

    private static string HandleSetTransform(string id, Dictionary<string, string> p)
    {
        var path = p.GetValueOrDefault("gameObjectPath", "");
        var go = FindGameObjectByPath(path);
        if (go == null)
            return MakeError(id, $"GameObject not found: {path}");

        Undo.RecordObject(go.transform, $"Transform {go.name}");

        if (p.TryGetValue("position", out var posStr))
            go.transform.position = ParseVector3(posStr);
        if (p.TryGetValue("rotation", out var rotStr))
            go.transform.eulerAngles = ParseVector3(rotStr);
        if (p.TryGetValue("scale", out var scaleStr))
            go.transform.localScale = ParseVector3(scaleStr);

        return MakeSuccess(id, $"{{\"name\":{EscapeJson(go.name)},\"position\":\"{go.transform.position}\",\"rotation\":\"{go.transform.eulerAngles}\",\"scale\":\"{go.transform.localScale}\"}}");
    }

    private static string HandleGetSelected(string id)
    {
        var selected = Selection.gameObjects;
        var sb = new StringBuilder();
        sb.Append("{\"selected\":[");
        for (int i = 0; i < selected.Length; i++)
        {
            if (i > 0) sb.Append(",");
            sb.Append(EscapeJson(selected[i].name));
        }
        sb.Append("]}");
        return MakeSuccess(id, sb.ToString());
    }

    // --- Component Handlers ---

    private static string HandleAddComponent(string id, Dictionary<string, string> p)
    {
        var path = p.GetValueOrDefault("gameObjectPath", "");
        var go = FindGameObjectByPath(path);
        if (go == null)
            return MakeError(id, $"GameObject not found: {path}");

        var typeName = p.GetValueOrDefault("componentType", "");
        var type = FindComponentType(typeName);
        if (type == null)
            return MakeError(id, $"Component type not found: {typeName}");

        Undo.AddComponent(go, type);
        return MakeSuccess(id, $"{{\"gameObject\":{EscapeJson(go.name)},\"component\":{EscapeJson(type.Name)}}}");
    }

    private static string HandleRemoveComponent(string id, Dictionary<string, string> p)
    {
        var path = p.GetValueOrDefault("gameObjectPath", "");
        var go = FindGameObjectByPath(path);
        if (go == null)
            return MakeError(id, $"GameObject not found: {path}");

        var typeName = p.GetValueOrDefault("componentType", "");
        var comp = go.GetComponent(typeName);
        if (comp == null)
            return MakeError(id, $"Component not found: {typeName} on {go.name}");

        Undo.DestroyObjectImmediate(comp);
        return MakeSuccess(id, "{}");
    }

    private static string HandleGetComponents(string id, Dictionary<string, string> p)
    {
        var path = p.GetValueOrDefault("gameObjectPath", "");
        var go = FindGameObjectByPath(path);
        if (go == null)
            return MakeError(id, $"GameObject not found: {path}");

        var components = go.GetComponents<Component>();
        var sb = new StringBuilder();
        sb.Append("{\"components\":[");
        for (int i = 0; i < components.Length; i++)
        {
            if (components[i] == null) continue;
            if (i > 0) sb.Append(",");
            sb.Append(EscapeJson(components[i].GetType().Name));
        }
        sb.Append("]}");
        return MakeSuccess(id, sb.ToString());
    }

    private static string HandleSetProperty(string id, Dictionary<string, string> p)
    {
        var path = p.GetValueOrDefault("gameObjectPath", "");
        var go = FindGameObjectByPath(path);
        if (go == null)
            return MakeError(id, $"GameObject not found: {path}");

        var typeName = p.GetValueOrDefault("componentType", "");
        var comp = go.GetComponent(typeName);
        if (comp == null)
            return MakeError(id, $"Component not found: {typeName} on {go.name}");

        var propName = p.GetValueOrDefault("propertyName", "");
        var valueStr = p.GetValueOrDefault("value", "");

        Undo.RecordObject(comp, $"Set {propName} on {go.name}");

        // Try setting via SerializedObject for proper undo support
        var so = new SerializedObject(comp);
        var prop = so.FindProperty(propName);
        if (prop != null)
        {
            SetSerializedPropertyValue(prop, valueStr);
            so.ApplyModifiedProperties();
            return MakeSuccess(id, $"{{\"property\":{EscapeJson(propName)},\"set\":true}}");
        }

        // Fallback: reflection with smart type conversion
        var field = comp.GetType().GetField(propName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
        if (field != null)
        {
            var converted = SmartConvert(valueStr, field.FieldType);
            field.SetValue(comp, converted);
            return MakeSuccess(id, $"{{\"property\":{EscapeJson(propName)},\"set\":true}}");
        }

        var property = comp.GetType().GetProperty(propName, BindingFlags.Public | BindingFlags.Instance);
        if (property != null && property.CanWrite)
        {
            var converted = SmartConvert(valueStr, property.PropertyType);
            property.SetValue(comp, converted);
            return MakeSuccess(id, $"{{\"property\":{EscapeJson(propName)},\"set\":true}}");
        }

        return MakeError(id, $"Property not found: {propName} on {typeName}");
    }

    // --- Prefab Handlers ---

    private static string HandleCreatePrefab(string id, Dictionary<string, string> p)
    {
        var goPath = p.GetValueOrDefault("gameObjectPath", "");
        var go = FindGameObjectByPath(goPath);
        if (go == null)
            return MakeError(id, $"GameObject not found: {goPath}");

        var assetPath = p.GetValueOrDefault("assetPath", $"Assets/Prefabs/{go.name}.prefab");

        // Ensure directory exists
        var dir = Path.GetDirectoryName(assetPath);
        if (!string.IsNullOrEmpty(dir) && !AssetDatabase.IsValidFolder(dir))
        {
            CreateFolderRecursive(dir);
        }

        var prefab = PrefabUtility.SaveAsPrefabAsset(go, assetPath);
        if (prefab == null)
            return MakeError(id, $"Failed to create prefab at {assetPath}");

        return MakeSuccess(id, $"{{\"path\":{EscapeJson(assetPath)},\"name\":{EscapeJson(prefab.name)}}}");
    }

    private static string HandleInstantiatePrefab(string id, Dictionary<string, string> p)
    {
        var prefabPath = p.GetValueOrDefault("prefabPath", "");
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
        if (prefab == null)
            return MakeError(id, $"Prefab not found at: {prefabPath}");

        var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
        Undo.RegisterCreatedObjectUndo(instance, $"Instantiate {prefab.name}");
        Selection.activeGameObject = instance;

        return MakeSuccess(id, $"{{\"name\":{EscapeJson(instance.name)},\"instanceId\":{instance.GetInstanceID()}}}");
    }

    private static string HandleGetAllPrefabs(string id)
    {
        var guids = AssetDatabase.FindAssets("t:Prefab");
        var sb = new StringBuilder();
        sb.Append("{\"prefabs\":[");
        for (int i = 0; i < guids.Length; i++)
        {
            if (i > 0) sb.Append(",");
            var path = AssetDatabase.GUIDToAssetPath(guids[i]);
            sb.Append(EscapeJson(path));
        }
        sb.Append("]}");
        return MakeSuccess(id, sb.ToString());
    }

    // --- Asset Handlers ---

    private static string HandleCreateAsset(string id, Dictionary<string, string> p)
    {
        var assetType = p.GetValueOrDefault("assetType", "Material");
        var assetPath = p.GetValueOrDefault("path", "");

        if (string.IsNullOrEmpty(assetPath))
            return MakeError(id, "path is required");

        // Ensure directory exists
        var dir = Path.GetDirectoryName(assetPath);
        if (!string.IsNullOrEmpty(dir) && !AssetDatabase.IsValidFolder(dir))
        {
            CreateFolderRecursive(dir);
        }

        UnityEngine.Object asset = null;
        switch (assetType.ToLower())
        {
            case "material":
                var shader = Shader.Find(p.GetValueOrDefault("shader", "Standard"));
                asset = new Material(shader);
                break;
            case "physicmaterial":
                asset = new PhysicMaterial();
                break;
            default:
                return MakeError(id, $"Unsupported asset type: {assetType}. Supported: Material, PhysicMaterial");
        }

        AssetDatabase.CreateAsset(asset, assetPath);
        AssetDatabase.Refresh();

        return MakeSuccess(id, $"{{\"path\":{EscapeJson(assetPath)},\"type\":{EscapeJson(assetType)}}}");
    }

    private static string HandleFindAssets(string id, Dictionary<string, string> p)
    {
        var filter = p.GetValueOrDefault("filter", "");
        var guids = AssetDatabase.FindAssets(filter);
        var sb = new StringBuilder();
        sb.Append("{\"assets\":[");
        var count = Math.Min(guids.Length, 50); // Cap at 50
        for (int i = 0; i < count; i++)
        {
            if (i > 0) sb.Append(",");
            var path = AssetDatabase.GUIDToAssetPath(guids[i]);
            sb.Append(EscapeJson(path));
        }
        sb.Append($"],\"total\":{guids.Length}}}");
        return MakeSuccess(id, sb.ToString());
    }

    // --- Project / Editor Handlers ---

    private static string HandleGetProjectInfo(string id)
    {
        return MakeSuccess(id, $"{{\"name\":{EscapeJson(Application.productName)},\"unityVersion\":{EscapeJson(Application.unityVersion)},\"platform\":{EscapeJson(EditorUserBuildSettings.activeBuildTarget.ToString())}}}");
    }

    private static string HandleGetPlayMode(string id)
    {
        var state = EditorApplication.isPlaying
            ? (EditorApplication.isPaused ? "paused" : "playing")
            : "stopped";
        return MakeSuccess(id, $"{{\"state\":\"{state}\"}}");
    }

    private static string HandleExecuteMenuItem(string id, Dictionary<string, string> p)
    {
        var menuPath = p.GetValueOrDefault("menuPath", "");
        if (string.IsNullOrEmpty(menuPath))
            return MakeError(id, "menuPath is required");

        var result = EditorApplication.ExecuteMenuItem(menuPath);
        return MakeSuccess(id, $"{{\"executed\":{result.ToString().ToLower()},\"menuPath\":{EscapeJson(menuPath)}}}");
    }

    // --- Utilities ---

    /// <summary>
    /// Find a GameObject by hierarchy path, including inactive objects.
    /// Unity's GameObject.Find() only finds active objects, which fails when
    /// a parent has been set inactive. This method walks the hierarchy manually.
    /// </summary>
    private static GameObject FindGameObjectByPath(string path)
    {
        if (string.IsNullOrEmpty(path)) return null;

        // First try the fast path — Unity's built-in (only works for active objects)
        var found = GameObject.Find(path);
        if (found != null) return found;

        // Slow path: manually walk the hierarchy (works for inactive objects too)
        var parts = path.Split('/');
        var rootName = parts[0];

        // Search through all scene root objects
        var scene = SceneManager.GetActiveScene();
        var roots = scene.GetRootGameObjects();
        GameObject root = null;
        foreach (var r in roots)
        {
            if (r.name == rootName)
            {
                root = r;
                break;
            }
        }

        if (root == null) return null;
        if (parts.Length == 1) return root;

        // Walk down the path using Transform.Find (supports '/' paths and finds inactive children)
        var subPath = string.Join("/", parts, 1, parts.Length - 1);
        var child = root.transform.Find(subPath);
        return child != null ? child.gameObject : null;
    }

    private static Type FindComponentType(string typeName)
    {
        // Common namespace prefixes for Unity component types.
        // UI components live in UnityEngine.UI, TMPro, EventSystems — not just UnityEngine.
        string[] namespacePrefixes = new[]
        {
            "UnityEngine.",              // Rigidbody, Canvas, AudioSource, etc.
            "UnityEngine.UI.",           // Button, Image, Slider, CanvasScaler, GraphicRaycaster, VerticalLayoutGroup, etc.
            "UnityEngine.EventSystems.", // EventSystem, StandaloneInputModule, etc.
            "TMPro.",                    // TextMeshProUGUI, TMP_InputField, etc.
            "",                          // Custom scripts (bare class name in Assembly-CSharp)
        };

        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            foreach (var prefix in namespacePrefixes)
            {
                var fullName = prefix + typeName;
                var type = assembly.GetType(fullName);
                if (type != null && typeof(Component).IsAssignableFrom(type))
                    return type;
            }
        }

        return null;
    }

    /// <summary>
    /// Smart type conversion that handles enums, Vector2, Vector3, Color, and primitives.
    /// Falls back to Convert.ChangeType for simple types.
    /// </summary>
    private static object SmartConvert(string valueStr, Type targetType)
    {
        // Handle nullable
        var underlyingType = Nullable.GetUnderlyingType(targetType);
        if (underlyingType != null)
            targetType = underlyingType;

        // Enum types (RenderMode, ScaleMode, TextAlignmentOptions, etc.)
        if (targetType.IsEnum)
        {
            // Try parsing by name first (e.g. "ScreenSpaceOverlay", "ScaleWithScreenSize")
            if (Enum.TryParse(targetType, valueStr, true, out var enumVal))
                return enumVal;
            // Try parsing as integer
            if (int.TryParse(valueStr, out var intVal))
                return Enum.ToObject(targetType, intVal);
            throw new InvalidCastException($"Cannot convert '{valueStr}' to {targetType.Name}. Valid values: {string.Join(", ", Enum.GetNames(targetType))}");
        }

        // Vector2
        if (targetType == typeof(Vector2))
            return ParseVector2(valueStr);

        // Vector3
        if (targetType == typeof(Vector3))
            return ParseVector3(valueStr);

        // Vector4
        if (targetType == typeof(Vector4))
            return ParseVector4(valueStr);

        // Color
        if (targetType == typeof(Color))
            return ParseColor(valueStr);

        // Bool
        if (targetType == typeof(bool))
            return valueStr.ToLower() == "true" || valueStr == "1";

        // Int
        if (targetType == typeof(int))
        {
            int.TryParse(valueStr, out var v);
            return v;
        }

        // Float
        if (targetType == typeof(float))
        {
            float.TryParse(valueStr, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var v);
            return v;
        }

        // String
        if (targetType == typeof(string))
            return valueStr;

        // Fallback
        return Convert.ChangeType(valueStr, targetType);
    }

    private static Vector2 ParseVector2(string str)
    {
        str = str.Trim('[', ']', '(', ')').Trim();
        var parts = str.Split(',');
        if (parts.Length >= 2)
        {
            float.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var x);
            float.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var y);
            return new Vector2(x, y);
        }
        return Vector2.zero;
    }

    private static Vector3 ParseVector3(string str)
    {
        // Handle both "[x,y,z]" and "x,y,z" formats
        str = str.Trim('[', ']', '(', ')').Trim();
        var parts = str.Split(',');
        if (parts.Length >= 3)
        {
            float.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var x);
            float.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var y);
            float.TryParse(parts[2].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var z);
            return new Vector3(x, y, z);
        }
        return Vector3.zero;
    }

    private static Vector4 ParseVector4(string str)
    {
        str = str.Trim('[', ']', '(', ')').Trim();
        var parts = str.Split(',');
        if (parts.Length >= 4)
        {
            float.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var x);
            float.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var y);
            float.TryParse(parts[2].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var z);
            float.TryParse(parts[3].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var w);
            return new Vector4(x, y, z, w);
        }
        return Vector4.zero;
    }

    private static Color ParseColor(string str)
    {
        // Try hex color (#RRGGBB or #RRGGBBAA)
        if (str.StartsWith("#") && ColorUtility.TryParseHtmlString(str, out var htmlColor))
            return htmlColor;
        // Try RGBA components
        str = str.Trim('[', ']', '(', ')').Trim();
        var parts = str.Split(',');
        if (parts.Length >= 3)
        {
            float.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var r);
            float.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var g);
            float.TryParse(parts[2].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var b);
            float a = 1f;
            if (parts.Length >= 4)
                float.TryParse(parts[3].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out a);
            return new Color(r, g, b, a);
        }
        return Color.white;
    }

    private static void SetSerializedPropertyValue(SerializedProperty prop, string value)
    {
        switch (prop.propertyType)
        {
            case SerializedPropertyType.Integer:
                if (int.TryParse(value, out var intVal))
                    prop.intValue = intVal;
                break;
            case SerializedPropertyType.Float:
                if (float.TryParse(value, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var floatVal))
                    prop.floatValue = floatVal;
                break;
            case SerializedPropertyType.Boolean:
                prop.boolValue = value.ToLower() == "true" || value == "1";
                break;
            case SerializedPropertyType.String:
                prop.stringValue = value;
                break;
            case SerializedPropertyType.Enum:
                // Try name first, then integer
                var enumNames = prop.enumNames;
                for (int i = 0; i < enumNames.Length; i++)
                {
                    if (string.Equals(enumNames[i], value, StringComparison.OrdinalIgnoreCase))
                    {
                        prop.enumValueIndex = i;
                        return;
                    }
                }
                if (int.TryParse(value, out var enumInt))
                    prop.enumValueIndex = enumInt;
                break;
            case SerializedPropertyType.Vector2:
                prop.vector2Value = ParseVector2(value);
                break;
            case SerializedPropertyType.Vector3:
                prop.vector3Value = ParseVector3(value);
                break;
            case SerializedPropertyType.Color:
                prop.colorValue = ParseColor(value);
                break;
        }
    }

    private static void CreateFolderRecursive(string path)
    {
        var parts = path.Replace("\\", "/").Split('/');
        var current = parts[0];
        for (int i = 1; i < parts.Length; i++)
        {
            var next = current + "/" + parts[i];
            if (!AssetDatabase.IsValidFolder(next))
            {
                AssetDatabase.CreateFolder(current, parts[i]);
            }
            current = next;
        }
    }

    private static string EscapeJson(string s)
    {
        if (s == null) return "null";
        return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r").Replace("\t", "\\t") + "\"";
    }

    private static string MakeSuccess(string id, string resultJson)
    {
        return $"{{\"id\":{EscapeJson(id)},\"type\":\"response\",\"success\":true,\"result\":{resultJson}}}";
    }

    private static string MakeError(string id, string error)
    {
        return $"{{\"id\":{EscapeJson(id)},\"type\":\"response\",\"success\":false,\"error\":{EscapeJson(error)}}}";
    }

    // --- Serialization Helpers ---
    // JsonUtility needs serializable classes for FromJson

    [Serializable]
    private class SerializableRequest
    {
        public string id;
        public string type;
        public string category;
        public string action;
        public string paramsJson; // Params as raw JSON string

        /// <summary>
        /// Parse params from the raw JSON. Since Unity's JsonUtility doesn't handle
        /// Dictionary or dynamic objects, we do manual parsing for the simple key-value params.
        /// </summary>
        public Dictionary<string, string> GetParams()
        {
            var result = new Dictionary<string, string>();
            if (string.IsNullOrEmpty(paramsJson)) return result;

            // Simple JSON object parser for flat key-value pairs
            var json = paramsJson.Trim();
            if (!json.StartsWith("{")) return result;

            json = json.Substring(1, json.Length - 2).Trim();
            if (string.IsNullOrEmpty(json)) return result;

            // Split by commas that aren't inside strings
            var pairs = SplitJsonPairs(json);
            foreach (var pair in pairs)
            {
                var colonIdx = pair.IndexOf(':');
                if (colonIdx < 0) continue;

                var key = pair.Substring(0, colonIdx).Trim().Trim('"');
                var val = pair.Substring(colonIdx + 1).Trim().Trim('"');

                // Handle array values (keep as string for now)
                if (val.StartsWith("["))
                    val = val.Trim();

                result[key] = val;
            }

            return result;
        }

        private static List<string> SplitJsonPairs(string json)
        {
            var result = new List<string>();
            var depth = 0;
            var inString = false;
            var start = 0;

            for (int i = 0; i < json.Length; i++)
            {
                var c = json[i];
                if (c == '"' && (i == 0 || json[i - 1] != '\\'))
                    inString = !inString;
                else if (!inString)
                {
                    if (c == '{' || c == '[') depth++;
                    else if (c == '}' || c == ']') depth--;
                    else if (c == ',' && depth == 0)
                    {
                        result.Add(json.Substring(start, i - start).Trim());
                        start = i + 1;
                    }
                }
            }
            if (start < json.Length)
                result.Add(json.Substring(start).Trim());

            return result;
        }
    }

}
