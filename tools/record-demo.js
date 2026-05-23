// Record the README demo GIF against live TCGplayer.
//
// Flow: open the Ascended Heroes grid view, manually select "Price: High to
// Low" from the sort dropdown (the URL param doesn't apply a sort —
// TCGplayer reads it as a filter, see .claude/skills/record-demo/SKILL.md),
// wait for the re-sort, click the first (now most-expensive) tile, scroll
// the resulting product page to its listings, and hold long enough for the
// chip row + Vendor Locations panel + location badges to read. Convert the
// resulting WebM to docs/images/demo.gif via ffmpeg.
//
// Usage:
//   npm run demo:record
//
// Requires `ffmpeg` on PATH. On macOS: `brew install ffmpeg`.

const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('@playwright/test');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXT_PATH = REPO_ROOT;
const OUT_PATH = path.join(REPO_ROOT, 'docs', 'images', 'demo.gif');

// The set's grid view. Bare URL — `Sort=` URL param is ignored by
// TCGplayer's Vue app (read as filter, not sort) so the demo selects sort
// via the dropdown instead. Condition=Near+Mint matches what the extension
// nudges users toward via the "Always Near Mint" setting.
const SEARCH_URL =
  'https://www.tcgplayer.com/search/pokemon/me-ascended-heroes' +
  '?productLineName=pokemon&page=1&view=grid&ProductTypeName=Cards' +
  '&setName=me-ascended-heroes&Condition=Near+Mint';

// Desktop viewport wide enough to keep TCGplayer in its non-narrow layout.
// 1280x720 balances readability in the GitHub README against keeping the
// GIF a sane file size.
const VIEWPORT = { width: 1280, height: 720 };

// 10fps demo — smooth enough to read interactions, slow enough to keep the
// file small.
const FPS = 10;

// The recording captures more than the GIF actually needs: there's about:
// blank at the start, page-load latency, the sort-change transition, and
// the click → product-page navigation gap. To avoid hard-coding fragile
// timestamps, playScript records the wall-clock times of the two visible
// phases (sorted grid hold, product page hold) and we hand those to
// ffmpeg as `select=between(t,...)` ranges, jump-cutting everything else.

const NAV_TIMEOUT_MS = 30000;

function requireFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (r.status !== 0) {
    console.error('ffmpeg not found on PATH. Install it first:');
    console.error('  macOS:   brew install ffmpeg');
    console.error('  Debian:  sudo apt-get install ffmpeg');
    process.exit(1);
  }
}

async function dismissCookieBanner(page) {
  // TCGplayer uses OneTrust for consent in some regions. The "Accept All"
  // button shows up only sometimes; click it if present, otherwise move on.
  const candidates = [
    '#onetrust-accept-btn-handler',
    'button:has-text("Accept All Cookies")',
    'button:has-text("Accept All")',
  ];
  for (const sel of candidates) {
    const btn = page.locator(sel).first();
    if (await btn.count()) {
      try {
        await btn.click({ timeout: 1500 });
        return;
      } catch {
        // ignore — banner may have already vanished
      }
    }
  }
}

async function waitForGridAnnotated(page) {
  // Extension marks each grid tile with data-tcgplus-chips="1" after it
  // builds the price-vs-market chip. Wait for several so we know the run is
  // populated, not partial.
  await page.locator('.product-card__product[data-tcgplus-chips="1"]').nth(5).waitFor({ timeout: 15000 });
}

async function waitForProductAnnotated(page) {
  await page.locator('.listing-item[data-tcgplus-chips="1"]').nth(2).waitFor({ timeout: 20000 });
  await page.locator('.tcgplus-panel').waitFor({ timeout: 5000 });
}

async function sortPriceHighToLow(page) {
  // The sort dropdown is a Vue-styled <select> in TCGplayer's search UI.
  // It's labelled "Sort & View" / sits in the .sort-and-view region.
  // Use stable text-based locators rather than Vue scope hashes.
  //
  // Strategy: find the visible sort control, click to open, click the
  // "Price: High to Low" option. After the click, the URL gains a
  // Sort=... param and the grid re-renders — wait for the first tile's
  // displayed price to be high enough that we know we're sorted.
  const sortControl = page
    .locator('select, [role="combobox"]')
    .filter({ hasText: /best match|price|sort/i })
    .first();

  // Approach A: real <select>. Use Playwright's selectOption.
  if ((await sortControl.evaluate((el) => el.tagName).catch(() => null)) === 'SELECT') {
    await sortControl.selectOption({ label: 'Price: High to Low' });
  } else {
    // Approach B: Vue custom dropdown. Open it, then click the option.
    await sortControl.click();
    await page.locator('text=/^Price: High to Low$/').first().click({ timeout: 5000 });
  }

  // The re-sort triggers a fresh search and a fresh extension annotation
  // pass. Wait for the grid to be re-annotated; that signals the new
  // tiles have rendered.
  await page.locator('.product-card__product[data-tcgplus-chips="1"]').nth(5).waitFor({ timeout: 15000 });

  // Belt-and-braces: confirm a high price is visible in the first tile so
  // we know we're sorted (Special Illustration Rares from this set are in
  // the hundreds-to-thousands of dollars).
  await page.waitForFunction(
    () => {
      const first = document.querySelector('.product-card__product .inventory__price-with-shipping');
      if (!first) return false;
      const m = (first.textContent || '').match(/\$\s*([\d,]+(?:\.\d+)?)/);
      return m && parseFloat(m[1].replace(/,/g, '')) >= 100;
    },
    null,
    { timeout: 10000 }
  );
}

async function playScript(initialPage, recStartT) {
  let page = initialPage;
  const tNow = () => Date.now() / 1000 - recStartT;

  // Beat 0: page loaded, default sort. Sort manually.
  await waitForGridAnnotated(page);
  await sortPriceHighToLow(page);
  await page.mouse.move(20, 200); // neutral cursor

  // Beat 1: hold on sorted grid. Capture the bounds for the GIF cut.
  const gridStart = tNow();
  await page.waitForTimeout(2500);
  const gridEnd = tNow();

  // Beat 2: click into the most expensive product tile. The grid's <a>
  // doesn't have target=_blank, so this should navigate the same tab,
  // but TCGplayer's JS occasionally opens a new tab anyway. Race the
  // possibilities and continue in whichever page actually navigated.
  const firstTile = page.locator('a[data-testid="product-card__image--0"]');
  await firstTile.scrollIntoViewIfNeeded();
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
  await page.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT_MS });

  // Beat 3: product page settled. Scroll listings into view.
  await waitForProductAnnotated(page);
  await page.evaluate(() => {
    const first = document.querySelector('.listing-item');
    if (first) first.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.mouse.move(20, 200);

  // Beat 4: hold the chip-row + panel money shot.
  const productStart = tNow();
  await page.waitForTimeout(3500);
  const productEnd = tNow();

  return {
    page,
    keepRanges: [
      [gridStart, gridEnd],
      [productStart, productEnd],
    ],
  };
}

function runFfmpeg(inputWebm, outputGif, keepRanges) {
  // select=between(t,a,b)+between(t,c,d) keeps only the named time ranges;
  // setpts=N/FRAME_RATE/TB re-times the surviving frames so the output
  // plays at FPS without gaps. palettegen + paletteuse with Bayer dither
  // give a clean GIF without per-frame palette artifacts.
  const selectExpr = keepRanges.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join('+');
  const filter =
    `select='${selectExpr}',setpts=N/FRAME_RATE/TB,` +
    `fps=${FPS},scale=${VIEWPORT.width}:${VIEWPORT.height}:flags=lanczos,` +
    `split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`;
  return new Promise((resolve, reject) => {
    const args = ['-y', '-i', inputWebm, '-vf', filter, '-loop', '0', outputGif];
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    p.on('exit', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}\n${stderr}`));
      else resolve();
    });
  });
}

async function main() {
  requireFfmpeg();

  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tcgplus-demo-'));
  const videoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tcgplus-video-'));

  // Playwright-bundled Chromium in `--headless=new` mode so the recorder
  // doesn't take over the user's screen. The earlier headless attempt
  // failed because we'd combined it with `channel: 'chrome'` (which
  // doesn't load --load-extension reliably); bundled Chromium handles
  // it. Override the User-Agent so TCGplayer doesn't reject us via the
  // "HeadlessChrome" UA token.
  const REAL_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-default-browser-check',
      '--no-first-run',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    ],
    viewport: VIEWPORT,
    userAgent: REAL_UA,
    recordVideo: { dir: videoDir, size: VIEWPORT },
  });
  // Wall-clock origin for the ranges that playScript hands back to ffmpeg.
  // recordVideo started when the context opened a moment ago; this is the
  // closest we can get to that exact instant.
  const recStartT = Date.now() / 1000;

  let page = ctx.pages()[0];
  if (!page) page = await ctx.newPage();
  await page.setViewportSize(VIEWPORT);
  page.setDefaultTimeout(NAV_TIMEOUT_MS);

  // Surface the extension's load log so a failed annotation is obvious.
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('TCG+') || t.includes('vendor location')) console.log(`  page>`, t);
  });

  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  await dismissCookieBanner(page);

  let activePage = page;
  let keepRanges = [[0, 5]]; // placeholder, never used on success path
  try {
    const result = await playScript(page, recStartT);
    activePage = result.page;
    keepRanges = result.keepRanges;
  } catch (err) {
    // On failure, snapshot the current state + diagnostic JSON so the next
    // person doesn't have to repro to debug. See .claude/skills/record-demo.
    try {
      const diag = await page.evaluate(() => ({
        url: location.href,
        gridTiles: document.querySelectorAll('.product-card__product').length,
        gridAnnotated: document.querySelectorAll('.product-card__product[data-tcgplus-chips="1"]').length,
        listings: document.querySelectorAll('.listing-item').length,
        listingsAnnotated: document.querySelectorAll('.listing-item[data-tcgplus-chips="1"]').length,
        panel: !!document.querySelector('.tcgplus-panel'),
        cartBadge: !!document.querySelector('.tcgplus-cart-subtotal'),
      }));
      console.error('Page state at failure:', JSON.stringify(diag));
      const dbg = path.join(REPO_ROOT, 'docs', 'images', '.demo-failed.png');
      await page.screenshot({ path: dbg, fullPage: false });
      console.error(`Wrote failure screenshot to ${path.relative(REPO_ROOT, dbg)}`);
    } catch {
      // ignore secondary failures
    }
    throw err;
  }

  // Pick whichever page's video has the interesting recording (search +
  // sort + product). If a new tab was opened mid-script, that one's video
  // is where the product page ended up.
  const allPages = ctx.pages();
  const videoSourcePage = allPages.includes(activePage) ? activePage : page;
  const videoPath = await videoSourcePage.video().path();
  await ctx.close();

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await runFfmpeg(videoPath, OUT_PATH, keepRanges);

  await fs.rm(userDataDir, { recursive: true, force: true });
  await fs.rm(videoDir, { recursive: true, force: true });

  const bytes = (await fs.stat(OUT_PATH)).size;
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_PATH)}`);
  console.log(`  ${VIEWPORT.width}x${VIEWPORT.height} @ ${FPS}fps, ${(bytes / 1024).toFixed(0)} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
