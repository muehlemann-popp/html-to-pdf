# AGENTS.md

Express + Puppeteer service that renders HTML or a URL to PDF/PNG, shipped as the public Docker
image `muehlemannpopp/html-to-pdf`. `README.md` is the user-facing API doc and is also served at `/`;
contributor docs live in [`docs/`](docs/README.md) — read its index, and update docs in the same change.

## Commands

```bash
yarn lint --max-warnings 0
yarn test                     # vitest; acceptance tests need a Chromium (see below)
yarn build                    # webpack -> build/main.prod.js, the only file the image runs
docker build --file deploy/Dockerfile --target test --tag html-to-pdf:test .
docker run --rm html-to-pdf:test yarn test      # what CI runs, with the image's Chromium
node scripts/benchmark.mjs <image> <out-dir>    # memory/latency + reference outputs per image
```

Node 26 (`.nvmrc`). Yarn comes from Corepack (`npm install --global corepack@0.36.0 && corepack
enable yarn`), which runs the `packageManager` version and the release committed in `.yarn/releases`;
never install Yarn classic. Locally, puppeteer never downloads a browser (`enableScripts: false`);
point it at one with `PUPPETEER_EXECUTABLE_PATH`, or run tests in the `test` image.

## Rules

- **Dependencies must be at least 14 days old.** `.yarnrc.yml` enforces it (`npmMinimalAgeGate`);
  never lower or bypass it, and do not pin a version younger than that.
- **Chromium comes from Alpine, not from puppeteer**: the `chromium-headless-shell` package
  ([ADR 0001](docs/adr/0001-chromium-headless-shell.md)). The `node:*-alpine3.XX` tag in
  `deploy/Dockerfile` decides the Chromium major; keep `puppeteer` in `package.json` on the release
  that targets the same major (its `PUPPETEER_REVISIONS`).
- **Rendering changes need evidence.** Any change to Chromium, puppeteer, launch flags or fonts:
  run `scripts/benchmark.mjs` against the old and new image and compare the outputs of
  `test/reference/requests/` (page count, size, visual diff) and the memory numbers.
- `/selfcheck` is the readiness probe of every deployment; do not tighten what it asserts.
- Failures of the page the caller asked for become a `TargetError` (`src/util/target-error.ts`,
  400/502/504, no retry, no restart); everything else is a service failure (500, one retry, then
  the process exits and `deploy/docker-entrypoint.sh` restarts it). Keep that split when adding
  error handling; the acceptance tests fail if a caller error makes the process exit.
- One shared browser, one `BrowserContext` per request (`src/controller/browser.ts`,
  [ADR 0002](docs/adr/0002-shared-browser.md)). Never let a capture touch another request's context,
  and always release the lease, also on errors. Launch flags are measured: `--single-process` and
  `--in-process-gpu` crash Chromium 155; read ADR 0001/0002 before adding any.
- Conventional commit prefixes (`feat:`, `fix:`, `docs:`, `chore:`); one topic per pull request.
