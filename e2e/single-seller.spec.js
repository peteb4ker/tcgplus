// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launchWithExtension, mockTCGplayer } = require('./helpers/load-extension.js');

test.describe('Single-seller mode', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let ctx;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeEach(async () => {
    ({ ctx } = await launchWithExtension());
    page = await ctx.newPage();
    const productHtml = await fs.readFile(path.join(__dirname, 'fixtures', 'search-single-seller-page.html'), 'utf8');
    await mockTCGplayer(page, {
      productHtml,
      sellers: {
        aaaaaaaa: { addressCity: 'Atascadero', addressTerritory: 'CA', addressCountryCode: 'US' },
      },
      cart: null,
    });
    await page.route('https://www.tcgplayer.com/search/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: productHtml })
    );
  });

  test.afterEach(async () => {
    if (ctx) await ctx.close();
  });

  test('shows the seller location inside the shop-by-seller banner', async () => {
    await page.goto('https://www.tcgplayer.com/search/pokemon/test?seller=aaaaaaaa');
    const banner = page.locator('.shop-by-seller-message');
    await expect(banner).toBeVisible();
    await expect(banner.locator('.tcgplus-loc')).toHaveText('Atascadero, CA');
  });

  test('skips per-listing location badges when the banner is present', async () => {
    await page.goto('https://www.tcgplayer.com/search/pokemon/test?seller=aaaaaaaa');
    // Wait for annotation to complete (data-tcgplus-tier set on listing-item).
    await expect(page.locator('.listing-item[data-tcgplus-tier]')).toHaveCount(2);
    // No per-listing badges anywhere except inside the banner.
    await expect(page.locator('.listing-item .tcgplus-loc')).toHaveCount(0);
  });

  test('still renders price chips on listings even when location is suppressed', async () => {
    await page.goto('https://www.tcgplayer.com/search/pokemon/test?seller=aaaaaaaa');
    await expect(page.locator('.listing-item[data-tcgplus-chips="1"]')).toHaveCount(2);
    const chips = await page.locator('.listing-item .tcgplus-price-chip').allInnerTexts();
    expect(chips).toContain('-$2.00 (-20.0%)');
    expect(chips).toContain('+$1.00 (+10.0%)');
  });
});
