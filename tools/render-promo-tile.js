// Generates the 440x280 Chrome Web Store small promo tile at
// docs/store/promo-tile.png. Static HTML + CSS rendered by Playwright's
// Chromium and screenshot to PNG. No image-toolchain dependency.
//
// Run: node tools/render-promo-tile.js

const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium } = require('@playwright/test');

async function main() {
  const iconSvg = await fs.readFile(path.join(__dirname, '..', 'icons', 'icon.svg'), 'utf8');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><style>
  html, body { margin: 0; padding: 0; }
  body { width: 440px; height: 280px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif; }
  .tile {
    width: 100%; height: 100%;
    box-sizing: border-box;
    background: linear-gradient(135deg, #fff 0%, #f1f3f5 100%);
    color: #1f2329;
    display: grid;
    grid-template-columns: 132px 1fr;
    align-items: center;
    gap: 24px;
    padding: 32px 36px;
  }
  .icon {
    width: 132px; height: 132px;
    box-shadow: 0 8px 24px rgba(225, 29, 72, 0.25);
    border-radius: 24px;
    overflow: hidden;
  }
  .icon svg { width: 132px; height: 132px; display: block; }
  .copy h1 {
    margin: 0 0 8px;
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -0.01em;
    line-height: 1.05;
  }
  .copy h1 .plus { color: #1e7e1e; }
  .copy p {
    margin: 0;
    font-size: 16px;
    color: #586069;
    line-height: 1.4;
  }
  .copy p strong { color: #1f2329; font-weight: 600; }
</style></head>
<body>
  <div class="tile">
    <div class="icon">${iconSvg}</div>
    <div class="copy">
      <h1>TCG<span class="plus">Plus</span></h1>
      <p><strong>Vendor locations, market-price chips, and a smart Deal indicator</strong> on every TCGplayer product page.</p>
    </div>
  </div>
</body></html>`;

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 440, height: 280 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const out = path.join(__dirname, '..', 'docs', 'store', 'promo-tile.png');
    await fs.mkdir(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, type: 'png', fullPage: false });
    console.log('Wrote', out);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
