# CLAUDE.md

Notes for AI agents working on this repo.

## Always work on a feature branch

`main` is protected. Never commit directly to `main`. For any change:

1. Make sure you're not on `main`. If you are, create a feature branch: `git checkout -b feat/short-description` (use one of `feat/`, `fix/`, `chore/`, `docs/`, `ci/`, `refactor/` as the prefix).
2. Commit on that branch.
3. Push and open a PR via `gh pr create`.
4. CI must pass. The required status checks are `Validate`, `Test`, and `Analyze (javascript)` (CodeQL). Auto-merge is enabled on the repo, so once checks pass and the PR is approved (if a reviewer was requested) it merges itself.
5. Force-pushing to `main` is disabled. Don't try.

If you opened a PR and want it merged automatically once checks pass, run `gh pr merge --auto --squash`.

## Local checks before pushing

- `npm install` once, then `npm test` and `npm run format:check` before every push.
- `node --check content.js` and `node --check lib.js` if you've edited only those.
- Reload the unpacked extension on `chrome://extensions` and refresh the TCGplayer tab to verify UI changes.

## Deal math must stay in sync between code and README

The "Deal" chip's logic is one of the few things in this extension that's hard to verify by reading the code alone. It depends on:

- The listing's price.
- The listing's stated shipping cost.
- Whether the listing has the "Free Shipping on Orders Over $X" promo.
- The per-seller cart subtotal from `mpgateway.tcgplayer.com/v1/cart/<key>/summary`.
- The global free-shipping threshold (currently $5, hard-coded as `FREE_SHIP_THRESHOLD` in `lib.js`).
- The page's market price (from the page DOM at `.price-points__upper__price` on product pages, or the per-tile `.product-info__market-price--value` / `.product-card__market-price--value` on search pages).

Whenever you change the formula (search for `renderDealChipHtml` and `recomputeDealChips` in `content.js`), update the `Price, shipping, and Deal chips` section of `README.md` in the same commit. The README is the user-facing source of truth for what triggers the chip; the code must agree.

If you add new inputs (e.g. tax, kickbacks, multi-listing combinations), document them in the README too. Don't ship a Deal-math change without a matching README update.

## Code layout

- `lib.js`: pure helpers (parsing, classification, chip color/text). No DOM access. Loaded as a content script and also `require()`d by tests. Keep it dependency-free.
- `content.js`: stateful orchestration (fetches, observers, panel rendering). Wraps in an IIFE; relies on `lib.js`'s top-level functions being in scope. No duplicated helpers — if you need one, add it to `lib.js` and write a unit test.
- `content.css`: all styling. Use `tcgplus-` prefixed classes only.
- `manifest.json`: MV3 manifest. `lib.js` must be listed before `content.js` in `content_scripts.js`.
- `tests/`: Node `--test` unit tests for `lib.js`. Add a test for any new pure helper.

## Other things to keep in mind

- `manifest.json` host permissions must list every host the script fetches from. Currently `seller-stores-backend.tcgplayer.com` (vendor info) and `mpgateway.tcgplayer.com` (cart). If you add another fetch target, add the host permission too.
- All persisted state lives in `localStorage` under the `tcgplus.*` namespace. No accounts, no servers.
- The extension is plain MV3 with no production build step. The published artifact is just the source files plus `LICENSE` and `README.md`.
