# Development

TCGPlus is a plain Manifest V3 extension with no build step. What ships is the source itself: `manifest.json`, `lib.js`, `storage.js`, `content.js`, `content.css`, `background.js`, the icons and the options page.

## Setup and local checks

```sh
npm install              # once; also installs the husky pre-commit hook
npx playwright install   # once, for the e2e suite
npm run check            # the gate: format, lint, typecheck, unit, e2e
```

`npm run check` is what the pre-commit hook and CI run, so if it passes locally, CI will pass too. To run one part at a time while you work, use `npm run format`, `npm run lint`, `npm run typecheck`, `npm test` or `npm run test:e2e`.

## Running a dev build alongside the production extension

```sh
npm run dev:build        # writes .dev/ with a dev-flavoured manifest
```

In Chrome, open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick the `.dev/` directory. The dev build appears as **TCGPlus (dev)**, with its own extension ID and its own storage. Turn the production extension off while you test.

The files in `.dev/` are copies, not symlinks, because Chrome on macOS silently refuses to load content scripts through symlinks. After you edit source files, run `npm run dev:build` again and click reload on the unpacked extension.

## Tests

- `tests/`: Node `--test` unit tests for the pure helpers in `lib.js`. Every new helper needs a test.
- `e2e/`: Playwright tests that load the unpacked extension into headless Chromium and run the content script and options page against mocked TCGplayer pages. They cover the panel, chips, cart and checkout verdicts, filters and the out-of-stock banner.

## Checking selectors against the live site

TCGplayer changes its pages without warning. `npm run audit:selectors` loads the extension into headless Chromium, visits one live page of each type (product, filtered product, search grid, single-seller search, seller storefront), and reports PASS or FAIL for every selector the extension depends on. Run it when chips or badges go missing, and before a release. It uses the live site, so it doesn't run in CI.

## CI

Every pull request must pass:

- **Validate**: manifest checks, JS syntax, Prettier, ESLint, and `tsc --checkJs` over the JSDoc types.
- **Test**: the Node unit tests.
- **E2E**: the Playwright suite.
- **CodeQL**: static analysis.
- **Conventional commits**: the PR title must be a Conventional Commits string, since it becomes the squash-merge commit on `main`.

## Releases

Releases are tag-driven, with manual version bumps. `npm run release -- X.Y.Z` bumps the version in `manifest.json` and `package.json` together. After the release PR merges, pushing a `vX.Y.Z` tag builds the zip, creates a GitHub Release with generated notes, and publishes to the Chrome Web Store.

The agent workflow (branching, issues, keeping the Deal math in sync) is in [CLAUDE.md](../CLAUDE.md).
