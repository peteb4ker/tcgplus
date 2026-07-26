---
name: selector-audit
description: Audit TCGPlus's DOM selectors against the live tcgplayer.com site using Playwright with the extension loaded. Runs npm run audit:selectors across product, filtered-product, search-grid, and single-seller pages and reports per-selector PASS/FAIL. Use when the user reports wrong or missing chips/badges/panel, suspects a TCGplayer UI update, asks to validate pages or audit selectors, or before cutting a release.
---

# selector-audit

Validate every DOM selector the extension depends on against the live TCGplayer site, with the unpacked extension loaded. The audit distinguishes "the DOM still has what we need" from "the extension's surfaces actually rendered" — both matter, and they fail independently.

## When to invoke

- The user reports missing or wrong chips, badges, panel, or banner on any TCGplayer page.
- A TCGplayer UI update is suspected or announced.
- The user asks to validate pages, audit selectors, or check for UI drift.
- Before cutting a release, as a live smoke check.

## Workflow

1. Run the audit:

   ```sh
   npm run audit:selectors
   ```

   It launches headless Chromium with the unpacked extension (same harness as the e2e suite and demo recorder), visits one canonical URL per page type, evaluates the selector inventory, and exits non-zero on any failure.

2. Read the per-page PASS/FAIL table. Interpret failures by category:
   - **DOM check fails** (listing rows, condition cell, market price, banner): TCGplayer changed their markup. Probe the page for the new class names (see Probing below), then file a `bug` issue with the old selector, the new DOM shape, and hit counts. Do not fix in the same session unless the user asks.
   - **Extension-health check fails** (chips, badges, panel, degradation warnings) while the DOM checks pass: the markup is available but the extension isn't consuming it — a content.js bug or a selector the code hasn't caught up to. File or link the issue and fix per the normal development loop.
   - **Navigation fails or a page returns near-empty listings**: the canonical URL went stale (sets rotate, products sell out). Swap in a current equivalent in `tools/audit-selectors.js` — any product with 10+ listings, any current set's search page. URL freshness is maintenance, not drift.

3. Report findings to the user before fixing anything. Include which pages pass clean — scoping drift is as valuable as finding it.

## Probing for new selectors

When a DOM check fails, find the replacement class names with a throwaway Playwright script in the same harness (headless, `channel: 'chromium'`, real-Chrome UA override, extension loaded). Never use the Chrome DevTools MCP — it drives the user's real browser and its findings don't reproduce in a fresh profile. Useful patterns:

- Enumerate candidate classes: query all elements, split classNames, filter by `/listing|seller|price|condition|shipping/i`, count occurrences.
- Dump `outerHTML` samples of the first listing row and any price-guide/market block.
- Find text anchors: elements whose text matches "Near Mint", "Market Price", "Shipping" — then read their classes.

## Keep the inventory in sync

The selector inventory lives in `CHECKS` inside [tools/audit-selectors.js](../../tools/audit-selectors.js). When any selector changes in content.js, update the inventory **in the same PR**. An audit that checks stale selectors reports stale truth.

Where TCGplayer has shipped a rename, keep both generations in the inventory as a comma-joined selector (`.old-name, .new-name`) with a comment naming which redesign introduced the split — the audit then keeps passing if TCGplayer reverts.

## Limits

- **Cart and checkout pages are not audited.** They need the user's logged-in session and cart contents, which a fresh headless profile cannot have. After changing cart/checkout selectors, ask the user to verify on their real session and to paste DOM samples if something misses.
- **On demand only, never CI.** The audit hits the live site: it is inherently flaky, rate-limited, and a courtesy to TCGplayer. Do not wire it into workflows.
- The single-seller page URL is built at runtime from a seller key discovered on the first product page; if product pages fail to load, the single-seller audit is skipped and reported as a failure.
