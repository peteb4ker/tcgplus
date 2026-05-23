---
name: record-demo
description: Re-record the README demo GIF at docs/images/demo.gif against live TCGplayer. Trigger when the user asks to refresh, redo, or rerecord the demo GIF, or when UI changes have made the existing recording stale.
---

# Recording the README demo GIF

The repo ships a `tools/record-demo.js` Playwright recorder. This skill captures everything I've learned from getting it to produce a good GIF, so the next person (probably future me) doesn't repeat the trial-and-error.

## When to use

- User says "redo the demo", "refresh the demo GIF", "rerecord the demo", or similar.
- The README's `docs/images/demo.gif` no longer matches what the extension shows on real TCGplayer (e.g., a UI change landed, or the recorded set / product is no longer relevant).
- A new feature deserves to be shown in the hero recording.

## Outcome

A fresh `docs/images/demo.gif` committed on a feature branch (`docs/...` prefix), opened as a PR for review. ~1–3 MB target, 1280×720 at 10 fps, 5–8 s. Shows real TCGplayer data, opens on a populated view (not a loading state), and ends on a satisfying loop point.

## Required tooling

- `ffmpeg` on PATH (`brew install ffmpeg` on macOS). The recorder pre-flights and exits with a helpful hint if missing.
- `npm install` once, plus `npx playwright install chromium` once.
- Playwright's bundled Chromium. Not the user's real Chrome (see "Findings" below).

## Default flow

The user-facing story the recording tells: search the Ascended Heroes set in grid view → manually sort Price High to Low → click into the most expensive product → see the full chip row + Vendor Locations panel + location badges + DEAL chip.

Implementation steps the recorder performs:

1. `goto` the grid view URL (no `Sort=` in the URL — it doesn't work, see Findings).
2. Wait for grid annotation (extension chips on ≥5 tiles).
3. Click the sort dropdown, click "Price: High to Low", wait for the re-sort to settle.
4. Hold briefly on the sorted grid (Beat 1).
5. Click the first tile (now the most expensive Special Illustration Rare).
6. Wait for product-page annotation (≥3 listings annotated, panel rendered).
7. Scroll the listings into view.
8. Hold (Beat 2) — the chip-row + panel money shot.
9. Close context to flush WebM, then ffmpeg-encode to GIF with `palettegen` + `paletteuse`.

`SKIP_START_SEC` chops the load + scroll-into-view phase so the GIF opens on a fully-rendered listings view. Tune empirically — too low and you see the loading state, too high and the first beat is clipped.

## Findings worth knowing

These are the rakes I stepped on. Don't repeat them.

### Always probe inside Playwright, never via Chrome DevTools MCP

The user's real Chrome session has cookies and persistent storage that change how TCGplayer behaves. The Playwright recorder uses a fresh temp profile. Probing the live page with DevTools MCP gives findings that don't reproduce in the recorder. Also: DevTools MCP takes over the user's actual browser, which is intrusive.

Use Playwright's own affordances: `page.evaluate`, `page.locator(...).count()`, `await page.screenshot(...)`, `headless: false` + `await page.pause()` for interactive inspection. Everything DevTools MCP can do, Playwright can do in the right environment.

### `Sort=Price+High+to+Low` in the URL doesn't work

I assumed this URL param controlled sort. In a fresh Playwright session, TCGplayer interprets it as a **filter** (showing items matching "Price: High to Low", which is nothing), not a sort. The page falls back to default Best Match sort and shows boring sealed product and code cards.

In the user's real-Chrome session the same URL worked. That's because their persisted state pre-selected the sort and the URL param happened to be consistent with it.

**Workaround:** click the sort dropdown in the UI. Locate by stable text (`text="Price: High to Low"`), not by Vue scope hashes (`data-v-xxxxxxxx`).

### Default grid sort is uninteresting

Best Match leads with code cards and sealed product. Without an explicit sort, the grid view doesn't sell the extension. Always sort high-to-low before recording the grid leg of the demo.

### `channel: 'chrome'` + `--load-extension` is unreliable

Using `channel: 'chrome'` (the user's installed Chrome) with `--load-extension` and a temp `userDataDir` doesn't load the extension reliably — the page renders but the content script never fires. Use `channel: 'chromium'` (Playwright-bundled) instead. Same as the e2e suite does.

### Headless works against live TCGplayer if you override the User-Agent

Earlier I'd written this off — `--headless=new` failed and I switched to headed. The actual failure was unrelated (`channel: 'chrome'` not loading extensions). With `channel: 'chromium'` + `--headless=new`, the extension activates and the page loads — but TCGplayer can still treat the `HeadlessChrome` UA token differently. Set a normal Chrome UA on the context and the site behaves identically to headed:

```js
const REAL_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
// ... in launchPersistentContext options:
userAgent: REAL_UA,
```

**Always use headless.** Headed mode pops up a real window over the user's workspace, which is intrusive on every iteration — they noticed and didn't like it.

### `recordVideo` ignores `deviceScaleFactor`

Playwright records at CSS pixel resolution. Setting `deviceScaleFactor: 2` does not give you a 2x-density video. The workaround for sharper output is to use a larger viewport and a CSS-zoomed page, but that only works when the page's layout doesn't break at the larger viewport — TCGplayer's site has responsive breakpoints that shift to a narrower-viewport layout under `zoom: 2`, so don't zoom for live recordings. Stick to 1280×720 native and accept some softness on Retina.

### Real TCGplayer needs a fresh, cookieless session

A logged-in session shows the cart subtotal at whatever the user has in their cart. For a public demo recording we want a clean baseline ($0.00) — that's what the default temp `userDataDir` gives. Don't reuse the user's profile.

### Network latency is real and varies

Live TCGplayer can take 2–4 seconds to render the grid and another 2–3 seconds after a sort change. `waitForLoadState('networkidle')` helps but isn't a silver bullet — TCGplayer has long-tail network activity (analytics, lazy-loaded images). Use specific DOM-state waits (`locator(...).nth(5).waitFor`) rather than blanket network waits.

### Jump-cut the loading transition with ffmpeg select + setpts

The recording captures everything between context-open and context-close: about:blank, navigation, sort settling, click → product-page load (~1.5s of mostly-white loading spinner), then product page. Don't let that loading gap into the final GIF — it kills the demo's pace.

playScript captures wall-clock timestamps at the start and end of each "hold" beat (sorted grid hold, product page hold) using `Date.now() / 1000 - recStartT`, where `recStartT` is captured in `main` right after `launchPersistentContext` returns. Pass the resulting time ranges to ffmpeg:

```text
select='between(t,2.8,5.3)+between(t,7.1,10.6)',setpts=N/FRAME_RATE/TB,
fps=10,scale=1280:720:flags=lanczos,split[s0][s1];[s0]palettegen=...
```

`select` keeps only the named ranges; `setpts=N/FRAME_RATE/TB` re-times the surviving frames so playback is smooth at the output FPS. This makes the GIF a clean grid-shot → jump cut → product-shot loop with no dead frames in the middle.

### New-tab handling on the tile click

TCGplayer's grid `<a>` tiles don't have `target="_blank"`, but their Vue handlers occasionally open a new page anyway. Wrap the click in a `context.waitForEvent('page', ...)` race:

```js
const newPagePromise = page
  .context()
  .waitForEvent('page', { timeout: 3000 })
  .catch(() => null);
await firstTile.click();
const newPage = await newPagePromise;
if (newPage) {
  page = newPage;
  await page.bringToFront();
  await page.setViewportSize(VIEWPORT);
}
```

If a new tab opened, switch to it and continue there. The video for whichever page actually navigated is the one that has the interesting content — `main` picks it via `ctx.pages()`.

### The recorder has a failure-diagnostic screenshot

If `playScript` fails, the recorder writes `docs/images/.demo-failed.png` and dumps a JSON state summary (URL, tile count, annotation status, panel state, cart badge). Use this to debug.

### File size budget

| Output size | Verdict                              |
| ----------- | ------------------------------------ |
| < 1 MB      | Excellent. Loads fast in the README. |
| 1–3 MB      | Fine for a hero GIF.                 |
| 3–5 MB      | On the heavy side but acceptable.    |
| > 5 MB      | Tools struggle to inspect. Trim.     |

The biggest knobs: viewport size, FPS, duration. ffmpeg's palette pipeline is already as efficient as it gets.

## Debugging the recorder

Don't reach for DevTools MCP. Instead:

1. Add an `await page.pause()` at the failure point in `playScript`. Re-run the recorder. A headed window opens and pauses; you get a Playwright inspector to probe DOM, run console commands, and step through.
2. Use the failure-diagnostic screenshot if a step times out.
3. Add `page.on('console', ...)` to surface the extension's `[TCG+] vendor location extension loaded` log — confirms the content script actually fired.

## Workflow

1. **Branch.** `git checkout main && git pull --ff-only && git checkout -b docs/<short-name>`.
2. **Run the recorder.** `npm run demo:record`. First run after a UI change usually fails — read the error and inspect the failure screenshot.
3. **Iterate.** Adjust selectors, beat timings, or `SKIP_START_SEC` until the GIF looks right.
4. **Sanity-check the GIF.** Extract frames at known points with `ffmpeg -i docs/images/demo.gif -vf "select=eq(n,N)" -vframes 1 frame-N.png`. Read them to confirm content is what you expect.
5. **Update this skill** if you hit a new rake.
6. **Commit.** `git add tools/record-demo.js docs/images/demo.gif .claude/skills/record-demo/SKILL.md`. Open a PR titled `docs: refresh demo GIF`. Don't queue auto-merge — the user reviews demo PRs by eye.

## When to break the default flow

- Showing a feature that only lives on a product page (e.g., DEAL chip math, shipping chips, Vendor Locations panel) → skip the grid leg, go directly to a known product URL.
- Showing the cart-subtotal-in-header → still works in fresh session ($0.00) but won't have a non-zero number unless you mock the cart route, which would mean dropping back to test fixtures. Decide explicitly with the user.
- Showing single-seller mode (the "You are shopping from" banner) → use a search URL with `?seller=<key>` rather than the set view.
