# CLAUDE.md

Steering for AI agents working on TCGPlus.

## What this project is

> **TCGPlus reduces the friction of using TCGPlayer.com so it's easier to find and buy cards.**

That single sentence is the project's mandate. Every PR should be evaluated against it. If a feature doesn't make finding or buying cards on TCGplayer easier, it's out of scope.

TCGPlus achieves this by **adding to and removing parts of the TCGplayer UI** to improve usability. We are a usability layer on top of someone else's site.

### Out of scope (do not propose)

- Decklist building, collection tracking, sealed product tracking, scrying, anything that competes with separate apps.
- Anything that requires a server, a database, or a third party (analytics, error tracking, A/B testing, feature flags).
- Anything that interacts with sites other than `tcgplayer.com`.

## Privacy is non-negotiable

**No analytics. No servers. Ever.**

The only network calls TCGPlus makes are to TCGplayer's own APIs (currently `seller-stores-backend.tcgplayer.com` and `mpgateway.tcgplayer.com`). All state lives in the user's `localStorage`. Nothing is logged anywhere outside the user's browser.

If a future feature genuinely needs server-side help (e.g. a community price database), it's a separate project, not a TCGPlus feature. Don't add Sentry, don't add a "report a bug" upload button, don't add a CDN-hosted config. Don't.

When you add a new fetch target, add it to `manifest.json` `host_permissions`. New permissions are fine when they enable a feature; they are not fine for the sake of "future use."

## Development loop

For any change — feature, bug fix, chore, docs, infra — this is the standard arc. Each step links forward to a topical section below for the detail.

### 1. Understand before changing

- Bug reports: find root cause before proposing a fix. Don't pattern-match from training data — confirm with code reading or a live probe.
- Feature requests: nail down scope and surface area before writing code. If "is this in scope?" isn't obvious, re-read "What this project is" and "Out of scope". Ask the user if either is still ambiguous.
- Browser-visible symptoms: probe via Playwright in the same environment the recorder or e2e suite uses (`page.evaluate`, `page.locator(...).count()`, `page.screenshot`, `headless: false` + `await page.pause()` for interactive inspection). Do not use the Chrome DevTools MCP. A fresh Playwright session and the user's real Chrome behave differently — cookies, persistent storage, prior URL state — so findings in the MCP-driven session can fail to reproduce in the recorder. The Chrome DevTools MCP also takes over the user's real browser window. The single exception: one-off README screenshot capture from the user's real browser session.
- Be honest about uncertainty. If the diagnosis is a guess or the design is one of several options, say so before branching.

### 2. File the issue (→ "GitHub Issues is the backlog")

- `gh issue create` with one of `feature`/`bug`/`chore`/`docs`/`tech-debt`.
- Body: user-visible symptom or goal, what's been ruled out, acceptance criteria.
- Adjacent problems noticed mid-investigation get their own follow-up issues — never bundled into the current PR.

### 3. Branch (→ "Always work on a feature branch")

- `git checkout main && git pull --ff-only`, then a prefixed branch (`feat/`, `fix/`, `chore/`, `docs/`, `ci/`, `refactor/`, `perf/`, `test/`, `style/`).

### 4. Implement and test

- Smallest diff that does the job. No drive-by refactors.
- Bug fix: write a test that fails on `main` and passes with the fix. Verify both directions — placebo tests that pass trivially are worse than no test at all.
- Feature: tests cover the new behaviour, edge cases plus happy path.
- Chore / docs / infra: tests stay green; new tests aren't usually required unless the change actually alters runtime behaviour.
- Pure helpers go in `tests/`. DOM and cross-cutting behaviour go in `e2e/`.

### 5. Sync user-facing docs

If the change affects what a user sees, does, or notices, the docs catch up in the same PR:

- **README.md** when user-visible behaviour changes — a new feature, a changed setting, a new install/setup step.
- **README screenshots** when the panel, chips, or settings page changes appearance. Retake via `mcp__chrome-devtools__take_screenshot` and replace the file in `docs/images/`. No stale screenshots.
- **`docs/store/listing-description.md`** when the Web Store listing copy needs to match.
- **CLAUDE.md** when the development workflow itself changes (CI gates, hooks, scripts, conventions).
- **Deal-math changes** must update the README in the same commit — that math lives in code and prose and the two must agree.

Pure-internal changes (refactors that don't change behaviour, dep bumps, test-only additions) don't need user-facing doc updates.

### 6. Local gate (→ "Local checks before pushing")

- `npm run check` — chains format/lint/typecheck/unit/e2e. The `.husky/pre-commit` hook runs the same thing automatically on `git commit`, so a clean commit means CI will pass too.

### 7. Commit and push

- Commit message: Conventional Commits prefix matching the branch. Body explains _why_. Reference `Closes #N` so the issue auto-closes on merge.

### 8. Open the PR (→ "Always work on a feature branch")

- Title is a Conventional Commits string — the PR-title linter will fail otherwise. Body has summary, why, test plan, `Closes #N`.
- Queue `gh pr merge <N> --auto --squash --repo peteb4ker/tcgplus` immediately. CI gates the actual merge.

### 9. After the merge lands (→ "After every PR you queued auto-merges")

- Pull main locally, rerun `npm run dev:build` if `.dev/` exists, prompt the user to reload the dev extension if runtime files changed.
- Scan the other open PRs for `mergeStateStatus: DIRTY` — their conflicts may have come from the merge that just landed. For Dependabot PRs comment `@dependabot recreate` (or `@dependabot rebase` if untouched). For human-authored PRs: `gh pr checkout <N>`, merge or rebase against current main, resolve, `git push --force-with-lease`.
- One PR at a time — don't batch the post-merge ritual.

### 10. Confirm and tidy

- Verify `Closes #N` actually closed the issue on GitHub. If the fix only partially resolved it, leave the issue open with a status comment describing what's done and what's left.
- If new follow-up issues surfaced mid-work, double-check they're filed.

## GitHub Issues is the backlog

**Don't propose work out of thin air. Pull from issues.**

Every feature, bug, and chore lives as a GitHub issue on this repo. The issues are the canonical backlog. When you're handed an open-ended ask like "what should we work on next?" or "pick something to improve," do this:

1. List open issues (oldest priority first, then by interaction): `gh issue list --repo peteb4ker/tcgplus --state open --limit 20`.
2. Pick the issue you'll work on. Comment on it stating you're starting, so the user has a record.
3. Work on a feature branch (next section). Reference the issue in the PR body with a closing keyword (`Closes #N`).
4. When the PR merges, the issue closes automatically. If your work didn't fully resolve the issue, leave it open and post a status comment with what's done and what's left.

When the user describes a new feature, bug, or chore in conversation:

- Open an issue first via `gh issue create`. Use one of the labels `feature` / `bug` / `chore` / `docs` / `tech-debt`. Reference where the idea came from if helpful.
- Then either start the work on a branch (with `Closes #N` in the PR body) or stop after creating the issue and let the user prioritize.

When you're partway through work and find an out-of-scope problem, file a new issue with enough context that someone (you, on a later visit) can pick it up cold. Don't sneak unrelated fixes into the current PR.

Keep issue titles imperative and short ("Move settings to a singleton options page"), with the body carrying the why and acceptance criteria.

## Always work on a feature branch

`main` is protected. Required status checks: `Validate`, `Test`, `Analyze (javascript)`. Force-pushing is disabled.

1. Branch off `main` with one of `feat/`, `fix/`, `chore/`, `docs/`, `ci/`, `refactor/`, `perf/`, `test/`, `style/` as the prefix.
2. Open a PR. The **PR title must be a Conventional Commits string** (`feat:`, `fix:`, `chore:`, etc.) — there's a workflow that lints this. The PR title becomes the squash-merge commit on `main`.
3. Use `gh pr merge --auto --squash` to queue auto-merge once checks pass.
4. Don't push to `main` directly. Don't try to bypass the PR flow even when "it's just a one-liner."

## Versioning and releases

Tag-driven, manual version bumps. No release-please, no draft release PR.

When you're ready to ship:

1. Decide on the next semver based on what's landed since the last tag. Roughly: `feat:` → minor, `fix:`/`chore:`/etc → patch, `feat!:` or `BREAKING CHANGE:` → major. Look at `git log $(git describe --tags --abbrev=0)..HEAD --oneline` to see what's queued.
2. On a `chore/release-vX.Y.Z` branch, run `npm run release -- X.Y.Z`. The script bumps both `manifest.json` and `package.json` in lockstep. Open a PR titled `chore: release vX.Y.Z` and merge it.
3. After it's on main, tag and push:
   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
4. `.github/workflows/release.yml` fires on the tag. It builds the zip, creates a GitHub Release with auto-generated notes from the merged PR titles, and (when the four `CWS_*` secrets are present) pushes the zip to the Chrome Web Store.

There is no separate `CHANGELOG.md`. Release notes are auto-generated on the GitHub Releases tab from the merged PRs.

### Chrome Web Store secrets

`release.yml` looks for these four repository secrets and skips the publish step if any is missing:

- `CWS_EXTENSION_ID` — the published extension's ID.
- `CWS_CLIENT_ID` — Google OAuth client ID for the publisher project.
- `CWS_CLIENT_SECRET` — paired secret for the OAuth client.
- `CWS_REFRESH_TOKEN` — minted once via `npx chrome-webstore-upload-keys` against the developer-account login.

Setup is documented in PR #19 / [`docs/store/listing-description.md`](docs/store/listing-description.md). The first publish must be done manually through the developer dashboard so the extension exists in the store; from then on, every `v*` tag publishes automatically.

## Local checks before pushing

```sh
npm install              # once. Also installs the husky pre-commit hook.
npx playwright install   # once, for the e2e suite.
npm run check            # the gate. Chains format/lint/typecheck/unit/e2e.
```

`npm run check` is what `.husky/pre-commit` runs automatically, and it's what CI runs (split across parallel jobs for speed). A clean `npm run check` means CI will pass too. If something fails, fix it locally first.

Individual scripts (`npm run format`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run typecheck`) are still available for iterating on a single slice while debugging.

For UI changes, also reload the unpacked extension on `chrome://extensions` and verify the affected feature on a real TCGplayer product page and search page.

## Local dev build (running alongside the production extension)

Keep the production extension installed (so uninstall events don't show up in CWS analytics) and run the dev build side-by-side:

```sh
npm run dev:build       # writes .dev/ with a dev-flavoured manifest + symlinks
```

Then in Chrome:

1. `chrome://extensions` → enable Developer mode (top right).
2. **Load unpacked** → pick the `.dev/` directory.
3. Toggle the production "TCGPlus" extension off while testing the dev build (and back on when you're done).

The two extensions get different IDs (CWS assigned vs. Chrome-generated) and are shown as **TCGPlus** and **TCGPlus (dev)** so it's obvious which one is which. Storage is isolated per extension ID, so dev settings don't leak into production.

Files inside `.dev/` are copies (not symlinks): Chrome on macOS silently refuses to read content-script JS through symlinks — the extension would load without errors but its scripts wouldn't fire. After editing source files, rerun `npm run dev:build` and click the reload icon on the unpacked extension in `chrome://extensions`.

`.dev/` is gitignored.

### After every PR you queued auto-merges

Once a PR you've been watching lands on `main`, the loaded unpacked dev extension is still running the pre-merge code until `.dev/` is rebuilt. Each time:

1. `git checkout main && git pull --ff-only` so local `main` has the new code.
2. If `.dev/` exists locally, rerun `npm run dev:build`. The script is a cheap recursive copy plus manifest rewrite.
3. If the merge touched any runtime file (`lib.js`, `storage.js`, `content.js`, `content.css`, `background.js`, `manifest.json`, anything under `icons/` or `options/`), tell the user to click the reload icon on the **TCGPlus (dev)** extension in `chrome://extensions` so the new code actually takes effect. Skip the reload prompt for doc-only / test-only / CI-only changes — the rebuild is a no-op visually.

Skip steps 2–3 if `.dev/` isn't present — the user isn't on the dev workflow and only the published extension is in play.

## Definition of done

A PR is ready to merge when:

- All local and CI checks pass.
- **Logic changes have unit tests** in `tests/`. No exceptions. Tests live with the pure helpers in `lib.js`.
- **UI changes update the relevant README screenshot.** If the panel's appearance, the chip layout, or the settings drawer changed, retake the screenshot via `mcp__chrome-devtools__take_screenshot` and replace the file in `docs/images/`. Don't merge a stale screenshot.
- README is updated if user-facing behavior changed.
- **Deal-math changes update the README in the same commit** (see below).

## Deal math must stay in sync between code and README

The "Deal" chip's logic is one of the few things that's hard to verify by reading code alone. It depends on:

- Listing price (from the listing's price element).
- Listing's stated shipping cost.
- Whether the listing has a "Free Shipping on Orders Over $X" promo.
- Per-seller cart subtotal from `mpgateway.tcgplayer.com/v1/cart/<key>/summary`.
- Global free-shipping threshold (currently $5, hard-coded as `FREE_SHIP_THRESHOLD` in `lib.js`).
- Page market price (`.price-points__upper__price` on product pages, `.product-info__market-price--value` / `.product-card__market-price--value` on search pages).

When you change `renderDealChipHtml` or `recomputeDealChips` in `content.js`, update the `Price, shipping, and Deal chips` section of `README.md` in the same commit. The README is the user-facing source of truth.

## Code layout

- **`lib.js`**: pure helpers (parsing, classification, chip color/text). No DOM access, no fetches, no globals beyond function declarations. Loaded as a content script and `require()`'d from tests. Keep it dependency-free.
- **`content.js`**: stateful orchestration (fetches, MutationObservers, panel rendering). Wraps an IIFE; relies on `lib.js`'s top-level functions being in scope. **Don't duplicate helpers here.** If you need a new helper, add it to `lib.js` and write a test.
- **`content.css`**: all styling. Use `tcgplus-` prefixed classes only. Don't style raw TCGplayer classes — that breaks when they reorganize.
- **`manifest.json`**: MV3 manifest. `lib.js` must come before `content.js` in `content_scripts.js`.
- **`tests/`**: Node `--test` unit tests for `lib.js` only. Pure-helper coverage. Add a test for any new helper.
- **`e2e/`**: Playwright tests that load the unpacked extension into Chromium and exercise the content script + options page against mocked TCGplayer routes. Add a test when you change panel rendering, chip placement, cart fetching, or any cross-cutting behavior.

When the **Options page** lands (planned future work), it'll live in its own HTML/JS file referenced from `manifest.json` `options_page`. Settings UI will move out of the floating panel and into that page.

## TCGplayer DOM survival rules

This extension scrapes a Vue-driven SPA. Their DOM changes without warning.

- **`data-v-XXXXXXXX` attributes are Vue scope hashes, not stable identifiers.** Don't use them in selectors. They change on every TCGplayer build.
- **Prefer specific class names** like `.listing-item__listing-data__info__price` over generic ones like `.price`. Specific names are more likely to map to component identity.
- **Get the right selector first.** Fallbacks are acceptable when there's a known ambiguity (e.g. grid view vs. list view), but don't carry 5 fallbacks "just in case." That hides drift.
- **Never re-render in response to your own DOM mutations.** Functions that write to the DOM should be idempotent (compare before set; skip if equal). Treat your own panel's contents as off-limits to the global `MutationObserver` (filter by `closest('.tcgplus-panel')` and by `tcgplus-` prefixed classes on added/removed nodes).

## Degraded-functionality reporting

When a critical selector or fetch fails, **show a visible warning** in the floating panel saying the extension is partially broken on this page. Don't fail silently with a `console.warn` only — the user can't act on a console message, but they can decide whether to trust the rest of the panel.

The user can't fix selector breakage themselves; they just need to know when to discount what TCGPlus is showing.

Critical paths:

- Market price not found → no chips can be computed.
- Listing price selector misses → no chips for that listing.
- Cart summary fetch fails → Deal-math degrades to "without cart context."

## Dependency policy

- **Zero runtime dependencies.** The extension ships `manifest.json`, `lib.js`, `content.js`, `content.css`, plus `LICENSE` and `README.md`. Nothing from `node_modules` is loaded by the extension. Don't add a runtime dep unless it's clearly worth its size and review cost — and that bar is high.
- **Dev dependencies are fine** when they earn their place: Prettier, ESLint, TypeScript (for `tsc --checkJs` only — no `.ts` files), `@types/*` for the JSDoc layer. Add via `npm install --save-dev`. Dependabot will keep them current.

## CI surface

The `.github/workflows/ci.yml` workflow runs:

- **Validate**: manifest schema sanity, JS syntax, Prettier, ESLint, `tsc --checkJs`.
- **Test**: `npm test` (Node `--test`) over `lib.js` pure helpers.
- **E2E**: `npm run test:e2e` (Playwright) loads the unpacked extension into headless Chromium with mocked TCGplayer routes and asserts on the panel, chips, cart subtotal, filter, and OOS hide behavior.

All three plus CodeQL must pass on every PR.

If you change CI, update this section. If you add a required check, also update the branch protection contexts via `gh api repos/peteb4ker/tcgplus/branches/main/protection`.

### When you add a workflow

Two follow-ups, every time:

1. **Add a status badge to the README.** The pattern is `https://github.com/peteb4ker/tcgplus/actions/workflows/<file>.yml/badge.svg?branch=main`. Without a badge the workflow's failures are silent until someone opens the Actions tab.
2. **Wire the workflow into `.github/workflows/main-health.yml`.** That workflow listens for `workflow_run.completed` from a fixed list of workflows and auto-files a tracking issue (label `main-health`) when one fails on `main`. Add the new workflow's `name:` to that list. Same applies if you rename a workflow.

## Other things to keep in mind

- All persisted state lives in `localStorage` under the `tcgplus.*` namespace. When changing the schema (renaming/removing keys), include a migration in the load path; don't break users with old saved settings.
- The extension is plain MV3 with no production build step. The published artifact is just the source files.
- Visual identity stays close to TCGplayer's existing palette so the extension feels native (greens for prices, the same kind of pill chips), with our own tcgplus-prefixed classes carrying the styling.
