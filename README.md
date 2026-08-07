# GolfTrainer

Record every stroke of a round on the course — offline, one-handed, no map —
then replay and simulate it on a map from the couch.

An installable PWA in vanilla JavaScript. No framework, no build step, no app
store. The architecture, the decisions behind it and the open questions live in
[`CLAUDE.md`](CLAUDE.md), which is the spine of this project: read it first.

## Status

Bootstrap. The walking skeleton proves the stack holds — offline cold start,
local Postgres, storage durability — but no use case is implemented yet. The
capture screen (UC1) waits on OPEN-3 in `CLAUDE.md`.

The burger menu lists the four destinations. Three are disabled and say why;
only **Load new version** works. It clears the cached app shell and reinstalls
it, and it refuses to run offline — deleting the precache with no network would
leave nothing to reinstall from. Rounds live in IndexedDB and are never touched.

## Running it

```sh
npm install     # also vendors the PGlite runtime into vendor/
npm start       # http://127.0.0.1:8080
```

`vendor/` is generated, not committed: it is 17 MB of binary WASM per version.
`npm install` reproduces it from the version pinned in `package-lock.json`.

## The one rule

> **Online capabilities may depend on offline capabilities. Never the reverse.**

`src/offline/` works with no network. `src/online/` may import from it; the
reverse fails the build. ESLint enforces both halves — forbidden imports _and_
network calls from the offline core.

The acceptance test: delete `src/online/` and the offline core must still run.
If it cannot, the app can no longer be trusted on a course with no reception,
which is quality goal 1.

## Quality signals

Each answers a question that reading the code cannot. All run in CI.

| Command                | Signal              | Tool                              |
| ---------------------- | ------------------- | --------------------------------- |
| `npm run lint`         | Style + security    | ESLint, eslint-plugin-security    |
| `npm run format:check` | Style               | Prettier                          |
| `npm run typecheck`    | Static bug patterns | TypeScript over JSDoc (`checkJs`) |
| `npm run duplication`  | Copy-paste          | jscpd                             |
| `npm audit`            | Vulnerable deps     | npm                               |
| `npm run signals`      | All of the above    | —                                 |

## Deployment

CI publishes to GitHub Pages from `main`, after every signal and both offline
suites pass.

```sh
npm run site    # assemble _site/ — a copy, not a build
```

The app uses **only relative paths**. GitHub Pages serves a project repository
under `/<repo>/`, so anything rooted at `/` would resolve outside the app —
including the service worker scope and the PGlite WASM. `npm run test:e2e:pages`
runs the offline suite against that exact layout, which is what stops a green
build from publishing a broken app.

## Tests

```sh
npm run test:unit       # migrations, precache manifest
npm run test:e2e        # offline cold start in a real browser
npm run test:e2e:pages  # the same, mounted at /golftrainer/ as Pages serves it
```

The end-to-end suite is the only thing that can verify the offline goal: it
loads the app, cuts the network, closes the page, and reopens it. If that ever
fails, the central promise of the product is broken.

Where a browser is preinstalled rather than downloaded by Playwright, point at
it: `CHROMIUM_PATH=/path/to/chromium npm run test:e2e`.
