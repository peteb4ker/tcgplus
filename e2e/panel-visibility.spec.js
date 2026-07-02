// @ts-check
// Regression tests for #44: the floating Vendor Locations panel only makes
// sense on pages that have per-seller listings to summarise. On the home,
// /cart, /content articles, search-grid view, etc. the panel would show
// nothing but a row of zeros (and the cart-fetch warning has no useful
// context to attach to). It should stay hidden.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

test.describe('Panel visibility (regression for #44)', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('does not render the panel on the homepage (no .listing-item)', async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    // Minimal homepage shell — cart header present so renderCartBadge works,
    // but no listings.
    await page.route('https://www.tcgplayer.com/', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html><head><meta charset="utf-8"><title>Home</title></head>
          <body>
            <header>
              <button class="mp-header__content__cart-count">
                <span class="mp-header__content__cart-count__chip">0</span>
              </button>
            </header>
            <main>Welcome to TCGplayer</main>
          </body></html>`,
      });
    });
    await mockTCGplayer(page);

    await page.goto('https://www.tcgplayer.com/');
    await page.waitForFunction(() => document.documentElement.dataset.tcgplusReady === '1', { timeout: 5000 });

    // Give the content script's MutationObserver debounce a chance to fire
    // even though the DOM is static — if the panel were going to appear
    // erroneously, this is the window where it would.
    await page.waitForTimeout(500);
    await expect(page.locator('.tcgplus-panel')).toHaveCount(0);
  });

  test('panel disappears after SPA navigation away from a listings page', async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    const productHtml = await fs.readFile(path.join(__dirname, 'fixtures', 'product-page.html'), 'utf8');
    await mockTCGplayer(page, { productHtml });

    await page.goto('https://www.tcgplayer.com/product/1/test');
    await expect(page.locator('.tcgplus-panel')).toBeVisible();
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(3);

    // Simulate an SPA route change to a non-listings page (e.g. clicking the
    // logo back to home). pushState + body content swap, no real navigation.
    await page.evaluate(() => {
      history.pushState({}, '', '/');
      document.body.innerHTML = `
        <header>
          <button class="mp-header__content__cart-count">
            <span class="mp-header__content__cart-count__chip">0</span>
          </button>
        </header>
        <main>Welcome to TCGplayer</main>
      `;
    });

    // The content script's MutationObserver should pick up the DOM swap and
    // re-scan; renderPanel() then sees no listings and tears the panel down.
    await expect(page.locator('.tcgplus-panel')).toHaveCount(0, { timeout: 5000 });
  });
});
