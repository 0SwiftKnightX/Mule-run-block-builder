# Vehicle Sandbox Builder

A browser-based 3D construction sandbox built with Three.js. Build 001 focuses on a tactile, deterministic construction foundation while preserving the pre-existing vehicle sandbox loop for regression compatibility.

## Run locally

Serve the repository root with a static HTTP server and open `index.html`. Three.js and the included web fonts load from public CDNs.

WebXR requires a compatible browser, secure context, and XR device. Unsupported browsers display a disabled XR status instead of failing.

## Build 001 controls

### Desktop

- Click: place at the active ghost
- Shift + click: select and move an existing component
- Alt/right/middle drag: orbit camera
- Shift + right/middle drag: pan camera
- Mouse wheel: zoom
- R: rotate 90 degrees
- Delete: remove selected component
- Ctrl+Z / Ctrl+Y: undo / redo
- Escape: cancel an active move

### Touch

- Drag construction view: orbit
- Two-finger gesture: pan and zoom
- Tap a component: select it without altering the original
- Bottom action dock: focus, rotate, place, cancel, remove

### XR architecture

- Controller ray: aim the construction cursor
- Trigger: confirm placement
- Squeeze: grab the aimed component or rotate the held component
- Touch, desktop, and XR inputs call the same construction operations

## Files

- `index.html` — application shell, construction HUD, mobile action dock, XR status, help, and inherited vehicle HUD.
- `style.css` — responsive construction UI and industrial visual language.
- `game.js` — world, data-driven components, construction rules, blueprint graph, vehicle regression systems, and shared operations.
- `build-foundation.js` — Build 001 camera controller, release-timed placement motion, procedural build audio, and WebXR input bridge.
- `BUILD_001.md` — audit, implementation record, verification, known issues, and version-lock status.

## Construction data

Each placed component stores a stable component ID, component type, grid transform, parent ID, and explicit connection records. Connections are deterministically reconstructed from face adjacency and remain independent of scene-object identities.

Placement validation returns specific recoverable states: build-volume bounds, occupied space, invalid foundation type, disconnected placement, or valid face connection. The ghost combines color, wireframe state, spatial glyphs, text, coordinates, and orientation cues so validity does not depend on color alone.

## Existing systems preserved

The earlier blueprint persistence, vehicle spawning, driving, ramps, collision response, fuel, engine health, propeller lift, first-person movement, and vehicle entry/exit remain present. Build 001 does not expand those systems.

## Performance approach

- Preview geometry is reused until component type or rotation changes.
- Superseded construction and held-object resources are disposed.
- Mobile pixel ratio and shadow resolution are capped.
- Build rules update on interaction rather than through scene-wide per-frame searches.
- XR, touch, and desktop inputs share one placement path.

See `BUILD_001.md` for the locked baseline and verification record.
