// Renders docs/images/options-page.png by loading the unpacked extension into
// Chromium and navigating to its chrome-extension://<id>/options/index.html.
//
// Run: node tools/render-options-screenshot.js

const path = require('node:path');
const fs = require('node:fs/promises');
const { launchWithExtension } = require('../e2e/helpers/load-extension.js');

async function main() {
  const { ctx } = await launchWithExtension();
  try {
    // Discover the extension's runtime ID by waiting for its service worker.
    let workers = ctx.serviceWorkers();
    if (!workers.length) {
      const worker = await ctx.waitForEvent('serviceworker', { timeout: 8000 });
      workers = [worker];
    }
    const swUrl = workers[0].url();
    const extensionId = new URL(swUrl).host;

    const page = await ctx.newPage();
    await page.setViewportSize({ width: 760, height: 1100 });
    await page.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'networkidle',
    });
    // Give the version label a moment to render.
    await page.waitForFunction(
      () => {
        const el = document.getElementById('tcgplus-version');
        return el && el.textContent && el.textContent !== '…';
      },
      null,
      { timeout: 4000 }
    );

    const out = path.join(__dirname, '..', 'docs', 'images', 'options-page.png');
    await fs.mkdir(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, type: 'png', fullPage: true });
    console.log('Wrote', out);
  } finally {
    await ctx.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
