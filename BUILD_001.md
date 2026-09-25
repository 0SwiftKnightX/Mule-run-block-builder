# BUILD 001 — Construction Foundation

## Version state

**Version:** 001
**Status:** LOCKED

## Current-state audit

The repository began with a working browser sandbox containing first-person movement, a grid builder, local blueprint storage, vehicle spawning, arcade driving, ramps, collisions, and touch controls.

The audited construction implementation placed immediately on pointer-down, used an automatically rotating camera, recreated preview geometry continuously, communicated invalid placement mainly through color, offered no safe move-cancel state, lacked a selection outline, and had no WebXR input architecture.

## Player-perceived problems addressed

1. Camera motion happened without player intent.
2. Placement felt like a cursor command instead of a physical action.
3. Invalid placement did not explain the cause clearly enough.
4. Selecting and moving a component did not visibly guarantee recovery.
5. Touch controls competed with the construction viewport.
6. XR-capable input had no shared path into construction logic.

## Implemented

- Direct startup into the construction workshop.
- Bounded orbit camera with zoom, controlled pan, and focus action.
- Deterministic grid and face snapping.
- Structured validation results for bounds, overlap, foundation rules, and disconnected placement.
- Ghost feedback using opacity, wireframe state, spatial check/cross glyphs, text, coordinates, and orientation arrow.
- Release-timed placement motion with a held component and compact hand representation.
- Placement commits at the deterministic release event rather than at input time.
- Selection outline and explicit held/editing UI state.
- Safe move workflow: select, preview, rotate/reposition, confirm, or cancel while the original remains intact.
- Reversible place, move, rotate, clear, and remove operations through data snapshots.
- Explicit component connection records and parent IDs derived from face adjacency.
- Responsive mobile component strip and large bottom action dock.
- Touch orbit plus two-pointer pan/zoom architecture.
- WebXR session capability detection, controller rays, shared trigger placement, and squeeze grab/rotate hooks.
- Centralized procedural construction audio for select, grab, snap, rotate, place, remove, and invalid operations.
- Preview reuse, resource disposal, mobile resolution caps, and shadow-budget reduction.

## Exact release timing verification

| Checkpoint | Construction mass |
|---|---:|
| Before placement input | 0 KG |
| Immediately after input | 0 KG |
| 80 ms, before release event | 0 KG |
| 180 ms, after release event | 12 KG |

This verifies that blueprint mutation does not occur before the visual release event.

## Verified

- Application startup enters Build 001 without runtime errors.
- Initial ghost resolves to a valid connected grid target.
- Valid and invalid states expose distinct text, geometry, and control availability.
- Placement waits for the release event.
- Undo and redo restore construction data correctly.
- Shift-click enters safe editing state with the original preserved.
- Cancel exits editing without mutating the original.
- Mobile layout was visually inspected at 390 × 844.
- Desktop layout was visually inspected at 1280 × 720.
- Unsupported WebXR environments fail safely with a disabled status control.
- Browser console reported zero application errors.

## Explicit non-changes

- Vehicle physics were not redesigned.
- Engine and wheel functionality were not expanded.
- Blueprint persistence behavior was not expanded.
- No progression, inventory, combat, multiplayer, economy, missions, or open-world systems were added.
- No new runtime dependency was introduced.

## Regression status

**Pass.** Existing component catalog, history, save/exit flow, vehicle spawning, entry/exit, and driving code remain integrated. Construction data gained additive connection metadata; existing consumers continue to use the original type and transform fields.

## Performance status

- No application errors during desktop or mobile browser testing.
- Preview allocation was removed from steady pointer movement.
- Resource cleanup occurs when construction meshes or held previews are replaced.
- Mobile rendering uses a reduced pixel-ratio and shadow-map ceiling.
- Headless Chromium emitted only known WebGL readback warnings caused by test screenshots.

## Known issues

- Immersive WebXR interaction cannot be fully exercised in the headless test browser; capability fallback and input wiring are verified, but Quest hardware validation remains required.
- Procedural audio starts only after a browser-approved user gesture.
- Existing vehicle and persistence systems are inherited compatibility systems and are outside the Build 001 improvement scope.

## Next version

**BUILD 002 objective:** refine construction physicality and game feel using Quest hardware feedback, repeated-placement cadence testing, input haptics where supported, and final camera/snap tuning. Do not expand vehicle systems during Build 002.
