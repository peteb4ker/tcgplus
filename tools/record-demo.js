// Record the README demo GIF.
//
// Launches Chromium with the unpacked extension loaded and Playwright's
// recordVideo turned on, navigates to a mocked TCGplayer product page
// (the same fixture the e2e suite uses), plays a short scripted sequence
// (initial render → click home filter → unfilter → tail), then converts
// the resulting WebM into docs/images/demo.gif using ffmpeg's
// palettegen + paletteuse two-pass-in-one-command recipe.
//
// Usage:
//   npm run demo:record
//
// Requires `ffmpeg` on PATH. On macOS: `brew install ffmpeg`.
//
// Output: docs/images/demo.gif. Rerun this script to regenerate the
// recording any time the UI it shows changes.

const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('@playwright/test');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXT_PATH = REPO_ROOT;
const FIXTURES = path.join(REPO_ROOT, 'e2e', 'fixtures');
const OUT_PATH = path.join(REPO_ROOT, 'docs', 'images', 'demo.gif');

// Recording viewport. The fixture content's natural layout fills a 960x720
// area, but Playwright's recordVideo captures at CSS pixels — so to keep
// the GIF sharp on Retina-class displays in the GitHub README, we render
// at 1920x1440 CSS pixels and CSS-zoom the document to 2x so the content
// fills the bigger frame at higher effective pixel density.
const CONTENT_SCALE = 2;
const CONTENT_SIZE = { width: 960, height: 720 };
const VIEWPORT = {
  width: CONTENT_SIZE.width * CONTENT_SCALE,
  height: CONTENT_SIZE.height * CONTENT_SCALE,
};

// 10fps is the sweet spot for README demos: smooth enough to read the
// interaction, slow enough to keep the file small.
const FPS = 10;

// recordVideo starts when the context opens, so the first ~0.5s of the
// recording captures the empty page + navigation. Trim it off via -ss
// before encoding to GIF.
const SKIP_START_SEC = 0.5;

const SELLERS = {
  aaaaaaaa: { addressCity: 'Atascadero', addressTerritory: 'CA', addressCountryCode: 'US' },
  bbbbbbbb: { addressCity: 'Portland', addressTerritory: 'OR', addressCountryCode: 'US' },
  cccccccc: { addressCity: 'Austin', addressTerritory: 'TX', addressCountryCode: 'US' },
};
const CART = {
  itemCount: 1,
  itemSubtotal: 8.0,
  requestedTotalCost: 8.0,
  sellers: [{ sellerKey: 'aaaaaaaa', productTotalCost: 8.0, shippingCost: 0 }],
};

function requireFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (r.status !== 0) {
    console.error('ffmpeg not found on PATH. Install it first:');
    console.error('  macOS:   brew install ffmpeg');
    console.error('  Debian:  sudo apt-get install ffmpeg');
    process.exit(1);
  }
}

async function setupRoutes(page) {
  await page.context().addCookies([
    {
      name: 'StoreCart_PRODUCTION',
      value: 'CK=deadbeefdeadbeefdeadbeefdeadbeef&Ignore=false',
      domain: '.tcgplayer.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'Lax',
    },
  ]);
  await page.route('**/sm/seller/*', (route) => {
    const key = new URL(route.request().url()).pathname.split('/').pop() || '';
    const info = SELLERS[key] || null;
    route.fulfill({
      status: info ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(info),
    });
  });
  await page.route('**/v1/cart/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ errors: [], results: [CART] }),
    });
  });
  const html = await fs.readFile(path.join(FIXTURES, 'product-page.html'), 'utf8');
  await page.route('https://www.tcgplayer.com/product/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  );
}

async function playScript(page) {
  // Wait until the extension has annotated everything so frame 1 already
  // shows the working extension.
  await page.locator('.tcgplus-panel').waitFor({ timeout: 5000 });
  await page.locator('.listing-item[data-tcgplus-chips="1"]').nth(2).waitFor({ timeout: 5000 });

  // Beat 1: initial state visible.
  await page.waitForTimeout(1500);

  // Beat 2: click the home filter — non-home listings hide.
  await page.locator('.tcgplus-panel .tcgplus-panel-row[data-tier="home"]').click();
  await page.waitForTimeout(1500);

  // Beat 3: click again — filter clears, all listings return.
  await page.locator('.tcgplus-panel .tcgplus-panel-row[data-tier="home"]').click();
  await page.waitForTimeout(1500);

  // Beat 4: small tail pad so the loop point isn't jarring.
  await page.waitForTimeout(600);
}

function runFfmpeg(inputWebm, outputGif) {
  // palettegen builds an optimal 256-colour palette for the whole clip;
  // paletteuse maps each frame to that palette with Bayer dithering for
  // smooth gradients without the splotchy artifacts of per-frame palettes.
  // -ss before -i seeks before decoding, cheap.
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
    recordVideo: { dir: videoDir, size: VIEWPORT },
  });

  let page = ctx.pages()[0];
  if (!page) page = await ctx.newPage();
  await page.setViewportSize(VIEWPORT);

  await setupRoutes(page);
  await page.goto('https://www.tcgplayer.com/product/1/demo');

  // CSS zoom the entire document so the fixture's fixed-pixel layout
  // fills the larger Retina-sized viewport. Effective rendering happens
  // at CONTENT_SCALE × the original layout, giving us a 2x-sharp video.
  await page.evaluate((scale) => {
    document.documentElement.style.zoom = String(scale);
  }, CONTENT_SCALE);

  await playScript(page);

  // Closing the context flushes the WebM to disk.
  const videoPathBeforeClose = await page.video().path();
  await ctx.close();

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await runFfmpeg(videoPathBeforeClose, OUT_PATH);

  // Tidy.
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
