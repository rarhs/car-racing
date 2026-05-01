# Conversation History — Building the Car Racing Game

A chronological transcript of the conversation that produced the kart racer in this directory.

---

## 1. Opening request

**User:**
> I want make a car racing game.

**Assistant:**
Invoked the `superpowers:brainstorming` skill, scanned the project directory and found:

- Empty project except for `public/models/` containing a large Kenney-style asset library (~700 GLB/GLTF files): cars, kart models, road tiles, racing props, nature scatter.
- Sibling projects in `vibe-games/` (rope-swing using Vite+TS, platformer-game using vanilla JS, etc.) for tech-stack pattern reference.

Asked the first scoping question:

> **What style of racing game?**
> A. Arcade circuit racer
> B. Time-trial driving
> C. Endless highway racer
> D. Open exploration driver
>
> My recommendation is **A** — the asset library is heavily skewed toward circuit racing.

---

## 2. Style refinement

**User:**
> What about Kart racer (Mario Kart style)

**Assistant:**
Confirmed the kart models in the asset folder (`kart-oobi`, `oodi`, `ooli`, `oopi`, `oozi`) and asked about scope:

> **Which feature set for V1?**
> A. Pure racing — 1 track, 4 AI, 3 laps, drift, no items.
> B. Racing + items — A plus item boxes and 3-4 power-ups.
> C. Racing + items + multiple tracks.
>
> My recommendation is **B**.

---

## 3. Scope locked

**User:**
> B

**Assistant:**
Asked which 4 items:

> A. Classic kit — Boost, Banana, Homing Missile, Shield.
> B. Aggression-heavy.
> C. Defense-heavy.
>
> My recommendation is **A** — canonical Mario Kart loop.

---

## 4. Items locked

**User:**
> A

**Assistant:**
Started presenting the design in sections, beginning with the tech stack:

> - Three.js (CDN ES modules, no build step)
> - GLTFLoader for the existing assets
> - Plain HTML/CSS/JS — single index.html, modular JS
> - Custom arcade physics, no physics engine

---

## 5. Stack adjustment

**User:**
> What about Vite?

**Assistant:**
Updated stack:

> - Vite dev server + build
> - Three.js via npm
> - JavaScript (not TypeScript)
> - No physics engine — custom arcade kart physics
> - Project layout with `src/main.js`, `kart.js`, `track.js`, `ai.js`, `items.js`, `camera.js`, `hud.js`, `input.js`, `assets.js`, `config.js`, `state.js`

Asked: sound right? (next: game loop & states)

---

## 6. Spec request

**User:**
> Make a SPEC.md file first.

**Assistant:**
Wrote the full spec to `SPEC.md` at the project root, covering:

- Goals and non-goals
- Tech stack and project layout
- Game flow / state machine
- Controls (WASD + space drift + E item + R restart + Esc pause)
- Kart physics model (acceleration, brake, friction, steering, off-track penalty, wall bounce, drift, item effects)
- Track design (Catmull-Rom centerline → procedural ribbon mesh, walls, waypoints, item box spots)
- Camera (third-person chase with smoothing and FOV punch on boost)
- AI opponents (waypoint follow + variation + rubber-banding + item use + stuck recovery)
- Items (item boxes, 4 item behaviors, AI use logic)
- HUD (lap, position, item slot, countdown, toast, results, restart)
- Asset usage table mapping spec features to GLB files
- Performance targets
- Out of scope for V1
- Open questions (none blocking)

Did a self-review (no placeholders, no contradictions). With auto mode active, proceeded directly to scaffolding.

---

## 7. Implementation phase

Created a TaskList with 8 tasks:

1. Scaffold Vite + Three.js project
2. Asset preloader and base scene
3. Build the track
4. Player kart + arcade physics + chase camera
5. AI opponents
6. Items system
7. Game states + HUD
8. Playtest and tune

Wrote the codebase in passes:

- `package.json`, `vite.config.js`, `index.html`, `src/style.css`
- `src/config.js` — tunable constants
- `src/input.js` — keyboard listener with action mapping
- `src/main.js` — entry: scene, lights, camera, render loop, state machine wiring
- `src/state.js` — minimal state class
- `src/hud.js` — DOM-based HUD with lap, position, item icon, countdown, results
- `src/assets.js` — GLTF preloader for karts, item box, racing props, nature scatter
- `src/track.js` — Catmull-Rom curve → 240-sample centerline, ribbon road mesh, dashed stripes, edge walls, finish line, item box spawns, decorative scatter, lap progress tracking
- `src/kart.js` — kart class with arcade physics, drift, mini-turbo boost, item effects, wall collision via point-to-segment distance, shield bubble mesh
- `src/camera.js` — chase cam with damped lerp and FOV transition on boost
- `src/ai.js` — waypoint-following AI with steering, drift on tight turns, rubber-banding, item use timer, stuck recovery
- `src/items.js` — item box rotation/respawn, pickup detection, 4 item behaviors (boost / banana hazard / homing missile along racing line / shield), AI item use

Ran `npm install` (Vite + Three.js, ~12 packages). Started dev server at localhost:5173.

---

## 8. Testing phase

Used `mcp__claude-in-chrome` to navigate to localhost:5173 and inspect runtime state via `javascript_tool`.

### Initial render check

- Canvas mounted at 1522×688
- WebGL context active
- HUD visible: "LAP 1/3 / 2nd of 5 / — / 0 / 3" (countdown showing 3)
- No JS errors from app code (only an unrelated chrome extension error)

### Visibility-throttling discovery

The tab was hidden (Chrome backgrounded), so RAF was throttled — countdown stuck at "3". Added a debug API to `main.js`:

```js
window.__game = {
  get player() { ... },
  get ais() { ... },
  get state() { ... },
  tick(dt, steps),
  setCountdownDone(),
  pause(),
  resume(),
};
```

Plus `?paused=1` URL flag for test isolation.

### Bug 1: walls passing through the origin

After skipping the countdown and pressing accelerate, the player kart got stuck at near-zero speed (0.36) with the position barely changing. AI karts were also clustered at the start.

Diagnosed by sampling `track.walls` near the player position — found 4 walls with vertices exactly at `(0, 0, 0)`. Root cause:

- `CatmullRomCurve3.getSpacedPoints(N)` for closed curves returns `N+1` points where the first and last coincide.
- My code then ran `samples.push(samples[0])` to "close the loop" — but this duplicated the closure point.
- The tangent at the duplicated index ended up `(0,0,0)` (since `samples[i+1] - samples[i] = 0 - 0 = 0`).
- Normal vector was zero, so `left[duplicate]` and `right[duplicate]` collapsed to `(0,0,0)`.
- Wall iteration with modular indexing `% (left.length - 1)` then created walls connecting real edge points to `(0,0,0)`, slicing across the road right at the start grid.

Fix:

- Slice samples to exactly `N` unique points: `samples = curve.getSpacedPoints(240).slice(0, 240)`
- Compute left/right edges for those 240 points, then explicitly append a closing duplicate to left/right so ribbon mesh and wall iteration can use simple `i, i+1` access.
- Updated all `samples.length - 1` references in track/ai/items to just `samples.length`.

After the fix: 0 walls at origin, player reached max speed 27.7 within 3 seconds.

### Bug 2: lap counter triggered on first start-line crossing

After the wall fix, player completed "lap 1" within 3 seconds because the start grid sits behind the finish line — the first time the kart crossed it triggered a wrap from sample 239 → 0 = lap +1.

Fix: initialize `kart.lap = -1` and `kart.lastSampleIndex = null` so the first crossing produces `lap = 0` (= "first lap of race"). HUD displays `lap + 1` (1, 2, 3). Race ends at `lap >= 3` (= 3 laps completed).

### Bug 3: tests fighting the natural RAF loop

Found that synthesized keyboard input combined with the still-running natural animate loop produced wildly inconsistent state — heading would jump by 20+ radians between samples, AIs would race ahead by 2-3 laps before tests began. Root cause: the natural loop kept ticking the simulation while my manual `tick()` calls also advanced it, and the tab being hidden meant `clock.getDelta()` returned bursts of throttled frames.

Fix: added a `?paused=1` URL flag that auto-pauses the animate loop after boot. With that, manual ticks produce deterministic state.

### Final verification

Ran a 30-second AI-only simulation at the end:

- AIs progressed normally (lap counts 3/2/2/2 — first AI finished, others on lap 2)
- Active missiles in flight: 1
- Active banana hazards: 2
- Item boxes correctly cycling between picked-up and respawning
- AIs holding items (banana, shield)
- No errors

Pixel-sampled the rendered framebuffer:

- Top: rgb(154, 215, 255) — sky color matches `0x9ad7ff` ✓
- Middle: rgb(114, 114, 117) — road grey ✓
- Bottom: rgb(56, 99, 43) — grass green ✓

Scene renders correctly. All 8 tasks marked completed.

---

## 9. Final state

**Files at project root:**

- `SPEC.md` — design document
- `HISTORY.md` — this file
- `package.json`, `package-lock.json`, `vite.config.js`, `index.html`
- `node_modules/` — installed (three, vite)
- `public/models/` — pre-existing asset library
- `src/` — 11 source modules, ~1100 lines

**Key tunables in `src/config.js`:**

- Kart: accel 22, maxSpeed 28, drag 0.6, steerSpeed 2.6→1.4 (linear with speed), wallBounceDamp 0.5
- Drift: slipFactor 0.45, miniTurboThreshold 0.7, miniTurboBoost 0.45 for 1s
- Camera: distance 7, height 3.4, lookAhead 4, fovBase 70 → fovBoosted 84
- Race: 3 laps, 3-second countdown, 5 karts on grid
- AI: speed jitter 0.95-1.0, line offset ±1.5, rubber-band ±5%, item use delay 1-3s
- Items: box respawn 3s, boost +50% for 2s, banana spin 1s, missile 40 u/s for 5s, shield 5s

**Controls:**

- WASD or arrows — drive
- Space — drift
- E / Shift — use item
- R — restart on results screen
- Esc — pause (no-op currently)

**Run it:**

```
cd car-racing
npm run dev
```

Open http://localhost:5173/

For test isolation: http://localhost:5173/?paused=1 (animate loop paused; control via `window.__game.tick(dt, steps)` in console).
