# Online capabilities

Round Simulation, Map Visualisation and Tile Access live here (CLAUDE.md §1.4).
Empty for now — UC2 and UC3 are not built yet.

## The rule that governs this directory

> Online capabilities may depend on offline capabilities. Never the reverse.

Code in here **may** import from `src/offline/`. That is the whole point: the
simulation and the map read and write the same domain model and the same store
that Round Capture uses. There is one truth about a golf round.

Code in `src/offline/` **may not** import from here. Not by import, not by
event, not by a shared type that drags an online concern into the offline core.
`eslint.config.mjs` enforces both halves; a violation fails the build.

The acceptance test for the rule: delete this directory and the offline core
must still work. If it does not, the app can no longer be trusted on a course
with no reception — which is quality goal 1.
