---
name: npm-bce-layout
description: Structures Node.js/npm projects using Spring Boot and Gradle conventions - src/main plus src/test/unit and src/test/e2e, reverse-domain package folders such as de.roeselert.order, and Boundary-Control-Entity-View layering. Use this skill whenever the user sets up a new npm or Node project, adds a feature or component to one, asks where a file belongs, wires up package.json scripts, configures node:test, or mentions Spring Boot, Gradle or Maven layout, BCE, boundary/control/entity, or "de.roeselert" - even if they never name this convention explicitly. Also use when reviewing or refactoring an existing Node project toward this structure.
---

# npm project layout: Spring Boot conventions on Node

This skill applies the Maven/Gradle source layout and Adam Bien's Boundary-Control-Entity
pattern to plain-JavaScript (ESM) Node projects. Target stack: **Node 22+, ESM, `node:test`,
esbuild**. The project is a **monolith**: one Node process serves the API and the bundled
frontend assets.

## Directory layout

Always use this exact skeleton. `<component>` is a business capability (`order`, `billing`,
`customer`) - never a technical layer name (`utils`, `services`, `models`).

```
<project>/
├── package.json
├── build.mjs                       # build script (the "Gradle build task")
├── src/
│   ├── main/
│   │   └── de/roeselert/
│   │       ├── Application.mjs     # composition root: wires boundaries, starts server
│   │       └── <component>/
│   │           ├── boundary/       # HTTP routes, handlers, public API of the component
│   │           ├── control/        # business logic, orchestration
│   │           ├── entity/         # data structures, validation, persistence
│   │           └── view/           # static index.html, css, client-side js
│   └── test/
│       ├── unit/
│       │   └── de/roeselert/<component>/{boundary,control,entity}/
│       └── e2e/
│           └── de/roeselert/<component>/
└── dist/                           # build output, git-ignored
    ├── static/<component>/         # bundled view assets
    └── ...
```

The test trees **mirror the main tree** package-for-package, exactly like Maven. A test for
`src/main/de/roeselert/order/control/PriceCalculator.mjs` lives at
`src/test/unit/de/roeselert/order/control/PriceCalculator.test.mjs`. This mirroring is the
whole point - it makes "where is the test for X" a mechanical question instead of a search.

Use the `.mjs` extension throughout, or set `"type": "module"` in package.json and use `.js`.
Pick one and stay consistent; mixing them is the main source of ESM resolution pain.

## The four layers

Each layer has one job. Keeping them separate is what makes components independently
testable and replaceable.

| Layer | Contains | Depends on | Naming |
|---|---|---|---|
| `boundary` | HTTP route registration, request/response mapping, the component's exported facade | control, entity | `OrderResource.mjs`, `OrderBoundary.mjs` |
| `control` | Business rules, orchestration, pure functions | entity | `PriceCalculator.mjs`, `OrderService.mjs` |
| `entity` | Data shapes, invariants, validation, repository/persistence | nothing in the component | `Order.mjs`, `OrderRepository.mjs` |
| `view` | `index.html`, css, browser js for this component | nothing server-side | `index.html`, `order-form.mjs` |

Files use PascalCase when they export a class or a single cohesive module (`Order.mjs`),
matching Java conventions. Client-side view files use kebab-case (`order-form.mjs`) since
they are web assets, not packages.

### Dependency rules

These four rules keep the structure from decaying into a folder-shaped mud ball:

1. **Cross-component imports go through `boundary` only.** `billing/control/*` may import
   `order/boundary/OrderBoundary.mjs`, never `order/control/*` or `order/entity/*`.
2. **Within a component, dependencies point inward**: boundary → control → entity. Never
   the reverse. An entity that imports from control is a design smell.
3. **`entity` has no framework imports.** No Express, no HTTP, no config. This is what makes
   entities trivially unit-testable.
4. **`Application.mjs` is the only place that knows all components.** It imports each
   component's boundary, registers routes, and starts the server.

Truly shared code goes in `de/roeselert/common/` with the same BCE layering - but resist it.
Two components needing the same helper is usually a sign a third component is hiding there.

## Imports: no `../../../..`

Deep relative imports are the one place where the Java package layout hurts in Node. Solve it
with the `imports` field in package.json (subpath imports), which gives you Java-style absolute
imports:

```json
{
  "imports": {
    "#de/*": "./src/main/de/*"
  }
}
```

Then everywhere - in main and in tests - write:

```js
import { Order } from '#de/roeselert/order/entity/Order.mjs';
```

This is native Node resolution, needs no build step, no tsconfig paths, and no bundler alias
for server code. Always set this up when initializing the project; adding it later means
rewriting every import.

## package.json

Model the scripts on Gradle's task names so the muscle memory transfers.

```json
{
  "name": "<project>",
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22" },
  "imports": {
    "#de/*": "./src/main/de/*"
  },
  "scripts": {
    "clean": "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\"",
    "build": "node build.mjs",
    "test": "node --test \"src/test/unit/**/*.test.mjs\"",
    "e2e": "node --test --test-concurrency=1 \"src/test/e2e/**/*.test.mjs\"",
    "check": "npm run test && npm run e2e",
    "start": "node src/main/de/roeselert/Application.mjs",
    "dev": "node --watch src/main/de/roeselert/Application.mjs"
  },
  "devDependencies": {
    "esbuild": "^0.25.0"
  }
}
```

Notes on the scripts:

- Pass a **quoted glob**, not a bare directory. `node --test src/test/unit/` fails with
  `MODULE_NOT_FOUND` because Node treats a positional path as a file to execute; the glob
  form is what actually recurses. Node expands the glob itself, so the quotes matter - an
  unquoted pattern gets mangled by the shell.
- Splitting unit and e2e is just two globs over the mirrored tree. No test runner config
  file and no extra dependency - the main reason `node:test` suits this layout.
- E2E runs with `--test-concurrency=1` because e2e tests usually share a port, a database,
  or a browser and will flake if run in parallel. The e2e tests set `process.env.PORT = '0'`
  themselves before importing the app, so the OS picks a free port and the suite never
  collides with a running dev server - doing it in the test rather than as an inline env
  var in the script keeps it working on Windows.
- `check` mirrors Gradle's `check` task: everything that must pass before merging.
- `clean` uses `node -e` rather than `rm -rf` so it works on Windows too. `node -e` runs as
  CommonJS even when `"type": "module"` is set, so `require` is correct there.

## The build script

`build.mjs` is the Gradle `build` task: bundle each component's view into
`dist/static/<component>/` and copy its HTML. Server code is plain ESM and needs no
compilation.

```js
import { build } from 'esbuild';
import { readdirSync, existsSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const MAIN = 'src/main/de/roeselert';
const OUT = 'dist/static';

const components = readdirSync(MAIN, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(MAIN, d.name, 'view')))
  .map((d) => d.name);

for (const component of components) {
  const viewDir = join(MAIN, component, 'view');
  const outDir = join(OUT, component);
  mkdirSync(outDir, { recursive: true });

  const entry = join(viewDir, `${component}-view.mjs`);
  if (existsSync(entry)) {
    await build({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: 'esm',
      outfile: join(outDir, 'bundle.js'),
    });
  }
  cpSync(join(viewDir, 'index.html'), join(outDir, 'index.html'));
}

console.log(`Bundled ${components.length} component view(s)`);
```

The convention is discovery-based: drop a new component folder with a `view/` directory and
the build picks it up. No central registry to update.

`Application.mjs` then serves `dist/static` and mounts each component's boundary. In
development, serving `src/main/de/roeselert/<component>/view` directly (unbundled) keeps the
edit-reload loop fast.

## Adding a component

Use the bundled scaffolder to create the full tree with stub files and mirrored test folders:

```bash
node scripts/scaffold-component.mjs <component-name>
```

Read `scripts/scaffold-component.mjs` before running it if the project deviates from the
default layout (different domain than `de.roeselert`, `.js` instead of `.mjs`) - the constants
at the top are meant to be adjusted.

If creating by hand, create all four layer folders even when some start empty except for the
ones that make no sense (a component with no UI has no `view/`), plus the matching
`src/test/unit/...` folders. Empty layer folders communicate intent and stop people from
inventing ad-hoc locations later.

## Worked example

For a complete component - `Order` with routes, service, entity, view, and both test types
written out in full - read `references/example-component.md`. Consult it when the user wants
to see how the layers actually talk to each other, or when generating a first component in a
fresh project.

## Applying this to an existing project

When migrating, move in this order so the project keeps running at each step:

1. Add `"type": "module"` and the `imports` map to package.json.
2. Create `src/main/de/roeselert/` and move code component by component, starting with the
   most isolated one.
3. Rewrite that component's imports to `#de/...` as you move it.
4. Mirror its tests into `src/test/unit/de/roeselert/...`.
5. Repeat, then delete the old directories and update the scripts.

Do not attempt a big-bang move of every file at once - the import rewrites are where mistakes
hide, and moving one component at a time keeps `npm run check` green throughout.
