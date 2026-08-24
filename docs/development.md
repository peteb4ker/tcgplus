# Development

TCGPlus is a plain Manifest V3 extension with no build step. The published artifact is the source files: `manifest.json`, `lib.js`, `storage.js`, `content.js`, `content.css`, `background.js`, plus the icons and options page.

## Setup and local checks

```sh
npm install              # once; also installs the husky pre-commit hook
npx playwright install   # once, for the e2e suite
npm run check            # the gate: format, lint, typecheck, unit, e2e
```

`npm run check` is what the pre-commit hook runs and what CI runs. A clean local check means CI will pass. Individual slices are available while iterating: `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`.

## Running a dev build alongside the production extension

```sh
npm run dev:build        # writes .dev/ with a dev-flavoured manifest
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked** → pick the `.dev/` directory. The dev build shows as **TCGPlus (dev)** with its own extension ID and isolated storage; toggle the production extension off while testing.

Files in `.dev/` are copies, not symlinks — Chrome on macOS silently refuses to load content scripts through symlinks. After editing source files, rerun `npm run dev:build` and click reload on the unpacked extension.

## Tests

- `tests/` — Node `--test` unit tests covering the pure helpers in `lib.js`. Every new helper gets a test.
- `e2e/` — Playwright tests that load the unpacked extension into headless Chromium and exercise the content script and options page against mocked TCGplayer routes: panel, chips, cart and checkout verdicts, filters, and the out-of-stock banner.

## Checking selectors against the live site

TCGplayer's DOM changes without warning. `npm run audit:selectors` loads the extension into headless Chromium, visits one live page per page type (product, filtered product, search grid, single-seller search), and reports PASS/FAIL for every selector the extension depends on. Run it when chips or badges go missing, or before a release. It hits the live site, so it stays out of CI.

## CI

Every pull request runs, and must pass:

- **Validate** — manifest schema sanity, JS syntax, Prettier, ESLint, and `tsc --checkJs` over the JSDoc types.
- **Test** — the Node unit tests.
- **E2E** — the Playwright suite against mocked TCGplayer routes.
- **CodeQL** — static analysis.

## Releases

Releases are tag-driven with manual version bumps. `npm run release -- X.Y.Z` bumps `manifest.json` and `package.json` in lockstep; after the release PR merges, pushing a `vX.Y.Z` tag builds the zip, creates a GitHub Release with auto-generated notes, and publishes to the Chrome Web Store.

The agent-facing workflow (branching, issue conventions, deal-math sync rules) lives in [CLAUDE.md](../CLAUDE.md).
