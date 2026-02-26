/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unity game engine knowledge base for the AI assistant.
 * Organized by category — injected into system prompt when a Unity project is detected.
 */

export const UNITY_SKILLS_CORE = `
## Unity Core Concepts

### Lifecycle Execution Order
Awake() → OnEnable() → Start() → FixedUpdate() → Update() → LateUpdate() → OnDisable() → OnDestroy()

Key rules:
- Awake(): Called once when the script instance is loaded (even if the component is disabled). Use for self-initialization and references between components on the SAME GameObject.
- Start(): Called once before the first Update, only if the component is enabled. Use for initialization that depends on OTHER GameObjects being ready.
- FixedUpdate(): Called on a fixed timestep (default 0.02s). ALL physics logic goes here (forces, velocity changes). Never apply forces in Update().
- Update(): Called every frame. Use for input, non-physics movement, timers.
- LateUpdate(): Called after all Update()s. Use for camera follow, post-movement adjustments.
- OnEnable/OnDisable: Called when component is enabled/disabled or GameObject is activated/deactivated. Use for event subscription/unsubscription.
- OnDestroy(): Called when the GameObject is destroyed. Unsubscribe from static events here to avoid memory leaks.

### GameObjects & Components
- Everything in a scene is a GameObject with Components attached.
- Transform is always present — it defines position, rotation, scale.
- Access components: GetComponent<T>(), TryGetComponent<T>(out T component) (preferred — no garbage allocation on failure).
- Cache component references in Awake() or Start(). NEVER call GetComponent in Update().
- Find is expensive: GameObject.Find(), FindObjectOfType<T>() — avoid in runtime. Use serialized references or events instead.

### Prefabs & Instantiation
- Prefabs are reusable GameObject templates. Changes to the prefab propagate to all instances.
- Instantiate(prefab, position, rotation) creates a runtime clone.
- Prefab Variants: inherit from a base prefab and override specific properties.
- Nested Prefabs: prefabs inside other prefabs. Modifications to the inner prefab auto-update everywhere.
- Always pool frequently instantiated objects (bullets, particles) instead of Instantiate/Destroy.

### ScriptableObjects
- Data containers that exist as assets. Do NOT live in scenes.
- Use for game config, item databases, shared data between scenes, event channels.
- Create with [CreateAssetMenu(fileName = "New Item", menuName = "Game/Item")].
- Persist between play sessions in editor (careful: runtime changes in editor persist too!).

### Scene Management
- SceneManager.LoadScene() replaces current scene. SceneManager.LoadSceneAsync() for non-blocking.
- Additive loading: SceneManager.LoadScene(name, LoadSceneMode.Additive) — good for UI overlay scenes, streaming worlds.
- DontDestroyOnLoad(gameObject) persists a GameObject across scene loads. Use sparingly.

### Coroutines vs Async/Await
Coroutines:
- yield return null (wait one frame), yield return new WaitForSeconds(t), yield return new WaitForFixedUpdate()
- yield return new WaitUntil(() => condition) — useful but allocates garbage each call
- Cannot return values. Use callbacks or set fields.
- StartCoroutine()/StopCoroutine() — tied to the MonoBehaviour lifecycle.

Async/Await (Unity 2023+):
- Awaitable.WaitForSecondsAsync(), Awaitable.NextFrameAsync()
- Can return values: async Awaitable<int> GetValueAsync()
- Cancels automatically when the MonoBehaviour is destroyed.
- Prefer async/await for new code in Unity 2023+.

### Events & Delegates
- C# events: event Action<T> OnSomething — subscribe in OnEnable, unsubscribe in OnDisable.
- UnityEvent: serializable, configurable in Inspector. Good for designer-facing hooks.
- ALWAYS unsubscribe from static events in OnDisable/OnDestroy to prevent memory leaks.
`;

export const UNITY_SKILLS_CSHARP = `
## C# for Unity

### Serialization & Inspector
- [SerializeField] private float speed = 5f; — exposes private fields to Inspector
- [Header("Movement")] — groups fields in Inspector
- [Tooltip("Speed in m/s")] — hover tooltip
- [Range(0, 100)] — slider in Inspector
- [HideInInspector] public float x; — hides public fields
- [Space(10)] — adds spacing between fields
- [TextArea(3, 5)] string description; — multiline text field

### Unity's Null Check Quirk
Unity overrides == operator on UnityEngine.Object. A destroyed GameObject is NOT actually null in C# but == null returns true.
- obj == null → true for destroyed objects (Unity check)
- obj is null → false for destroyed objects (pure C# check)
- ReferenceEquals(obj, null) → false for destroyed objects
- Use ?. (null conditional) with caution — it uses C# null, not Unity null. Unity 2023+ added better support.

### Common Patterns
\`\`\`csharp
// Cache components — NEVER GetComponent in Update
private Rigidbody _rb;
private void Awake() {
    _rb = GetComponent<Rigidbody>();
}

// TryGetComponent is better than null check
if (TryGetComponent<Enemy>(out var enemy)) {
    enemy.TakeDamage(10);
}

// String comparison for tags — use CompareTag (no garbage)
if (other.CompareTag("Player")) { } // GOOD
if (other.tag == "Player") { }      // BAD — allocates string

// Layer masks for raycasting
[SerializeField] private LayerMask groundLayer;
Physics.Raycast(origin, direction, out hit, distance, groundLayer);

// Invoke with delay (simple alternative to coroutines)
Invoke(nameof(DoSomething), 2f);
CancelInvoke(nameof(DoSomething));
\`\`\`

### Collections & Memory
- Avoid LINQ in hot paths (Update, FixedUpdate) — allocates garbage.
- Use List<T> instead of arrays when size changes. Pre-allocate capacity: new List<T>(expectedSize).
- NativeArray<T> for Jobs/Burst — requires manual Dispose().
- StringBuilder for string concatenation in loops.
- Use nonAlloc variants: Physics.RaycastNonAlloc(), Physics.OverlapSphereNonAlloc().
`;

export const UNITY_SKILLS_PHYSICS = `
## Unity Physics

### Rigidbody
- AddForce(vector, ForceMode) in FixedUpdate ONLY.
- ForceMode.Force: continuous (mass-dependent), ForceMode.Impulse: instant (mass-dependent), ForceMode.VelocityChange: instant (ignores mass).
- Set velocity directly for precise control: rb.linearVelocity = new Vector3(x, rb.linearVelocity.y, z) (preserve Y for gravity).
- Kinematic rigidbodies: move with MovePosition/MoveRotation (not transform.position). Still participate in triggers.
- Interpolation: set to Interpolate for player-controlled objects to smooth visual jitter.
- Collision Detection: Continuous for fast-moving objects (bullets) to prevent tunneling.

### Rigidbody2D
- Same concepts but 2D-specific. AddForce takes Vector2.
- BodyType: Dynamic (full physics), Kinematic (code-controlled, triggers only), Static (immovable).

### Colliders & Triggers
- Collider: solid, blocks movement when paired with Rigidbody.
- Trigger (isTrigger = true): not solid, detects overlap. Use OnTriggerEnter/Stay/Exit.
- At least ONE object must have a Rigidbody for collision/trigger events to fire.
- Compound colliders: multiple colliders on child objects, single Rigidbody on parent.

### Raycasting
\`\`\`csharp
// Basic raycast
if (Physics.Raycast(origin, direction, out RaycastHit hit, maxDistance, layerMask)) {
    Debug.Log(hit.collider.name);
}

// SphereCast for wider detection (good for ground checks)
Physics.SphereCast(origin, radius, direction, out hit, maxDistance, layerMask);

// OverlapSphere for area detection
Collider[] hits = Physics.OverlapSphere(center, radius, layerMask);

// 2D equivalents use Physics2D and RaycastHit2D
RaycastHit2D hit = Physics2D.Raycast(origin, direction, distance, layerMask);
\`\`\`

### CharacterController
- NOT a Rigidbody. Uses Move() or SimpleMove() for movement.
- SimpleMove() applies gravity automatically. Move() does not.
- isGrounded check: only true if collided with ground DURING the last Move() call.
- Good for: third-person characters, first-person controllers. Not good for: vehicles, ragdolls.
`;

export const UNITY_SKILLS_RENDERING = `
## Unity Rendering & Graphics

### Render Pipelines
- Built-in RP: legacy, most tutorials use this. Shader Lab + CG/HLSL shaders.
- URP (Universal): mobile-friendly, good performance, ShaderGraph. Use this for most projects.
- HDRP (High Definition): high-end visuals, expensive. Desktop/console only.
- Do NOT mix shaders between pipelines. URP shaders won't work in HDRP and vice versa.

### Materials & Shaders
- Materials are instances of Shaders with specific property values.
- Renderer.material creates a runtime copy (memory leak if not managed). Use Renderer.sharedMaterial to read without copying.
- MaterialPropertyBlock: change per-instance properties without creating material copies. Good for GPU instancing.
- ShaderGraph: node-based shader editor. Available in URP/HDRP.

### Lighting
- Realtime: dynamic, expensive. Good for moving lights.
- Baked: pre-calculated into lightmaps. Static objects only. Very cheap at runtime.
- Mixed: combines baked indirect + realtime direct. Best balance for most games.
- Light Probes: provide baked lighting data for dynamic objects.
- Reflection Probes: capture environment reflections for metallic/glossy surfaces.

### UI Systems
Canvas + UGUI (legacy but widely used):
- Screen Space - Overlay: always on top, no 3D interaction.
- Screen Space - Camera: rendered by a specific camera. Supports post-processing.
- World Space: UI in 3D world (health bars above enemies, in-game screens).
- Canvas Scaler: set to "Scale With Screen Size" for responsive UI.
- Optimization: split UI into multiple canvases (static vs dynamic) to reduce rebuild cost. When ANY element on a Canvas changes, the ENTIRE canvas mesh rebuilds.

TextMeshPro (TMP):
- Always use TextMeshPro over legacy Text. Better rendering, features, and performance.
- TMP_Text for 3D world text, TextMeshProUGUI for canvas UI text.

UI Toolkit (newer):
- USS (like CSS) + UXML (like HTML) + C# logic.
- Better for complex, data-driven UI (inventory, settings screens).
- Not yet feature-complete for all game UI needs. Check Unity version support.

### Particles
- ParticleSystem: CPU-based, full-featured, good for most VFX.
- VFX Graph: GPU-based, handles millions of particles. URP/HDRP only. Good for: ambient effects, magic, weather.
`;

export const UNITY_SKILLS_ANIMATION = `
## Unity Animation

### Animator Controller
- State machine for animation control. States contain Animation Clips.
- Transitions: conditions based on Parameters (bool, int, float, trigger).
- Trigger: auto-resets after transition. Use for one-shot animations (attack, jump).
- Bool: stays set. Use for ongoing states (isRunning, isGrounded).
- Float: use for blend trees (speed, direction).
- Has Exit Time: transition happens after clip finishes. Disable for instant transitions (like attack interrupts).

### Blend Trees
- 1D: blend between animations based on one parameter (idle → walk → run based on speed).
- 2D: blend based on two parameters (directional movement: X velocity, Z velocity).
- Freeform: more flexible 2D blending.

### Animation Events
- Call methods at specific frames in an animation clip.
- Method must be public and on the same GameObject as the Animator.
- Signatures: void Func(), void Func(float), void Func(int), void Func(string), void Func(AnimationEvent).
- Use for: footstep sounds, damage frames, particle spawning.

### Root Motion
- Animation drives the GameObject position/rotation instead of code.
- Enable "Apply Root Motion" on Animator.
- Override OnAnimatorMove() for custom root motion handling.
- Good for: realistic character locomotion. Not ideal for: precise, code-driven movement.

### IK (Inverse Kinematics)
- Requires Humanoid rig. Enable IK Pass on the Animator layer.
- OnAnimatorIK(int layerIndex) callback.
- SetIKPosition/Rotation + SetIKPositionWeight/RotationWeight.
- Use for: foot placement on uneven terrain, hand reaching, look-at targets.

### Timeline
- Cinematic sequencing tool. Controls animations, audio, activation, custom tracks.
- PlayableDirector component to play Timeline assets.
- Signal Emitters: fire events at timeline points (like animation events but for Timeline).

### DOTween (Third-party, very common)
\`\`\`csharp
transform.DOMove(target, duration).SetEase(Ease.OutQuad);
material.DOColor(color, duration);
transform.DOScale(Vector3.one * 1.5f, 0.2f).SetLoops(-1, LoopType.Yoyo);
sequence.Append(transform.DOMove(...)).Join(transform.DORotate(...));
\`\`\`
`;

export const UNITY_SKILLS_AUDIO = `
## Unity Audio

### Core Components
- AudioListener: receives audio. Usually on the main camera. Only ONE active per scene.
- AudioSource: plays audio clips. Attach to GameObjects. Multiple sources per object OK.
- AudioClip: the audio asset (WAV, MP3, OGG).

### 3D Audio
- Spatial Blend: 0 = 2D (UI sounds, music), 1 = 3D (footsteps, gunfire).
- 3D settings: Min/Max Distance, Rolloff (logarithmic for realism, linear for gameplay control).
- Doppler Level: set to 0 unless you need the Doppler effect.

### AudioMixer
- Route AudioSources through mixer groups (Master → Music, SFX, UI).
- Expose parameters for runtime control: mixer.SetFloat("MusicVolume", Mathf.Log10(volume) * 20).
- Snapshots: save/restore mixer states (e.g., underwater, paused).
- Effects: reverb, distortion, low-pass filter — apply per group.

### Best Practices
- Pool AudioSources for frequent sounds (gunfire, footsteps).
- PlayOneShot(clip) for overlapping sounds (doesn't interrupt current clip).
- Use AudioSource.Play() when you need stop/pause control.
- Compress clips: Vorbis for music/long clips, ADPCM for short SFX.
- Load Type: "Decompress On Load" for small frequent clips, "Streaming" for music.
`;

export const UNITY_SKILLS_AI_NAV = `
## Unity AI & Navigation

### NavMesh
- Bake NavMesh: Window → AI → Navigation. Defines walkable surfaces.
- NavMeshSurface component (newer): bake at runtime, per-surface control.
- NavMeshModifier: mark areas as different costs (swamp = expensive, road = cheap).
- NavMeshObstacle: dynamic objects that carve holes in the NavMesh. Use "Carve" for stationary, non-carve for moving.

### NavMeshAgent
\`\`\`csharp
agent.SetDestination(target.position);
agent.isStopped = true/false; // pause/resume
agent.remainingDistance // check if arrived
agent.pathPending // path still being calculated
agent.velocity // current movement velocity
agent.speed, agent.angularSpeed, agent.acceleration // tuning
\`\`\`

### State Machines (AI)
\`\`\`csharp
public enum EnemyState { Idle, Patrol, Chase, Attack, Dead }

private EnemyState currentState;

void Update() {
    switch (currentState) {
        case EnemyState.Idle: UpdateIdle(); break;
        case EnemyState.Patrol: UpdatePatrol(); break;
        case EnemyState.Chase: UpdateChase(); break;
        case EnemyState.Attack: UpdateAttack(); break;
    }
}
\`\`\`

### Common AI Patterns
- Line of sight: Physics.Raycast from enemy eye to player, check for obstacles.
- Detection radius: Physics.OverlapSphere with enemy layer exclusion.
- Steering behaviors: seek, flee, wander, arrive — calculate desired velocity, apply as force or direct movement.
- Behavior trees: use third-party (NodeCanvas, Behavior Designer) or implement simple tree with interfaces.
`;

export const UNITY_SKILLS_INPUT = `
## Unity Input

### New Input System (Recommended)
- Install via Package Manager: "Input System".
- Create Input Action Asset: define Action Maps (Player, UI) → Actions (Move, Jump) → Bindings (keyboard, gamepad).
- Generate C# class from asset for type-safe access.
\`\`\`csharp
// Using generated class
private PlayerInputActions input;
void Awake() { input = new PlayerInputActions(); }
void OnEnable() { input.Player.Enable(); }
void OnDisable() { input.Player.Disable(); }

void Update() {
    Vector2 move = input.Player.Move.ReadValue<Vector2>();
    if (input.Player.Jump.WasPressedThisFrame()) { Jump(); }
}
\`\`\`

- PlayerInput component: auto-wires actions, supports local multiplayer.
- Supports: keyboard, mouse, gamepad, touch, XR controllers.
- Interaction types: Press, Hold, Tap, SlowTap, MultiTap.

### Legacy Input Manager
- Input.GetAxis("Horizontal"), Input.GetButton("Jump"), Input.GetMouseButton(0).
- Still works, simpler for prototyping. Not recommended for production.
`;

export const UNITY_SKILLS_PERFORMANCE = `
## Unity Performance

### Profiling
- Window → Analysis → Profiler. ALWAYS profile before optimizing.
- Key markers: GC.Alloc (garbage collection), rendering time, physics time.
- Profile on target hardware, not just in editor. Editor adds overhead.
- Deep Profile: captures all method calls but adds significant overhead.

### CPU Optimization
- Object pooling: reuse objects instead of Instantiate/Destroy. Critical for bullets, particles, enemies.
- Cache components and calculations. Move expensive operations out of Update().
- Avoid string operations in hot paths. Strings are immutable — concatenation creates garbage.
- Use NonAlloc physics queries: RaycastNonAlloc, OverlapSphereNonAlloc.
- Job System + Burst: for CPU-heavy calculations (pathfinding, spatial queries). Native containers required.

### GPU / Rendering
- Draw call batching: Static Batching (check "Static" on non-moving objects), Dynamic Batching (small meshes auto-batched), SRP Batcher (URP/HDRP — keeps shader variants in memory).
- GPU Instancing: for many identical objects (trees, grass). Enable on material.
- LOD Groups: reduce mesh complexity at distance. LOD0 (near), LOD1, LOD2 (far).
- Occlusion Culling: skip rendering objects behind walls. Bake occlusion data.
- Overdraw: minimize transparent/overlapping UI elements. Use Overdraw scene view to check.

### Memory
- Texture compression: ASTC (mobile), BC7 (desktop). Max resolution appropriate for use case.
- Audio compression: see Audio section above.
- Addressables: async asset loading, memory management, remote content delivery.
- Resources.UnloadUnusedAssets() after scene changes.
- Avoid Resources folder for large amounts of assets — everything in Resources is loaded into memory index at startup.

### Mobile-Specific
- Target 30fps for battery life or 60fps for responsiveness. Application.targetFrameRate = 60.
- Reduce fillrate: smaller render targets, fewer transparent objects.
- Avoid realtime shadows or limit to one directional light.
- Texture atlases reduce draw calls.
- Mesh polygon budgets: characters ~3K-10K tris, environment props ~500-3K tris.
`;

export const UNITY_SKILLS_PATTERNS = `
## Unity Architecture Patterns

### Singleton (Use Sparingly)
\`\`\`csharp
public class GameManager : MonoBehaviour {
    public static GameManager Instance { get; private set; }

    void Awake() {
        if (Instance != null && Instance != this) {
            Destroy(gameObject);
            return;
        }
        Instance = this;
        DontDestroyOnLoad(gameObject);
    }
}
\`\`\`
Pitfall: tight coupling. Prefer ScriptableObject events or dependency injection.

### ScriptableObject Event System
\`\`\`csharp
// Event channel asset
[CreateAssetMenu(menuName = "Events/Void Event")]
public class VoidEventChannel : ScriptableObject {
    private readonly HashSet<Action> listeners = new();
    public void Register(Action cb) => listeners.Add(cb);
    public void Unregister(Action cb) => listeners.Remove(cb);
    public void Raise() { foreach (var l in listeners) l?.Invoke(); }
}

// Usage: drag the same asset into publisher and subscriber Inspector fields
\`\`\`

### Object Pooling
\`\`\`csharp
public class ObjectPool<T> where T : Component {
    private readonly Queue<T> pool = new();
    private readonly T prefab;
    private readonly Transform parent;

    public T Get() {
        var obj = pool.Count > 0 ? pool.Dequeue() : Object.Instantiate(prefab, parent);
        obj.gameObject.SetActive(true);
        return obj;
    }
    public void Return(T obj) {
        obj.gameObject.SetActive(false);
        pool.Enqueue(obj);
    }
}
\`\`\`

### State Machine (Generic)
\`\`\`csharp
public abstract class State<T> {
    protected T owner;
    public virtual void Enter(T owner) { this.owner = owner; }
    public virtual void Update() { }
    public virtual void FixedUpdate() { }
    public virtual void Exit() { }
}

public class StateMachine<T> {
    private State<T> currentState;
    public void ChangeState(State<T> newState) {
        currentState?.Exit();
        currentState = newState;
        currentState.Enter(owner);
    }
    public void Update() => currentState?.Update();
}
\`\`\`

### Component Pattern
- Favor small, focused components over monolithic scripts.
- One responsibility per component: Health, Movement, Weapon, AI.
- Communicate via events, interfaces, or ScriptableObject channels — not direct references.

### Service Locator / Dependency Injection
- Zenject/Extenject or VContainer for DI in Unity.
- Service Locator: simpler, register/resolve services globally.
- Helps testability and loose coupling.
`;

export const UNITY_SKILLS_PITFALLS = `
## Unity Common Pitfalls

### Critical Mistakes
1. **GetComponent in Update**: Costs performance. Cache in Awake/Start.
2. **Physics in Update**: Forces, velocity, MovePosition must be in FixedUpdate.
3. **String concatenation in Update**: Creates garbage every frame. Use StringBuilder or avoid.
4. **Find/FindObjectOfType at runtime**: O(n) scan every call. Use references, events, or manager patterns.
5. **Not unsubscribing from events**: Static events on destroyed objects = memory leak + null reference exceptions.
6. **Instantiate/Destroy in loops**: Causes GC spikes. Use object pooling.
7. **Ignoring Execution Order**: Awake/Start order between scripts is undefined unless set manually in Project Settings → Script Execution Order.
8. **Transform.position in FixedUpdate for Rigidbody**: Use Rigidbody.MovePosition() instead.
9. **Camera.main**: Internally calls FindGameObjectWithTag("MainCamera"). Cache it.
10. **Coroutine yielding new WaitForSeconds every time**: Allocates garbage. Cache the WaitForSeconds: private readonly WaitForSeconds wait = new(0.5f);

### Architecture Mistakes
- God scripts: one script does everything. Break into focused components.
- Hard-coding values: use [SerializeField] or ScriptableObjects for tuning.
- Circular dependencies: A references B which references A. Use events or interfaces.
- Not using Assembly Definitions: large projects compile slowly without them.
- Modifying prefab references at runtime thinking it affects only the instance (Renderer.sharedMaterial modifies the ASSET).

### 2D-Specific Pitfalls
- Z-fighting in sprites: use Sorting Layers and Order in Layer, not Z position.
- Physics2D and Physics3D are completely separate systems. OnTriggerEnter ≠ OnTriggerEnter2D.
- Tilemap collider: use Composite Collider 2D for performance (merges tile colliders).
`;

export const UNITY_SKILLS_EDITOR = `
## Unity Editor Scripting

### Custom Inspector
\`\`\`csharp
[CustomEditor(typeof(MyComponent))]
public class MyComponentEditor : Editor {
    public override void OnInspectorGUI() {
        serializedObject.Update();
        EditorGUILayout.PropertyField(serializedObject.FindProperty("speed"));
        if (GUILayout.Button("Reset")) { ((MyComponent)target).Reset(); }
        serializedObject.ApplyModifiedProperties();
    }
}
\`\`\`

### Property Drawers
\`\`\`csharp
[CustomPropertyDrawer(typeof(RangeAttribute))]
public class RangeDrawer : PropertyDrawer { /* ... */ }
\`\`\`

### Editor Windows
\`\`\`csharp
public class MyToolWindow : EditorWindow {
    [MenuItem("Tools/My Tool")]
    static void ShowWindow() => GetWindow<MyToolWindow>("My Tool");
    void OnGUI() { /* EditorGUILayout calls */ }
}
\`\`\`

### Gizmos
\`\`\`csharp
void OnDrawGizmos() {
    Gizmos.color = Color.red;
    Gizmos.DrawWireSphere(transform.position, detectionRadius);
}
void OnDrawGizmosSelected() { /* Only when selected */ }
\`\`\`

### Attributes for Editor
- [ExecuteInEditMode] / [ExecuteAlways]: script runs in editor
- [RequireComponent(typeof(Rigidbody))]: auto-adds component
- [DisallowMultipleComponent]: prevents duplicates
- [AddComponentMenu("Custom/MyScript")]: custom menu path
- [ContextMenu("Do Thing")]: right-click option in Inspector
`;

/**
 * Returns all Unity skill sections concatenated.
 */
export function getUnitySkills(): string {
	return [
		UNITY_SKILLS_CORE,
		UNITY_SKILLS_CSHARP,
		UNITY_SKILLS_PHYSICS,
		UNITY_SKILLS_RENDERING,
		UNITY_SKILLS_ANIMATION,
		UNITY_SKILLS_AUDIO,
		UNITY_SKILLS_AI_NAV,
		UNITY_SKILLS_INPUT,
		UNITY_SKILLS_PERFORMANCE,
		UNITY_SKILLS_PATTERNS,
		UNITY_SKILLS_PITFALLS,
		UNITY_SKILLS_EDITOR,
	].join('\n');
}

/**
 * Returns a compact subset of Unity skills for token-constrained contexts.
 */
export function getUnitySkillsCompact(): string {
	return [
		UNITY_SKILLS_CORE,
		UNITY_SKILLS_CSHARP,
		UNITY_SKILLS_PATTERNS,
		UNITY_SKILLS_PITFALLS,
	].join('\n');
}
