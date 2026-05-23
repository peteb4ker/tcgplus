// Record the README demo GIF against live TCGplayer.
//
// Launches Chromium with the unpacked extension loaded and Playwright's
// recordVideo turned on, navigates to a real TCGplayer search page,
// waits for the extension to annotate the grid, clicks into a product
// to show the full chip row + panel + location badges, then converts
// the resulting WebM into docs/images/demo.gif via ffmpeg's
// palettegen + paletteuse filter chain.
//
// Usage:
//   npm run demo:record
//
// Requires `ffmpeg` on PATH. On macOS: `brew install ffmpeg`.
//
// Notes:
//   - Runs against the real site, so each recording reflects live
//     prices/listings/sellers. Pages and DOM can change without warning.
//   - Uses a fresh, cookieless session, so cart subtotal renders at
//     $0.00. This is what a logged-out user sees.

const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('@playwright/test');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXT_PATH = REPO_ROOT;
const OUT_PATH = path.join(REPO_ROOT, 'docs', 'images', 'demo.gif');

// The demo opens directly on a product page rather than starting on the
// set's grid view and clicking through. Reasoning: the grid view's
// default Best Match sort leads with sealed product and code cards
// (boring); the `Sort=Price+High+to+Low` URL param is read as a
// filter by TCGplayer and shows no matches; clicking the sort dropdown
// adds 2-3s of recording for limited payoff. Going straight to a
// concrete product with rich listings is the cleaner story.
//
// Pikachu ex - 276/217 from ME: Ascended Heroes — Special Illustration
// Rare, expensive enough that listings span the full chip-colour range,
// 17+ sellers from many states (gives the Vendor Locations panel
// something to summarise), and at least one seller usually clears the
// DEAL threshold.
const PRODUCT_URL =
  'https://www.tcgplayer.com/product/676088/pokemon-me-ascended-heroes-pikachu-ex-276-217?Condition=Near+Mint';

// Desktop viewport wide enough to keep TCGplayer in its non-narrow
// layout. 1280x720 balances readability in the GitHub README against
// keeping the GIF a sane file size (a 1600x900 demo against the real
// site runs ~10 MB; 1280x720 lands closer to 3 MB).
const VIEWPORT = { width: 1280, height: 720 };

// 10fps demo: smooth enough to read interactions, slow enough to keep
// the file size in a reasonable range.
const FPS = 10;

// recordVideo starts the moment the context opens. The first several
// seconds are about:blank, navigation, page load, extension annotation,
// and the scroll-to-listings call. Trim past all of that so the GIF
// opens on a fully-rendered, scrolled-into-place listing view. Tuned
// empirically — too low and we see the loading state; too high and
// the first beat gets clipped.
const SKIP_START_SEC = 4.5;

// Max network-idle wait. TCGplayer's homepage and search pages are
// heavyweight; allow generous time for fonts / images / JSON.
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

async function waitForProductAnnotated(page) {
  // On a product page, listings have data-tcgplus-chips="1" once the
  // chip row is in place. Wait for at least three so the panel has
  // counts to show.
  await page.locator('.listing-item[data-tcgplus-chips="1"]').nth(2).waitFor({ timeout: 20000 });
  // Plus the floating panel.
  await page.locator('.tcgplus-panel').waitFor({ timeout: 5000 });
}

async function playScript(page) {
  // Wait for the extension to finish annotating, then scroll the
  // listings into view so the recording leads with the chip-and-panel
  // money shot (the product info card sits above by default).
  await waitForProductAnnotated(page);
  await page.evaluate(() => {
    const first = document.querySelector('.listing-item');
    if (first) first.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  // Neutral mouse position keeps hover state out of the frame.
  await page.mouse.move(20, 200);

  // Beat 1: hold the unfiltered listing view.
  await page.waitForTimeout(2200);

  // Beat 2: click home tier in the panel — non-home listings hide,
  // demonstrating the interactive filter. If there's no home-tier
  // listing on this product, fall through to a longer hold.
  const homeRow = page.locator('.tcgplus-panel-row[data-tier="home"]:not(.tcgplus-panel-row-disabled)');
  if (await homeRow.count()) {
    await homeRow.first().click();
    await page.mouse.move(20, 200);
    await page.waitForTimeout(2000);

    // Beat 3: click again to clear the filter, all listings return.
    await homeRow.first().click();
    await page.mouse.move(20, 200);
    await page.waitForTimeout(1500);
  } else {
    await page.waitForTimeout(2500);
  }
}

function runFfmpeg(inputWebm, outputGif) {
  // palettegen builds a 256-colour palette tuned to the clip; paletteuse
  // maps each frame with Bayer dithering for smooth gradients without
  // the splotchy artifacts of per-frame palettes.
  const filter =
    `fps=${FPS},scale=${VIEWPORT.width}:${VIEWPORT.height}:flags=lanczos,` +
    `split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`;
  return new Promise((resolve, reject) => {
    const args = ['-y', '-ss', String(SKIP_START_SEC), '-i', inputWebm, '-vf', filter, '-loop', '0', outputGif];
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

  // Use the Playwright-bundled Chromium in headed mode. `channel: 'chrome'`
  // (the user's real Chrome install) doesn't load --load-extension reliably
  // alongside a temp user-data-dir; bundled Chromium does. Headed means a
  // window pops up briefly while recording runs.
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-default-browser-check',
      '--no-first-run',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    ],
    viewport: VIEWPORT,
    recordVideo: { dir: videoDir, size: VIEWPORT },
  });

  let page = ctx.pages()[0];
  if (!page) page = await ctx.newPage();
  await page.setViewportSize(VIEWPORT);
  page.setDefaultTimeout(NAV_TIMEOUT_MS);

  // Log everything the extension prints to console so we can tell if
  // it's actually loading on the page or being skipped.
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('TCG+') || t.includes('vendor location')) console.log(`  page>`, t);
  });

  await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  await dismissCookieBanner(page);

  try {
    await playScript(page);
  } catch (err) {
    // On failure, dump diagnostics: did the extension activate at all?
    const diag = await page.evaluate(() => ({
      url: location.href,
      tiles: document.querySelectorAll('.product-card__product, .search-result').length,
      annotated: document.querySelectorAll('[data-tcgplus-chips="1"]').length,
      panel: !!document.querySelector('.tcgplus-panel'),
      cartBadge: !!document.querySelector('.tcgplus-cart-subtotal'),
    }));
    console.error('Page state at failure:', JSON.stringify(diag));
    try {
      const dbg = path.join(REPO_ROOT, 'docs', 'images', '.demo-failed.png');
      await page.screenshot({ path: dbg, fullPage: false });
      console.error(`Wrote failure screenshot to ${path.relative(REPO_ROOT, dbg)}`);
    } catch (_) {
      // ignore secondary failures
    }
    throw err;
  }

  // Close to flush WebM to disk.
  const videoPath = await page.video().path();
  await ctx.close();

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await runFfmpeg(videoPath, OUT_PATH);

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
