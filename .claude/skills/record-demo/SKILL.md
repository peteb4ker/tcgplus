---
name: record-demo
description: Re-record the README demo GIF at docs/images/demo.gif against live TCGplayer using Playwright + ffmpeg. Use when the user asks to refresh the demo GIF, redo the README hero recording, retake the screen recording, or when UI changes (panel layout, chip styling, settings page) have made the existing recording stale.
---

# record-demo

Regenerate `docs/images/demo.gif` against live TCGplayer using `tools/record-demo.js`. Open a PR on a `docs/`-prefixed branch for review; do not auto-merge.

## When to invoke

- The user asks to redo, refresh, or rerecord the demo GIF.
- A UI change has landed that makes the existing recording stale (panel layout, chip styling, settings page).
- A new user-visible feature warrants showing in the README hero.

## Outcome

A fresh `docs/images/demo.gif`, 1280×720 at 10 fps, 4–6 seconds, 2–4 MB. Recording opens on real TCGplayer data, holds long enough to read each phase, ends on a satisfying loop point. No banner ads or loading spinners visible.

## Required tooling

- `ffmpeg` on PATH. The recorder pre-flights this and exits with a brew/apt hint if missing.
- `npm install` once. `npx playwright install chromium` once.
- Playwright's bundled Chromium. Do not use the user's installed Chrome via `channel: 'chrome'` — extension loading is unreliable.

## Workflow

1. Branch off `main` with a `docs/` prefix: `git checkout main && git pull --ff-only && git checkout -b docs/<short-name>`.
2. Run `npm run demo:record`. The recorder navigates to a real TCGplayer URL, drives the UI, and produces `docs/images/demo.gif`.
3. Sanity-check the GIF. Extract specific frames with ffmpeg if needed: `ffmpeg -i docs/images/demo.gif -vf "select=eq(n,N)" -vframes 1 frame-N.png`. Confirm each phase looks right.
4. If a step in the recorder times out, read the failure-diagnostic screenshot at `docs/images/.demo-failed.png` and the JSON state summary printed to stderr. Fix selectors or timings.
5. Commit, push, open a PR titled `docs: refresh demo GIF`. Do not queue auto-merge — the user reviews demo PRs visually.
6. If the recorder reveals a new failure mode or selector quirk, fold it into this skill's "Constraints" section before merging.

## Default recording flow

The recorder tells this story: search a Pokémon set in grid view → sort by price descending → jump-cut to a specific richly-listed product → see the full chip row + panel + location badges → filter to home state.

Implementation steps in `playScript`:

1. Wait for the extension to annotate the default-sort grid (`.product-card__product[data-tcgplus-chips="1"]`).
2. Hide TCGplayer's promotional banners from the DOM (see Constraints — they're noise).
3. Drive the sort dropdown via the UI to select "Price: High to Low". Wait for the re-sort to settle.
4. Hold on the sorted grid (Beat 1).
5. `page.goto` the chosen product URL directly. The Beat 1 → Beat 2 transition is a jump-cut in the encoded GIF, so the visual narrative reads as "click a product" without the recorder having to actually click a tile (see Constraints — TCGplayer tiles sometimes open in a new tab and the race is brittle).
6. Wait for product-page annotation (`.listing-item[data-tcgplus-chips="1"]` plus `.tcgplus-panel`).
7. Hide product-page recommendation carousels ("Customers Also Purchased" etc., see Constraints).
8. Scroll the listings into view.
9. Hold on the unfiltered product listings (Beat 2).
10. Click the home-tier panel row to filter to home state.
11. Re-scroll the listings header to the top of the viewport (the filter reflows the document shorter).
12. Re-run the banner/carousel hide — the scroll can trigger lazy-loaded carousels back into the DOM.
13. Hold on the filtered view (Beat 3).
14. Close the context to flush WebM, then ffmpeg-encode.

### Product choice

The current demo uses **Mega Gengar ex (284/217)** from Ascended Heroes (product `676096`). Picked for: many listings spread across states (good panel data + a meaningful home-state filter), varied per-listing pricing (varied chip colours), high enough market price that the Deal chip can show. Update `PRODUCT_URL` in `tools/record-demo.js` to retarget.

Beat 1's grid is independent of the chosen product — it just shows whatever's at the top of the price sort for the set. The set URL is `SEARCH_URL` in the recorder; the grid view condition is fixed to Near Mint to match what the extension nudges users toward.

## Encoding

Pass per-beat wall-clock timestamps from `playScript` to ffmpeg's `select` filter so the GIF jump-cuts the loading transitions between beats. Pattern:

```
select='between(t,t1,t2)+between(t,t3,t4)+between(t,t5,t6)',setpts=N/FRAME_RATE/TB,
fps=10,scale=1280:720:flags=lanczos,
split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5
```

`select` keeps only the named time ranges. `setpts=N/FRAME_RATE/TB` re-times the surviving frames so playback is smooth at output FPS. `palettegen + paletteuse` with Bayer dither produces a clean GIF without per-frame palette artifacts.

`playScript` records `Date.now()/1000 - recStartT` at the start and end of each hold, where `recStartT` is captured in `main` immediately after `launchPersistentContext` returns.

## Constraints

### Use Playwright for all browser-side probing

Never use the Chrome DevTools MCP to investigate site behaviour. The MCP drives the user's real Chrome, which has cookies and persistent storage that change how TCGplayer responds. Findings there do not reproduce in the recorder's fresh temp profile. The MCP also takes over the user's screen.

Inside the recorder, use `page.evaluate`, `page.locator(...).count()`, `await page.screenshot(...)`, or `headless: false` + `await page.pause()` to inspect state interactively.

### The `Sort=` URL parameter does not sort

TCGplayer reads `?Sort=Price+High+to+Low` as a filter. A fresh session sees zero matches and falls back to the default Best Match sort, which leads with sealed product and code cards. Drive the sort dropdown via the UI instead:

```js
const sortControl = page
  .locator('select, [role="combobox"]')
  .filter({ hasText: /best match|price|sort/i })
  .first();
if ((await sortControl.evaluate((el) => el.tagName).catch(() => null)) === 'SELECT') {
  await sortControl.selectOption({ label: 'Price: High to Low' });
} else {
  await sortControl.click();
  await page.locator('text=/^Price: High to Low$/').first().click({ timeout: 5000 });
}
```

Locate options by stable text. Do not target Vue scope hashes (`data-v-xxxxxxxx`) — they change on every TCGplayer build.

### Always run headless

Headed mode pops up a window over the user's workspace on every iteration. Use `--headless=new` with `channel: 'chromium'`. Override the User-Agent so TCGplayer does not bot-detect on the `HeadlessChrome` token:

```js
userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
```

### Hide promotional banners and product-page carousels before recording

TCGplayer puts two kinds of noise in front of the camera. On search pages it flashes a marketing banner ("Mayhem Sweepstakes" or similar) between the filter bar and the grid tiles. On product pages it lazy-loads "Customers Also Purchased" / "You May Also Like" carousels below the listings — those sit out of frame in unfiltered Beat 2, but the panel-filter beat reflows the document shorter and the carousels creep into the bottom of the viewport.

`hidePromoBanners` handles both. Call it after every navigation, and again after any scroll that could trigger lazy-loaded carousels back into the DOM:

```js
await page.evaluate(() => {
  const sels = [
    // Search-page marketing / sweepstakes banners
    '[class*="sweepstakes" i]',
    '[class*="promo-banner" i]',
    '[class*="marketing-banner" i]',
    '[class*="hero-banner" i]',
    '[data-testid*="banner" i]',
    'a[href*="sweepstakes" i]',
    // Product-page recommendations / upsell carousels
    '[class*="customers-also" i]',
    '[class*="also-purchased" i]',
    '[class*="related-products" i]',
    '[class*="recommended" i]',
    '[class*="recommendation" i]',
    '[data-testid*="related" i]',
    '[data-testid*="recommend" i]',
  ];
  for (const sel of sels) document.querySelectorAll(sel).forEach((el) => el.remove());

  // Text fallback for carousels with non-matching class names.
  const titleRe =
    /^\s*(customers also (purchased|bought)|you may also like|related products|recommended (for you|products))\s*$/i;
  document.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
    if (!titleRe.test(h.textContent || '')) return;
    const wrapper = h.closest('section, aside, [class*="section" i], [class*="carousel" i]') || h.parentElement;
    if (wrapper) wrapper.remove();
  });
});
```

Probe live for the current selectors if these no longer match.

### `channel: 'chrome'` does not load `--load-extension` reliably

Use `channel: 'chromium'` (Playwright-bundled). The e2e suite uses the same — keep it consistent.

### `recordVideo` ignores `deviceScaleFactor`

Playwright video output is at CSS pixel resolution regardless of `deviceScaleFactor`. CSS-zooming the page works for static fixtures but breaks live TCGplayer (responsive breakpoints shift the layout). Record at 1280×720 native and accept the result.

### Use a fresh cookieless session

Do not reuse the user's profile. A logged-in session leaks cart contents and other personal state into the recording. The default temp `userDataDir` gives the right baseline (`$0.00` cart).

### Network-state waits over time-based waits

Live TCGplayer takes 2–4 seconds to render the grid and another 2–3 seconds after a sort change. `waitForLoadState('networkidle')` is unreliable on TCGplayer because of long-tail analytics traffic. Use specific DOM-state waits such as `locator(...).nth(5).waitFor` or `page.waitForFunction(...)` against expected DOM content.

### Prefer `page.goto(href)` over clicking tiles to navigate

Reading the first tile's `href` and calling `page.goto` directly is more reliable than clicking it. TCGplayer's Vue handlers occasionally open a new tab via JavaScript even when the `<a>` has no `target="_blank"`. The race between `context.waitForEvent('page')` and the original page's navigation is brittle, and a new-tab destination can leave the active page reference pointing at the old grid. Direct navigation has the same visual result and no race:

```js
const firstTile = page.locator('a[data-testid="product-card__image--0"]').first();
const href = await firstTile.getAttribute('href');
const productUrl = new URL(href, 'https://www.tcgplayer.com').toString();
await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
```

### Wait for the first-tile href to change after sort

A sort change can briefly empty the grid before re-rendering, so polling on tile count races the empty intermediate state. Capture the first tile's `href` before clicking the sort option, then wait for the first tile's `href` to be a different product:

```js
const firstTileBefore = page.locator('a[data-testid="product-card__image--0"]').first();
const hrefBefore = await firstTileBefore.getAttribute('href');
// ... click the sort option ...
await page.waitForFunction(
  (hrefBefore) => {
    const a = document.querySelector('a[data-testid="product-card__image--0"]');
    if (!a) return false;
    const cur = a.getAttribute('href');
    return cur && cur !== hrefBefore;
  },
  hrefBefore,
  { timeout: 15000 }
);
```

### Re-scroll after a filter click

Clicking a panel-filter row triggers CSS `display: none` on the hidden-tier listings, which reflows the document and shifts the visible scroll position. Without a re-scroll, the recording ends up showing the market-price chart or the "Customers Also Purchased" carousel instead of the filtered listings. After the click, wait ~250ms for layout to settle, then scroll the listings container back to the top:

```js
await homeRow.first().click();
await page.waitForTimeout(250);
await page.evaluate(() => {
  const c = document.querySelector('.product-details__listings-results, .product-details__listings, .listings');
  if (c) c.scrollIntoView({ behavior: 'instant', block: 'start' });
});
```

Targeting the listings container (not the first listing-item) puts the section header at the top of the viewport, so both home listings are in frame.

## File-size budget

| Size   | Acceptable?                                                       |
| ------ | ----------------------------------------------------------------- |
| < 2 MB | Excellent. Loads fast in the README.                              |
| 2–4 MB | Fine for a hero GIF.                                              |
| 4–5 MB | On the heavy side. Trim a beat or drop FPS to 8 if possible.      |
| > 5 MB | Too heavy. Tools struggle to inspect. Cut beats or viewport size. |

The biggest knobs are viewport resolution, FPS, and total duration. ffmpeg's palette pipeline is already near-optimal.

## Variants

- **Showing a feature that only lives on a product page** (e.g., Deal-chip math, shipping chips, single product's panel): skip the grid leg, navigate directly to a product URL. Update keepRanges to one range.
- **Showing single-seller mode** (the "You are shopping from" banner): start on a search URL with `?seller=<key>`. The per-listing badges are suppressed in this mode; the banner carries the seller's location instead.
- **Showing settings page interactions**: navigate to `chrome-extension://<id>/options/index.html` after launching the extension. The ID is generated on each `launchPersistentContext`; read it from `chrome.management` via a privileged background context, or hard-code the development extension's ID after one-time setup.
