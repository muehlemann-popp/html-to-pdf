# Dependency upgrade plan

**Status:** not started.

Every runtime dependency of this service is several majors behind, and the Node line it builds on
has been out of support since 2023. This plan is the ordered route back to current, split so each
step is a reviewable pull request on its own.

| Step | Status |
| --- | --- |
| A1 Capture reference PDFs from the current version | pending |
| A2 Node 19 → 24 (one version, three files) | pending |
| A3 Sentry 7 → 10 (delete `@sentry/tracing`) | pending |
| A4 Patches and minors | pending |
| A5 Puppeteer 19 → 25 | pending |
| A6 Express 4 → 5 | pending |
| A7 `marked` 4 → 18 | pending |
| A8 TypeScript 4.8 → 5.x + fix `tsconfig.json` | pending |
| A9 ESLint 8 → 10 (flat config) | pending |
| A10 Jest 29 → 30, Yarn 3 → 4 | pending |
| A11 CI actions bump + release | pending |

Snapshot taken 2026-08-28 against `main` (`4e3b4b6`). Every "latest" below was read from the npm
registry on that date; every change marked **confirmed** was read from the upstream migration
guide or API docs, not inferred from the version number.

**Node target for the whole plan: 24 (Krypton), currently `24.20.0`** — the latest *active* LTS
(EOL 2028-04-30). Node 26 exists (`26.8.1`) but does not become LTS until October 2026. Node 22
went into maintenance in October 2025.

The current state is worse than "behind": **the service builds on `node:19-alpine`, and Node 19
was an odd-numbered line that was never an LTS at all — it went out of support on 2023-06-01.**
It has had no security patches for three years.

## Four confirmed hard breaks

These are not "expect some deprecations". Each one was verified against upstream and will fail:

1. **`router.get('*', ...)`** in `src/router.ts` (the 404 catch-all). Express 5 uses
   path-to-regexp 8, which removed the bare `*` wildcard. Per the Express 5 migration guide it
   becomes `'/*splat'`, or `'/{*splat}'` if it must also match `/`. → A6
2. **`Handlers.requestHandler()` / `Handlers.errorHandler()` and
   `Integrations.Express` from `@sentry/tracing`** in `src/app.ts`. Both the handler API and the
   whole `@sentry/tracing` package were removed at Sentry v8. → A3
3. **`page.pdf()` and `page.screenshot()` now return `Uint8Array`, not `Buffer`.** Confirmed
   against the current Puppeteer API docs (`pdf(options?): Promise<Uint8Array>`). Three places
   in this codebase assume `Buffer`: the `Promise<Buffer>` return type of `capture()`, the
   `as Buffer` cast on the screenshot path, and — the one that actually misbehaves at runtime —
   `buffer.toString()` in the `/selfcheck` route plus `res.status(200).send(result)` in
   `src/util/capture-return.ts`. Express serialises a `Uint8Array` differently from a `Buffer`,
   so this can silently return JSON-ish garbage instead of a PDF rather than throwing. → A5
4. **`tsconfig.json` has `"module": "NodeNext"` with `"moduleResolution": "Node"`.** TypeScript 5
   rejects that combination outright (`NodeNext` requires `nodenext` resolution). It also targets
   `ES5` for a Node service, which is pointless and costs bundle size. → A8

## Verification gate

Every step ends with the same four commands. A step is not done until all four pass:

```
yarn lint --max-warnings 0
yarn test                       # 4 spec files: 3 unit, 1 acceptance (supertest)
yarn build                      # webpack → build/main.prod.js
docker build --file deploy/Dockerfile --target test --tag html-to-pdf .
```

The test suite is small (`test/unit/` ×3 + `test/acceptance/app.test.ts`), so it is a smoke
check, not a safety net. **The real gate is visual PDF comparison** — see A1.

One branch and one PR per step.

---

## A1 — Capture reference PDFs first

Do this before touching anything. A six-major Chromium jump changes text layout, font
fallback, page-break behaviour and image scaling. Nothing in the test suite checks that a
rendered document still *looks* right, so the baseline has to be captured while the current
version is still running.

Render and keep, from the running service:

- a single-page document, the ordinary case;
- a document that exercises whatever the rendering actually depends on — web fonts, a CJK or
  emoji glyph, a background image, a CSS `@page` rule, an explicit page break;
- a long document (≥20 pages), where page-break behaviour and pagination show up;
- one `/screenshot` call, since that is a separate code path with its own defaults.

Keep the exact request bodies next to the outputs so they can be replayed against the upgraded
service. Compare page count, page size, and a visual diff of the first, a middle and the last
page after A5.

Also note what `/selfcheck` currently asserts, because it is a de-facto contract with whatever
runs the container — it is the obvious readiness probe:

```ts
pdfStr.startsWith('%PDF-1.4') && pdfStr.includes('/Creator (Chromium)') && pdfStr.endsWith('%%EOF')
```

All three are assumptions about Chromium's PDF writer. If a newer Chromium emits a different
PDF version header or creator string, the readiness probe fails and **the container never
becomes ready** — with a perfectly healthy service inside. Re-verify these three strings against the new
Chromium as part of A5, and consider loosening the version check to `%PDF-1.` while you are
there.

## A2 — Node 19 → 24

There are **three** places that state a Node version, and today all three disagree:

| File | Says | Should say |
| --- | --- | --- |
| `package.json` → `engines.node` | `~16` | `~24` |
| `.nvmrc` | `v19.0.1` | `24` |
| `deploy/Dockerfile` | `FROM node:19-alpine` | `node:24-alpine` |

`.nvmrc` is what `Taskfile.yml` feeds to `nvm use` for every local task, so a developer's
toolchain and CI's image are currently two different majors.

The fragile part of this step is not Node, it is the Chromium install in the same base stage:

```dockerfile
apk add --no-cache chromium ttf-freefont font-noto-emoji \
  && apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/edge/testing font-wqy-zenhei
```

Two things to watch. `node:24-alpine` is a newer Alpine, so the `chromium` package version
changes with it — which means **A2 already moves Chromium**, before Puppeteer does. And pulling
`font-wqy-zenhei` from `edge/testing` against a stable Alpine base is unpinned by construction;
it may simply stop resolving. If it does, pin it or vendor the font.

Because A2 moves Chromium, run the A1 comparison after this step too, not only after A5.

Also update `@types/node` from 18 to **24** here — pin it to the runtime major, not to npm's
`latest` (which is 26), so the type surface matches what actually runs.

## A3 — Sentry 7 → 10

`@sentry/node` `^7.19.0` → 10.71.0, and **`@sentry/tracing` deleted** — it was folded into
`@sentry/node` at v8 and is a no-op package today.

`src/app.ts` needs rewriting, not bumping. Current shape:

```ts
import { init as sentry, Handlers as SentryHandlers } from '@sentry/node'
import { Integrations as SentryTracing } from '@sentry/tracing'
// ...
integrations: [new SentryTracing.Express({ app })]
app.use(SentryHandlers.requestHandler())
appConfigure()
app.use(SentryHandlers.errorHandler())
```

In Sentry 8+ the request handler is gone (instrumentation is automatic) and the error handler is
`Sentry.setupExpressErrorHandler(app)`. The other structural requirement: **`Sentry.init()` must
run before Express is imported**, which normally means a separate instrumentation module
imported first. With webpack bundling everything into one file, verify the import order actually
survives the bundle — check that a thrown error still reaches Sentry, don't assume.

Keep the `/debug-sentry` route; it is exactly the tool for verifying this step.

While here: the `if (SENTRY_DSN)` branch means the app configures Express **differently** with
and without Sentry. Once the request handler is gone, that branch can collapse to a single
`appConfigure()` plus a conditional error handler — simpler, and it removes a case where a run
with a DSN and a run without one are structurally different apps.

## A4 — Patches and minors

Mechanical. `prom-client` `^14.1.0` → 15.1.3 (used by `src/controller/metrics.ts` and the
`/metrics` route), `body-parser`, `@types/*`, `terser-webpack-plugin`, `webpack` within 5.x,
`ts-loader`, `ts-node`, `env-cmd`, `nodemon` 2 → 3, `supertest` 6 → 7 (+ `@types/supertest`),
`prettier` 2 → 3.

`prettier` 3 changes default formatting; do the reformat as its own commit.

## A5 — Puppeteer 19 → 25

`puppeteer` and `puppeteer-core` `19.2.2` → 25.9.0. Six majors, and `engines.node >= 22.12`
gates it on A2. One consumer: `src/controller/capture.ts`.

### What needs to change in that file

- **Return types.** `capture()` declares `Promise<Buffer>`; `page.pdf()` and `page.screenshot()`
  now return `Uint8Array`. Change the signature to `Uint8Array`, drop the `as Buffer` cast, and
  fix the two consumers: `res.send()` in `src/util/capture-return.ts` (wrap in
  `Buffer.from(...)` for Express) and `buffer.toString()` in the `/selfcheck` route.
- **`import Buffer from 'buffer'`** is importing the *module* as a default export, not the
  `Buffer` class — it works only because nothing calls a method on it. Delete it; `Buffer` is a
  global.
- **`headless: true`.** Puppeteer switched `true` to mean the new headless implementation. The
  new mode renders differently from old headless in ways that matter for print. This is the
  single biggest source of PDF diff in this step.
- **The launch args list.** 20 flags, several of which are worth re-checking against a modern
  Chromium: `--single-process` together with `--no-zygote` is called out in the code as "adds
  about 30% of speed" but is a known source of instability in newer Chrome;
  `--disable-features=...BlinkGenPropertyTrees...` names a feature that no longer exists;
  `--font-render-hinting=none` directly affects text rendering and must be kept for output
  stability. Do not clean this list up in the same PR as the version bump — one variable at a
  time.
- **`page.waitForNavigation()` used alongside `page.setContent()`.** The pattern here starts the
  navigation promise, calls `setContent`, then awaits — fragile across versions. Newer Puppeteer
  supports `setContent(html, { waitUntil })` directly, which is what this code is emulating.
  Prefer that, and verify the `document.fonts.ready` handle afterwards still resolves.
- **`ScreenshotOptions` typing.** `src/interface.ts` intersects Puppeteer's `ScreenshotOptions`
  with a local `CustomScreenshotOptions`, and passes `encoding: 'binary'`. Both the option name
  and the type have moved; expect type errors here.
- **`PuppeteerLifeCycleEvent`** is still exported, but confirm the four-value default
  (`domcontentloaded`, `load`, `networkidle2`, `networkidle0`) still behaves the same — awaiting
  all four is unusual and was presumably tuned deliberately.

### Environment

`PUPPETEER_SKIP_DOWNLOAD=1` and `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser` mean the
service uses Alpine's Chromium, not a Puppeteer-managed one. Confirm the path still exists in
the new base image (`/usr/bin/chromium-browser` vs `/usr/bin/chromium` has changed in Alpine
before), and confirm the Alpine Chromium version is within Puppeteer 25's supported range — a
too-old browser against a new client fails in the CDP handshake, which is an obscure error to
debug.

`CHROME_BIN` and `CHROME_PATH` are also set. Check whether anything still reads them; they look
like leftovers from the `zenika/alpine-chrome` base that commit `4e3b4b6` removed.

## A6 — Express 4 → 5

`^4.18.2` → 5.2.1. `src/app.ts`, `src/router.ts`, `src/util/capture-return.ts`.

- **`router.get('*', ...)` → `router.get('/*splat', ...)`** — confirmed hard break, see above.
- `router.use('/favicon.ico', express.static('favicon.ico'))` — `express.static` takes a
  *directory*; passing a file works by accident. Re-verify under 5, or serve it with
  `res.sendFile`.
- `body-parser` is a direct dependency and `json()` is imported from it. Express 5 ships
  `express.json()`; prefer that and drop the dependency, including `@types/body-parser`.
- Express 5 changes how rejected promises in handlers surface. Every route here is an
  `async (req, res)`, and errors are caught internally by `logRequest` /
  `processRequestError` — but the `/debug-sentry` route deliberately throws synchronously. Check
  it still reaches Sentry after both A3 and A6.
- `res.attachment()` / `res.contentType()` / `res.send(Buffer)` in `capture-return.ts` should be
  unaffected, but this is where the A5 `Uint8Array` change lands, so test the two together.

## A7 — `marked` 4 → 18

Fourteen majors, one call site: the `/` route in `src/router.ts`, which renders the top-level
`README.md` as the service's own landing page.

Two things to decide before bumping:

- **`marked` has been ESM-only since v5.** This is a CommonJS webpack build
  (`libraryTarget: 'commonjs2'`, `target: 'async-node'`). Either configure webpack to handle
  the ESM dependency, or — given the call site is one line rendering one static file — drop
  `marked` entirely and serve pre-rendered HTML or plain text.
- **`marked()` gained an async path**; the synchronous call returns a `string | Promise<string>`
  union in newer versions, which will not satisfy the template literal without handling.

Once on 18, delete `@types/marked` — marked ships its own types now, and the `@types` package
is what forces it into `dependencies` rather than `devDependencies` today.

Given the cost/benefit here, "delete `marked` and inline the landing page" is the recommended
option, not the fallback.

## A8 — TypeScript 4.8 → 5.x and fix `tsconfig.json`

`typescript` `^4.8.4` → latest 5.x. npm's `latest` tag is **7.0.2**; treat TypeScript 7 as a
separate evaluation (it is a new compiler implementation, not a version bump) and do not pick it
up implicitly by running `ncu -u`.

`tsconfig.json` needs three fixes, and the first is a hard error on TS 5:

| Setting | Now | Should be |
| --- | --- | --- |
| `module` / `moduleResolution` | `NodeNext` / `Node` | `NodeNext` / `NodeNext`, or `CommonJS` / `Node10` — the current pair is rejected |
| `target` | `ES5` | `ES2023` or later. This is a Node 24 service; ES5 output is dead weight and defeats native async |
| `paths` | includes `"*": ["*", "@types/*"]` | drop it — it predates `@types` auto-discovery and hides missing type packages |

Also bump `@typescript-eslint/*` from 5.x in the same step; they are versioned against the
TypeScript they parse.

## A9 — ESLint 8 → 10 (flat config)

`eslint` `^8.27.0` → 10.9.1 (`engines.node ^20.19 || ^22.13 || >=24`). This is its own project,
not a bump, and the current `.eslintrc.js` has three separate problems:

- **Flat config.** ESLint 9 made `eslint.config.mjs` the default and 10 drops `.eslintrc`
  support, so `.eslintrc.js` has to be ported, not edited.
- **`eslint-config-airbnb-base` + `eslint-config-airbnb-typescript`.** Check whether both have a
  flat-config entry point before committing to them. This is the real risk in this step: if they
  do not, the choice is a compatibility shim or switching the rule base (e.g. to
  `typescript-eslint`'s own recommended set plus the handful of rules this repo actually
  customises — `semi: never`, `max-len: 120`).
- **`'@typescript-eslint/semi'`** was removed from typescript-eslint at v7 along with the other
  formatting rules. Delete that rule; Prettier already owns it.

Note also that `extends: ['prettier', 'airbnb-base', ...]` lists `eslint-config-prettier`
**first**, so Airbnb's stylistic rules override the disables it is there to apply. It should be
last. Fix while migrating.

## A10 — Jest 29 → 30 and Yarn 3 → 4

- `jest` `^29.3.1` → 30.5.0, `ts-jest` → 29.4.12, `@types/jest` → 30.
  `jest.config.ts` is minimal (`preset: 'ts-jest'`, `testEnvironment: 'node'`,
  `slowTestThreshold: 30000`, one `moduleNameMapper`), so this should be uneventful.
- `yarnPath: .yarn/releases/yarn-3.2.4.cjs` → Yarn 4. Note `.yarnrc.yml` carries three
  `packageExtensions` workarounds (`debug` → `supports-color`, `html-to-pdf` → `cookie`+`tslib`,
  `ws` → `bufferutil`+`utf-8-validate`). Re-test whether any are still needed after the
  dependency bumps — the `html-to-pdf@*` self-extension in particular looks like it is patching
  around a peer-dependency problem that A5/A6 may remove.
- `.npmversion` says `8.19.2` and nothing appears to read it. Confirm and delete.

## A11 — CI actions bump and release

`.github/workflows/`:

| Action | Pinned | Note |
| --- | --- | --- |
| `actions/checkout` | v3 | → v6 |
| `docker/setup-qemu-action` | v2 | → latest |
| `docker/setup-buildx-action` | v2 | → latest |
| `docker/metadata-action` | v4 | → latest |
| `tonistiigi/binfmt` | `qemu-v6.2.0` | Pinned QEMU image for the arm64 cross-build. Re-verify or unpin |

`docker-bake.hcl` builds `linux/amd64` and `linux/arm64/v8` from the `prod` target — check that
the arm64 build still works after the Chromium/Alpine change. It is the leg most likely to break
silently: Alpine ships different Chromium builds per architecture, and CI cross-builds it under
QEMU rather than natively.

Then tag a release. `release.yml` publishes on pushes to `main` and on `v*` tags, emitting
semver, major.minor, major and `git-<sha>` tags. **Treat this as a semver major.** The image is
public and MIT-licensed, so assume there are users who pin it and will not read the diff: the
minimum supported Node version changes, the rendering engine changes, and `/selfcheck` may assert
different strings. Say all three in the release notes.

---

## Not in scope

| Thing | Why not |
| --- | --- |
| TypeScript 7 | A new compiler implementation. Evaluate separately once 5.x is green. |
| Dropping webpack for `tsc` or `esbuild` | Defensible — the bundle exists only to make the Docker image a single file — but it is a build-system change, not a dependency upgrade. Worth an ADR. |
| Rewriting the `--single-process` launch args | Touches PDF output and stability at the same time as Puppeteer does. Separate change, with the A1 references as the check. |
| The Browserless code path | `BROWSERLESS=1` is a local-debug path. Leave it, but stop the README implying it is the normal way to run the service. |
| Anything outside this repository | Whatever deploys this image pins a tag; bumping that pin is the deployer's step, not part of this plan. |

## If you only do three things

1. **A1** — capture the reference PDFs. Everything else in this plan is verifiable only against
   them, and once Node moves you cannot go back and take them.
2. **A2 + A3** — get off an unsupported Node line, and delete a Sentry package that has not
   existed for two majors. Both are small and both are pure risk reduction.
3. **A5** — Puppeteer 19 drives a 2022 Chromium, and callers send it 2026 HTML and CSS. That is
   the actual product risk: the input keeps moving, the renderer does not.
