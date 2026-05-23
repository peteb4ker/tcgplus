// Record the README demo GIF.
//
// Launches Chromium with the unpacked extension loaded, navigates to a
// mocked TCGplayer product page (same fixture the e2e suite uses), grabs
// PNG screenshots at a fixed frame rate while a short scripted sequence
// plays (initial render → click home filter → unclick → done), and
// encodes the frames into docs/images/demo.gif using gifenc.
//
// Usage:
//   npm run demo:record
//
// Output: docs/images/demo.gif. The GIF is committed and referenced from
// the README; rerun this script to regenerate after UI changes.
//
// No ffmpeg or other system tools required — everything runs through node
// + the existing Playwright install.

const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { chromium } = require('@playwright/test');
const { PNG } = require('pngjs');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXT_PATH = REPO_ROOT;
const FIXTURES = path.join(REPO_ROOT, 'e2e', 'fixtures');
const OUT_PATH = path.join(REPO_ROOT, 'docs', 'images', 'demo.gif');

// Keep the viewport small so the GIF stays under a couple of MB. The
// fixture's three listings + panel + cart header fit comfortably.
const VIEWPORT = { width: 960, height: 720 };

// 10fps is the sweet spot for README demos: smooth enough to read the
// interaction, slow enough to keep the file under 2MB.
const FPS = 10;
const FRAME_MS = Math.round(1000 / FPS);

// Sequence timing (seconds). Each phase is a "hold" before the next action.
const PHASES = [
  { holdMs: 1500, action: null }, // initial: show chips + panel
  { holdMs: 1500, action: 'clickHomeFilter' }, // filter applied
  { holdMs: 1500, action: 'clickHomeFilter' }, // filter cleared
  { holdMs: 600, action: null }, // tail pad before loop
];

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

async function captureFrame(page) {
  const buf = await page.screenshot({ type: 'png', fullPage: false });
  const png = PNG.sync.read(buf);
  // gifenc wants RGBA Uint8Array. PNG.data is already RGBA.
  return { data: new Uint8Array(png.data), width: png.width, height: png.height };
}

async function performAction(page, name) {
  if (name === 'clickHomeFilter') {
    await page.locator('.tcgplus-panel .tcgplus-panel-row[data-tier="home"]').click();
    return;
  }
  throw new Error(`Unknown action: ${name}`);
}

async function recordFrames(page, gif) {
  let firstSize = null;
  for (const phase of PHASES) {
    if (phase.action) await performAction(page, phase.action);
    const frames = Math.max(1, Math.round(phase.holdMs / FRAME_MS));
    for (let i = 0; i < frames; i++) {
      const frame = await captureFrame(page);
      if (!firstSize) firstSize = { w: frame.width, h: frame.height };
      // Build a per-frame palette. Quality 10 is a balance of speed and
      // accuracy; bumping to 5 gives slightly better colour but slower.
      const palette = quantize(frame.data, 256, { format: 'rgb444' });
      const index = applyPalette(frame.data, palette, 'rgb444');
      gif.writeFrame(index, frame.width, frame.height, { palette, delay: FRAME_MS });
      await page.waitForTimeout(FRAME_MS);
    }
  }
  return firstSize;
}

async function main() {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tcgplus-demo-'));
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
  });

  // launchPersistentContext gives an existing about:blank page; use it.
  let page = ctx.pages()[0];
  if (!page) page = await ctx.newPage();
  await page.setViewportSize(VIEWPORT);

  await setupRoutes(page);
  await page.goto('https://www.tcgplayer.com/product/1/demo');

  // Wait for the extension to fully annotate the listings and render the
  // panel so frame 1 already shows the working extension.
  await page.locator('.tcgplus-panel').waitFor({ timeout: 5000 });
  await page.locator('.listing-item[data-tcgplus-chips="1"]').nth(2).waitFor({ timeout: 5000 });

  const gif = GIFEncoder();
  const size = await recordFrames(page, gif);
  gif.finish();

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, Buffer.from(gif.bytes()));

  await ctx.close();
  await fs.rm(userDataDir, { recursive: true, force: true });

  const bytes = (await fs.stat(OUT_PATH)).size;
  const totalSec = PHASES.reduce((s, p) => s + p.holdMs, 0) / 1000;
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_PATH)}`);
  console.log(`  ${size.w}x${size.h}, ${totalSec.toFixed(1)}s @ ${FPS}fps, ${(bytes / 1024).toFixed(0)} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
