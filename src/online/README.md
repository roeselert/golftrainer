# Online capabilities

Round Simulation, Map Visualisation and Tile Access live here (CLAUDE.md §1.4).
Empty for now — UC2 and UC3 are not built yet.

The map is Leaflet with the basemap behind Tile Access (TD7/TD7a): German state
orthophotos where they cover the course, OSM standard tiles elsewhere. Tile
Access exists so the imagery is a URL template in one module rather than an SDK
the map code is written inside — which is also why Google Maps was not chosen,
since its terms forbid its content appearing on or beside any other map.

One rule follows from the dependency rule and is easy to break by accident:
**which basemap covers a course is resolved here, from the position, at display
time.** It must never become a column on `Course` — the catalogue lives in the
offline core, and a tile provider is an online concern.

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
