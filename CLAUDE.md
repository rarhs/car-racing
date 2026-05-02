# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies.
- `npm run dev` — start Vite dev server at http://localhost:5173 (auto-opens browser).
- `npm run build` — production build to `dist/`.
- `npm run preview` — preview the built bundle.
- `npm run lint` — ESLint flat config (`typescript-eslint` recommended).
- `npm run typecheck` — `tsc --noEmit` against strict `tsconfig.json`.
- `npm run test` — Vitest in watch mode. `npm run test:run` for one-shot.

CI runs `lint → typecheck → test:run → build` on every PR (`.github/workflows/ci.yml`).

## Debug surface

`src/main.js` exposes `window.__game` after boot for in-browser inspection and headless driving:

- `__game.player`, `__game.ais`, `__game.state`, `__game.items`, `__game.track`
- `__game.tick(dt, steps)` — manually step the simulation N frames at fixed `dt` (used to reproduce frame-rate-independent bugs).
- `__game.setCountdownDone()` — skip the countdown.
- `__game.pause()` / `__game.resume()` — freeze/resume the `requestAnimationFrame` loop.
- URL param `?paused` boots in the paused state so you can attach a debugger before the first frame.

## Architecture

This is a single-page Three.js app. No physics engine — kart movement is custom arcade physics with sphere/segment collision against generated walls. No bundler config beyond `vite.config.js` (just sets the dev port).

### Entry & game loop (`src/main.js`)

`boot()` runs once: load assets → build track → spawn karts → enter `countdown`. Then `animate()` calls `frame(dt)` every frame with `dt` clamped to `1/30s` to survive tab-switch hitches.

State is a tiny string machine in `src/state.js` (`boot | loading | countdown | race | results`). Pause is a separate boolean (`isPaused`) layered on top — Esc toggles it during `countdown`/`race` and short-circuits `frame()` to render-only.

### Track is procedural, not tile-based

Despite the GLB road tile assets in `public/models/racing/`, the track is **not** assembled from those tiles. `src/track.js` defines ~13 hand-authored 2D control points (`CONTROL_POINTS`), fits a closed `CatmullRomCurve3` through them, and samples 240 evenly-spaced points. Those `samples[]` + their `tangents[]` are the source of truth for everything downstream:

- Road mesh (`buildRibbonGeometry`) — extruded ±`ROAD_HALF_WIDTH` along each tangent's normal.
- Walls (`buildWalls`) — short box segments every 4 samples on left/right edges, each stored as `{a, b, normal}` for `Kart.resolveWallCollisions`.
- Lap progress — `track.updateProgress(kart)` finds the nearest sample each frame and detects wraparound (prev > 85% of length, current < 15%) to bump `kart.lap`.
- Off-track detection — distance from nearest sample > `ROAD_HALF_WIDTH - 0.5`.
- AI waypoints — `track.getWaypoint(idx, offset)` returns a sample with optional perpendicular offset.
- Item box spawn positions (`computeItemBoxSpawns`) — every 30 samples, three across the road.

If you change `CONTROL_POINTS`, every system above re-derives automatically.

### Karts share one class; AI is just mock input

`src/kart.js` (`Kart`) is used for the player and all 4 AI. The player gets the real `input` from `src/input.js`; each AI gets an `AIController` (`src/ai.js`) that exposes the **same** `isDown(action)` / `wasPressed(action)` interface backed by `_down`/`_press` Sets. `Kart.update(dt, inputCtl, track)` doesn't know or care which is which.

This is why drift, mini-turbo, item use, and rubber-banding all "just work" identically for AI and player — the controller flips the same virtual buttons the keyboard would.

### Race ranking

`kart.totalProgress = kart.lap * samples.length + sampleIndex`. Position is computed every frame by sorting all karts on this scalar. Same value drives:

- HUD position display (1st of 5).
- Item-rank weighting (`pickItemForRank` in `items.js`) — leader gets defensive items, last place gets offensive comeback items, interpolated by rank fraction.
- AI rubber-banding (`accelBonus` in `ai.js`).

### Items

`src/items.js` (`ItemSystem`) owns three lists: `itemBoxes` (respawning pickups), `hazards` (dropped bananas), `missiles` (homing along the same track samples the AI uses). `ItemSystem.update` runs every frame with all karts: handles pickups, applies queued `useItemRequested` flags, ticks/collides hazards and missiles. Shields are stored on the `Kart` (`shieldTimer`, `shieldMesh`) and absorbed inside `Kart.hit()`.

Bananas and missiles are drawn from procedurally-built Three.js meshes (no GLB), cached in module-level `bananaTemplate` / `missileTemplate` and `clone(true)`'d on use.

### Tuning

**Every gameplay knob lives in `src/config.js`** — kart accel/drag/steering, drift slip and mini-turbo thresholds, camera distance/damping/FOV, race laps, AI rubber-banding %, item box respawn, item weights by rank. Prefer editing `config.js` over hardcoding numbers in feature files.

### HUD is DOM, not WebGL

`index.html` declares fixed-position `<div>`s on top of the canvas; `src/hud.js` writes text into them. The minimap is the only Canvas2D piece — it caches a projection of `track.samples` into 160×160 px on first frame, then redraws kart dots each tick.

## Conventions

- TypeScript strict (no `noUncheckedIndexedAccess`); ES modules; no JSX.
- Don't introduce a physics library — collisions stay analytical (segment-distance for walls, point-distance for items).
- New tunables → `src/config.ts`, not magic numbers.
- New AI behavior → drive it through `AIController.input` (which implements `KartInput`); don't bypass `Kart.update`.
- New track geometry → adjust `CONTROL_POINTS` or post-process `samples`/`tangents`; don't author per-tile transforms.
- New player/AI input source → implement the `KartInput` interface from `src/input.ts`. The mock-input contract is the seam that keeps `Kart.update` source-agnostic.
- See `SPEC.md` for the original V1 design intent (controls, items, performance targets).

## Tests

Vitest, Node environment (no jsdom, no WebGL). Two layers:

- **Unit (`tests/unit/`)** — pure-logic checks: `wrapAngle`, `pickItemForRank`, `Track` lap wraparound, `resolveWallCollisions`.
- **Sim (`tests/sim/`)** — headless gameplay: drive a `Kart` with a `TestInput`, run an `AIController` around the real track for N frames, verify physics tuning / lap completion / item flow end-to-end.

Three.js objects work fine in Node — only `WebGLRenderer` and `document.createElement('canvas')` need a browser. That's why `track.ts` has `buildTrackHeadless()` (pure data + Track methods) alongside `buildTrack(scene, assets)` (data + scene meshes); the meshes need a canvas for the finish-line texture, the data doesn't. Tests use `buildTrackHeadless()`.

Test helpers in `tests/helpers/stubs.ts`: `TestInput` (KartInput with `hold`/`release`/`tap`), `makeStubAssets()` (Group placeholders for every PropName), `makeStubHud()` (returns `{ hud, toasts }` so you can assert on `hud.toast()` calls), `makeKart()`.
