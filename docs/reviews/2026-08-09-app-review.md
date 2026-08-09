# App review — 9 August 2026

Agentic review (`timo_agentic_coding_process` §5.2) of the whole app against
[`CLAUDE.md`](../../CLAUDE.md) and the four [use-case specifications](<../use cases/README.md>).

Every quality signal is green and every test passes, so this review is about
what the signals cannot see: the nine-hole course the capture screen does not
believe in, the screens that render on top of each other, and the writes that
fail without saying so. Fourteen findings, none fixed — triaged first, as the
workflow requires.

|             |                                               |
| ----------- | --------------------------------------------- |
| Unit tests  | 61 passed                                     |
| Offline e2e | 34 passed (3.3 min)                           |
| Signals     | 5/5 — lint, format, types, duplication, audit |
| Findings    | 14 — 4 high, 4 medium, 6 low                  |

## What was run

| Command             | Result                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run signals`   | Green. ESLint, Prettier, `tsc --checkJs`, jscpd (0 clones over 34 files), `npm audit` 0 vulnerabilities                                              |
| `npm run test:unit` | 61 passed, 0 failed                                                                                                                                  |
| `npm run test:e2e`  | 34 passed. Needed `CHROMIUM_PATH`, because the pinned Playwright build was not the one installed in the review container — the README documents this |
| probes              | Three throwaway specs, since deleted, to confirm findings 1–3 in a real browser rather than by reading                                               |

`npm run test:e2e:pages` was not run: CI runs it on every push, and nothing in
this review touches path resolution.

## Findings

Ordered by how much they cost a golfer, not by how hard they are to fix.

### 1. The capture screen does not know a course can have nine holes

**High** · UC5 BR4, UC1 step 9 · `src/offline/capture/capture-view.js:63,226,281`

Eighteen is hard-coded three times: `Math.min(last + 1, 18)` proposes the next
hole, `number >= 18` decides when a round ends, and the forward button is
disabled at 18. The planner does this correctly from `courseHoles.length` —
capture never loads the course's hole count at all.

Confirmed in a browser: on a nine-hole course, finishing hole 9 opens _Hole
10_, the round is never closed, and reopening Track round returns to hole 10.
Holes 10–18 can then be created with no matching `course_holes` row, so they
carry no tee and no par, and UC5 BR4 says hole numbers are 1..`holeCount`.

```
AFTER HOLE 9 — title: Hole 10
AFTER HOLE 9 — url: …#/track?round=4d6d1d6a…&hole=10
REOPEN track  — title: Hole 10
HOLES RECORDED: [1,2,3,4,5,6,7,8,9]
```

_Fix:_ read the round's course once in `render` and thread `holeCount` through
`nextHoleNumber`, `closeHole` and the hole navigation, the way
`planner-view.js` already does.

### 2. A render that throws leaves a blank screen and no message

**High** · QG2, UC1 E5 in spirit · `src/shell/router.js:95`, `capture-view.js:38`, `planner-view.js:41`

`show()` clears the outlet and then awaits `route.render()` with no `catch`.
Capture and the planner both call `roundById` unguarded, so a hash that names a
round which no longer exists — a bookmark, a stale URL after a round was
finished — throws past the router and the golfer is left with an empty page.

```
#/track?round=00000000-…&hole=1
view text:   ""
page errors: ["RoundError: That round no longer exists."]
```

Review and Courses each catch their own lookup and show a notice, so the
pattern is already in the codebase; it just is not enforced anywhere.

_Fix:_ wrap the `render` call in the router and render a notice through
`onUnavailable` (or a sibling) on failure. That covers every screen at once
rather than asking each to remember.

### 3. Two screens can end up stacked in the outlet

**High** · router generation guard · `src/shell/router.js:92`

The generation guard is checked after `load()` and before `replaceChildren()`,
but never again. Views append _after_ their own awaits, so a screen that is
still mid-render when the golfer navigates away keeps appending into the outlet
the newer screen has already claimed.

Reproduced by opening a round and leaving within 10–60 ms: the Courses list and
the whole round review — header, overview, stroke table, map — are both in the
document, with two screen titles.

```
delay=10  {"courseList":true,"overview":true,"map":true,
           "titles":["Courses","Race Course"]}
delay=60  {"courseList":true,"overview":true,"map":true,…}
delay=100 {"courseList":true,"overview":false,"map":false,
           "titles":["Courses"]}
```

_Fix:_ pass the generation (or an `AbortSignal`) into `render` and have the
router discard a render that is no longer current — or re-check after the await
and clear. Views appending up front, as the tee map does, narrow the window but
do not close it.

### 4. A failed write in the planner is silent

**High** · UC3 E5, UC1 E5 · `planner-view.js:146,175,185,201,287,342`, `capture-view.js:182,292`

UC3 E5 says a stroke that does not store is reported as not placed and is not
drawn. Every planner handler is an `async` callback handed to Leaflet or
`onclick` with no `try`: placing a stroke, dragging one, undo, clear, intended
putts, finish. A rejection becomes an unhandled promise rejection and the
golfer sees nothing at all.

Capture gets this right for the stroke itself — `recordStroke` catches and says
"Stroke NOT saved" — but its own Undo and Finish round buttons have the same
gap, which matters more, because that is the on-course screen.

_Fix:_ one small helper in `shell/dom.js` that wraps a handler, posts
`describeError` into a messages element, and is used by every write handler in
both views.

### 5. The attribution line goes stale the moment the layer changes

**Medium** · UC2 BR7, TD7a · `review-view.js:301`, `planner-view.js:238`, `tee-map-view.js:84`

BR7 requires the attribution to name whichever layer is actually being drawn,
and CLAUDE.md calls it a functional requirement rather than a footer. Leaflet's
own control does update on a layer switch; the app's extra `.attribution`
paragraph is written once from `defaultBasemap()` and keeps crediting Esri
after the golfer switches to OpenStreetMap. So the screen shows two
attributions and one of them is wrong.

_Fix:_ drop the paragraph — Leaflet's control already satisfies BR7 — or
subscribe to `baselayerchange` and rewrite it. Note `review.spec.js:82` asserts
on the stale paragraph today, so the test moves with the decision.

### 6. Resuming a round is silent, and declining is not possible

**Medium** · UC1 A1, UC3 A3 · `capture-view.js:38`, `planner-view.js:41`

A1 specifies that an unfinished round is _offered_ for resume and that
declining finishes the old round instead of deleting it. Both screens instead
resume whatever `roundInProgress` returns, with no offer and no decline.
Combined with BR10 — only one open round — a golfer who forgot to finish last
week's round cannot start today's until they work out that the way through is
to open the old round and tap Finish round.

_Fix:_ when a round is in progress, render the choice: resume it, or finish it
and pick a course. Two buttons on a screen that is otherwise already built.

### 7. An implausible tap on a zoomed-out map is accepted without the flag

**Medium** · UC3 E4 · `planner-view.js:339`

E4 says a stroke placed more than a kilometre from the tee is accepted _but
flagged_, because a mis-tap on a zoomed-out map is easy to make and expensive
to notice later. Nothing checks the distance, though `legDistances` is already
computed one function away in the same file.

_Fix:_ after `repaint`, compare the new leg against 1 km and append a warning
notice. Accept the stroke either way, as specified.

### 8. A hole with no tee draws from the first stroke without saying so

**Medium** · UC2 E3 · `map-view.js:169`, `review-view.js:312`

E3 says the route starts at the first stroke instead _and says the tee is
unknown_. `drawHole` simply omits the tee marker, and the review screen says
nothing — so a hole whose route begins at the first stroke looks identical to
one whose tee happens to sit under it. The screen already has the vocabulary:
it reports missing stroke positions the same way.

_Fix:_ in `show()`, add a notice when `hole.teePosition` is null, beside the
existing "strokes have no position" one.

### 9. A tee placed on a map claims a fix time

**Low** · UC5 BR8, `Position.fixedAt` · `planner-view.js:151`, `tee-map-view.js:152`

Both map-placement paths write `accuracy: null` with the comment "nothing
measured this", and then `fixedAt: new Date()`. The typedef says `fixedAt` is
null when nothing measured it, and planned strokes follow that rule exactly. A
tee placed by eye on imagery is the same kind of thing, so it should carry the
same two nulls.

_Fix:_ pass `fixedAt: null` in both places. Nothing reads the field except
`describeAccuracy`, which already handles null.

### 10. Leaflet maps are never disposed when leaving a map screen

**Low** · resource lifecycle · `map-view.js:96` and all three online views

Layers are removed, the map is not: `map.remove()` appears nowhere. The router
drops the container from the DOM, but each Leaflet instance keeps its document
and window listeners, so bouncing between Rounds and Plan accumulates them for
the life of the page. Nothing user-visible today; it is the kind of thing that
becomes a slow phone later.

_Fix:_ have `createMap` return a disposer and call it — which needs the same
render-lifecycle hook finding 3 wants.

### 11. `openDatabase` silently ignores its argument after the first call

**Low** · API honesty · `src/offline/shared/store/database.js:36`

`opening ??=` memoises the first connection, so a later call with a different
`dataDir` quietly returns the first database instead. The JSDoc says tests pass
`memory://` to get an isolated database per test — they do not;
`test/support/database.js` constructs PGlite directly, which is why nothing has
tripped over this.

_Fix:_ either drop the parameter and the claim, or key the memo on `dataDir`.
The single-connection rule that motivates the memo is real and worth keeping.

### 12. The durability warning points at an export that does not exist

**Low** · TD8 · `storage-durability.js:56`

When the Storage API is missing, the app tells the golfer to "Export after each
round". There is no export anywhere in the product — CLAUDE.md lists it as
still worth building. Advice that cannot be followed is worse than none on the
one screen whose job is honesty about durability.

_Fix:_ say what is actually true — that rounds may be cleared by the browser
and installing to the home screen is the mitigation — until export exists.

### 13. `src/online/README.md` describes a directory that no longer exists

**Low** · deletion check · `src/online/README.md`

It says "Empty for now — UC2 and UC3 are not built yet", beside three built
screens, and describes the basemap as German state orthophotos with OSM
elsewhere — the arrangement TD7a superseded and `tile-access.js` explains at
length was parked. The dependency-rule half of the file is still exactly right
and worth keeping.

_Fix:_ delete the two stale paragraphs; keep the rule.

### 14. The README still describes the old burger menu

**Low** · deletion check, TD13 · `README.md`, "Status"

"The burger menu lists five destinations" — it lists one, Load new version, and
the destinations moved to home-screen tiles in the commit that emptied it. The
rest of the paragraph (which screens need a network, what the update button
does) is accurate and just needs re-anchoring to the tiles.

_Fix:_ one paragraph, rewritten to match TD13.

## What holds up

Worth stating plainly, because the findings above are all this document would
otherwise say.

- **The dependency rule is real, not aspirational.** ESLint blocks the imports
  and the network globals, `app-shell.test.js` checks the same thing
  independently in case the lint rule is relaxed, and the precache boundary is
  asserted in both directions. No violation was found, and no online concern
  leaks into the catalogue — the tile provider genuinely is resolved at display
  time.
- **The tests assert things that could fail.** The migration suite proves a
  failed migration rolls back its tables and does not advance the version; the
  geo suite checks a degree of latitude at two latitudes, which is the property
  a planar approximation would not have; the penalty test asserts the _absence_
  of penalty columns. The e2e suite captures rounds through the UI rather than
  seeding fixtures, so the review screens read what UC1 actually wrote.
- **Data honesty is consistent.** Nothing is invented to look plausible: an
  unknown par stays "—", a par summed over half a round says so, coincident
  strokes are never merged, a stroke with no fix keeps its row. This is the
  hardest property to retrofit and it is present throughout.
- **No unsafe DOM anywhere.** `textContent` only, no `innerHTML`, no `eval`;
  route names and menu actions are both looked up in ways that cannot reach
  `constructor` through a prototype chain.

## Triage

Nothing was changed — the workflow says findings are triaged before they are
fixed. Findings 1 to 4 are the ones to take now; 5 to 8 close specified
behaviour that was written down and then not built; 9 to 14 are cheap and can
ride along with anything else.
