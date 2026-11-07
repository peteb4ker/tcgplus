# CLAUDE.md

Guidance for AI agents working on TCGPlus.

## What this project is

> **TCGPlus reduces the friction of using TCGPlayer.com so it's easier to find and buy cards.**

This sentence is the project's mandate. Judge every PR against it. If a feature doesn't make finding or buying cards on TCGplayer easier, it's out of scope.

TCGPlus does this by adding to and removing parts of the TCGplayer UI. It is a usability layer on top of someone else's site.

### Out of scope (do not propose)

- Decklist building, collection tracking, sealed product tracking, scrying, or anything else that competes with separate apps.
- Anything that needs a server, a database, or a third party (analytics, error tracking, A/B testing, feature flags).
- Anything that interacts with sites other than `tcgplayer.com`.

## Privacy is non-negotiable

**No analytics. No servers. Ever.**

TCGPlus only makes network calls to TCGplayer's own APIs. Currently these are `seller-stores-backend.tcgplayer.com`, `mpgateway.tcgplayer.com`, and `mp-search-api.tcgplayer.com`. All state lives in the extension's `chrome.storage.local` on the user's machine. Nothing is logged outside the user's browser.

If a feature genuinely needs server-side help (for example, a community price database), it belongs in a separate project, not in TCGPlus. Don't add Sentry, a "report a bug" upload button, or a CDN-hosted config.

When you add a new fetch target, add it to `manifest.json` `host_permissions`. Add a permission when a feature needs it, never for "future use."

## Development loop

Every change (feature, bug fix, chore, docs, infra) follows these steps. A step marked → has more detail in the named section.

### 1. Understand before changing

- Bug reports: find the root cause before proposing a fix. Confirm it by reading the code or with a live probe. Don't pattern-match from training data.
- Feature requests: pin down scope and surface area before writing code. If it isn't obvious whether something is in scope, re-read "What this project is" and "Out of scope". If it's still unclear, ask the user.
- Browser-visible symptoms: start with `npm run audit:selectors` (the `selector-audit` skill). It checks every selector the extension depends on against the live site, with the extension loaded, and narrows any drift to a page type in one command. For anything it doesn't cover, probe with Playwright in the same environment the demo recorder or the e2e suite uses (`page.evaluate`, `page.locator(...).count()`, `page.screenshot`, or `headless: false` + `await page.pause()` for interactive inspection).
- Don't use the Chrome DevTools MCP for probing. The user's real Chrome behaves differently from a fresh Playwright session (cookies, persistent storage, prior URL state), so findings from the MCP session may not reproduce in the recorder. The MCP also takes over the user's real browser window. The one exception is one-off README screenshot capture from the user's real browser session.
- Be honest about uncertainty. If the diagnosis is a guess, or the design is one of several options, say so before branching.

### 2. File the issue (→ "GitHub Issues is the backlog")

- Run `gh issue create` with one of the labels `feature`, `bug`, `chore`, `docs`, `tech-debt`.
- In the body, give the user-visible symptom or goal, what you've ruled out, and the acceptance criteria.
- File adjacent problems you notice along the way as their own follow-up issues. Never bundle them into the current PR.

### 3. Branch (→ "Always work on a feature branch")

- Run `git checkout main && git pull --ff-only`, then create a branch with one of the allowed prefixes.

### 4. Implement and test

- Make the smallest diff that does the job. No drive-by refactors.
- Bug fix: write a test that fails on `main` and passes with the fix. Check both directions. A placebo test that passes trivially is worse than no test.
- Feature: tests cover the new behaviour, including edge cases and the happy path.
- Chore, docs, infra: keep tests green. New tests usually aren't needed unless the change alters runtime behaviour.
- Tests for pure helpers go in `tests/`. Tests for DOM and cross-cutting behaviour go in `e2e/`.

### 5. Sync user-facing docs

If the change affects what a user sees, does, or notices, update the docs in the same PR:

- `README.md`, when user-visible behaviour changes: a new feature, a changed setting, a new install or setup step.
- README screenshots, when the panel, chips, or settings page look different. Retake them with `mcp__chrome-devtools__take_screenshot` and replace the files in `docs/images/`. No stale screenshots.
- `docs/store/listing-description.md`, when the Web Store listing copy needs to match.
- `CLAUDE.md`, when the development workflow changes (CI gates, hooks, scripts, conventions).
- The README's Deal-math description, in the same commit as any Deal-math change (→ "Deal math must stay in sync between code and README").

Pure-internal changes don't need user-facing doc updates. That covers refactors that don't change behaviour, dependency bumps, and test-only additions.

### 6. Local gate (→ "Local checks before pushing")

- Run `npm run check`. It chains format, lint, typecheck, unit, and e2e. The `.husky/pre-commit` hook runs the same command on `git commit`, so a clean commit means CI will pass too.

### 7. Commit and push

- Use a Conventional Commits prefix that matches the branch. The body explains _why_. Include `Closes #N` so the issue closes on merge.

### 8. Open the PR (→ "Always work on a feature branch")

- The title must be a Conventional Commits string, or the PR-title check fails. The body has a summary, the why, a test plan, and `Closes #N`.
- Queue auto-merge right away with `gh pr merge <N> --auto --squash --repo peteb4ker/tcgplus`. CI gates the actual merge.

### 9. After the merge lands (→ "After every PR you queued auto-merges")

- Pull `main`, rerun `npm run dev:build` if `.dev/` exists, and ask the user to reload the dev extension if runtime files changed.
- Check the other open PRs for `mergeStateStatus: DIRTY`. The merge that just landed may have caused their conflicts.
  - Dependabot PRs: comment `@dependabot recreate`, or `@dependabot rebase` if the PR is untouched.
  - Human-authored PRs: `gh pr checkout <N>`, merge or rebase onto current `main`, resolve the conflicts, then `git push --force-with-lease`.
- Do this one PR at a time. Don't batch the post-merge steps.

### 10. Confirm and tidy

- Check that `Closes #N` actually closed the issue on GitHub. If the fix only partly resolved it, leave the issue open with a status comment saying what's done and what's left.
- Make sure any follow-up issues that came up during the work are filed.

## GitHub Issues is the backlog

**Don't propose work out of thin air. Pull from issues.**

Every feature, bug, and chore lives as a GitHub issue on this repo. The issues are the canonical backlog.

For an open-ended ask like "what should we work on next?" or "pick something to improve":

1. List open issues (oldest priority first, then by interaction): `gh issue list --repo peteb4ker/tcgplus --state open --limit 20`.
2. Pick an issue. Comment on it to say you're starting, so the user has a record.
3. Work on a feature branch (next section). Reference the issue in the PR body with a closing keyword (`Closes #N`).
4. When the PR merges, the issue closes automatically. If your work didn't fully resolve it, leave it open and post a status comment with what's done and what's left.

When the user describes a new feature, bug, or chore in conversation:

- Open an issue first with `gh issue create`, using one of the labels `feature`, `bug`, `chore`, `docs`, `tech-debt`. Note where the idea came from if that helps.
- Then either start work on a branch (with `Closes #N` in the PR body), or stop after creating the issue and let the user prioritize.

If you find an out-of-scope problem partway through other work, file a new issue with enough context that someone (possibly you, later) can pick it up cold. Don't slip unrelated fixes into the current PR.

Issue titles are short and imperative ("Move settings to a singleton options page"). The body carries the why and the acceptance criteria.

## Always work on a feature branch

`main` is protected and force-pushing is disabled. The required status checks are listed under "CI surface".

1. Branch off `main`. Use one of these prefixes: `feat/`, `fix/`, `chore/`, `docs/`, `ci/`, `refactor/`, `perf/`, `test/`, `style/`.
2. Open a PR. **The PR title must be a Conventional Commits string** (`feat:`, `fix:`, `chore:`, etc.). The `PR title` workflow lints it. The title becomes the squash-merge commit on `main`.
3. Queue auto-merge with `gh pr merge --auto --squash` so the PR merges once checks pass.
4. **Don't push to `main` directly.** Don't bypass the PR flow, even for a one-liner.

## Versioning and releases

Releases are tag-driven, with manual version bumps. There is no release-please and no draft release PR.

To ship:

1. Pick the next semver from what has landed since the last tag. Roughly: `feat:` → minor, `fix:`/`chore:`/etc → patch, `feat!:` or `BREAKING CHANGE:` → major. To see what's queued, run `git log $(git describe --tags --abbrev=0)..HEAD --oneline`.
2. On a `chore/release-vX.Y.Z` branch, run `npm run release -- X.Y.Z`. The script bumps `manifest.json` and `package.json` together. Open a PR titled `chore: release vX.Y.Z` and merge it.
3. Once it's on `main`, tag and push:
   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
4. The tag triggers `.github/workflows/release.yml`. It builds the zip, creates a GitHub Release with notes generated from the merged PR titles, and pushes the zip to the Chrome Web Store if all four `CWS_*` secrets are set.

There is no `CHANGELOG.md`. Release notes are generated on the GitHub Releases tab from the merged PRs.

### Recovering from a failed Chrome Web Store publish

The CWS publish step sometimes fails with `ITEM_NOT_UPDATABLE`. This happens when a previous version is still in review, or is "Ready to publish" on the developer dashboard ("Ready to publish" is not the same as "Published").

`release.yml` is safe to rerun: if a release already exists for the tag, the create-release step is skipped. To recover:

1. Wait until the in-flight version reaches **Published** in the dev console. Go by the dashboard banner, not the email.
2. Re-run the workflow via `workflow_dispatch` against the existing tag, from the Actions tab or with:
   ```sh
   gh workflow run release.yml --repo peteb4ker/tcgplus -f tag=vX.Y.Z
   ```
   The build-zip and CWS-publish steps run. The create-release step is skipped because the release already exists.

Do **not** bump to the next patch to recover. Do **not** delete and recreate the tag; GitHub repo rules block recreating recent tags.

### Chrome Web Store secrets

`release.yml` reads these four repository secrets. If any is missing, it skips the publish step.

- `CWS_EXTENSION_ID`: the published extension's ID.
- `CWS_CLIENT_ID`: the Google OAuth client ID for the publisher project.
- `CWS_CLIENT_SECRET`: the OAuth client's secret.
- `CWS_REFRESH_TOKEN`: minted once with `npx chrome-webstore-upload-keys`, logged in as the developer account.

Setup steps are in PR #20. PR #19 added the store listing assets, including [`docs/store/listing-description.md`](docs/store/listing-description.md). The first publish has to be done by hand in the developer dashboard so the extension exists in the store. After that, every `v*` tag publishes automatically.

## Local checks before pushing

```sh
npm install              # once. Also installs the husky pre-commit hook.
npx playwright install   # once, for the e2e suite.
npm run check            # the gate. Chains format/lint/typecheck/unit/e2e.
```

`.husky/pre-commit` runs `npm run check` automatically, and CI runs the same checks split across parallel jobs. A clean `npm run check` means CI will pass. If something fails, fix it locally first.

To iterate on one slice while debugging, run the individual scripts: `npm run format`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run typecheck`.

For UI changes, also reload the unpacked extension on `chrome://extensions` and check the affected feature on a real TCGplayer product page and search page.

## Local dev build (running alongside the production extension)

Keep the production extension installed, so uninstall events don't show up in CWS analytics, and run the dev build next to it:

```sh
npm run dev:build       # writes .dev/ with a dev-flavoured manifest + copies of the source files
```

Then in Chrome:

1. `chrome://extensions` → enable Developer mode (top right).
2. **Load unpacked** → pick the `.dev/` directory.
3. Turn the production "TCGPlus" extension off while testing the dev build, and back on when you're done.

The two extensions have different IDs (one assigned by CWS, one generated by Chrome) and are labelled **TCGPlus** and **TCGPlus (dev)**. Storage is isolated per extension ID, so dev settings don't leak into production.

The files in `.dev/` are copies, not symlinks, because Chrome on macOS silently refuses to read content-script JS through symlinks: the extension loads without errors, but its scripts never run. After editing source files, rerun `npm run dev:build` and click the reload icon on the unpacked extension in `chrome://extensions`.

`.dev/` is gitignored.

### After every PR you queued auto-merges

When a PR you've been watching lands on `main`, the loaded dev extension keeps running the pre-merge code until `.dev/` is rebuilt. After each merge:

1. `git checkout main && git pull --ff-only` so local `main` has the new code.
2. If `.dev/` exists locally, rerun `npm run dev:build`. It's a quick recursive copy plus a manifest rewrite.
3. If the merge touched a runtime file (`lib.js`, `storage.js`, `content.js`, `content.css`, `background.js`, `manifest.json`, or anything under `icons/` or `options/`), tell the user to click the reload icon on the **TCGPlus (dev)** extension in `chrome://extensions` so the new code takes effect. Skip this for doc-only, test-only, or CI-only changes, since the rebuild changes nothing visible.

If `.dev/` doesn't exist, skip steps 2 and 3. The user isn't on the dev workflow, and only the published extension is in play.

## Definition of done

A PR is ready to merge when:

- All local and CI checks pass.
- **Logic changes have unit tests** in `tests/`. No exceptions. These tests cover the pure helpers in `lib.js`.
- **UI changes update the relevant README screenshot.** If the panel, the chip layout, or the settings page looks different, retake the screenshot as described in step 5. Don't merge a stale screenshot.
- The README is updated if user-facing behaviour changed.
- **Deal-math changes update the README in the same commit** (see below).

## Deal math must stay in sync between code and README

The Deal chip's logic is one of the few things that's hard to verify by reading the code alone. It depends on:

- The listing price, from the listing's price element.
- The listing's stated shipping cost.
- Whether the listing has a "Free Shipping on Orders Over $X" promo.
- The per-seller cart subtotal from `mpgateway.tcgplayer.com/v1/cart/<key>/summary`. A seller with anything already in the cart adds **no** shipping. TCGplayer charges one flat shipping fee per seller order (help article 201996807) and relabels those listings "Shipping: Included" (#186).
- The global free-shipping threshold: $5, hard-coded as `FREE_SHIP_THRESHOLD` in `lib.js`. TCGplayer fixes this amount; sellers don't set it. A live probe of ~480 listings found that every `.free-shipping-over-min` promo read "$5". The "$50" variant is TCGplayer Direct's separate `a.free-shipping-direct` offer, not a seller promo.
- The shipping rule (seller in cart → promo → listed shipping). It lives in the pure helper `effectiveDealShipping` in `lib.js`, with unit tests.
- The per-SKU market price from TCGplayer's pricing endpoints. This is the primary source:
  - `mp-search-api.tcgplayer.com/v2/product/<id>/details` returns the product's SKU list `[{sku, condition, variant, language}, …]`.
  - `mpgateway.tcgplayer.com/v1/pricepoints/marketprice/skus/search` (POST `{skuIds: […]}`) returns `[{skuId, marketPrice, …}]`.
  - The extension matches each listing to its SKU by parsing the condition cell text (e.g. `"Near Mint Reverse Holofoil"` → condition `"Near Mint"`, variant `"Reverse Holofoil"`) and uses that SKU's `marketPrice`.
  - `capConditionMarkets` (`lib.js`) then caps each condition tier at the best condition above it within the same variant. TCGplayer's thin condition tiers recalculate late and can otherwise price LP above NM (#111).
  - Results are cached per productId for the page lifetime in `productSkuPricingCache`.
- The fallback page market price, used only when the per-SKU lookup fails: `.price-points__upper__price` on product pages, and `.product-info__market-price--value` / `.product-card__market-price--value` on search pages. The fallback only applies when the listing's condition matches the URL `Condition=` param (default `Near Mint`). A mismatched listing gets the shipping chip only, not a misleading delta.

When you change `effectiveDealShipping` in `lib.js`, or `renderDealChipHtml` or `recomputeDealChips` in `content.js`, update the `Price, shipping, and Deal chips` section of `README.md` in the same commit. The README is the user-facing source of truth.

## Code layout

- `lib.js`: pure helpers (parsing, classification, chip color/text). No DOM access, no fetches, no globals other than function declarations. Loaded as a content script and `require()`'d from tests. Keep it dependency-free.
- `content.js`: stateful orchestration (fetches, MutationObservers, panel rendering). Wrapped in an IIFE; relies on `lib.js`'s top-level functions being in scope. **Don't duplicate helpers here.** Put a new helper in `lib.js` and write a test for it.
- `content.css`: all styling. Use `tcgplus-`-prefixed classes only. Don't style raw TCGplayer classes; that breaks when they reorganize.
- `storage.js`: the shared settings layer over `chrome.storage.local` (`STORAGE_KEYS`, load/save/remove helpers, and a one-time migration from the page's `localStorage`). Loaded as a content script before `content.js`, and as a plain script by the options page. **Only the content script may call `migrateFromLocalStorageIfNeeded`.** The options page's `localStorage` belongs to the extension's own origin and never held the old keys. Running the migration there would set the "migrated" flag and block the real migration (#178).
- `background.js`: the MV3 service worker. It opens the options page from the toolbar action icon and from the panel's gear button. Content scripts can't call `chrome.runtime.openOptionsPage`, so they message the worker.
- `options/`: the settings page (`index.html`, `options.js`, `options.css`), referenced from `manifest.json` `options_page`. Settings UI lives here, not in the floating panel. It reads and writes through `storage.js`.
- `manifest.json`: the MV3 manifest. `lib.js` and `storage.js` must come before `content.js` in `content_scripts.js`.
- `tests/`: Node `--test` unit tests for `lib.js` only. Add a test for every new helper.
- `e2e/`: Playwright tests that load the unpacked extension into Chromium and exercise the content script and options page against mocked TCGplayer routes. Add a test when you change panel rendering, chip placement, cart fetching, or other cross-cutting behaviour.

## TCGplayer DOM survival rules

TCGplayer is a Vue-driven SPA, and its DOM changes without warning.

- **Don't use `data-v-XXXXXXXX` attributes in selectors.** They are Vue scope hashes, not stable identifiers, and they change on every TCGplayer build.
- Prefer specific class names like `.listing-item__listing-data__info__price` over generic ones like `.price`. Specific names are more likely to map to component identity.
- Get the right selector first. A fallback is fine when there's a known ambiguity (e.g. grid view vs. list view). Don't carry five fallbacks "just in case"; that hides drift.
- **Never re-render in response to your own DOM mutations.** Functions that write to the DOM should be idempotent: compare before setting, and skip if equal. Keep your own panel's contents out of the global `MutationObserver` by filtering on `closest('.tcgplus-panel')` and on `tcgplus-`-prefixed classes in added and removed nodes.

## Degraded-functionality reporting

When a critical selector or fetch fails, **show a visible warning** in the floating panel saying the extension is partially broken on this page. A `console.warn` alone is not enough. Users can't act on a console message, and they can't fix selector breakage themselves. They just need to know when to discount what TCGPlus shows, so they can decide whether to trust the rest of the panel.

Critical paths:

- Market price not found → no chips can be computed.
- Listing price selector misses → no chips for that listing.
- Cart summary fetch fails → Deal math degrades to "without cart context."

## Dependency policy

- **Zero runtime dependencies.** The extension ships `manifest.json`, `lib.js`, `storage.js`, `content.js`, `content.css`, `background.js`, `icons/`, and `options/`, plus `LICENSE` and `README.md`. It loads nothing from `node_modules`. The bar for adding a runtime dependency is high: it has to be clearly worth its size and review cost.
- Dev dependencies are fine when they earn their place: Prettier, ESLint, TypeScript (for `tsc --checkJs` only; no `.ts` files), and `@types/*` for the JSDoc layer. Add them with `npm install --save-dev`. Dependabot keeps them current.

## CI surface

`.github/workflows/ci.yml` runs three jobs:

- `Validate`: manifest sanity checks, including that every file the manifest references exists (content scripts, `background.service_worker`, `options_page`, `icons`, `action.default_icon`); `node --check` on every runtime JS file; Prettier; ESLint; `tsc --checkJs`.
- `Test`: `npm test` (Node `--test`) over the `lib.js` pure helpers.
- `E2E`: `npm run test:e2e` (Playwright). It loads the unpacked extension into headless Chromium with mocked TCGplayer routes and checks the panel, chips, Deal math, cart subtotal, cart and checkout verdicts, filters, Always Near Mint, the OOS banner, and the options page.

Two more workflows run on every PR: `codeql.yml` (check `Analyze (javascript)`) and `pr-title.yml` (check `Conventional commits`). Branch protection on `main` requires all five checks: `Validate`, `Test`, `E2E`, `Analyze (javascript)`, and `Conventional commits`.

If you change CI, update this section. If you add a required check, also update the branch protection contexts with `gh api repos/peteb4ker/tcgplus/branches/main/protection`.

### When you add a workflow

Do both of these every time:

1. **Add a status badge to the README.** The pattern is `https://github.com/peteb4ker/tcgplus/actions/workflows/<file>.yml/badge.svg?branch=main`. Without a badge, the workflow's failures go unnoticed until someone opens the Actions tab.
2. **Add the workflow to `.github/workflows/main-health.yml`.** That workflow listens for `workflow_run.completed` from a fixed list of workflows and files a tracking issue (label `main-health`) when one fails on `main`. Add the new workflow's `name:` to that list. Do the same when you rename a workflow.

## Other things to keep in mind

- All persisted state lives in `chrome.storage.local` under the `tcgplus.*` namespace, with keys listed in `STORAGE_KEYS` in `storage.js`. Older versions used the page's `localStorage`; `migrateFromLocalStorageIfNeeded` copies those values across once. When you rename or remove keys, add a migration in the load path so users with old saved settings don't break.
- The extension is plain MV3 with no production build step. The published artifact is just the source files.
- Keep the visual identity close to TCGplayer's existing palette so the extension feels native (greens for prices, the same kind of pill chips). Our own `tcgplus-`-prefixed classes carry the styling.
