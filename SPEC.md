# Car Racing — Mario Kart-style Web Game

A browser-based 3D kart racer. One track, four AI opponents, three laps, drift mechanic, and four power-up items.

## Goals

- Fun-feeling kart handling: responsive, arcade-y, drift-friendly.
- Recognizable Mario Kart loop: race + items + position + comeback.
- Ships in a single playable build. No half-finished menus or stub screens.
- Runs in any modern desktop browser at 60 fps.

## Non-goals (V1)

- Multiplayer / networking.
- Multiple tracks or kart selection screens.
- Mobile / touch controls.
- Sound design beyond a few placeholder cues (engine, hit, item).
- Save data, leaderboards, accounts.

## Tech stack

- **Vite** dev server + build.
- **Three.js** via npm.
- **JavaScript** (not TypeScript).
- **No physics engine** — custom arcade kart physics; sphere/AABB collision checks.
- **GLTFLoader** for `.glb` / `.gltf` assets already in `public/models/`.

## Project layout

```
car-racing/
  index.html
  package.json
  vite.config.js
  public/models/...        (existing assets — cars, racing props, track tiles, nature)
  src/
    main.js                entry: scene, render loop, state machine
    state.js               game state machine (boot, countdown, race, results)
    assets.js              GLTF preloader + model cache
    input.js               keyboard handling
    kart.js                kart entity (used by player and AI)
    physics.js             arcade physics: accel, friction, drift, off-track penalty
    track.js               track build, walls, waypoints, lap detection
    ai.js                  AI driving (waypoint follow + items)
    items.js               item boxes, item types, item effects
    camera.js              chase camera with smoothing
    hud.js                 DOM-based HUD (lap, position, item icon, countdown, results)
    config.js              tunable constants (speeds, drift params, etc.)
```

## Game flow / states

```
Boot ─▶ Loading ─▶ Countdown (3-2-1-GO) ─▶ Race ─▶ Results ─▶ (Restart) ─▶ Countdown
```

- **Boot**: create scene, camera, lights, renderer, HUD root.
- **Loading**: preload all GLTF models needed for the race; show progress text.
- **Countdown**: place karts on grid, freeze input, show "3, 2, 1, GO!" at 1s intervals.
- **Race**: full simulation — input, physics, AI, items, lap counting, HUD.
- **Results**: final positions, lap times, "Press R to restart". On restart → Countdown.

## Controls (keyboard)

| Action     | Key            |
|------------|----------------|
| Accelerate | `W` or `↑`     |
| Brake / reverse | `S` or `↓` |
| Steer left | `A` or `←`     |
| Steer right| `D` or `→`     |
| Drift (hold while turning) | `Space` |
| Use item   | `E` or `Shift` |
| Restart (results screen) | `R` |
| Pause      | `Esc`          |

## Kart physics (arcade)

Kart is a kinematic object with position, heading, and forward speed. Update each frame using `dt` (seconds).

- **Acceleration**: `speed += accel * dt` while accel held; capped at `maxSpeed`.
- **Brake**: stronger negative accel; can reverse below 0 to small negative speed.
- **Friction**: passive drag every frame (`speed *= 1 - drag * dt`).
- **Steering**: turn rate scales with speed (no zero-speed pivot, weaker turn at top speed).
- **Off-track penalty**: when kart center is over grass/sand, `maxSpeed` and `accel` are halved until back on road.
- **Wall collision**: detected against track wall AABBs; on hit, kart bounces (reflect velocity along wall normal) and loses ~50% speed.
- **Drift**: when `Space` held *while turning*, kart's heading turns slower than its velocity vector (sliding). Charges a drift meter while drifting; on release, applies a short speed boost ("mini-turbo") if the meter passed a threshold.
- **Item effects** modify these numbers temporarily (boost = +50% maxSpeed for 2s; banana hit = spin out, speed → 0 for 1s; etc.).

All tunables live in `config.js` so play-feel can be iterated.

## Track

- **Layout**: one closed-loop circuit, hand-authored as a list of segment placements (positions + rotations of road tiles from `public/models/racing/`). Roughly 30-50 tiles forming a track with at least one long straight, two corners of varying tightness, and one S-bend.
- **Start/finish**: `roadStartPositions.glb` placed at start; finish line is the segment crossing detection plane.
- **Walls**: invisible AABB colliders generated alongside road tiles (kart can bounce off but not see them) plus visible decorative barriers (`barrierRed.glb`, `barrierWhite.glb`).
- **Waypoints**: an ordered list of `{x, z}` points along the racing line, used for:
  - AI pathfinding target selection.
  - Lap progress tracking (kart's current "progress" = nearest waypoint index).
  - Off-track detection (distance from racing line beyond a threshold = off-track).
- **Lap detection**: when a kart's progress index wraps past the start waypoint, increment its lap. Race ends when a kart finishes lap 3.
- **Decoration**: trees and rocks from `public/models/nature/` placed off-track for visual polish; grandstands and billboards from `public/models/racing/` near the start/finish.

## Camera

Third-person chase camera following the player's kart.

- Position: behind kart at offset (e.g., `-6` units back, `+3` units up in kart-local space).
- Look-at: kart position + small forward offset.
- Smoothing: damped lerp on position and look target (`damping ≈ 0.1`) so the camera lags slightly during sharp turns and drifts — this feels good and reads speed.
- Subtle FOV punch on boost (FOV 70 → 80 over 0.15s, then back) to sell speed.

## AI opponents

Four AI karts share the same `Kart` class as the player, but their input comes from `ai.js` rather than `input.js`.

- **Driving**: target the next waypoint ahead. Compute desired heading; if difference exceeds a small angle, steer toward it. Always accelerate. Brake only if heading-error is huge (e.g., recovering from wall bonk).
- **Variation**: each AI has a small random offset from the racing line (±1.5 units) and a slightly different `maxSpeed` (95-100% of player's) so they don't form a snake.
- **Rubber-banding (light)**: AI behind the player gets +5% accel; AI well ahead gets -3% maxSpeed. Caps the gap so races stay tense without feeling rigged.
- **Item use**: when AI holds an item, it uses it after a 1-3s delay if there's a target ahead (offensive) or behind (defensive, e.g., banana). Boost: used on long straights.
- **Recovery**: if stuck against a wall for >1s, reverse for 0.5s then continue.

## Items

### Item boxes

- Floating, rotating boxes (`box.glb` from cars folder, scaled and animated) placed at fixed spots on the racing line — about 6-10 boxes per lap, in clusters near corners.
- Driving through a box: box disappears, respawns after 3s, kart receives one random item.
- A kart can hold only one item at a time. Picking up while holding does nothing.

### The 4 items

| Item | Effect |
|------|--------|
| **Boost** (mushroom-style) | Instant +50% maxSpeed for 2s. Stacks with drift mini-turbo. |
| **Banana** | Drops a hazard at the kart's current position. Any kart that drives over it spins out (loses control + speed → 0 for 1s). Persists until hit. |
| **Homing missile** | Locks onto the nearest kart ahead. Travels along the racing line at higher-than-kart speed until it hits the target or expires after 5s. On hit: target spins out for 1s. |
| **Shield** | Surrounds the kart with a visible bubble for 5s. Absorbs one banana or missile hit, then breaks. |

Random selection is uniform across the 4 items in V1. (Position-based weighting — better items when you're losing — can come later.)

## HUD (DOM overlay)

Plain HTML/CSS layered over the canvas:

- **Top-left**: Lap counter — `LAP 1/3`.
- **Top-right**: Position — `1st of 5`.
- **Bottom-left**: Current item icon (or empty slot when none).
- **Bottom-right** (optional): Speed in arbitrary units.
- **Center, transient**: Countdown ("3", "2", "1", "GO!"), boost burst flash, "Banana hit!" toast.
- **Results screen**: Centered card with final positions and lap times; "Press R to restart" prompt.

## Asset usage

From `public/models/`:

- **Player kart**: `cars/kart-oobi.glb` (or whichever feels right after testing).
- **AI karts**: `cars/kart-oodi.glb`, `kart-ooli.glb`, `kart-oopi.glb`, `kart-oozi.glb`.
- **Wheels**: `cars/wheel-racing.glb` (attached at known offsets per kart model).
- **Track**: pieces from `racing/` — `roadStraight`, `roadStraightLong`, `roadCornerLarge`, `roadCornerSmall`, `roadCurved`, `roadStart`, `roadStartPositions`.
- **Walls**: `racing/barrierRed.glb`, `racing/barrierWhite.glb`, `racing/rail.glb`.
- **Decoration**: `racing/grandStand.glb`, `racing/billboard.glb`, `racing/flagCheckers.glb`, `racing/treeLarge.glb`, `racing/treeSmall.glb`.
- **Nature scatter**: `nature/tree_pineDefaultA.glb`, `nature/rock_largeA.glb` etc., off-track.
- **Item box**: `cars/box.glb` (custom material to make it shiny).
- **Banana hazard**: temporary placeholder — small yellow sphere drawn in code (real banana model can be added later; not in asset pack).
- **Homing missile**: small cone primitive drawn in code (placeholder).

## Performance targets

- 60 fps on a mid-range laptop GPU.
- Single directional light + ambient (no real-time shadows for V1, or a single low-res shadow map on the player kart only).
- All GLTFs loaded once at boot; instances reused via `clone()`.
- Frustum culling on by default; manual culling not needed at this scale.

## Out of scope for this spec (future)

- Sound design, music, voice clips.
- Mobile/touch controls.
- Multiple tracks, kart selection screen, stats per kart.
- Network multiplayer.
- Save data / best lap times.
- Position-weighted item odds.
- Track editor.

## Open questions

None blocking V1 — all the above is decided. Tunable values (top speed, drift threshold, AI rubber-banding %, item box density) will be iterated in `config.js` during playtesting.
