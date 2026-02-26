/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Godot 4.x game engine knowledge base for the AI assistant.
 * Organized by category — injected into system prompt when a Godot project is detected.
 */

export const GODOT_SKILLS_CORE = `
## Godot Core Concepts

### Node Tree & Scenes
- Everything is a Node arranged in a tree. Scenes are saved branches of the tree (.tscn files).
- Scenes are the "prefab" equivalent. Instance a scene = spawn a copy of that subtree.
- Root node types matter: Node2D for 2D games, Node3D for 3D, Control for UI.
- Nodes are accessed by path: get_node("Player/Sprite2D") or the shorthand $Player/Sprite2D.
- @onready var sprite = $Sprite2D — resolves path at _ready() time. Fails if path doesn't exist.

### Lifecycle Callbacks
- _init(): Constructor equivalent. Node is NOT in the tree yet. Do not access other nodes here.
- _enter_tree(): Node just entered the tree. Parent is set, but children may not be ready.
- _ready(): All children are ready. This is where you initialize — like Unity's Start().
- _process(delta): Called every frame (like Update). delta is time since last frame.
- _physics_process(delta): Called on fixed timestep (like FixedUpdate). Default 60 fps.
- _input(event): Receives all InputEvents. Call get_viewport().set_input_as_handled() to consume.
- _unhandled_input(event): Only receives events not handled by _input or UI.
- _exit_tree(): Node is leaving the tree. Clean up connections here.

CRITICAL: _ready() is called bottom-up (children first, then parent). This means child nodes are fully initialized before the parent's _ready() runs.

### Signals
- Godot's event/observer system. Type-safe in Godot 4.
- Declare: signal health_changed(new_health: int)
- Emit: health_changed.emit(current_health)
- Connect: enemy.health_changed.connect(_on_enemy_health_changed)
- Disconnect: enemy.health_changed.disconnect(_on_enemy_health_changed)
- One-shot: signal.connect(callable, CONNECT_ONE_SHOT)
- Deferred: signal.connect(callable, CONNECT_DEFERRED) — executes at end of frame.
- Always disconnect signals from freed nodes to avoid errors.

### Groups
- Tag system for nodes. Add via editor or code: add_to_group("enemies").
- Query: get_tree().get_nodes_in_group("enemies").
- Broadcast: get_tree().call_group("enemies", "alert", player_position).
- Good for: finding all enemies, notifying all UI elements, tagging interactables.

### Autoloads (Singletons)
- Project → Project Settings → Autoload: scripts/scenes that persist across scene changes.
- Accessed globally by name: GameManager.score += 1 (if autoload is named GameManager).
- Use for: game state, audio manager, scene transitions, event bus.
- Equivalent to DontDestroyOnLoad + Singleton in Unity.

### Scene Management
- get_tree().change_scene_to_file("res://scenes/level2.tscn") — instant change.
- get_tree().change_scene_to_packed(packed_scene) — from preloaded resource.
- For smooth transitions: use an autoload that manages scene switching with fade effects.
- Additive scenes: add child scenes to the tree manually. No built-in additive loading like Unity.

### Resources
- Any data that can be saved/loaded: textures, scripts, scenes, custom data.
- Extend Resource for custom data types (like Unity ScriptableObjects):
\`\`\`gdscript
class_name ItemData extends Resource
@export var name: String
@export var damage: int
@export var icon: Texture2D
\`\`\`
- Save: ResourceSaver.save(resource, "res://data/sword.tres")
- Load: var item = load("res://data/sword.tres") as ItemData
- preload("path") for compile-time loading (GDScript only, not in variables that change).
`;

export const GODOT_SKILLS_GDSCRIPT = `
## GDScript (Godot 4.x)

### Type System
- Optional static typing: var speed: float = 5.0
- Type inference: var speed := 5.0
- Typed arrays: var enemies: Array[Enemy] = []
- Return types: func get_health() -> int: return health
- Static typing catches errors at parse time and improves performance.

### Key Syntax
\`\`\`gdscript
# Variables
var health: int = 100
@export var speed: float = 5.0          # Exposed to Inspector
@export_range(0, 100, 1) var hp: int    # Slider in Inspector
@export_group("Movement")               # Group header
@export var run_speed: float = 10.0
@onready var sprite := $Sprite2D        # Resolved at _ready()

# Constants and enums
const MAX_HEALTH := 100
enum State { IDLE, RUN, JUMP, ATTACK }

# Functions
func take_damage(amount: int) -> void:
    health -= amount
    health_changed.emit(health)

# Match (like switch)
match state:
    State.IDLE:
        play_idle()
    State.RUN:
        play_run()
    _:
        pass  # default case

# Lambdas
var callback := func(x: int) -> int: return x * 2
enemies.filter(func(e): return e.is_alive())

# String formatting
var msg := "Player %s has %d HP" % [name, health]

# Null-safe access
var hp = enemy?.health_component?.current_hp
\`\`\`

### Properties (setget replacement in Godot 4)
\`\`\`gdscript
var health: int = 100:
    set(value):
        health = clamp(value, 0, MAX_HEALTH)
        health_changed.emit(health)
    get:
        return health
\`\`\`

### Coroutine-like patterns with await
\`\`\`gdscript
# Wait for signal
await get_tree().create_timer(2.0).timeout

# Wait for next frame
await get_tree().process_frame

# Wait for custom signal
await enemy.died

# Chain async operations
func attack_sequence() -> void:
    play_animation("windup")
    await animation_player.animation_finished
    deal_damage()
    play_animation("recover")
    await animation_player.animation_finished
\`\`\`

### class_name
\`\`\`gdscript
class_name Player extends CharacterBody2D
# Now "Player" is a global type. Can use: var p: Player, is Player, etc.
# Can also be used as type hint in @export: @export var player: Player
\`\`\`

### Inner Classes
\`\`\`gdscript
class DamageInfo:
    var amount: int
    var source: Node
    var type: String
\`\`\`
`;

export const GODOT_SKILLS_CSHARP = `
## C# for Godot 4.x

### Key Differences from GDScript
- Requires .NET 6+ SDK. Enable in Project Settings → Dotnet → Enable.
- Scripts extend GodotObject-based classes: public partial class Player : CharacterBody2D
- MUST use 'partial' keyword for Godot classes (source generators).
- File name MUST match class name.

### Exports and Properties
\`\`\`csharp
public partial class Player : CharacterBody2D
{
    [Export] public float Speed { get; set; } = 5.0f;
    [Export(PropertyHint.Range, "0,100,1")] public int Health { get; set; } = 100;
    [ExportGroup("Movement")]
    [Export] public float JumpForce { get; set; } = 10.0f;
}
\`\`\`

### Node Access
\`\`\`csharp
// Get node (equivalent to $Sprite2D)
private Sprite2D _sprite;
public override void _Ready() {
    _sprite = GetNode<Sprite2D>("Sprite2D");
}

// Null-safe
var enemy = GetNodeOrNull<Enemy>("Enemy");
\`\`\`

### Signals in C#
\`\`\`csharp
// Declare signal
[Signal] public delegate void HealthChangedEventHandler(int newHealth);

// Emit
EmitSignal(SignalName.HealthChanged, currentHealth);

// Connect
enemy.HealthChanged += OnEnemyHealthChanged;

// Disconnect
enemy.HealthChanged -= OnEnemyHealthChanged;
\`\`\`

### Lifecycle
\`\`\`csharp
public override void _Ready() { /* initialization */ }
public override void _Process(double delta) { /* per frame */ }
public override void _PhysicsProcess(double delta) { /* fixed step */ }
public override void _Input(InputEvent @event) { /* input handling */ }
public override void _EnterTree() { }
public override void _ExitTree() { }
\`\`\`

### GDScript vs C# Tradeoffs
- GDScript: faster iteration, no compilation step, tighter editor integration, most tutorials/plugins use it.
- C#: better IDE support, stronger typing, access to .NET ecosystem, better for large codebases.
- They can coexist in the same project. C# can call GDScript and vice versa (with caveats).
- C# export for web is limited. Check platform support.
`;

export const GODOT_SKILLS_PHYSICS = `
## Godot Physics

### CharacterBody2D/3D (Most Common for Players)
\`\`\`gdscript
extends CharacterBody2D

@export var speed := 200.0
@export var jump_force := -400.0
var gravity := ProjectSettings.get_setting("physics/2d/default_gravity") as float

func _physics_process(delta: float) -> void:
    # Gravity
    if not is_on_floor():
        velocity.y += gravity * delta

    # Jump
    if Input.is_action_just_pressed("jump") and is_on_floor():
        velocity.y = jump_force

    # Horizontal movement
    var direction := Input.get_axis("move_left", "move_right")
    velocity.x = direction * speed

    move_and_slide()  # Handles collisions, slopes, floors
\`\`\`
- move_and_slide(): handles collision response. Returns nothing — check is_on_floor(), is_on_wall(), is_on_ceiling() after.
- get_slide_collision(index): get collision info after move_and_slide.
- floor_snap_length: prevents bouncing on slopes. Set > 0 for stable slopes.

### RigidBody2D/3D
- Dynamic physics bodies. Controlled by forces, not direct velocity.
- apply_force(force, position), apply_impulse(impulse), apply_central_force(force).
- Do NOT set position directly. Use _integrate_forces(state) for custom physics:
\`\`\`gdscript
func _integrate_forces(state: PhysicsDirectBodyState2D) -> void:
    state.linear_velocity = desired_velocity
\`\`\`
- Freeze modes: FREEZE_MODE_STATIC (immovable), FREEZE_MODE_KINEMATIC (code-controlled).

### Area2D/3D
- Detects overlapping bodies/areas. Does NOT block movement.
- Signals: body_entered, body_exited, area_entered, area_exited.
- Collision layer: what this object IS. Collision mask: what this object DETECTS.
- Use for: damage zones, pickups, triggers, detection areas.

### Raycasting
\`\`\`gdscript
# Using RayCast2D node (easiest)
if $RayCast2D.is_colliding():
    var collider = $RayCast2D.get_collider()

# Using PhysicsDirectSpaceState (code-only)
func raycast(from: Vector2, to: Vector2) -> Dictionary:
    var space = get_world_2d().direct_space_state
    var query = PhysicsRayQueryParameters2D.create(from, to)
    query.collision_mask = 0b0001  # Layer 1 only
    query.exclude = [self]
    return space.intersect_ray(query)  # Returns {} if no hit
\`\`\`

### Collision Layers & Masks
- 32 layers available. Name them in Project Settings → Layer Names.
- Layer: "I am on this layer" (what I am).
- Mask: "I detect these layers" (what I scan for).
- Two objects collide when: A's mask includes B's layer OR B's mask includes A's layer.
- Set in code: collision_layer = 1 << 2 (layer 3), collision_mask = (1 << 0) | (1 << 2).
`;

export const GODOT_SKILLS_RENDERING = `
## Godot Rendering & Graphics

### Shaders
- Godot Shading Language (similar to GLSL):
\`\`\`glsl
shader_type canvas_item; // or spatial, particles, sky, fog
uniform vec4 tint_color : source_color = vec4(1.0);
uniform float speed = 1.0;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    COLOR = tex * tint_color;
}
\`\`\`
- Visual Shaders: node-based editor (similar to Unity's ShaderGraph).
- shader_type canvas_item for 2D, spatial for 3D, particles for GPU particles.

### Materials
- StandardMaterial3D: PBR material for 3D. Albedo, metallic, roughness, normal map, emission.
- ShaderMaterial: custom shader-based material.
- Material override per node or per surface on MeshInstance3D.
- CanvasItemMaterial for 2D with blend modes.

### Lighting
- 3D: DirectionalLight3D (sun), OmniLight3D (point), SpotLight3D.
- Baked lightmaps: LightmapGI node. Bake for performance.
- SDFGI: real-time global illumination (Vulkan only). Looks great but expensive.
- VoxelGI: alternative real-time GI, more stable but limited range.
- 2D: PointLight2D, DirectionalLight2D. Use CanvasModulate for ambient.
- LightOccluder2D for 2D shadows.

### Viewports & SubViewports
- SubViewport: render a separate scene (minimaps, portals, picture-in-picture).
- SubViewportContainer: displays a SubViewport in the UI or scene.
- ViewportTexture: use a SubViewport's output as a texture on a material.

### Particles
- GPUParticles2D/3D: GPU-based, fast, handles many particles.
- CPUParticles2D/3D: CPU-based fallback, supports all platforms.
- ParticleProcessMaterial or custom shaders for GPU particles.

### Tilemaps (Godot 4)
- TileMap node + TileSet resource (completely reworked from Godot 3).
- TileSet: define tiles, physics layers, navigation layers, terrain connections.
- Multiple layers per TileMap (ground, decoration, collision).
- Terrain mode: auto-tiling with terrain sets (bitmasking).
- Atlas tiles: pack many tiles into one texture atlas.
`;

export const GODOT_SKILLS_UI = `
## Godot UI System

### Control Nodes
- All UI nodes extend Control. They use anchors + margins for responsive layout.
- Anchor presets: Full Rect, Center, Top Left, etc. Set in Inspector or code.
- size_flags_horizontal/vertical: FILL, EXPAND, SHRINK_CENTER, SHRINK_END.

### Container Nodes
- HBoxContainer / VBoxContainer: horizontal/vertical layout.
- GridContainer: grid layout. Set columns property.
- MarginContainer: adds padding.
- ScrollContainer: scrollable area.
- PanelContainer: draws a panel background.
- CenterContainer: centers single child.
- Custom minimum size: custom_minimum_size property to enforce sizing.

### Common UI Patterns
\`\`\`gdscript
# Inventory slot
extends PanelContainer
@export var item_data: ItemData

func _ready() -> void:
    $Icon.texture = item_data.icon if item_data else null
    $Label.text = str(item_data.stack_count) if item_data else ""

# HUD health bar
extends TextureProgressBar
func update_health(current: int, max_hp: int) -> void:
    value = float(current) / max_hp * 100.0
\`\`\`

### Themes & StyleBoxes
- Theme resource: define fonts, colors, styleboxes for all Control types.
- StyleBoxFlat: color, corner radius, border, shadow. Most versatile.
- StyleBoxTexture: 9-slice texture-based style.
- Apply theme to a root Control node — it cascades to all children.
- Override per-node via theme_override_* properties.

### RichTextLabel
- Supports BBCode: [b]bold[/b], [color=red]red[/color], [url]link[/url].
- Push/pop effects for complex formatting.
- bbcode_enabled must be true.

### Input in UI
- Focus: Control nodes can receive keyboard focus.
- grab_focus() to programmatically focus a control.
- Focus neighbors: set focus_next, focus_previous for gamepad/keyboard navigation.
- Mouse filter: MOUSE_FILTER_STOP (consume), MOUSE_FILTER_PASS (pass-through), MOUSE_FILTER_IGNORE.
`;

export const GODOT_SKILLS_ANIMATION = `
## Godot Animation

### AnimationPlayer
- Core animation node. Keyframes any property of any node.
- Tracks: property, method call, bezier, audio, animation (sub-animations).
- Autoplay: set one animation to play automatically when scene loads.
\`\`\`gdscript
$AnimationPlayer.play("run")
$AnimationPlayer.play_backwards("run")
$AnimationPlayer.stop()
$AnimationPlayer.queue("idle")  # Play after current finishes

# Wait for animation
await $AnimationPlayer.animation_finished
\`\`\`

### AnimationTree
- State machine or blend tree for complex animation logic.
- StateMachine: define states and transitions with conditions.
- BlendSpace1D: 1D blending (speed-based idle → walk → run).
- BlendSpace2D: 2D blending (directional movement).
- Access via: anim_tree["parameters/StateMachine/playback"].travel("run")
- Blend amounts: anim_tree["parameters/blend_position"] = velocity.length()

### Tween (Godot 4 — completely reworked)
\`\`\`gdscript
# Create tween (auto-disposed, no node needed)
var tween = create_tween()
tween.tween_property(sprite, "position", target_pos, 0.5)
tween.tween_property(sprite, "modulate:a", 0.0, 0.3)  # Chain: runs after previous
tween.parallel().tween_property(sprite, "scale", Vector2(2, 2), 0.3)  # Parallel

# Easing
tween.tween_property(node, "position", target, 1.0).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BOUNCE)

# Callbacks
tween.tween_callback(queue_free)  # Call after previous tweens finish
tween.tween_interval(0.5)  # Wait 0.5s between tweens

# Looping
tween.set_loops(3)  # 3 times, or 0 for infinite
\`\`\`
- IMPORTANT: create_tween() kills any previous tween on the same property. No need to manually stop.
- Tweens auto-free when done. Do not store references unless you need to stop early.

### Sprite Animation
- AnimatedSprite2D: simple frame-by-frame animation with SpriteFrames resource.
- Good for: character sprites, simple VFX, animated tiles.
- Set up animations in SpriteFrames editor, play with play("anim_name").
`;

export const GODOT_SKILLS_AUDIO = `
## Godot Audio

### AudioStreamPlayer Variants
- AudioStreamPlayer: non-positional (music, UI sounds).
- AudioStreamPlayer2D: positional audio in 2D space.
- AudioStreamPlayer3D: positional audio in 3D space.
- All support: play(), stop(), stream property, volume_db, pitch_scale.

### AudioBus Layout
- Audio → Audio Bus Layout (bottom panel).
- Default buses: Master. Add: Music, SFX, UI, Ambient.
- Set bus per AudioStreamPlayer: bus = "SFX".
- Effects per bus: reverb, delay, compressor, limiter, EQ, chorus.
- Mute/solo buses for debugging.

### Best Practices
\`\`\`gdscript
# Play one-shot sound (pool approach)
func play_sound(stream: AudioStream) -> void:
    var player = AudioStreamPlayer.new()
    player.stream = stream
    player.bus = "SFX"
    add_child(player)
    player.play()
    player.finished.connect(player.queue_free)

# Volume control (use linear_to_db)
func set_volume(bus_name: String, linear: float) -> void:
    var bus_idx = AudioServer.get_bus_index(bus_name)
    AudioServer.set_bus_volume_db(bus_idx, linear_to_db(linear))
\`\`\`

### Audio Formats
- WAV: uncompressed, good for short SFX. Can set loop points.
- OGG Vorbis: compressed, good for music and longer sounds.
- MP3: supported in Godot 4. Slightly higher decode cost than OGG.
`;

export const GODOT_SKILLS_AI_NAV = `
## Godot AI & Navigation

### NavigationServer (Godot 4)
- Completely reworked from Godot 3. Uses NavigationServer2D/3D.
- NavigationRegion2D/3D: defines walkable areas with NavigationPolygon/NavigationMesh.
- Bake at runtime: navigation_region.bake_navigation_mesh() (supports dynamic changes).

### NavigationAgent2D/3D
\`\`\`gdscript
extends CharacterBody2D
@onready var nav_agent := $NavigationAgent2D

func set_target(target_pos: Vector2) -> void:
    nav_agent.target_position = target_pos

func _physics_process(delta: float) -> void:
    if nav_agent.is_navigation_finished():
        return

    var next_pos = nav_agent.get_next_path_position()
    var direction = global_position.direction_to(next_pos)
    velocity = direction * speed
    move_and_slide()
\`\`\`
- Avoidance: nav_agent.velocity = desired_velocity → connect to velocity_computed signal for avoidance-adjusted velocity.
- Path postprocessing: CORRIDORFUNNEL (default, smooth) or EDGECENTERED.

### State Machine Pattern
\`\`\`gdscript
enum State { IDLE, PATROL, CHASE, ATTACK, FLEE }
var current_state: State = State.IDLE

func _physics_process(delta: float) -> void:
    match current_state:
        State.IDLE: _idle_state(delta)
        State.PATROL: _patrol_state(delta)
        State.CHASE: _chase_state(delta)
        State.ATTACK: _attack_state(delta)
        State.FLEE: _flee_state(delta)

func transition_to(new_state: State) -> void:
    _exit_state(current_state)
    current_state = new_state
    _enter_state(new_state)
\`\`\`

### Detection Patterns
\`\`\`gdscript
# Sight check with raycast
func can_see_player() -> bool:
    var space = get_world_2d().direct_space_state
    var query = PhysicsRayQueryParameters2D.create(
        global_position, player.global_position
    )
    query.exclude = [self]
    var result = space.intersect_ray(query)
    return result.get("collider") == player

# Range check
func is_player_in_range(range: float) -> bool:
    return global_position.distance_to(player.global_position) <= range
\`\`\`
`;

export const GODOT_SKILLS_NETWORKING = `
## Godot Networking

### High-Level Multiplayer API (Godot 4)
\`\`\`gdscript
# Server
var peer = ENetMultiplayerPeer.new()
peer.create_server(7000)
multiplayer.multiplayer_peer = peer

# Client
var peer = ENetMultiplayerPeer.new()
peer.create_client("127.0.0.1", 7000)
multiplayer.multiplayer_peer = peer

# Check role
multiplayer.is_server()
multiplayer.get_unique_id()  # 1 = server
\`\`\`

### RPCs
\`\`\`gdscript
@rpc("any_peer", "reliable")
func take_damage(amount: int) -> void:
    health -= amount

# Call RPC
take_damage.rpc(25)       # Call on ALL peers
take_damage.rpc_id(1, 25) # Call on specific peer (1 = server)
\`\`\`
- Modes: "authority" (only authority can call), "any_peer" (anyone can call).
- Transfer: "reliable" (TCP-like), "unreliable" (UDP-like), "unreliable_ordered".

### MultiplayerSpawner & MultiplayerSynchronizer
- MultiplayerSpawner: auto-spawns scenes across peers when added as child.
- MultiplayerSynchronizer: auto-syncs properties across peers.
- Set authority: node.set_multiplayer_authority(peer_id).
- Check: is_multiplayer_authority() before processing input.

### Peer Types
- ENetMultiplayerPeer: UDP-based, reliable + unreliable channels. Best for most games.
- WebSocketMultiplayerPeer: WebSocket-based. Required for web exports.
- WebRTCMultiplayerPeer: P2P connections via WebRTC. Good for browser games.
`;

export const GODOT_SKILLS_INPUT = `
## Godot Input

### Input Map
- Project Settings → Input Map: define actions and bind keys/buttons.
- Default actions: ui_accept, ui_cancel, ui_left, ui_right, ui_up, ui_down.

### Input Handling
\`\`\`gdscript
# Polling in _process/_physics_process
func _physics_process(delta: float) -> void:
    # Axis (returns -1 to 1, handles opposing keys)
    var direction = Input.get_axis("move_left", "move_right")
    # Vector (returns Vector2 for 2D movement)
    var move = Input.get_vector("move_left", "move_right", "move_up", "move_down")

    if Input.is_action_just_pressed("jump"):  # Single frame
        jump()
    if Input.is_action_pressed("fire"):  # Held down
        shoot()
    if Input.is_action_just_released("interact"):  # Released
        drop()

# Event-based in _input or _unhandled_input
func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("pause"):
        toggle_pause()
        get_viewport().set_input_as_handled()

    if event is InputEventMouseMotion:
        rotate_camera(event.relative)
\`\`\`

### Device Detection
\`\`\`gdscript
# Detect input method for UI prompts
func _input(event: InputEvent) -> void:
    if event is InputEventJoypadButton or event is InputEventJoypadMotion:
        show_gamepad_prompts()
    elif event is InputEventKey or event is InputEventMouseButton:
        show_keyboard_prompts()
\`\`\`

### Input Buffering (for responsive controls)
\`\`\`gdscript
var jump_buffer_timer := 0.0
const JUMP_BUFFER := 0.1  # 100ms buffer

func _physics_process(delta: float) -> void:
    if Input.is_action_just_pressed("jump"):
        jump_buffer_timer = JUMP_BUFFER
    jump_buffer_timer -= delta

    if is_on_floor() and jump_buffer_timer > 0:
        velocity.y = jump_force
        jump_buffer_timer = 0.0
\`\`\`
`;

export const GODOT_SKILLS_PERFORMANCE = `
## Godot Performance

### Profiling
- Debugger → Profiler: shows function call times and frame breakdown.
- Debugger → Monitors: FPS, physics, memory, video memory, audio.
- Debugger → Visual Profiler: rendering breakdown per viewport.
- ALWAYS profile before optimizing. Don't guess bottlenecks.

### CPU Optimization
- Avoid get_node() in _process. Cache with @onready.
- Object pooling: hide and reuse nodes instead of queue_free()/instantiate().
- Use signals instead of polling: don't check conditions every frame if they rarely change.
- Groups with call_group are batched and efficient.
- StringName for frequent string comparisons: var action := &"move_left" (compiled to integer lookup).

### Rendering Optimization
- 2D: use VisibilityNotifier2D/VisibilityEnabler2D to disable off-screen processing.
- 3D: LOD on MeshInstance3D, visibility ranges, Occlusion Culling.
- MultiMesh: draw thousands of identical meshes in one draw call (grass, trees, debris).
- CanvasGroup: merge child CanvasItem draw calls (useful for complex UI).
- Avoid overlapping transparent sprites — causes overdraw.
- Texture sizes: power of 2 for compression. Don't use 4K textures for small objects.

### Physics Optimization
- Simplify collision shapes: use simple shapes (rectangles, circles) over polygons.
- Disable physics processing on distant objects.
- Collision layers: narrow down what detects what. Don't use "all layers" masks.
- Use Area2D for detection instead of raycasts when possible.

### Memory
- Resource sharing: identical resources are shared by default. Don't duplicate unnecessarily.
- load() vs preload(): preload is compile-time (instant), load is runtime (can cause hitches).
- ResourceLoader.load_threaded_request() for async loading.
- Free large resources when switching scenes: resource = null.

### Threading
\`\`\`gdscript
# Background processing
var thread := Thread.new()

func heavy_operation() -> void:
    thread.start(_thread_function)

func _thread_function() -> void:
    # Do heavy work here. Do NOT access the scene tree.
    var result = expensive_calculation()
    call_deferred("_on_thread_done", result)  # Safe way back to main thread

func _on_thread_done(result) -> void:
    # Now safe to update nodes
    $Label.text = str(result)
\`\`\`
- NEVER access or modify nodes from a thread. Use call_deferred() or Mutex.
`;

export const GODOT_SKILLS_PATTERNS = `
## Godot Architecture Patterns

### Autoload Event Bus
\`\`\`gdscript
# EventBus.gd (Autoload)
extends Node
signal player_died
signal score_changed(new_score: int)
signal level_completed(level_id: int)
signal game_paused(is_paused: bool)
\`\`\`
Any script can emit: EventBus.player_died.emit()
Any script can connect: EventBus.player_died.connect(_on_player_died)

### Scene-as-Component Pattern
Instead of one monolithic script, compose behavior from child scene instances:
- Player scene → HealthComponent (scene), HitboxComponent (scene), StateMachine (scene)
- Each component is a self-contained scene with its own script.
- Communicate via signals between components.

### Resource-Based Data (like ScriptableObjects)
\`\`\`gdscript
# weapon_data.gd
class_name WeaponData extends Resource
@export var name: String
@export var damage: int
@export var fire_rate: float
@export var projectile_scene: PackedScene

# weapon.gd
@export var data: WeaponData

func fire() -> void:
    var projectile = data.projectile_scene.instantiate()
    projectile.damage = data.damage
    get_tree().root.add_child(projectile)
\`\`\`

### State Machine with Nodes
\`\`\`gdscript
# state_machine.gd
extends Node
var current_state: State

func _ready() -> void:
    for child in get_children():
        if child is State:
            child.state_machine = self
    current_state = get_child(0) as State
    current_state.enter()

func transition_to(state_name: StringName) -> void:
    var new_state = get_node(NodePath(state_name)) as State
    if new_state and new_state != current_state:
        current_state.exit()
        current_state = new_state
        current_state.enter()

func _physics_process(delta: float) -> void:
    current_state.physics_update(delta)
\`\`\`
Each state is a child Node with a script extending a base State class.

### Dependency Injection (Godot Style)
- Pass dependencies via @export (editor-wired) or setter functions.
- Autoloads as service locators (GameManager, AudioManager, SaveManager).
- For testing: swap autoloads or inject mock nodes.

### Scene Transition Pattern
\`\`\`gdscript
# SceneManager.gd (Autoload)
extends CanvasLayer
@onready var animation := $AnimationPlayer  # Fade in/out animations

func change_scene(path: String) -> void:
    animation.play("fade_out")
    await animation.animation_finished
    get_tree().change_scene_to_file(path)
    animation.play("fade_in")
\`\`\`
`;

export const GODOT_SKILLS_PITFALLS = `
## Godot Common Pitfalls

### Critical Mistakes
1. **Accessing nodes in _init()**: Node is NOT in the tree yet. Always use _ready() for node access.
2. **@onready with null**: If the node path is wrong, @onready silently sets null. Crashes later. Validate in _ready().
3. **Signal from freed node**: Connecting to a signal on a node that gets freed causes errors. Disconnect in _exit_tree() or use CONNECT_ONE_SHOT.
4. **Modifying tree in signal callback**: Adding/removing nodes during signal emission can cause issues. Use call_deferred().
5. **Physics in _process**: Use _physics_process for move_and_slide, velocity changes, force application.
6. **Using == for float comparison**: Floating point imprecision. Use is_equal_approx(a, b) instead.
7. **Not checking is_instance_valid()**: After queue_free(), the node still exists until end of frame. Check is_instance_valid(node) before accessing.
8. **Large scenes**: Loading huge scenes causes hitches. Break into smaller scenes, load async.
9. **Circular preload()**: Two scripts preloading each other causes parse errors. Use load() for one of them.
10. **Thread-unsafe node access**: Accessing/modifying nodes from a Thread crashes. Use call_deferred().

### Godot 3 → 4 Migration Gotchas
- KinematicBody2D → CharacterBody2D. move_and_slide() no longer takes parameters — set velocity directly.
- Tween is no longer a node. Use create_tween() — it auto-frees.
- yield → await. yield(get_tree(), "idle_frame") → await get_tree().process_frame.
- setget → property syntax with set/get blocks.
- export → @export. onready → @onready. tool → @tool.
- GDScript typed arrays: Array → Array[Type].
- PoolByteArray/PoolVector2Array → PackedByteArray/PackedVector2Array.
- String.match() → String.match() (regex) vs matchn() (case-insensitive glob).
- NavigationServer completely reworked. Old Navigation node deprecated.

### Architecture Mistakes
- God node: one script does everything. Decompose into child scenes/components.
- Hard-coded paths: get_node("../../Player") breaks when tree changes. Use groups, signals, or @export references.
- Overusing Autoloads: not everything should be a singleton. Use them for truly global services only.
- Ignoring the scene tree: Godot is designed around the tree. Work with it, not against it.
- Not using Resources: storing data in scripts when it should be in reusable Resource files.
`;

export const GODOT_SKILLS_GDEXTENSION = `
## GDExtension & Editor Plugins

### Tool Scripts
\`\`\`gdscript
@tool  # Script runs in editor
extends Node2D

@export var radius := 50.0:
    set(value):
        radius = value
        queue_redraw()  # Redraw gizmo when property changes

func _draw() -> void:
    draw_circle(Vector2.ZERO, radius, Color(1, 0, 0, 0.3))
\`\`\`
- @tool makes the script execute in the editor.
- Useful for: custom gizmos, visual debugging, editor-time generation.
- CAUTION: @tool scripts can modify project files in editor. Guard with Engine.is_editor_hint().

### Editor Plugins
\`\`\`gdscript
@tool
extends EditorPlugin

func _enter_tree() -> void:
    add_custom_type("MyNode", "Node2D", preload("my_node.gd"), preload("icon.svg"))
    var dock = preload("my_dock.tscn").instantiate()
    add_control_to_dock(DOCK_SLOT_RIGHT_UL, dock)

func _exit_tree() -> void:
    remove_custom_type("MyNode")
\`\`\`

### Custom Resources
\`\`\`gdscript
@tool
class_name DialogueLine extends Resource
@export var speaker: String
@export var text: String
@export var choices: Array[DialogueLine]
\`\`\`
- @tool ensures the resource editor shows custom properties.
- Create instances via "New Resource" in FileSystem dock.

### GDExtension (Native Code)
- Write performance-critical code in C, C++, Rust, or other compiled languages.
- Uses godot-cpp bindings or community bindings (gdext for Rust).
- Compiles to shared libraries, loaded at runtime.
- Use for: heavy computation, wrapping native libraries, platform-specific features.
`;

/**
 * Returns all Godot skill sections concatenated.
 */
export function getGodotSkills(): string {
	return [
		GODOT_SKILLS_CORE,
		GODOT_SKILLS_GDSCRIPT,
		GODOT_SKILLS_CSHARP,
		GODOT_SKILLS_PHYSICS,
		GODOT_SKILLS_RENDERING,
		GODOT_SKILLS_UI,
		GODOT_SKILLS_ANIMATION,
		GODOT_SKILLS_AUDIO,
		GODOT_SKILLS_AI_NAV,
		GODOT_SKILLS_NETWORKING,
		GODOT_SKILLS_INPUT,
		GODOT_SKILLS_PERFORMANCE,
		GODOT_SKILLS_PATTERNS,
		GODOT_SKILLS_PITFALLS,
		GODOT_SKILLS_GDEXTENSION,
	].join('\n');
}

/**
 * Returns a compact subset of Godot skills for token-constrained contexts.
 */
export function getGodotSkillsCompact(): string {
	return [
		GODOT_SKILLS_CORE,
		GODOT_SKILLS_GDSCRIPT,
		GODOT_SKILLS_PATTERNS,
		GODOT_SKILLS_PITFALLS,
	].join('\n');
}
